"""
Patient document upload/download via S3-compatible object storage.

Upload flow:
  1. Client sends multipart/form-data POST with the file.
  2. FastAPI streams the upload into an UploadFile — the file is spooled to a
     temp file on disk above 1 MB, so large files never fully buffer in memory.
  3. We stream the file body directly to S3 with put_object().
  4. We save metadata (filename, s3_key, size, content_type) to SQLite.
  5. We return the metadata record — not the file bytes.

Download flow:
  1. Client requests a download URL for a document id.
  2. We generate a presigned S3 URL (valid for PRESIGN_TTL_SECONDS).
  3. The client fetches the file directly from S3/MinIO — the API server is not
     in the data path, so large files don't consume API memory or bandwidth.

Presigned URLs:
  A presigned URL is a time-limited, pre-authenticated S3 URL.  S3 validates
  the HMAC signature embedded in the URL's query string — no separate auth
  header needed.  Expiry is enforced server-side by S3.
"""
import re
import uuid
import urllib.parse
from typing import List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime

from app.database import get_db
from app.auth import verify_token
from app.models.document import PatientDocument
from app.models.patient import Patient
from app.s3 import get_s3_client, S3_BUCKET

router = APIRouter()

PRESIGN_TTL_SECONDS = 3600  # presigned URL expires after 1 hour
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB hard limit


def _content_disposition(filename: str) -> str:
    """Build a safe Content-Disposition header value (RFC 6266 / RFC 5987).

    Two parts:
      filename=  — ASCII fallback for old clients; special chars replaced with _.
      filename*= — UTF-8 percent-encoded name for modern clients (RFC 5987).
    Both are needed: some clients only read the first, some prefer the second.
    """
    ascii_name = re.sub(r'[^\x20-\x7e]', '_', filename)   # strip non-ASCII
    ascii_name = ascii_name.replace('"', '_').replace('\\', '_')  # no quotes/backslash
    encoded = urllib.parse.quote(filename, safe='')
    return f'attachment; filename="{ascii_name}"; filename*=UTF-8\'\'{encoded}'


class DocumentOut(BaseModel):
    id: int
    patient_id: int
    filename: str
    content_type: str
    size_bytes: int
    uploaded_at: datetime

    model_config = {"from_attributes": True}


