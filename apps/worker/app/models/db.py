from contextlib import contextmanager
from typing import Generator
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, Session
from app.config.settings import settings
from app.models.generated_models import Base
import boto3
import logging

logger = logging.getLogger(__name__)

# Initialize SQLAlchemy Engine
# Provide a placeholder "database" if DB_IAM_AUTH_ENABLED is True, otherwise use DATABASE_URL
engine = create_engine(settings.DATABASE_URL if not settings.DB_IAM_AUTH_ENABLED else "database" , pool_pre_ping=True)

if settings.DB_IAM_AUTH_ENABLED:
    logger.info("IAM Auth enabled for worker: Registering do_connect event for dynamic token generation.")
    
    @event.listens_for(engine, "do_connect")
    def receive_do_connect(dialect, conn_rec, cargs, cparams):
        try:
            client = boto3.client('rds', region_name=settings.AWS_REGION)
            token = client.generate_db_auth_token(
                DBHostname=settings.DB_HOST,
                Port=settings.DB_PORT,
                DBUsername=settings.DB_USER,
                Region=settings.AWS_REGION
            )
            cparams["password"] = token
            # IAM Auth requires an SSL connection.
            # Enforcing verify-full with the CA cert injected in Dockerfile.
            cparams["sslmode"] = "verify-full" if settings.DB_SSL else "disable"
            cparams["sslrootcert"] = settings.DB_SSL_ROOT_CERT if settings.DB_SSL else None
        except Exception as e:
            logger.error(f"Failed to generate RDS IAM token: {e}")
            raise

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@contextmanager
def get_db() -> Generator[Session, None, None]:
    """Provide a transactional scope around database operations with proper cleanup."""
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
