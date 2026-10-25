import math
from pathlib import Path
from uuid import uuid4

from flask import Blueprint, current_app, g, jsonify, request
from mutagen import MutagenError
from mutagen.mp3 import MP3
from mutagen.mp4 import MP4
from mutagen.wave import WAVE
from werkzeug.exceptions import RequestEntityTooLarge

from app.auth import require_auth
from app.db import get_connection
from app.storage import get_storage_client


recordings_bp = Blueprint("recordings", __name__)

MAX_FILE_BYTES = 25 * 1024 * 1024

AUDIO_FORMATS = {
    ".mp3": (MP3, "audio/mpeg"),
    ".wav": (WAVE, "audio/wav"),
    ".m4a": (MP4, "audio/mp4"),
}


@recordings_bp.app_errorhandler(RequestEntityTooLarge)
def upload_too_large(error):
    return jsonify({"error": "The upload request is too large."}), 413


@recordings_bp.post("/pieces/<uuid:piece_id>/recordings")
@require_auth
def upload_recording(piece_id):
    # Check ownership before processing or storing the file.
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id FROM public.pieces
                WHERE id = %s AND owner_id = %s
                """,
                (piece_id, g.user["id"]),
            )
            piece = cursor.fetchone()

    if piece is None:
        return jsonify({"error": "Piece not found."}), 404

    audio_file = request.files.get("file")
    title = request.form.get("title", "").strip()

    if not title:
        return jsonify({"error": "Recording title is required."}), 400

    if audio_file is None or not audio_file.filename:
        return jsonify({"error": "An audio file is required."}), 400

    suffix = Path(audio_file.filename).suffix.lower()

    if suffix not in AUDIO_FORMATS:
        return jsonify({"error": "Use an MP3, WAV, or M4A file."}), 415

    # Measure the file without loading all its bytes into memory.
    audio_file.stream.seek(0, 2)
    size_bytes = audio_file.stream.tell()
    audio_file.stream.seek(0)

    if size_bytes == 0:
        return jsonify({"error": "The file is empty."}), 400

    if size_bytes > MAX_FILE_BYTES:
        return jsonify({"error": "Maximum file size is 25 MiB."}), 413

    parser, content_type = AUDIO_FORMATS[suffix]

    try:
        audio = parser(audio_file.stream)
        duration = audio.info.length

        if not math.isfinite(duration) or duration <= 0:
            raise ValueError("Invalid duration")

        duration_ms = round(duration * 1000)

        if duration_ms > 2_147_483_647:
            raise ValueError("Duration exceeds database limit")
    except (MutagenError, ValueError, EOFError):
        return jsonify({
            "error": "Could not read this audio file."
        }), 415
    finally:
        audio_file.stream.seek(0)

    recording_id = uuid4()
    key = f"recordings/{g.user['id']}/{recording_id}{suffix}"
    bucket = current_app.config["R2_BUCKET_NAME"]
    storage = get_storage_client()

    try:
        storage.upload_fileobj(
            audio_file.stream,
            bucket,
            key,
            ExtraArgs={
                "ContentType": content_type,
                "ContentDisposition": "inline",
            },
        )

        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO public.recordings (
                        id, piece_id, title, storage_key,
                        original_filename, content_type,
                        size_bytes, duration_ms, upload_status
                    )
                    SELECT
                        %s, p.id, %s, %s, %s, %s, %s, %s, 'ready'
                    FROM public.pieces AS p
                    WHERE p.id = %s AND p.owner_id = %s
                    RETURNING id, piece_id, title, duration_ms, created_at
                    """,
                    (
                        recording_id,
                        title,
                        key,
                        audio_file.filename,
                        content_type,
                        size_bytes,
                        duration_ms,
                        piece_id,
                        g.user["id"],
                    ),
                )
                recording = cursor.fetchone()

                if recording is None:
                    raise RuntimeError("Piece no longer available")

    except Exception:
        current_app.logger.exception("Recording upload failed")

        # Try to remove the object if the operation did not finish.
        try:
            storage.delete_object(Bucket=bucket, Key=key)
        except Exception:
            current_app.logger.exception(
                "Could not clean up recording object"
            )

        return jsonify({
            "error": "Could not save the recording. Please try again."
        }), 503

    return jsonify({
        "id": str(recording["id"]),
        "piece_id": str(recording["piece_id"]),
        "title": recording["title"],
        "duration_ms": recording["duration_ms"],
        "created_at": recording["created_at"].isoformat(),
        "upload_status": "ready",
    }), 201