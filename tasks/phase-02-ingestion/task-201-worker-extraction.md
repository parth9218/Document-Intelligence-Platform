# Task 201: Worker Document Extraction

## Goal
Download files from S3, run safety validations, and extract text pages.

## Scope
Update SQS task handler inside `apps/worker` to pull documents, snif magic numbers, and parse text via PyMuPDF.

## Files Expected To Change
* `apps/worker/extractor.py`
* `apps/worker/worker.py`

## Dependencies
* Task 103 (Upload Presigning)
* Task 104 (SQS Consumer)

## Acceptance Criteria
* Worker downloads raw file from S3 using boto3.
* File type is sniffed via magic numbers. Corruption triggers permanent failure (`status=failed`).
* PyMuPDF (`fitz` library) extracts text from document pages, tracking page numbers.

## Validation Steps
1. Upload a text-native PDF to local S3.
2. Queue S3 ObjectCreated notification payload.
3. Verify worker extracts correct text per page.
4. Verify uploading corrupted file transitions database document record to `failed`.
