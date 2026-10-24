import os
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask

from app.routes.auth import auth_bp
from app.routes.health import health_bp


def create_app():
    backend_dir = Path(__file__).resolve().parent.parent
    load_dotenv(backend_dir / ".env")

    app = Flask(__name__)

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

    return app