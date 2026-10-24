from flask import Blueprint, g, jsonify

from app.auth import require_auth


auth_bp = Blueprint("auth", __name__)


@auth_bp.get("/me")
@require_auth
def me():
    return jsonify({
        "id": g.user["id"],
        "email": g.user.get("email"),
    }), 200