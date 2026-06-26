import os
from typing import List, Tuple
import fitz  # PyMuPDF

from app.errors import PermanentFailure
from app.utils.logger import logger

class ExtractorService:
    def __init__(self):
        pass

    def validate_document(self, temp_path: str, expected_mime: str) -> None:
        """Inspect file content (magic number or decode validation) matching the expected MIME type."""
        logger.info(f"[Extractor] Performing binary content validation for: {temp_path}")
        
        try:
            with open(temp_path, "rb") as f:
                header = f.read(16)
        except Exception as e:
            raise PermanentFailure(
                "validation_failed", 
                f"Could not open temporary file for binary validation: {e}"
            )

        if expected_mime == "application/pdf":
            # PDF magic prefix is %PDF (hex 25 50 44 46)
            if not header.startswith(b"%PDF"):
                raise PermanentFailure(
                    "invalid_file_type",
                    "Uploaded file is not a valid PDF document (magic byte mismatch)."
                )
        elif expected_mime == "text/plain":
            # Plain text has no specific magic bytes, we validate by trying to decode as UTF-8
            try:
                with open(temp_path, "r", encoding="utf-8") as f:
                    # Attempt reading a chunk to confirm UTF-8 compliance
                    f.read(1024)
            except UnicodeDecodeError:
                raise PermanentFailure(
                    "invalid_file_type",
                    "Uploaded plain text file is not valid UTF-8 encoded text."
                )
        else:
            raise PermanentFailure(
                "invalid_file_type",
                f"Unsupported MIME type validation: {expected_mime}"
            )

    def extract_text(self, temp_path: str, mime_type: str) -> List[Tuple[int, str]]:
        """Parse document contents page-by-page and extract text."""
        logger.info(f"[Extractor] Extracting text content from: {temp_path} (MIME: {mime_type})")
        pages: List[Tuple[int, str]] = []

        if mime_type == "application/pdf":
            try:
                # Open PDF with PyMuPDF
                doc = fitz.open(temp_path)
                for idx, page in enumerate(doc):
                    page_number = idx + 1
                    text = page.get_text("text")
                    cleaned_text = text.strip()
                    if cleaned_text:
                        pages.append((page_number, cleaned_text))
                doc.close()
            except Exception as e:
                logger.error(f"[Extractor] PyMuPDF failed to parse PDF: {e}")
                raise PermanentFailure(
                    "extraction_failed",
                    f"PDF extraction failed (possibly corrupt or encrypted file): {e}"
                )
        elif mime_type == "text/plain":
            try:
                with open(temp_path, "r", encoding="utf-8") as f:
                    text = f.read()
                cleaned_text = text.strip()
                if cleaned_text:
                    pages.append((1, cleaned_text))
            except Exception as e:
                logger.error(f"[Extractor] Failed to read plain text file: {e}")
                raise PermanentFailure(
                    "extraction_failed",
                    f"Plain text extraction failed: {e}"
                )
        else:
            raise PermanentFailure(
                "extraction_failed",
                f"Unsupported MIME type for text extraction: {mime_type}"
            )

        logger.info(f"[Extractor] Successfully extracted {len(pages)} text pages.")
        return pages
