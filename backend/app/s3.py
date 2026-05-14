"""
S3-compatible object storage client.

Configured entirely from environment variables so the same code works against
MinIO locally, Cloudflare R2, or AWS S3 in production — only the env vars change.

  S3_ENDPOINT_URL  — MinIO: http://localhost:9000
                     AWS S3: omit (boto3 uses the regional default)
                     R2: https://<account>.r2.cloudflarestorage.com
  S3_ACCESS_KEY    — MinIO default: minioadmin
  S3_SECRET_KEY    — MinIO default: minioadmin
  S3_BUCKET        — bucket name (created on startup if it doesn't exist)
  S3_REGION        — AWS region; unused by MinIO but required by boto3 signature

boto3 client vs resource:
  client   — low-level, 1:1 with the S3 REST API.  Used here for upload,
              presigned URL generation, and delete — all single-object ops.
  resource — higher-level ORM-like wrapper.  Useful for bucket-level iteration
              but adds overhead we don't need for simple CRUD.
"""
import logging
import os
import boto3
from botocore.config import Config
from botocore.exceptions import ClientError, EndpointConnectionError

log = logging.getLogger(__name__)

S3_ENDPOINT_URL = os.getenv("S3_ENDPOINT_URL", "http://localhost:9000")
S3_ACCESS_KEY   = os.getenv("S3_ACCESS_KEY",   "minioadmin")
S3_SECRET_KEY   = os.getenv("S3_SECRET_KEY",   "minioadmin")
S3_BUCKET       = os.getenv("S3_BUCKET",       "processor-docs")
S3_REGION       = os.getenv("S3_REGION",       "us-east-1")

# path-style addressing is required for MinIO (and most non-AWS providers).
# AWS S3 uses virtual-hosted-style by default (bucket.s3.amazonaws.com);
# MinIO only serves bucket.endpoint or endpoint/bucket — path style is safer.
_config = Config(signature_version="s3v4", s3={"addressing_style": "path"})


def get_s3_client():
    return boto3.client(
        "s3",
        endpoint_url=S3_ENDPOINT_URL,
        aws_access_key_id=S3_ACCESS_KEY,
        aws_secret_access_key=S3_SECRET_KEY,
        region_name=S3_REGION,
        config=_config,
    )


def ensure_bucket() -> None:
    """Create the bucket if it doesn't already exist.

    Called once at startup from main.py.  Idempotent — safe to call on every
    restart.  On AWS S3 the bucket must be pre-created; on MinIO and R2 this
    works without extra permissions.
    """
    client = get_s3_client()
    try:
        client.head_bucket(Bucket=S3_BUCKET)
    except EndpointConnectionError:
        # S3/MinIO is not reachable at startup — warn and continue.
        # The app starts successfully; uploads will fail with a clear error
        # until the storage backend comes online.
        log.warning("S3 endpoint unreachable at startup — document upload will be unavailable until MinIO/S3 is running")
    except ClientError as e:
        # head_bucket raises ClientError, not NoSuchBucket — check the HTTP code.
        # 404 → bucket absent, create it.
        # 409 → bucket exists but owned by this account (MinIO race).
        # Anything else (403 auth) → re-raise so startup fails loudly rather than
        # silently proceeding to a state where every upload fails.
        code = e.response["Error"]["Code"]
        if code in ("404", "NoSuchBucket"):
            client.create_bucket(Bucket=S3_BUCKET)
        elif code != "409":
            raise
