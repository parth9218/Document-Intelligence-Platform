# Context Handover: AI Document Intelligence Platform — Documentation Initiative

    ## 1. Project & Task Status Overview
    - **Goal**: Full implementation of the production-grade documentation site and root

`README.md` following `DOCUMENTATION_PLAN.md`. - **Phase 1 (Complete & Verified)**: - MkDocs Material infrastructure encapsulated inside dedicated `/docs-site/` directory
(preserving internal `/docs/` context as mandated by `GEMINI.md`). - Full 84-page navigation structure scaffolded across 13 engineering sections. - Interactive diagram panning, zooming, and fullscreen controls fully operational via
standard `mkdocs-panzoom-plugin`. - Architecture diagram visually styled and color-matched to the official reference design
(`AWS EKS Cluster Workflow-2026-10-11-101704.png`). - Strict build verified (`mkdocs build --strict`) with zero errors. - Local dev server runs via `docs-site/.venv-docs/bin/mkdocs serve -f mkdocs.yml` at
`http://127.0.0.1:8000/`.

    ---

    ## 2. Directory Structure & Key Files

    ```text
    /
    ├── .github/workflows/
    │   └── docs-deploy.yml               # GitHub Actions workflow (triggers on docs-site/**,

deploys to gh-pages)
├── DOCUMENTATION_PLAN.md # Authoritative 7-phase documentation blueprint
├── docs/ # INTERNAL context recovery only (DO NOT pollute with
site content)
│ ├── context/ # Architecture specs and ADRs
│ └── progress/ # Task status and progress tracking
└── docs-site/ # Documentation Website Root
├── .venv-docs/ # Dedicated documentation Python virtual environment
├── requirements.txt # Dependencies: mkdocs-material, pymdown-extensions,
mkdocs-mermaid2-plugin, mkdocs-panzoom-plugin
├── mkdocs.yml # Authoritative MkDocs configuration (docs_dir: docs,
full 84-page nav)
└── docs/
├── index.md # Homepage with executive summary, production
invariants, and colored architecture diagram
├── javascripts/
│ └── mermaid.min.js # Self-hosted Mermaid runtime (guarantees offline
parity)
├── architecture/ # 4 pages
├── design-decisions/ # 8 ADR pages
├── challenges/ # 14 engineering challenge post-mortems
├── database/ # 4 PostgreSQL/pgvector pages
├── services/ # 7 service breakdown pages
├── cloud-infrastructure/ # 8 Terraform/AWS pages
├── security/ # 6 security & IRSA pages
├── deployment/ # 5 ArgoCD GitOps pages
├── operations/ # 6 observability & runbook pages
├── testing/ # 6 end-to-end testing pages
├── local-development/ # 6 Localstack & Docker parity pages
└── api-reference/ # 7 OpenAPI & SSE event pages
──────

## 3. Key Technical Decisions & Bug Resolutions

1. Isolation from Internal Docs:
   • docs/ is reserved strictly for internal agent memory (docs/context/ and docs/progress/)
   as enforced by GEMINI.md.
   • All documentation website source files, requirements, virtual environments, and
   configuration live exclusively under docs-site/.
2. Standardized Interactive Diagram Engine:
   • Avoid custom pan/zoom scripts; use standardized mkdocs-panzoom-plugin (v0.5.2).
   • In mkdocs.yml:
   plugins: - search - mermaid2:
   arguments:
   startOnLoad: true
   theme: 'default' - panzoom:
   full_screen: true
   key: "none"

   • Superfences custom fence uses mermaid2.fence_mermaid to generate standard <div
   class="mermaid"> elements in the light DOM, preventing Material for MkDocs 9.x from
   encapsulating diagrams inside a closed shadow root.
   • key: "none" allows intuitive, modifier-free on-canvas drag-to-pan and mouse-wheel zoom.
   • Theme variables seamlessly support both Material Light Mode and Slate (Dark) Mode.

3. Mermaid Diagram Color Palette & Flow:
   • Explicitly configured with %%{init}%% and custom subgraph borders to replicate AWS EKS
   Cluster Workflow-2026-10-11-101704.png:
   • Client Interface: #fdf4ff (Border: #d946ef)
   • Global Edge & CDN Layer: #f0fdfa (Border: #14b8a6)
   • AWS Storage, Messaging & Database: #ecfeff (Border: #06b6d4)
   • Amazon EKS Cluster (Kubernetes 1.31): #fff7ed (Border: #f97316)
   • Amazon Bedrock Foundation Models: #ecfdf5 (Border: #10b981)
   • Avoid classDef default, which overrides subgraph fills with white; use targeted classes
   like classDef whiteCard for service cards.

──────

## 4. Current Roadmap & Next Steps

We are ready to transition to Phase 2 of DOCUMENTATION_PLAN.md:

1. Phase 2: Master Readme & Core Architecture Documentation:
   • Step 2.1: Rewrite root README.md following Section 5.1 of DOCUMENTATION_PLAN.md (badges,
   architecture overview, AWS-DOP/CKA highlights, quickstart, verification).
   • Step 2.2: Populate docs-site/docs/architecture/overview.md, data-flow.md, technology-
   stack.md, and cost-optimization.md.
2. Phase 3: ADRs (docs-site/docs/design-decisions/) & Challenge Post-Mortems (docs-
   site/docs/challenges/).
3. Phase 4: Microservice & Database Documentation.
4. Phase 5: Infrastructure (Terraform), Kubernetes & GitOps Documentation.
5. Phase 6: Operations, Security & Local Development.
6. Phase 7: Final Review & GitHub Pages automated deployment check.
   ──────

## 5. Quick Verification Commands

    # Build documentation strictly from repo root
    docs-site/.venv-docs/bin/mkdocs build --strict -f docs-site/mkdocs.yml

    # Run dev server locally
    docs-site/.venv-docs/bin/mkdocs serve -f docs-site/mkdocs.yml
