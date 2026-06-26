import unittest
from unittest.mock import patch, MagicMock
from botocore.exceptions import ClientError

from app.services.storage_service import S3StorageProvider
from app.errors import PermanentFailure

class TestS3StorageProvider(unittest.TestCase):
    def setUp(self):
        self.mock_s3 = MagicMock()
        self.provider = S3StorageProvider(s3_client=self.mock_s3)
        self.s3_key = "sessions/sess-123/documents/doc-456/original"

    @patch('app.services.storage_service.settings')
    def test_download_file_success(self, mock_settings):
        mock_settings.S3_BUCKET_NAME = "test-bucket"
        self.provider.bucket = "test-bucket"
        
        # Mock head_object metadata response
        self.mock_s3.head_object.return_value = {
            "ContentLength": 100,
            "ContentType": "application/pdf"
        }
        
        with patch('app.services.storage_service.tempfile.NamedTemporaryFile') as mock_temp:
            mock_file = MagicMock()
            mock_temp.return_value = mock_file
            mock_file.name = "/tmp/test-file.pdf"
            
            path = self.provider.download_file(self.s3_key, 100, "application/pdf")
            
            self.assertEqual(path, "/tmp/test-file.pdf")
            self.mock_s3.head_object.assert_called_once_with("test-bucket", self.s3_key)
            self.mock_s3.download_fileobj.assert_called_once_with("test-bucket", self.s3_key, mock_file)
            mock_file.close.assert_called_once()

    def test_download_file_not_found(self):
        # Mock ClientError with 404 code
        error_response = {"Error": {"Code": "404", "Message": "Not Found"}}
        self.mock_s3.head_object.side_effect = ClientError(error_response, "head_object")
        
        with self.assertRaises(PermanentFailure) as context:
            self.provider.download_file(self.s3_key, 100, "application/pdf")
            
        self.assertEqual(context.exception.error_code, "file_not_found")

    def test_download_file_size_mismatch(self):
        self.mock_s3.head_object.return_value = {
            "ContentLength": 200,  # Mismatch (expected 100)
            "ContentType": "application/pdf"
        }
        
        with self.assertRaises(PermanentFailure) as context:
            self.provider.download_file(self.s3_key, 100, "application/pdf")
            
        self.assertEqual(context.exception.error_code, "size_mismatch")

    def test_download_file_mime_mismatch(self):
        self.mock_s3.head_object.return_value = {
            "ContentLength": 100,
            "ContentType": "image/png"  # Mismatch (expected application/pdf)
        }
        
        with self.assertRaises(PermanentFailure) as context:
            self.provider.download_file(self.s3_key, 100, "application/pdf")
            
        self.assertEqual(context.exception.error_code, "content_type_mismatch")

if __name__ == "__main__":
    unittest.main()
