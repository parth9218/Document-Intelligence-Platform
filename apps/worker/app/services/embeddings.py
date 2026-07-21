from abc import ABC, abstractmethod
from typing import List
import json
import time
from botocore.exceptions import ClientError

from app.config.settings import settings
from app.utils.logger import logger
from app.clients.bedrock_client import BedrockClient

class EmbeddingProvider(ABC):
    @abstractmethod
    def embed_chunk(self, text: str) -> List[float]:
        """Generate a 1024-dimension vector embedding for the given chunk text."""
        pass

class BedrockEmbeddingProvider(EmbeddingProvider):
    def __init__(self, bedrock_client=None):
        self._bedrock_client = bedrock_client

    def _get_bedrock_client(self):
        if self._bedrock_client is None:
            self._bedrock_client = BedrockClient()
        return self._bedrock_client

    def embed_chunk(self, text: str) -> List[float]:
        """Generate embedding using Amazon Bedrock Titan Embeddings V2 with exponential backoff."""
        client = self._get_bedrock_client()
        max_attempts = 3
        delay = 1.0
        backoff_multiplier = 2.0

        for attempt in range(1, max_attempts + 1):
            try:
                response = client.invoke_model(
                    modelId='amazon.titan-embed-text-v2:0',
                    body=json.dumps({
                        "inputText": text,
                        "dimensions": 1024,
                        "normalize": True
                    }),
                    contentType='application/json',
                    accept='application/json'
                )
                body = json.loads(response['body'].read())
                return body['embedding']
            except ClientError as e:
                error_code = e.response.get("Error", {}).get("Code", "")
                if error_code in ("ThrottlingException", "ServiceUnavailableException"):
                    if attempt == max_attempts:
                        logger.error(
                            f"[Embeddings] Transient error {error_code} hit max retries ({max_attempts}). Raising."
                        )
                        raise
                    logger.warning(
                        f"[Embeddings] Transient error {error_code} on attempt {attempt}/{max_attempts}. "
                        f"Retrying in {delay} seconds..."
                    )
                    time.sleep(delay)
                    delay *= backoff_multiplier
                else:
                    logger.error(f"[Embeddings] Permanent Bedrock error {error_code}: {e}")
                    raise

class LocalEmbeddingProvider(EmbeddingProvider):
    def __init__(self, local_model=None):
        self._local_model = local_model

    def _get_local_model(self):
        if self._local_model is None:
            # Lazy import to avoid loading sentence-transformers when not needed
            from sentence_transformers import SentenceTransformer
            logger.info("[Embeddings] Initializing local SentenceTransformer model (intfloat/e5-large-v2)")
            self._local_model = SentenceTransformer('intfloat/e5-large-v2')
        return self._local_model

    def embed_chunk(self, text: str) -> List[float]:
        """Generate embedding using local sentence-transformers model."""
        model = self._get_local_model()
        input_text = f"passage: {text}"
        embedding = model.encode(input_text)
        return [float(x) for x in embedding]

def get_embedding_provider() -> EmbeddingProvider:
    """Factory to retrieve the configured embedding provider based on environment setting."""
    provider = settings.EMBEDDING_PROVIDER
    if provider == "local":
        return LocalEmbeddingProvider()
    else:
        return BedrockEmbeddingProvider()
