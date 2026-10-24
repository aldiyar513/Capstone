import requests
from flask import Blueprint, current_app, jsonify, request

auth_bp = Blueprint("auth", __name__)


@auth_bp.get("/me")
def me():
    # Read the token sent by the frontend.
    authorization = request.headers.get("Authorization", "")
    parts = authorization.split()

    if len(parts) != 2 or parts[0].lower() != "bearer":
        return jsonify({
            "error": "A Bearer access token is required."
        }), 401

    token = parts[1]

    # Ask Supabase to verify the token and return its user.
    try:
        response = requests.get(
            f"{current_app.config['SUPABASE_URL']}/auth/v1/user",
            headers={
                "apikey": current_app.config["SUPABASE_PUBLISHABLE_KEY"],
                "Authorization": f"Bearer {token}",
            },
            timeout=10,
        )
    except requests.RequestException:
        return jsonify({
            "error": "Authentication service is unavailable."
        }), 503

    if response.status_code in (401, 403):
        return jsonify({
            "error": "Invalid or expired access token."
        }), 401

    if response.status_code != 200:
        return jsonify({
            "error": "Could not verify authentication."
        }), 503

    try:
        user = response.json()
        user_id = user["id"]
    except (ValueError, KeyError, TypeError):
        return jsonify({
            "error": "Unexpected authentication response."
        }), 503

    return jsonify({
        "id": user_id,
        "email": user.get("email"),
    }), 200