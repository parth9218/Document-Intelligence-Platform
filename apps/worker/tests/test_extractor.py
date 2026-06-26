import unittest
from unittest.mock import patch, MagicMock, mock_open
import os
from botocore.exceptions import ClientError

from app.services.extractor import ExtractorService
from app.errors import PermanentFailure

class TestExtractorService(unittest.TestCase):
    def setUp(self):
        self.mock_s3 = MagicMock()
        self.service = ExtractorService(s3_client=self.mock_s3)
        self.bucket = "test-bucket"
        self.s3_key = "sessions/sess-123/documents/doc-456/original"

    def test_download_document_success(self):
        # Mock head_object metadata response
        self.mock_s3.head_object.return_value = {
            "ContentLength": 100,
            "ContentType": "application/pdf"
        }
        
        with patch('app.services.extractor.tempfile.NamedTemporaryFile') as mock_temp:
            mock_file = MagicMock()
            mock_temp.return_value = mock_file
            mock_file.name = "/tmp/test-file.pdf"
            
            path = self.service.download_document(self.bucket, self.s3_key, 100, "application/pdf")
            
            self.assertEqual(path, "/tmp/test-file.pdf")
            self.mock_s3.head_object.assert_called_once_with(self.bucket, self.s3_key)
            self.mock_s3.download_fileobj.assert_called_once_with(self.bucket, self.s3_key, mock_file)
            mock_file.close.assert_called_once()

    def test_download_document_file_not_found(self):
        # Mock ClientError with 404 code
        error_response = {"Error": {"Code": "404", "Message": "Not Found"}}
        self.mock_s3.head_object.side_effect = ClientError(error_response, "head_object")
        
        with self.assertRaises(PermanentFailure) as context:
            self.service.download_document(self.bucket, self.s3_key, 100, "application/pdf")
            
        self.assertEqual(context.exception.error_code, "file_not_found")

    def test_download_document_size_mismatch(self):
        self.mock_s3.head_object.return_value = {
            "ContentLength": 200,  # Mismatch (expected 100)
            "ContentType": "application/pdf"
        }
        
        with self.assertRaises(PermanentFailure) as context:
            self.service.download_document(self.bucket, self.s3_key, 100, "application/pdf")
            
        self.assertEqual(context.exception.error_code, "size_mismatch")

    def test_download_document_mime_mismatch(self):
        self.mock_s3.head_object.return_value = {
            "ContentLength": 100,
            "ContentType": "image/png"  # Mismatch (expected application/pdf)
        }
        
        with self.assertRaises(PermanentFailure) as context:
            self.service.download_document(self.bucket, self.s3_key, 100, "application/pdf")
            
        self.assertEqual(context.exception.error_code, "content_type_mismatch")

    def test_validate_document_pdf_success(self):
        # Open mock file and return valid PDF header
        m_open = mock_open(read_data=b"%PDF-1.4\ncontent...")
        with patch('builtins.open', m_open):
            # Should not raise exception
            self.service.validate_document("/tmp/valid.pdf", "application/pdf")

    def test_validate_document_pdf_invalid(self):
        m_open = mock_open(read_data=b"invalid-header")
        with patch('builtins.open', m_open):
            with self.assertRaises(PermanentFailure) as context:
                self.service.validate_document("/tmp/invalid.pdf", "application/pdf")
            self.assertEqual(context.exception.error_code, "invalid_file_type")

    def test_validate_document_text_success(self):
        m_open = mock_open(read_data=b"valid text here")
        with patch('builtins.open', m_open):
            # Should not raise exception
            self.service.validate_document("/tmp/valid.txt", "text/plain")

    def test_validate_document_text_invalid_utf8(self):
        # Mock binary file return
        mock_bin_file = mock_open(read_data=b"binary content").return_value
        
        # Mock text file return raising UnicodeDecodeError on read
        mock_txt_file = MagicMock()
        mock_txt_file.__enter__.return_value = mock_txt_file
        mock_txt_file.read.side_effect = UnicodeDecodeError("utf-8", b"\x80", 0, 1, "invalid start byte")
        
        with patch('builtins.open') as mock_open_func:
            mock_open_func.side_effect = [mock_bin_file, mock_txt_file]
            with self.assertRaises(PermanentFailure) as context:
                self.service.validate_document("/tmp/invalid.txt", "text/plain")
            self.assertEqual(context.exception.error_code, "invalid_file_type")

    @patch('app.services.extractor.fitz')
    def test_extract_text_pdf_success(self, mock_fitz):
        # Mock fitz document and pages
        mock_doc = MagicMock()
        mock_page1 = MagicMock()
        mock_page1.get_text.return_value = "Page 1 content  "
        mock_page2 = MagicMock()
        mock_page2.get_text.return_value = "\n  Page 2 content"
        
        mock_doc.__iter__.return_value = [mock_page1, mock_page2]
        mock_fitz.open.return_value = mock_doc
        
        pages = self.service.extract_text("/tmp/doc.pdf", "application/pdf")
        
        self.assertEqual(len(pages), 2)
        self.assertEqual(pages[0], (1, "Page 1 content"))
        self.assertEqual(pages[1], (2, "Page 2 content"))
        mock_doc.close.assert_called_once()

    @patch('app.services.extractor.fitz')
    def test_extract_text_pdf_failed(self, mock_fitz):
        mock_fitz.open.side_effect = Exception("Corrupt PDF file")
        
        with self.assertRaises(PermanentFailure) as context:
            self.service.extract_text("/tmp/corrupt.pdf", "application/pdf")
            
        self.assertEqual(context.exception.error_code, "extraction_failed")

    def test_extract_text_text_success(self):
        m_open = mock_open(read_data="Hello World text file")
        with patch('builtins.open', m_open):
            pages = self.service.extract_text("/tmp/file.txt", "text/plain")
            self.assertEqual(len(pages), 1)
            self.assertEqual(pages[0], (1, "Hello World text file"))

if __name__ == "__main__":
    unittest.main()
