from flask import Flask

from app.routes.health import health_bp


def create_app():
    app = Flask(__name__)

    app.register_blueprint(health_bp, url_prefix="/api/v1")

    return app