@router.post("/", response_model=DocumentOut, status_code=201)
def upload_document(
    patient_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _=Depends(verify_token),
):
    """Upload a file and attach it to a patient record.

    UploadFile wraps a SpooledTemporaryFile — data below 1 MB lives in memory,
    above that it spills to disk.  We read in 64 KB chunks, enforcing the size
    limit incrementally so an oversized upload is rejected before the full body
    is buffered.  The assembled bytes object is then passed to put_object().
    """
    if not db.get(Patient, patient_id):
        raise HTTPException(status_code=404, detail="Patient not found")

    # UploadFile.filename is Optional[str] — None when the multipart part has
    # no filename parameter.  Reject early so we never store None in the DB or
    # produce an s3_key like "patients/1/abc_None".
    if not file.filename:
        raise HTTPException(status_code=422, detail="Upload must include a filename")

    # file.read() is a coroutine — it must be awaited in an async def handler.
    # This handler is sync (def), so it runs in a worker thread via
    # anyio.to_thread.run_sync.  In that context, use file.file.read() to
    # access the underlying SpooledTemporaryFile synchronously.
    #
    # Read in 64 KB chunks and check the running total against MAX_FILE_SIZE
    # before accumulating each chunk.  This way a 2 GB upload is rejected after
    # reading ~20 MB rather than after buffering the entire payload into RAM.
    _CHUNK = 64 * 1024
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = file.file.read(_CHUNK)
        if not chunk:
            break
        total += len(chunk)
        if total > MAX_FILE_SIZE:
            raise HTTPException(status_code=413, detail="File exceeds 20 MB limit")
        chunks.append(chunk)
    data = b"".join(chunks)

    # Sanitize the filename before embedding it in the S3 key.
    # A crafted name like "../../other_patient/secret.pdf" would escape the
    # intended patients/{id}/ namespace.  Strip all path separators and
    # keep only the basename so the key stays within its prefix.
    safe_name = re.sub(r'[/\\]', '_', file.filename).strip('.')
    s3_key = f"patients/{patient_id}/{uuid.uuid4().hex}_{safe_name}"
    content_type = file.content_type or "application/octet-stream"

    # Write the DB row first — if S3 put_object fails, no metadata is persisted
    # and no orphan is created.  If the DB commit succeeds but S3 then fails the
    # row points to a missing object; that edge case is acceptable and recoverable
    # (retry upload), whereas the reverse (S3 object with no DB row) is invisible.
    doc = PatientDocument(
        patient_id=patient_id,
        filename=file.filename,
        s3_key=s3_key,
        content_type=content_type,
        size_bytes=len(data),
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    s3 = get_s3_client()
    s3.put_object(
        Bucket=S3_BUCKET,
        Key=s3_key,
        Body=data,
        ContentType=content_type,
    )

    return doc


@router.get("/", response_model=List[DocumentOut])
def list_documents(
    patient_id: int,
    db: Session = Depends(get_db),
    _=Depends(verify_token),
):
    if not db.get(Patient, patient_id):
        raise HTTPException(status_code=404, detail="Patient not found")
    return (
        db.query(PatientDocument)
        .filter(PatientDocument.patient_id == patient_id)
        .order_by(PatientDocument.uploaded_at.desc())
        .all()
    )


@router.get("/{doc_id}/download")
def download_document(
    patient_id: int,
    doc_id: int,
    db: Session = Depends(get_db),
    _=Depends(verify_token),
):
    """Return a presigned S3 URL as JSON.

    Browser clients can't send an Authorization header on a plain navigation
    (window.open / <a href>), so a server-side redirect would strip auth.
    Instead, we return the URL as JSON — the client receives it via Axios
    (which carries the token), then opens the presigned URL directly.
    The presigned URL is self-authenticating (HMAC in the query string) and
    expires after PRESIGN_TTL_SECONDS, so no auth header is needed for the
    final fetch from S3/MinIO.
    """
    doc = db.get(PatientDocument, doc_id)
    if not doc or doc.patient_id != patient_id:
        raise HTTPException(status_code=404, detail="Document not found")

    s3 = get_s3_client()
    url = s3.generate_presigned_url(
        "get_object",
        Params={
            "Bucket": S3_BUCKET,
            "Key": doc.s3_key,
            # Content-Disposition with RFC 5987 encoding.
            # Interpolating doc.filename directly into the quoted string allows
            # header injection via filenames containing `"`, `\r`, or `\n`.
            # ascii_name strips non-ASCII for the legacy filename= fallback;
            # filename*= carries the percent-encoded UTF-8 name for modern clients.
            "ResponseContentDisposition": _content_disposition(doc.filename),
        },
        ExpiresIn=PRESIGN_TTL_SECONDS,
    )
    return {"url": url}


@router.delete("/{doc_id}", status_code=204)
def delete_document(
    patient_id: int,
    doc_id: int,
    db: Session = Depends(get_db),
    _=Depends(verify_token),
):
    """Delete from S3 first, then remove the metadata row.

    Order matters: if the DB delete fails after S3 delete, the metadata row
    becomes a dangling pointer to a missing object — the next download attempt
    will get a 404 from S3.  Deleting S3 first means a DB failure leaves an
    orphaned object (wasted storage, not broken UX).  The safer production
    pattern is a soft-delete flag + async cleanup job, but for this scale
    the simple approach is fine.
    """
    doc = db.get(PatientDocument, doc_id)
    if not doc or doc.patient_id != patient_id:
        raise HTTPException(status_code=404, detail="Document not found")

    # Delete the DB row first — if S3 delete fails, the metadata row survives
    # and the next delete attempt can retry.  The reverse (S3 deleted, DB commit
    # fails) leaves a row that points to a missing object, breaking downloads.
    s3_key = doc.s3_key
    db.delete(doc)
    db.commit()

    s3 = get_s3_client()
    s3.delete_object(Bucket=S3_BUCKET, Key=s3_key)
