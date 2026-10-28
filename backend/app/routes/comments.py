from flask import Blueprint, g, jsonify, request

from app.auth import require_auth
from app.db import get_connection


comments_bp = Blueprint("comments", __name__)


def serialize_comment(comment):
    return {
        "id": str(comment["id"]),
        "recording_id": str(comment["recording_id"]),
        "author_id": str(comment["author_id"]),
        "timestamp_ms": comment["timestamp_ms"],
        "body": comment["body"],
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
        """,
        (recording_id, g.user["id"]),
    )
    return cursor.fetchone()


@comments_bp.post("/recordings/<uuid:recording_id>/comments")
@require_auth
def create_comment(recording_id):
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({"error": "A JSON object is required."}), 400

    body = data.get("body")
    timestamp_ms = data.get("timestamp_ms")

    if not isinstance(body, str) or not body.strip():
        return jsonify({"error": "Comment text is required."}), 400

    body = body.strip()

    if len(body) > 5000:
        return jsonify({
            "error": "Comments must be 5,000 characters or fewer."
        }), 400

    if (
        type(timestamp_ms) is not int
        or timestamp_ms < 0
        or timestamp_ms > 2_147_483_647
    ):
        return jsonify({
            "error": "Timestamp must be a nonnegative integer in milliseconds."
        }), 400

    with get_connection() as connection:
        with connection.cursor() as cursor:
            recording = find_owned_recording(cursor, recording_id)

            if recording is None:
                return jsonify({"error": "Recording not found."}), 404

            duration_ms = recording["duration_ms"]

            if duration_ms is not None and timestamp_ms > duration_ms:
                return jsonify({
                    "error": "Timestamp exceeds the recording duration."
                }), 400

            cursor.execute(
                """
                INSERT INTO public.comments (
                    recording_id, author_id, timestamp_ms, body
                )
                VALUES (%s, %s, %s, %s)
                RETURNING
                    id, recording_id, author_id, timestamp_ms,
                    body, created_at, updated_at
                """,
                (
                    recording_id,
                    g.user["id"],
                    timestamp_ms,
                    body,
                ),
            )
            comment = cursor.fetchone()

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
                    c.id, c.recording_id, c.author_id,
                    c.timestamp_ms, c.body, c.created_at, c.updated_at
                FROM public.comments AS c
                JOIN public.recordings AS r ON r.id = c.recording_id
                JOIN public.pieces AS p ON p.id = r.piece_id
                WHERE c.recording_id = %s
                  AND p.owner_id = %s
                ORDER BY c.timestamp_ms ASC, c.created_at ASC, c.id ASC
                """,
                (recording_id, g.user["id"]),
            )
            comments = cursor.fetchall()

    return jsonify({
        "items": [serialize_comment(comment) for comment in comments]
    }), 200

@comments_bp.patch("/comments/<uuid:comment_id>")
@require_auth
def edit_comment(comment_id):
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({"error": "A JSON object is required."}), 400

    body = data.get("body")

    if not isinstance(body, str) or not body.strip():
        return jsonify({"error": "Comment text is required."}), 400

    body = body.strip()

    if len(body) > 5000:
        return jsonify({
            "error": "Comments must be 5,000 characters or fewer."
        }), 400

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE public.comments AS c
                SET body = %s
                FROM public.recordings AS r
                JOIN public.pieces AS p ON p.id = r.piece_id
                WHERE c.id = %s
                  AND c.recording_id = r.id
                  AND c.author_id = %s
                  AND p.owner_id = %s
                RETURNING
                    c.id, c.recording_id, c.author_id,
                    c.timestamp_ms, c.body,
                    c.created_at, c.updated_at
                """,
                (
                    body,
                    comment_id,
                    g.user["id"],
                    g.user["id"],
                ),
            )

            comment = cursor.fetchone()

    if comment is None:
        return jsonify({"error": "Comment not found."}), 404

    return jsonify(serialize_comment(comment)), 200