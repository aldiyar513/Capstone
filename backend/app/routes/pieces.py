from flask import Blueprint, g, jsonify, request

from app.auth import require_auth
from app.db import get_connection


pieces_bp = Blueprint("pieces", __name__)


def serialize_piece(piece):
    return {
        "id": str(piece["id"]),
        "title": piece["title"],
        "instrument": piece["instrument"],
        "description": piece["description"],
        "created_at": piece["created_at"].isoformat(),
        "updated_at": piece["updated_at"].isoformat(),
    }


@pieces_bp.post("/pieces")
@require_auth
def create_piece():
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({"error": "A JSON object is required."}), 400

    title = data.get("title")
    instrument = data.get("instrument")
    description = data.get("description")

    if not isinstance(title, str) or not title.strip():
        return jsonify({"error": "Title is required."}), 400

    if not isinstance(instrument, str) or not instrument.strip():
        return jsonify({"error": "Instrument is required."}), 400

    if description is not None and not isinstance(description, str):
        return jsonify({
            "error": "Description must be text or null."
        }), 400

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO public.pieces
                    (owner_id, title, instrument, description)
                VALUES (%s, %s, %s, %s)
                RETURNING
                    id, title, instrument, description,
                    created_at, updated_at
                """,
                (
                    g.user["id"],
                    title.strip(),
                    instrument.strip(),
                    description,
                ),
            )

            piece = cursor.fetchone()

    return jsonify(serialize_piece(piece)), 201


@pieces_bp.get("/pieces")
@require_auth
def list_pieces():
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT
                    id, title, instrument, description,
                    created_at, updated_at
                FROM public.pieces
                WHERE owner_id = %s
                ORDER BY created_at DESC, id DESC
                """,
                (g.user["id"],),
            )

            pieces = cursor.fetchall()

    return jsonify({
        "items": [serialize_piece(piece) for piece in pieces]
    }), 200