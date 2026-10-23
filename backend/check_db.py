import os
from pathlib import Path

import psycopg
from dotenv import load_dotenv


load_dotenv(Path(__file__).resolve().parent / ".env")

database_url = os.getenv("DATABASE_URL")

if not database_url:
    raise RuntimeError("DATABASE_URL is missing from backend/.env")

with psycopg.connect(
    database_url,
    sslmode="require",
    connect_timeout=10,
) as connection:
    with connection.cursor() as cursor:
        cursor.execute("SELECT COUNT(*) FROM public.pieces;")
        count = cursor.fetchone()[0]

print(f"Database connected successfully! Pieces: {count}")