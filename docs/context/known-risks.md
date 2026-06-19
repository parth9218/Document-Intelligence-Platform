# Known Risks & Mitigations

This registry lists potential issues and their mitigation strategies.

## 1. Bedrock Titan Embeddings Throttle Limit
* **Risk**: Titan API requests can hit throughput limits under heavy batch uploads.
* **Mitigation**: Implement exponential backoff and retries inside `apps/worker/embeddings.py` (maximum 3 attempts).

## 2. Vector Cosine Similarity Search Performance
* **Risk**: High concurrent searches can degrade database query latency.
* **Mitigation**: Configure HNSW index parameters (`m=16`, `ef_construction=64`) and route connections through RDS Proxy.

## 3. Session Cleanup Integrity
* **Risk**: S3 objects and Postgres rows can become orphaned if cleanup workers fail.
* **Mitigation**: Enforce cascading DB foreign key deletions, and write explicit S3 bucket lifecycle policies as a backstop.
