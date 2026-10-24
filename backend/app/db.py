import psycopg
from flask import current_app
from psycopg.rows import dict_row


def get_connection():
    return psycopg.connect(
        current_app.config["DATABASE_URL"],
        sslmode="require",
        connect_timeout=10,
        row_factory=dict_row,
    )