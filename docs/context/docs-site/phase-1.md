# Context Handover: AI Document Intelligence Platform — Documentation Initiative (Phase 1)

## 1. Project & Task Status Overview
- **Goal**: Full implementation of the production-grade documentation site and root `README.md` following `DOCUMENTATION_PLAN.md`.
- **Phase 1 Status (Complete & Verified)**:
  - **Isolated Documentation Workspace**: MkDocs Material infrastructure encapsulated inside dedicated `/docs-site/` directory (preserving internal `/docs/` context as mandated by `GEMINI.md`).
  - **Complete Navigation Structure**: 84-page navigation structure (+ index) scaffolded across 13 engineering sections.
  - **Interactive Diagram Controls**: Interactive diagram panning, zooming, and fullscreen controls fully operational via `mkdocs-panzoom-plugin`.
  - **Mermaid Reference Alignment**: Architecture diagram visually styled and color-matched to the official reference design (`AWS EKS Cluster Workflow-2026-10-11-101704.png`).
  - **Self-Hosted Offline Assets**: Self-hosted Mermaid runtime (`javascripts/mermaid.min.js`) ensuring complete offline parity.
  - **Strict Build Verification**: Strict build verified (`mkdocs build --strict`) with zero errors.
  - **Local Development Server**: Verified operational at `http://127.0.0.1:8000/`.

---

## 2. Directory Structure & Key Files

```text
/
├── .github/workflows/
│   └── docs-deploy.yml               # GitHub Actions workflow (triggers on docs-site/**, deploys to GitHub Pages)
├── DOCUMENTATION_PLAN.md             # Authoritative 7-phase documentation blueprint
├── docs/                             # INTERNAL context recovery only (DO NOT pollute with site content)
│   ├── context/                      # Architecture specs and ADRs
│   └── progress/                     # Task status and progress tracking
└── docs-site/                        # Documentation Website Root
    ├── .venv/                        # Dedicated documentation Python virtual environment
    ├── requirements.txt              # Dependencies: mkdocs-material, pymdown-extensions, mkdocs-mermaid2-plugin, mkdocs-panzoom-plugin
    ├── mkdocs.yml                    # Authoritative MkDocs configuration (docs_dir: docs, full 84-page nav)
    └── docs/
        ├── index.md                  # Homepage with executive summary, production invariants, and diagram
        ├── assets/
        │   └── logo.png              # Platform brand asset
        ├── javascripts/
        │   └── mermaid.min.js        # Self-hosted Mermaid runtime (guarantees offline parity)
        ├── stylesheets/
        │   └── custom.css            # Custom styling for panzoom container and fullscreen overlay
        ├── architecture/             # 4 pages (overview, data-flow, technology-stack, cost-optimization)
        ├── design-decisions/         # 9 pages (index + 8 ADR pages)
        ├── challenges/               # 15 pages (index + 14 engineering challenge post-mortems)
        ├── database/                 # 5 pages (schema, indexes-constraints, access-patterns, pg-notify-triggers, dual-orm-strategy)
        ├── services/                 # 22 pages (api: 8 pages, worker: 6 pages, frontend: 8 pages)
        ├── infrastructure/           # 10 pages (aws: 3 pages, kubernetes: 7 pages)
        ├── security/                 # 6 pages (overview, session-auth, iam-auth-secrets, upload-security, tenant-isolation, cors-policy)
        ├── deployment/               # 6 pages (overview, ci-pipeline, cd-dev, cd-staging-production, infrastructure-deployment, branch-tag-protection)
        ├── development/              # 5 pages (local-setup, api-standalone, worker-standalone, frontend-standalone, environment-variables)
        ├── testing/                  # 4 pages (strategy, api-tests, worker-tests, infrastructure-parity)
        ├── observability/            # 4 pages (overview, logging, health-checks, monitoring)
        └── screenshots/              # 1 page (index)
```

---

## 3. Key Technical Decisions & Bug Resolutions

### 3.1 Isolation from Internal Docs
- `/docs/` is reserved strictly for internal agent memory (`docs/context/` and `docs/progress/`) as enforced by `GEMINI.md`.
- All documentation website source files, requirements, virtual environments, and configuration live exclusively under `docs-site/`.
- This ensures zero collision with agent context recovery or task progress files.

### 3.2 Standardized Interactive Diagram Engine
- Avoid custom pan/zoom scripts; use standardized `mkdocs-panzoom-plugin` (v0.5.2+).
- In `mkdocs.yml`:
  ```yaml
  plugins:
    - search
    - mermaid2:
        arguments:
          startOnLoad: true
          theme: 'default'
    - panzoom:
        full_screen: true
        key: "none"
  ```
- Superfences custom fence uses `mermaid2.fence_mermaid` to generate standard `<div class="mermaid">` elements in the light DOM, preventing Material for MkDocs 9.x from encapsulating diagrams inside a closed shadow root.
- `key: "none"` allows intuitive, modifier-free on-canvas drag-to-pan and mouse-wheel zoom.
- Theme variables seamlessly support both Material Light Mode and Slate (Dark) Mode.

### 3.3 Mermaid Diagram Color Palette & Flow
- Explicitly configured with `%%{init}%%` and custom subgraph borders to replicate `AWS EKS Cluster Workflow-2026-10-11-101704.png`:
  - Client Interface: `#fdf4ff` (Border: `#d946ef`)
  - Global Edge & CDN Layer: `#f0fdfa` (Border: `#14b8a6`)
  - AWS Storage, Messaging & Database: `#ecfeff` (Border: `#06b6d4`)
  - Amazon EKS Cluster (Kubernetes 1.37): `#fff7ed` (Border: `#f97316`)
  - Amazon Bedrock Foundation Models: `#ecfdf5` (Border: `#10b981`)
- Avoid `classDef default`, which overrides subgraph fills with white; use targeted classes like `classDef whiteCard` for service cards.

### 3.4 GitHub Pages Deployment Automation
- Deployment workflow configured in `.github/workflows/docs-deploy.yml`.
- Migrated to official GitHub Pages actions (`actions/upload-pages-artifact@v3` and `actions/deploy-pages@v4`) with `permissions: pages: write, id-token: write`.
- Automated builds trigger on pushes to `dev` for changes under `docs-site/**` or the workflow file itself.

---

## 4. Current Roadmap & Next Steps

Transition to Phase 2 of `DOCUMENTATION_PLAN.md`:

1. **Phase 2: Master Readme & Core Architecture Documentation**:
   - Step 2.1: Author root `README.md` following Section 5.1 of `DOCUMENTATION_PLAN.md` (badges, architecture overview, AWS-DOP/CKA highlights, concise quickstart redirecting to docs site, verification).
   - Step 2.2: Populate `docs-site/docs/architecture/overview.md`, `data-flow.md`, `technology-stack.md`, and `cost-optimization.md`.
2. **Phase 3: ADRs (`docs-site/docs/design-decisions/`) & Challenge Post-Mortems (`docs-site/docs/challenges/`)**.
3. **Phase 4: Microservice & Database Documentation**.
4. **Phase 5: Infrastructure (Terraform), Kubernetes & GitOps Documentation**.
5. **Phase 6: Operations, Security & Local Development**.
6. **Phase 7: Final Review & GitHub Pages automated deployment check**.

---

## 5. Quick Verification Commands

```bash
# 1. Build documentation strictly from repo root
docs-site/.venv/bin/mkdocs build --strict -f docs-site/mkdocs.yml

# 2. Run dev server locally
docs-site/.venv/bin/mkdocs serve -f docs-site/mkdocs.yml
```
