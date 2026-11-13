from flask import Blueprint, g, jsonify, request

from app.auth import require_auth
from app.db import get_connection


passages_bp = Blueprint("passages", __name__)

EDITABLE_FIELDS = {"label", "start_ms", "end_ms", "note"}
MAX_TIME_MS = 2_147_483_647


def serialize_passage(passage):
    return {
        "id": str(passage["id"]),
        "recording_id": str(passage["recording_id"]),
        "label": passage["label"],
        "start_ms": passage["start_ms"],
        "end_ms": passage["end_ms"],
        "note": passage["note"],
        "created_at": passage["created_at"].isoformat(),
        "updated_at": passage["updated_at"].isoformat(),
    }


def read_payload():
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return None, "A JSON object is required."

    if not data:
        return None, "Provide at least one passage field."

    if set(data) - EDITABLE_FIELDS:
        return None, (
            "Only label, start_ms, end_ms and note can be provided."
        )

    return data, None


def validate_passage(data, duration_ms):
    label = data.get("label")
    start_ms = data.get("start_ms")
    end_ms = data.get("end_ms")
    note = data.get("note", "")

    if not isinstance(label, str):
        return None, "A passage label is required."

    label = label.strip()

    if not 1 <= len(label) <= 120:
        return None, "The label must contain 1–120 characters."

    for name, value in (("Start", start_ms), ("End", end_ms)):
        if (
            type(value) is not int
            or value < 0
            or value > MAX_TIME_MS
        ):
            return None, (
                f"{name} time must be a nonnegative integer "
                "in milliseconds."
            )

    if end_ms <= start_ms:
        return None, "End time must be after start time."

    if end_ms > duration_ms:
        return None, "The passage extends beyond the recording."

    if not isinstance(note, str):
        return None, "The note must be text."

    if len(note) > 5000:
        return None, "The note must be 5,000 characters or fewer."

    return {
        "label": label,
        "start_ms": start_ms,
        "end_ms": end_ms,
        "note": note,
    }, None


def recording_unavailable(recording):
    return (
        recording["upload_status"] != "ready"
        or recording["duration_ms"] is None
    )


def find_owned_recording(cursor, recording_id):
    cursor.execute(
        """
        SELECT r.id, r.duration_ms, r.upload_status
        FROM public.recordings AS r
        JOIN public.pieces AS p ON p.id = r.piece_id
        WHERE r.id = %s
          AND p.owner_id = %s
        FOR SHARE OF r, p
        """,
        (recording_id, g.user["id"]),
    )
    return cursor.fetchone()


def find_owned_passage(cursor, passage_id):
    cursor.execute(
        """
        SELECT
            pa.*,
            r.duration_ms,
            r.upload_status
        FROM public.passages AS pa
        JOIN public.recordings AS r ON r.id = pa.recording_id
        JOIN public.pieces AS p ON p.id = r.piece_id
        WHERE pa.id = %s
          AND p.owner_id = %s
        FOR UPDATE OF pa
        FOR SHARE OF r, p
        """,
        (passage_id, g.user["id"]),
    )
    return cursor.fetchone()


@passages_bp.post("/recordings/<uuid:recording_id>/passages")
@require_auth
def create_passage(recording_id):
    data, error = read_payload()

    if error:
        return jsonify({"error": error}), 400

    with get_connection() as connection:
        with connection.cursor() as cursor:
            recording = find_owned_recording(cursor, recording_id)

            if recording is None:
                return jsonify({"error": "Recording not found."}), 404

            if recording_unavailable(recording):
                return jsonify({
                    "error": (
                        "The recording must be ready and have a known "
                        "duration before saving passages."
                    )
                }), 409

            values, error = validate_passage(
                data, recording["duration_ms"]
            )

            if error:
                return jsonify({"error": error}), 400

            cursor.execute(
                """
                INSERT INTO public.passages (
                    recording_id, label, start_ms, end_ms, note
                )
                VALUES (%s, %s, %s, %s, %s)
                RETURNING *
                """,
                (
                    recording_id,
                    values["label"],
                    values["start_ms"],
                    values["end_ms"],
                    values["note"],
                ),
            )
            passage = cursor.fetchone()

    return jsonify(serialize_passage(passage)), 201


@passages_bp.get("/recordings/<uuid:recording_id>/passages")
@require_auth
def list_passages(recording_id):
    with get_connection() as connection:
        with connection.cursor() as cursor:
            recording = find_owned_recording(cursor, recording_id)

            if recording is None:
                return jsonify({"error": "Recording not found."}), 404

            cursor.execute(
                """
                SELECT *
                FROM public.passages
                WHERE recording_id = %s
                ORDER BY start_ms ASC, created_at ASC, id ASC
                """,
                (recording_id,),
            )
            passages = cursor.fetchall()

    return jsonify({
        "items": [
            serialize_passage(passage) for passage in passages
        ]
    }), 200


@passages_bp.patch("/passages/<uuid:passage_id>")
@require_auth
def edit_passage(passage_id):
    data, error = read_payload()

    if error:
        return jsonify({"error": error}), 400

    with get_connection() as connection:
        with connection.cursor() as cursor:
            passage = find_owned_passage(cursor, passage_id)

            if passage is None:
                return jsonify({"error": "Passage not found."}), 404

            if recording_unavailable(passage):
                return jsonify({
                    "error": (
                        "The recording must be ready and have a known "
                        "duration before editing passages."
                    )
                }), 409

            # Validate the complete passage, including unchanged fields.
            merged = {
                field: passage[field]
                for field in EDITABLE_FIELDS
            }
            merged.update(data)

            values, error = validate_passage(
                merged, passage["duration_ms"]
            )

            if error:
                return jsonify({"error": error}), 400

            cursor.execute(
                """
                UPDATE public.passages
                SET label = %s,
                    start_ms = %s,
                    end_ms = %s,
                    note = %s
                WHERE id = %s
                RETURNING *
                """,
                (
                    values["label"],
                    values["start_ms"],
                    values["end_ms"],
                    values["note"],
                    passage_id,
                ),
            )
            updated = cursor.fetchone()

    return jsonify(serialize_passage(updated)), 200


@passages_bp.delete("/passages/<uuid:passage_id>")
@require_auth
def delete_passage(passage_id):
    with get_connection() as connection:
        with connection.cursor() as cursor:
            passage = find_owned_passage(cursor, passage_id)

            if passage is None:
                return jsonify({"error": "Passage not found."}), 404

            cursor.execute(
                """
                DELETE FROM public.passages
                WHERE id = %s
                """,
                (passage_id,),
            )

    return "", 204