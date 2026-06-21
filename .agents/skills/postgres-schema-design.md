# Skill: PostgreSQL Schema Design

## Purpose
Help agents model tables, foreign key cascades, and optimization schemas.

## Best Practices
* Every session-scoped table must carry a foreign key pointing to the `sessions` table.
* Declare `ON DELETE CASCADE` indexes to clean up data structures automatically during session purging.
* Do not merge relational schema operations and vector indexes without setting up manual migration checkpoints.

## Common Mistakes
* Forgetting to index foreign keys, leading to full table scans during deletion runs.
* Allowing null strings inside database identity keys.

## Validation Checklist
- [ ] Schema SQL defines fields as NOT NULL where mandatory?
- [ ] ON DELETE CASCADE configured on document tables?
- [ ] Foreign keys indexed?
