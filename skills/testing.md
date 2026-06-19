# Skill: Verification & Integration Testing

## Purpose
Write automated verification checks and simulate local cloud environments.

## Best Practices
* Verify RAG processing steps locally using LocalStack to mock S3 and SQS.
* Assert database query isolation checks return null structures when querying with unowned session IDs.
* Use integration tests to verify SSE streams yield valid chunks.

## Common Mistakes
* Missing mock limits in test suites, causing them to make actual API calls to AWS Bedrock or RDS.
* Running test fixtures without cleaning up generated database rows.

## Validation Checklist
- [ ] LocalStack configuration loaded during integration testing runs?
- [ ] Verification tests assert multi-tenant isolation rules?
- [ ] Ingestion worker tests assert queue messages delete on success?
