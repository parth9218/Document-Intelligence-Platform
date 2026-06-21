# Skill: RAG Ingestion Pipeline

## Purpose
Extract text layout data, create segments, and run ingestion workers.

## Best Practices
* Download document streams to memory or clean up temporary files in worker directories immediately after parsing.
* Sniff file header magic numbers to identify corrupt or malicious inputs early.
* Set progress tracking checkpoints in relational tables to support job resuming.

## Common Mistakes
* Trusting the client-submitted `Content-Type` header without sniffing binary content structure.
* Swallowing parser script exceptions, resulting in ingestion jobs freezing in a permanent processing loop.

## Validation Checklist
- [ ] Local temp folder cleaned up?
- [ ] File validated using magic numbers?
- [ ] Ingestion chunk loops write progress indexes on each block insert?
