import argparse
import os
from pathlib import Path
from uuid import uuid4

import boto3
from botocore.config import Config
from dotenv import load_dotenv


load_dotenv(Path(__file__).resolve().parent / ".env")

parser = argparse.ArgumentParser()
parser.add_argument("file", help="Path to a small MP3 or WAV file")
args = parser.parse_args()

audio_path = Path(args.file).expanduser().resolve()

content_types = {
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
}

if not audio_path.is_file():
    raise SystemExit("File not found. Check the audio file path.")

content_type = content_types.get(audio_path.suffix.lower())

if not content_type:
    raise SystemExit("For this test, use an MP3, WAV, or M4A file.")

required = [
    "R2_ENDPOINT_URL",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET_NAME",
]

for name in required:
    if not os.getenv(name):
        raise SystemExit(f"Missing {name} in backend/.env")

storage = boto3.client(
    "s3",
    endpoint_url=os.environ["R2_ENDPOINT_URL"],
    aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
    aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
    region_name="auto",
    config=Config(
        signature_version="s3v4",
        connect_timeout=10,
        read_timeout=60,
    ),
)

bucket = os.environ["R2_BUCKET_NAME"]
key = f"tests/{uuid4().hex}{audio_path.suffix.lower()}"

storage.upload_file(
    str(audio_path),
    bucket,
    key,
    ExtraArgs={
        "ContentType": content_type,
        "ContentDisposition": "inline",
    },
)

url = storage.generate_presigned_url(
    "get_object",
    Params={"Bucket": bucket, "Key": key},
    ExpiresIn=900,
)

print(f"Uploaded successfully. Storage key: {key}")
print("Open this temporary playback link within 15 minutes:")
print(url)