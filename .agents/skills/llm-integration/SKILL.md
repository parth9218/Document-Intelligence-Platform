---
name: llm-integration
description: Assemble prompts and stream tokens safely using Server-Sent Events.
---

# Skill: LLM Prompting & Stream Handling

## Purpose
Assemble prompts and stream tokens safely using Server-Sent Events.

## Best Practices
* Formulate system prompt constraints clearly: enforce reference-only grounded rules.
* Format context chunks using clean bracket identifiers (`[1]`..`[n]`).
* Parse LLM streaming responses via regex to verify citation indexes align with reference documents.

## Common Mistakes
* Allowing LLM responses to refer to document chunk indices that were not injected in the system prompt.
* Swallowing connection disconnect events, keeping backend channels open indefinitely.

## Validation Checklist
- [ ] Input question truncated to maximum string limits?
- [ ] Grounding rules instruct model to say "not found" on lack of matching context?
- [ ] Streaming connection handles socket termination events?
