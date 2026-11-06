from sqlmodel import SQLModel, create_engine

from app.config import settings

engine = create_engine(f"sqlite:///{settings.db_file}", echo=False)


def init_db() -> None:
    import app.models  # noqa: F401  — registra las tablas

    SQLModel.metadata.create_all(engine)
