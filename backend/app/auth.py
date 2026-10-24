from functools import wraps

import requests
from flask import current_app, g, jsonify, request


def require_auth(view):
    @wraps(view)
    def wrapped_view(*args, **kwargs):
        authorization = request.headers.get("Authorization", "")
        parts = authorization.split()

        if len(parts) != 2 or parts[0].lower() != "bearer":
            return jsonify({
                "error": "A Bearer access token is required."
            }), 401

        try:
            response = requests.get(
                f"{current_app.config['SUPABASE_URL']}/auth/v1/user",
                headers={
                    "apikey": current_app.config[
                        "SUPABASE_PUBLISHABLE_KEY"
                    ],
                    "Authorization": f"Bearer {parts[1]}",
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
        except ValueError:
            return jsonify({
                "error": "Unexpected authentication response."
            }), 503

        if not isinstance(user, dict) or not user.get("id"):
            return jsonify({
                "error": "Unexpected authentication response."
            }), 503

        g.user = user

        return view(*args, **kwargs)

    return wrapped_view