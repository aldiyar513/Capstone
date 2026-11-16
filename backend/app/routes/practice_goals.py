from uuid import UUID

from flask import Blueprint, g, jsonify, request

from app.auth import require_auth
from app.db import get_connection


practice_goals_bp = Blueprint("practice_goals", __name__)


def serialize_goal(goal):
    return {
        "id": str(goal["id"]),
        "piece_id": str(goal["piece_id"]),
        "title": goal["title"],
        "created_at": goal["created_at"].isoformat(),
        "updated_at": goal["updated_at"].isoformat(),
    }


def serialize_link(link):
    return {
        "goal_id": str(link["goal_id"]),
        "passage_id": str(link["passage_id"]),
        "recording_id": str(link["recording_id"]),
        "recording_title": link["recording_title"],
        "label": link["label"],
        "start_ms": link["start_ms"],
        "end_ms": link["end_ms"],
        "linked_at": link["linked_at"].isoformat(),
    }


def find_owned_piece(cursor, piece_id):
    cursor.execute(
        """
        SELECT id
        FROM public.pieces
        WHERE id = %s
          AND owner_id = %s
        FOR SHARE
        """,
        (piece_id, g.user["id"]),
    )
    return cursor.fetchone()


def find_owned_goal(cursor, goal_id):
    cursor.execute(
        """
        SELECT goal.*
        FROM public.practice_goals AS goal
        JOIN public.pieces AS piece ON piece.id = goal.piece_id
        WHERE goal.id = %s
          AND piece.owner_id = %s
        FOR SHARE OF goal, piece
        """,
        (goal_id, g.user["id"]),
    )
    return cursor.fetchone()


def find_owned_passage(cursor, passage_id):
    cursor.execute(
        """
        SELECT
            passage.id,
            recording.piece_id,
            recording.upload_status
        FROM public.passages AS passage
        JOIN public.recordings AS recording
            ON recording.id = passage.recording_id
        JOIN public.pieces AS piece
            ON piece.id = recording.piece_id
        WHERE passage.id = %s
          AND piece.owner_id = %s
        FOR SHARE OF passage, recording, piece
        """,
        (passage_id, g.user["id"]),
    )
    return cursor.fetchone()


def fetch_link(cursor, goal_id, passage_id):
    cursor.execute(
        """
        SELECT
            link.goal_id,
            link.passage_id,
            link.created_at AS linked_at,
            passage.recording_id,
            passage.label,
            passage.start_ms,
            passage.end_ms,
            recording.title AS recording_title
        FROM public.practice_goal_passages AS link
        JOIN public.passages AS passage
            ON passage.id = link.passage_id
        JOIN public.recordings AS recording
            ON recording.id = passage.recording_id
        WHERE link.goal_id = %s
          AND link.passage_id = %s
        """,
        (goal_id, passage_id),
    )
    return cursor.fetchone()


@practice_goals_bp.post("/pieces/<uuid:piece_id>/goals")
@require_auth
def create_goal(piece_id):
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({"error": "A JSON object is required."}), 400

    if set(data) - {"title"}:
        return jsonify({"error": "Only title can be provided."}), 400

    title = data.get("title")

    if not isinstance(title, str):
        return jsonify({"error": "A goal title is required."}), 400

    title = title.strip()

    if not 1 <= len(title) <= 120:
        return jsonify({
            "error": "The title must contain 1–120 characters."
        }), 400

    with get_connection() as connection:
        with connection.cursor() as cursor:
            piece = find_owned_piece(cursor, piece_id)

            if piece is None:
                return jsonify({"error": "Piece not found."}), 404

            cursor.execute(
                """
                INSERT INTO public.practice_goals (piece_id, title)
                VALUES (%s, %s)
                RETURNING *
                """,
                (piece_id, title),
            )
            goal = cursor.fetchone()

    return jsonify(serialize_goal(goal)), 201


