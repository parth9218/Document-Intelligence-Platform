import os
import tempfile
from abc import ABC, abstractmethod
from botocore.exceptions import ClientError

from app.clients.s3_client import S3Client
from app.config.settings import settings
from app.errors import PermanentFailure
from app.utils.logger import logger

class StorageProvider(ABC):
    @abstractmethod
    def download_file(
        self, 
        remote_path: str, 
        expected_size: int, 
        expected_mime: str
    ) -> str:
        """Verify remote metadata and download the file, returning the local temp file path."""
        pass

class S3StorageProvider(StorageProvider):
    def __init__(self, s3_client: S3Client = None):
        self.s3_client = s3_client or S3Client()
        self.bucket = settings.S3_BUCKET_NAME

    def download_file(
        self, 
        remote_path: str, 
        expected_size: int, 
        expected_mime: str
    ) -> str:
        """Verify object metadata in S3 and download it to a local temporary file."""
        logger.info(f"[S3Storage] Starting metadata verification for: s3://{self.bucket}/{remote_path}")
        
        # 1. Verify object metadata using head_object
        try:
            metadata = self.s3_client.head_object(self.bucket, remote_path)
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "")
            if error_code in ("404", "NoSuchKey"):
                raise PermanentFailure(
                    "file_not_found", 
                    f"Document S3 object not found: s3://{self.bucket}/{remote_path}"
                )
            raise e

        # Assert ContentLength matching
        actual_size = metadata.get("ContentLength", 0)
        if actual_size != expected_size:
            raise PermanentFailure(
                "size_mismatch",
                f"S3 Object size {actual_size} bytes does not match DB expected size {expected_size} bytes."
            )

        # Assert ContentType matching
        actual_mime = metadata.get("ContentType", "")
        if actual_mime != expected_mime:
            raise PermanentFailure(
                "content_type_mismatch",
                f"S3 Object MIME type '{actual_mime}' does not match DB expected MIME type '{expected_mime}'."
            )

        # 2. Download object to a NamedTemporaryFile
        logger.info(f"[S3Storage] Downloading s3://{self.bucket}/{remote_path} to local temp file.")
        temp_file = tempfile.NamedTemporaryFile(delete=False)
        try:
            self.s3_client.download_fileobj(self.bucket, remote_path, temp_file)
            temp_file.close()
            return temp_file.name
        except Exception as e:
            temp_file.close()
            if os.path.exists(temp_file.name):
                os.remove(temp_file.name)
            logger.error(f"[S3Storage] Failed to download S3 file: {e}")
            raise e

def get_storage_provider() -> StorageProvider:
    """Factory to retrieve the configured storage provider."""
    # Currently defaults to S3, but can be easily extended to read from settings
    return S3StorageProvider()
