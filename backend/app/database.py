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
    """
    Dependency provider for a SQLAlchemy Session.

    FastAPI's Depends() system calls this generator for every request that
    declares `db: Session = Depends(get_db)`.  The yield-based pattern maps
    directly onto a context manager:

      Code before yield  →  __enter__: open the session
      yield db           →  provide the value to the route handler
      finally block      →  __exit__: close the session, always — even if
                             the handler raises an exception

    This inverts control of the resource lifecycle: the handler declares
    what it needs (a Session), and FastAPI owns when it is created and
    destroyed.  The handler never calls db.close() — it cannot forget to.

    FastAPI caches each resolved dependency for the duration of a single
    request, so if two route parameters both declare Depends(get_db) they
    receive the same Session instance within that request.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
