from datetime import datetime
from sqlalchemy import String, Integer, ForeignKey, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class PatientDocument(Base):
    __tablename__ = "patient_documents"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    # index=True: documents are always listed by patient — this FK is the
    # primary filter on every query in this table.
    patient_id: Mapped[int] = mapped_column(
        ForeignKey("patients.id", ondelete="CASCADE"), index=True
    )

    # Human-readable original filename preserved for download Content-Disposition.
    filename: Mapped[str] = mapped_column(String(255))

    # S3 object key — the path inside the bucket.
    # Format: patients/{patient_id}/{uuid}_{filename}
    # Stored separately from filename so renames don't break the storage reference.
    s3_key: Mapped[str] = mapped_column(String(512))

    content_type: Mapped[str] = mapped_column(String(100))
    size_bytes: Mapped[int] = mapped_column(Integer)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
