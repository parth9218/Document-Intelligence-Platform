# Task 201: Worker Document Extraction

## Goal
Download documents from S3, validate file integrity via magic number inspection,
extract text page-by-page using PyMuPDF, and update the processing job status
through the `downloading`, `validating`, and `extracting` stages.

## Scope
Implement `apps/worker/extractor.py` and wire it into `apps/worker/worker.py`'s
`process_document()` dispatch function.

## Files Expected To Change
* `apps/worker/extractor.py`
* `apps/worker/worker.py`
* `apps/worker/models.py` (SQLAlchemy ORM models — if not yet created)

## Dependencies
* Task 103 (Upload Presigning — defines the S3 key format)
* Task 104 (SQS Consumer — calls `process_document()`)

---

## Stage Transition Sequence

```
uploaded → downloading → validating → extracting → chunking (Task 202)
```

Each transition must update `processing_jobs.status` via SQLAlchemy ORM before
the stage begins. This triggers the PG NOTIFY trigger, which pushes the status
change to the SSE stream via the Express API.

---

## Stage 1: Downloading

**Entry action:** Update `processing_jobs.status = 'downloading'`, set `started_at = NOW()`,
set `worker_id = <pod hostname>`.

**Pre-download S3 object verification (execute before downloading):**

Perform a `boto3.client('s3').head_object(Bucket=BUCKET, Key=document.s3_key)` call and apply the following checks. All three failures are permanent — delete the SQS message and do not retry.

- `ClientError` with `404` (object does not exist) → `status = 'failed'`, `error_code = 'file_not_found'`.
- `response['ContentLength'] != document.file_size_bytes` → `status = 'failed'`, `error_code = 'size_mismatch'`.
- `response['ContentType'] != document.mime_type` → `status = 'failed'`, `error_code = 'content_type_mismatch'`.

Only proceed to download if all three checks pass. This is the authoritative server-side verification of uploaded file metadata integrity. The confirm-upload API endpoint (Task 103) does not perform this verification.

**Download implementation:**
* Use `boto3.client('s3').download_fileobj()` to stream the S3 object to a local temp file.
* Use `tempfile.NamedTemporaryFile(delete=False)` to create a temp path.
* Always clean up the temp file in a `finally` block.

**Download failure handling:**
* Network errors → transient failure: raise exception so SQS visibility timeout re-delivers.

---

## Stage 2: Validating

**Entry action:** Update `processing_jobs.status = 'validating'`.

**Implementation:**
* Read the first 16 bytes of the downloaded file.
* Check magic bytes:
  * PDF: `%PDF` (`25 50 44 46`)
  * Plain text: no specific magic; fall back to UTF-8 decode attempt
* If magic bytes do not match the `documents.mime_type` on record → permanent failure:
  `status = 'failed'`, `error_code = 'invalid_file_type'`. Delete SQS message.

**Do not trust the `Content-Type` header from the presigned URL.** Magic number inspection
is the authoritative validation step.

---

## Stage 3: Extracting

**Entry action:** Update `processing_jobs.status = 'extracting'`.

**Implementation:**
* For PDFs: open with `fitz.open(temp_path)` (PyMuPDF).
  * Iterate pages via `doc.pages()`.
  * For each page: call `page.get_text("text")`, strip whitespace, skip empty pages.
  * Collect: `List[Tuple[int, str]]` → `[(page_number, page_text), ...]`
* For plain text: read entire file content, assign `page_number = 1`.

**Output contract:** Return a list of `(page_number: int, text: str)` tuples to the caller
(`process_document`), which passes it to Task 202's chunker.

**Failure handling:**
* PyMuPDF raises on corrupt or password-protected PDF → permanent failure:
  `status = 'failed'`, `error_code = 'extraction_failed'`. Delete SQS message.

---

## Acceptance Criteria
* Worker transitions job through `downloading → validating → extracting` with DB updates at each stage.
* `worker_id` and `started_at` are set on job pickup.
* Pre-download `headObject` check sets `status = 'failed'` with `error_code = 'file_not_found'` if the S3 object does not exist.
* Pre-download `headObject` check sets `status = 'failed'` with `error_code = 'size_mismatch'` if `ContentLength` does not match `document.file_size_bytes`.
* Pre-download `headObject` check sets `status = 'failed'` with `error_code = 'content_type_mismatch'` if `ContentType` does not match `document.mime_type`.
* All three `headObject` failure paths delete the SQS message (permanent failures, no retry).
* Magic byte check rejects files whose bytes do not match the declared MIME type (`error_code = 'invalid_file_type'`).
* PyMuPDF extracts page-numbered text from text-native PDFs.
* Corrupt/password-protected PDFs set `status = 'failed'` with `error_code = 'extraction_failed'`.
* Temp files are always cleaned up, including on exceptions.

## Validation Steps
1. Upload a text-native PDF to local S3 (Localstack). Queue an S3 ObjectCreated payload.
2. Verify worker transitions through all three status stages in order (query DB between each).
3. Upload a plain `.txt` file — verify single-page extraction.
4. Queue an SQS event for a non-existent S3 key — verify `error_code = 'file_not_found'` and SQS message deleted.
5. Upload a file where the declared `file_size_bytes` does not match the actual S3 object size — verify `error_code = 'size_mismatch'` and SQS message deleted.
6. Upload a file with a mismatched declared `mime_type` vs actual S3 `ContentType` — verify `error_code = 'content_type_mismatch'` and SQS message deleted.
7. Rename a `.jpg` as `.pdf` and upload — verify magic byte check triggers `failed` with `error_code = 'invalid_file_type'`.
8. Upload a password-protected PDF — verify `error_code = 'extraction_failed'`.
9. Verify temp file does not persist after worker run (even on failure path).

## Definition Of Done
* `extractor.py` implements the full `downloading → validating → extracting` pipeline.
* Pre-download `headObject` verification covers all three checks (existence, size, content-type) before any download begins.
* All failure paths set correct `error_code` and delete the SQS message.
* ORM status updates confirmed to trigger PG NOTIFY (verified via LISTEN on test DB).
