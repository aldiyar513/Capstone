import os
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, app
from app.routes.pieces import pieces_bp
from app.routes.auth import auth_bp
from app.routes.health import health_bp
from app.routes.recordings import recordings_bp
from app.routes.comments import comments_bp

def create_app():
    backend_dir = Path(__file__).resolve().parent.parent
    load_dotenv(backend_dir / ".env")

    app = Flask(__name__)
    app.config["DATABASE_URL"] = os.getenv("DATABASE_URL", "")

    if not app.config["DATABASE_URL"]:
        raise RuntimeError("Set DATABASE_URL in backend/.env")

    app.config["SUPABASE_URL"] = os.getenv(
        "SUPABASE_URL", ""
    ).rstrip("/")
    app.config["SUPABASE_PUBLISHABLE_KEY"] = os.getenv(
        "SUPABASE_PUBLISHABLE_KEY", ""
    )

    if not (
        app.config["SUPABASE_URL"]
        and app.config["SUPABASE_PUBLISHABLE_KEY"]
    ):
        raise RuntimeError(
            "Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in backend/.env"
        )

    app.register_blueprint(health_bp, url_prefix="/api/v1")
    app.register_blueprint(auth_bp, url_prefix="/api/v1")
    app.register_blueprint(pieces_bp, url_prefix="/api/v1")
    for name in (
    "R2_ENDPOINT_URL",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET_NAME",
):
        app.config[name] = os.getenv(name, "")
    

    app.config["MAX_CONTENT_LENGTH"] = 26 * 1024 * 1024
    app.register_blueprint(recordings_bp, url_prefix="/api/v1")
    app.register_blueprint(comments_bp, url_prefix="/api/v1")
    return app