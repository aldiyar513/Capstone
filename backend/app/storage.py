import boto3
from botocore.config import Config
from flask import current_app


def get_storage_client():
    return boto3.client(
        "s3",
        endpoint_url=current_app.config["R2_ENDPOINT_URL"],
        aws_access_key_id=current_app.config["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=current_app.config[
            "R2_SECRET_ACCESS_KEY"
        ],
        region_name="auto",
        config=Config(
            signature_version="s3v4",
            connect_timeout=10,
            read_timeout=60,
        ),
    )