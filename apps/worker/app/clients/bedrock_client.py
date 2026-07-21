import boto3
from app.config.settings import settings

class BedrockClient:
    def __init__(self):
        client_kwargs = {
            "service_name": "bedrock-runtime",
            "region_name": settings.AWS_REGION or "us-east-1"
        }
        if settings.LOCALSTACK_URL:
            client_kwargs["endpoint_url"] = settings.LOCALSTACK_URL
            client_kwargs["aws_access_key_id"] = settings.AWS_ACCESS_KEY_ID
            client_kwargs["aws_secret_access_key"] = settings.AWS_SECRET_ACCESS_KEY

        self.client = boto3.client(**client_kwargs)

    def invoke_model(self, **kwargs) -> dict:
        """Call invoke_model to interact with AWS Bedrock models."""
        return self.client.invoke_model(**kwargs)
