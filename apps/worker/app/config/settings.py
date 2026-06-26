import os
from dotenv import load_dotenv

# Path to local apps/worker/.env file
WORKER_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
dotenv_path = os.path.join(WORKER_DIR, ".env")

# Load environment variables if they exist locally
if os.path.exists(dotenv_path):
    load_dotenv(dotenv_path)
else:
    load_dotenv()  # Fallback to current working directory .env

class Settings:
    # Postgres Configuration
    DATABASE_URL: str = os.getenv("DATABASE_URL")
    
    # Strip query parameters like schema=public if present for SQLAlchemy
    if "?" in DATABASE_URL:
        DATABASE_URL = DATABASE_URL.split("?")[0]

    # AWS SQS Configuration
    AWS_REGION: str = os.getenv("AWS_REGION")
    LOCALSTACK_URL: str = os.getenv("LOCALSTACK_URL")
    # AWS SQS Queue URLs
    QUEUE_URL: str = os.getenv("QUEUE_URL")
    DLQ_URL: str = os.getenv("DLQ_URL")
    
    # AWS S3 Configuration
    S3_BUCKET_NAME: str = os.getenv("S3_BUCKET_NAME")
    
    # AWS Credentials (optional, mock keys used for Localstack)
    AWS_ACCESS_KEY_ID: str = os.getenv("AWS_ACCESS_KEY_ID")
    AWS_SECRET_ACCESS_KEY: str = os.getenv("AWS_SECRET_ACCESS_KEY")

settings = Settings()
