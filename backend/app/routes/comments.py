from uuid import UUID

from flask import Blueprint, g, jsonify, request

from app.auth import require_auth
from app.db import get_connection


comments_bp = Blueprint("comments", __name__)

MAX_TIME_MS = 2_147_483_647


def serialize_comment(comment):
    passage_id = comment.get("passage_id")
    passage_start = comment.get("passage_start_ms")

    return {
        "id": str(comment["id"]),
        "recording_id": str(comment["recording_id"]),
        "author_id": str(comment["author_id"]),
        # Linked comments follow the passage's current start time.
        "timestamp_ms": (
            passage_start
            if passage_start is not None
            else comment["timestamp_ms"]
        ),
        "body": comment["body"],
        "passage_id": str(passage_id) if passage_id else None,
        "passage_label": comment.get("passage_label"),
        "passage_start_ms": passage_start,
        "passage_end_ms": comment.get("passage_end_ms"),
        "created_at": comment["created_at"].isoformat(),
        "updated_at": comment["updated_at"].isoformat(),
    }


def find_owned_recording(cursor, recording_id):
    cursor.execute(
        """
        SELECT r.id, r.duration_ms
        FROM public.recordings AS r
        JOIN public.pieces AS p ON p.id = r.piece_id
        WHERE r.id = %s
          AND p.owner_id = %s
          AND r.upload_status = 'ready'
        FOR SHARE OF r, p
        """,
        (recording_id, g.user["id"]),
    )
    return cursor.fetchone()


def find_passage(cursor, passage_id, recording_id):
    cursor.execute(
        """
        SELECT id, label, start_ms, end_ms
        FROM public.passages
        WHERE id = %s
          AND recording_id = %s
        FOR SHARE
        """,
        (passage_id, recording_id),
    )
    return cursor.fetchone()


def fetch_comment(cursor, comment_id):
    cursor.execute(
        """
        SELECT
            c.*,
            pa.label AS passage_label,
            pa.start_ms AS passage_start_ms,
            pa.end_ms AS passage_end_ms
        FROM public.comments AS c
        LEFT JOIN public.passages AS pa ON pa.id = c.passage_id
        WHERE c.id = %s
        """,
        (comment_id,),
    )
    return cursor.fetchone()


def read_payload():
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return None, "A JSON object is required."

    if not data:
        return None, "Provide at least one comment field."

    allowed = {"body", "timestamp_ms", "passage_id"}

    if set(data) - allowed:
        return None, (
            "Only body, timestamp_ms and passage_id can be provided."
        )

    return data, None


def validate_body(body):
    if not isinstance(body, str) or not body.strip():
        return None, "Comment text is required."

    body = body.strip()

    if len(body) > 5000:
        return None, "Comments must be 5,000 characters or fewer."

    return body, None


def resolve_target(cursor, data, recording, existing=None):
    """
    Returns (timestamp_ms, passage_id, error).

    A linked comment uses the passage start.
    An ordinary comment uses its supplied or existing timestamp.
    """
    passage_id = data.get(
        "passage_id",
        existing["passage_id"] if existing else None,
    )

    if passage_id is not None:
        try:
            passage_id = UUID(str(passage_id))
        except (ValueError, TypeError, AttributeError):
            return None, None, "Passage ID must be a valid UUID."

        passage = find_passage(
            cursor, passage_id, recording["id"]
        )

        if passage is None:
            return None, None, (
                "The passage does not belong to this recording "
                "or is no longer available."
            )

        return passage["start_ms"], passage["id"], None

    timestamp_ms = data.get(
        "timestamp_ms",
        existing["timestamp_ms"] if existing else None,
    )

    if (
        type(timestamp_ms) is not int
        or timestamp_ms < 0
        or timestamp_ms > MAX_TIME_MS
    ):
        return None, None, (
            "Timestamp must be a nonnegative integer in milliseconds."
        )

    duration_ms = recording["duration_ms"]

    if duration_ms is not None and timestamp_ms > duration_ms:
        return None, None, "Timestamp exceeds the recording duration."

    return timestamp_ms, None, None


@comments_bp.post("/recordings/<uuid:recording_id>/comments")
@require_auth
def create_comment(recording_id):
    data, error = read_payload()

    if error:
        return jsonify({"error": error}), 400

    body, error = validate_body(data.get("body"))

    if error:
        return jsonify({"error": error}), 400

    with get_connection() as connection:
        with connection.cursor() as cursor:
            recording = find_owned_recording(cursor, recording_id)

            if recording is None:
                return jsonify({"error": "Recording not found."}), 404

            timestamp_ms, passage_id, error = resolve_target(
                cursor, data, recording
            )

            if error:
                return jsonify({"error": error}), 400

            cursor.execute(
                """
                INSERT INTO public.comments (
                    recording_id,
                    author_id,
                    timestamp_ms,
                    body,
                    passage_id
                )
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    recording_id,
                    g.user["id"],
                    timestamp_ms,
                    body,
                    passage_id,
                ),
            )

            comment_id = cursor.fetchone()["id"]
            comment = fetch_comment(cursor, comment_id)

    return jsonify(serialize_comment(comment)), 201


@comments_bp.get("/recordings/<uuid:recording_id>/comments")
@require_auth
def list_comments(recording_id):
    with get_connection() as connection:
        with connection.cursor() as cursor:
            recording = find_owned_recording(cursor, recording_id)

            if recording is None:
                return jsonify({"error": "Recording not found."}), 404

            cursor.execute(
                """
                SELECT
                    c.*,
                    pa.label AS passage_label,
                    pa.start_ms AS passage_start_ms,
                    pa.end_ms AS passage_end_ms
                FROM public.comments AS c
                LEFT JOIN public.passages AS pa
                    ON pa.id = c.passage_id
                WHERE c.recording_id = %s
                ORDER BY
                    COALESCE(pa.start_ms, c.timestamp_ms) ASC,
                    c.created_at ASC,
                    c.id ASC
                """,
                (recording_id,),
            )
            comments = cursor.fetchall()

    return jsonify({
        "items": [
            serialize_comment(comment) for comment in comments
        ]
    }), 200


@comments_bp.patch("/comments/<uuid:comment_id>")
@require_auth
def edit_comment(comment_id):
    data, error = read_payload()

    if error:
        return jsonify({"error": error}), 400

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT c.*
                FROM public.comments AS c
                JOIN public.recordings AS r
                    ON r.id = c.recording_id
                JOIN public.pieces AS p
                    ON p.id = r.piece_id
                WHERE c.id = %s
                  AND c.author_id = %s
                  AND p.owner_id = %s
                FOR UPDATE OF c
                """,
                (comment_id, g.user["id"], g.user["id"]),
            )
            existing = cursor.fetchone()

            if existing is None:
                return jsonify({"error": "Comment not found."}), 404

            recording = find_owned_recording(
                cursor, existing["recording_id"]
            )

            if recording is None:
                return jsonify({"error": "Recording not found."}), 404

            body, error = validate_body(
                data.get("body", existing["body"])
            )

            if error:
                return jsonify({"error": error}), 400

            timestamp_ms, passage_id, error = resolve_target(
                cursor, data, recording, existing
            )

            if error:
                return jsonify({"error": error}), 400

            cursor.execute(
                """
                UPDATE public.comments
                SET body = %s,
                    timestamp_ms = %s,
                    passage_id = %s
                WHERE id = %s
                """,
                (
                    body,
                    timestamp_ms,
                    passage_id,
                    comment_id,
                ),
            )

            comment = fetch_comment(cursor, comment_id)

    return jsonify(serialize_comment(comment)), 200