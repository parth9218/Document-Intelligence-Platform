import boto3
from app.config.settings import settings

class S3Client:
    def __init__(self):
        s3_args = {
            "service_name": "s3",
            "region_name": settings.AWS_REGION,
        }
        # Inject LocalStack endpoint parameters if present
        if settings.LOCALSTACK_URL:
            s3_args["endpoint_url"] = settings.LOCALSTACK_URL
            s3_args["aws_access_key_id"] = settings.AWS_ACCESS_KEY_ID
            s3_args["aws_secret_access_key"] = settings.AWS_SECRET_ACCESS_KEY

        self.client = boto3.client(**s3_args)

    def head_object(self, bucket: str, key: str) -> dict:
        """Call head_object to fetch S3 file metadata."""
        return self.client.head_object(Bucket=bucket, Key=key)

    def download_fileobj(self, bucket: str, key: str, fh) -> None:
        """Download file content from S3 to a file-like object."""
        self.client.download_fileobj(bucket, key, fh)
