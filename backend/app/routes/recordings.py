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
from datetime import datetime, timedelta, timezone

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

@recordings_bp.get("/pieces/<uuid:piece_id>/recordings")
@require_auth
def list_recordings(piece_id):
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id FROM public.pieces
                WHERE id = %s AND owner_id = %s
                """,
                (piece_id, g.user["id"]),
            )

            if cursor.fetchone() is None:
                return jsonify({"error": "Piece not found."}), 404

            cursor.execute(
                """
                SELECT r.id, r.title, r.duration_ms, r.created_at
                FROM public.recordings AS r
                JOIN public.pieces AS p ON p.id = r.piece_id
                WHERE r.piece_id = %s
                  AND p.owner_id = %s
                  AND r.upload_status = 'ready'
                ORDER BY r.created_at DESC, r.id DESC
                """,
                (piece_id, g.user["id"]),
            )
            recordings = cursor.fetchall()

    return jsonify({
        "items": [
            {
                "id": str(recording["id"]),
                "title": recording["title"],
                "duration_ms": recording["duration_ms"],
                "created_at": recording["created_at"].isoformat(),
            }
            for recording in recordings
        ]
    }), 200

@recordings_bp.get("/recordings/<uuid:recording_id>/playback-url")
@require_auth
def get_playback_url(recording_id):
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT r.storage_key
                FROM public.recordings AS r
                JOIN public.pieces AS p ON p.id = r.piece_id
                WHERE r.id = %s
                  AND p.owner_id = %s
                  AND r.upload_status = 'ready'
                """,
                (recording_id, g.user["id"]),
            )

            recording = cursor.fetchone()

    if recording is None:
        return jsonify({"error": "Recording not found."}), 404

    lifetime_seconds = 900
    expires_at = datetime.now(timezone.utc) + timedelta(
        seconds=lifetime_seconds
    )

    try:
        storage = get_storage_client()

        url = storage.generate_presigned_url(
            "get_object",
            Params={
                "Bucket": current_app.config["R2_BUCKET_NAME"],
                "Key": recording["storage_key"],
            },
            ExpiresIn=lifetime_seconds,
        )
    except Exception:
        current_app.logger.exception("Could not generate playback URL")
        return jsonify({
            "error": "Playback is temporarily unavailable."
        }), 503

    return jsonify({
        "url": url,
        "expires_at": expires_at.isoformat(),
    }), 200