import os
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

# Absolute path so the DB location is stable regardless of working directory
_DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "processor.db")
DATABASE_URL = f"sqlite:///{os.path.normpath(_DB_PATH)}"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
