import unittest
from unittest.mock import patch, MagicMock
from botocore.exceptions import ClientError
import json

from app.services.embeddings import (
    get_embedding_provider, 
    BedrockEmbeddingProvider, 
    LocalEmbeddingProvider,
    EmbeddingProvider
)
from app.clients.bedrock_client import BedrockClient
from app.config.settings import settings


class TestBedrockClient(unittest.TestCase):
    @patch('app.clients.bedrock_client.boto3')
    def test_client_init(self, mock_boto3):
        mock_client = MagicMock()
        mock_boto3.client.return_value = mock_client
        
        client = BedrockClient()
        self.assertEqual(client.client, mock_client)
        mock_boto3.client.assert_called_once()

    @patch('app.clients.bedrock_client.boto3')
    def test_invoke_model_delegation(self, mock_boto3):
        mock_client = MagicMock()
        mock_boto3.client.return_value = mock_client
        mock_client.invoke_model.return_value = {"body": "test"}

        client = BedrockClient()
        response = client.invoke_model(modelId="foo", body="bar")
        
        mock_client.invoke_model.assert_called_once_with(modelId="foo", body="bar")
        self.assertEqual(response, {"body": "test"})


class TestEmbeddingsService(unittest.TestCase):
    def setUp(self):
        # Reset provider setting before each test
        settings.EMBEDDING_PROVIDER = "bedrock"

    def test_embed_bedrock_success(self):
        # Setup mock bedrock client response
        mock_client = MagicMock()
        
        # Bedrock invoke_model returns a streaming response under 'body'
        mock_response_body = MagicMock()
        mock_response_body.read.return_value = json.dumps({"embedding": [0.1] * 1024}).encode('utf-8')
        mock_client.invoke_model.return_value = {"body": mock_response_body}

        provider = BedrockEmbeddingProvider(bedrock_client=mock_client)
        embedding = provider.embed_chunk("hello world")

        self.assertEqual(len(embedding), 1024)
        self.assertEqual(embedding[0], 0.1)
        mock_client.invoke_model.assert_called_once()

    @patch('app.services.embeddings.time.sleep')
    def test_embed_bedrock_retry_throttling_success(self, mock_sleep):
        mock_client = MagicMock()

        # Create ClientError for ThrottlingException
        error_response = {"Error": {"Code": "ThrottlingException", "Message": "Rate exceeded"}}
        throttling_err = ClientError(error_response, "invoke_model")

        # Success response
        mock_response_body = MagicMock()
        mock_response_body.read.return_value = json.dumps({"embedding": [0.2] * 1024}).encode('utf-8')
        success_response = {"body": mock_response_body}

        # First call raises ThrottlingException, second call succeeds
        mock_client.invoke_model.side_effect = [throttling_err, success_response]

        provider = BedrockEmbeddingProvider(bedrock_client=mock_client)
        embedding = provider.embed_chunk("hello world")

        self.assertEqual(len(embedding), 1024)
        self.assertEqual(embedding[0], 0.2)
        self.assertEqual(mock_client.invoke_model.call_count, 2)
        mock_sleep.assert_called_once_with(1.0)

    def test_embed_bedrock_permanent_failure(self):
        mock_client = MagicMock()

        # ValidationException is a permanent failure
        error_response = {"Error": {"Code": "ValidationException", "Message": "Invalid format"}}
        validation_err = ClientError(error_response, "invoke_model")

        mock_client.invoke_model.side_effect = validation_err

        provider = BedrockEmbeddingProvider(bedrock_client=mock_client)
        with self.assertRaises(ClientError):
            provider.embed_chunk("hello world")

        # Should not retry permanent error
        mock_client.invoke_model.assert_called_once()

    @patch('app.services.embeddings.BedrockClient')
    def test_bedrock_provider_initializes_default_client(self, mock_bedrock_client_class):
        mock_client_instance = MagicMock()
        mock_bedrock_client_class.return_value = mock_client_instance
        
        provider = BedrockEmbeddingProvider()
        client = provider._get_bedrock_client()
        
        self.assertEqual(client, mock_client_instance)
        mock_bedrock_client_class.assert_called_once()

    def test_embed_local_success(self):
        provider = LocalEmbeddingProvider()

        # Generate a small test embedding
        embedding = provider.embed_chunk("hello world local testing")
        
        # Verify 1024 dimensional vector from E5 model
        self.assertEqual(len(embedding), 1024)
        for val in embedding:
            self.assertIsInstance(val, float)

    def test_factory_returns_correct_provider(self):
        # 1. Check bedrock provider
        settings.EMBEDDING_PROVIDER = "bedrock"
        provider = get_embedding_provider()
        self.assertIsInstance(provider, BedrockEmbeddingProvider)

        # 2. Check local provider
        settings.EMBEDDING_PROVIDER = "local"
        provider = get_embedding_provider()
        self.assertIsInstance(provider, LocalEmbeddingProvider)


if __name__ == "__main__":
    unittest.main()