@practice_goals_bp.get("/pieces/<uuid:piece_id>/goals")
@require_auth
def list_goals(piece_id):
    with get_connection() as connection:
        with connection.cursor() as cursor:
            piece = find_owned_piece(cursor, piece_id)

            if piece is None:
                return jsonify({"error": "Piece not found."}), 404

            cursor.execute(
                """
                SELECT *
                FROM public.practice_goals
                WHERE piece_id = %s
                ORDER BY created_at DESC, id ASC
                """,
                (piece_id,),
            )
            goals = cursor.fetchall()

    return jsonify({
        "items": [serialize_goal(goal) for goal in goals]
    }), 200


@practice_goals_bp.get("/goals/<uuid:goal_id>/passages")
@require_auth
def list_goal_passages(goal_id):
    with get_connection() as connection:
        with connection.cursor() as cursor:
            goal = find_owned_goal(cursor, goal_id)

            if goal is None:
                return jsonify({"error": "Goal not found."}), 404

            cursor.execute(
                """
                SELECT
                    link.goal_id,
                    link.passage_id,
                    link.created_at AS linked_at,
                    passage.recording_id,
                    passage.label,
                    passage.start_ms,
                    passage.end_ms,
                    recording.title AS recording_title
                FROM public.practice_goal_passages AS link
                JOIN public.passages AS passage
                    ON passage.id = link.passage_id
                JOIN public.recordings AS recording
                    ON recording.id = passage.recording_id
                WHERE link.goal_id = %s
                ORDER BY
                    recording.created_at ASC,
                    passage.start_ms ASC,
                    passage.id ASC
                """,
                (goal_id,),
            )
            links = cursor.fetchall()

    return jsonify({
        "goal": serialize_goal(goal),
        "items": [serialize_link(link) for link in links],
    }), 200


@practice_goals_bp.post("/goals/<uuid:goal_id>/passages")
@require_auth
def link_passage(goal_id):
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({"error": "A JSON object is required."}), 400

    if set(data) - {"passage_id"}:
        return jsonify({
            "error": "Only passage_id can be provided."
        }), 400

    try:
        passage_id = UUID(str(data.get("passage_id")))
    except (ValueError, TypeError, AttributeError):
        return jsonify({
            "error": "A valid passage_id is required."
        }), 400

    with get_connection() as connection:
        with connection.cursor() as cursor:
            goal = find_owned_goal(cursor, goal_id)

            if goal is None:
                return jsonify({"error": "Goal not found."}), 404

            passage = find_owned_passage(cursor, passage_id)

            if passage is None:
                return jsonify({"error": "Passage not found."}), 404

            if passage["piece_id"] != goal["piece_id"]:
                return jsonify({
                    "error": (
                        "The passage must belong to the same piece "
                        "as the practice goal."
                    )
                }), 400

            if passage["upload_status"] != "ready":
                return jsonify({
                    "error": "The recording must be ready before linking."
                }), 409

            cursor.execute(
                """
                INSERT INTO public.practice_goal_passages (
                    goal_id, passage_id
                )
                VALUES (%s, %s)
                ON CONFLICT (goal_id, passage_id) DO NOTHING
                RETURNING passage_id
                """,
                (goal_id, passage_id),
            )
            created = cursor.fetchone() is not None

            link = fetch_link(cursor, goal_id, passage_id)

    # Repeating the same request returns the existing link.
    return jsonify(serialize_link(link)), 201 if created else 200


@practice_goals_bp.delete(
    "/goals/<uuid:goal_id>/passages/<uuid:passage_id>"
)
@require_auth
def unlink_passage(goal_id, passage_id):
    with get_connection() as connection:
        with connection.cursor() as cursor:
            goal = find_owned_goal(cursor, goal_id)

            if goal is None:
                return jsonify({"error": "Goal not found."}), 404

            cursor.execute(
                """
                DELETE FROM public.practice_goal_passages
                WHERE goal_id = %s
                  AND passage_id = %s
                """,
                (goal_id, passage_id),
            )

    # Removing an already absent link is also successful.
    return "", 204