# Skill: RAG Semantic Retrieval

## Purpose
Retrieve relevant context passages to ground LLM generation prompts.

## Best Practices
* Enforce similarity score limits (>= 0.5) to avoid feeding low-relevance context to LLMs.
* Keep query vectors and database embedding models identical.
* Include session ID filtering inside similarity search parameters to isolate user namespaces.

## Common Mistakes
* Querying similarity without session filters.
* Overcrowding prompt context windows by returning too many matching chunks.

## Validation Checklist
- [ ] Query limits set to return top-5 chunks?
- [ ] Similarity filter threshold >= 0.5?
- [ ] Queries isolated using session ID parameters?
