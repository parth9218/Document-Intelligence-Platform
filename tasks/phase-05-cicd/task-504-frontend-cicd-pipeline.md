# Task 504: Multi-Environment Frontend CI/CD Pipeline (`frontend-deploy.yml`)

## 1. Goal

Implement an enterprise-grade, multi-environment, tag-driven CI/CD deployment pipeline for the React/Next.js frontend application in [`.github/workflows/frontend-deploy.yml`](file:///Users/parth/RAG/Document%20Intelligence%20Platform/.github/workflows/frontend-deploy.yml). The pipeline enforces a strict **"Build once in dev, promote identical immutable artifacts to stg/prod"** pattern using a dedicated shared S3 artifact bucket (`vars.ARTIFACT_BUCKET_NAME`), runtime `config.js` generation, CloudFront cache invalidation with edge-cached / browser-revalidating headers, manual approval gates via GitHub Environments, and automated selective release audit tracking branches (`{env}/frontend`).

---

## 2. Prerequisites & Frontend Code Preparation (Task 503)

Before executing Task 504, the frontend codebase must be modified per [Task 503: Frontend Runtime Configuration Decoupling](file:///Users/parth/RAG/Document%20Intelligence%20Platform/tasks/phase-05-cicd/task-503-frontend-runtime-config.md) to decouple runtime endpoints from build-time static inlining:

### Summary of Task 503 Frontend Modifications:
1. **Script Tag in Root Layout**: `<Script src="/config.js" strategy="beforeInteractive" />` injected into `<head>` in `apps/frontend/src/app/layout.tsx` so the browser loads runtime configuration synchronously before React hydration.
2. **Global Window Type Extension**: `apps/frontend/src/types/config.d.ts` extends `Window.__APP_CONFIG__` with `API_URL`, `API_MODE`, and `APP_VERSION`.
3. **Generic Default Template**: `apps/frontend/public/config.js` provides generic fallback properties for local testing.
4. **Runtime Config Readers**: [api-client.ts](file:///Users/parth/RAG/Document%20Intelligence%20Platform/apps/frontend/src/lib/api-client.ts) and [api-routing.ts](file:///Users/parth/RAG/Document%20Intelligence%20Platform/apps/frontend/src/config/api-routing.ts) resolve `window.__APP_CONFIG__` first before falling back to `process.env.NEXT_PUBLIC_*` or localhost.
5. **Universal Build Command**: `package.json` consolidates builds into a single `"build": "next build"` command, retiring environment-specific build scripts (`build:prod`, `build:local`).

---

## 3. Architectural Blueprint & S3 Artifact Promotion Hierarchy

To prevent rebuilding source code across environments and maintain immutable release provenance, pre-compiled static export bundles (`out/`) are packaged and managed through a centralized S3 artifact store:

### 3.1 Repository Configuration
* **Repository Variable**: `vars.ARTIFACT_BUCKET_NAME` (manually provisioned shared S3 bucket accessible by the GitHub Actions CI OIDC role).

### 3.2 Artifact Storage Layout
```text
s3://${ARTIFACT_BUCKET_NAME}/
├── builds/
│   └── ${COMMIT_SHA}.tar.gz           # Uploaded by dev branch CI build
└── releases/
    ├── stg/
    │   └── ${VERSION}.tar.gz          # Promoted from builds/${COMMIT_SHA}.tar.gz upon stg tag
    └── prod/
        └── ${VERSION}.tar.gz          # Promoted from releases/stg/${VERSION}.tar.gz upon prod tag
```

---

## 4. Trigger Configuration

The workflow [.github/workflows/frontend-deploy.yml](file:///Users/parth/RAG/Document%20Intelligence%20Platform/.github/workflows/frontend-deploy.yml) triggers on:

```yaml
on:
  push:
    branches:
      - dev
    paths:
      - 'apps/frontend/**'
    tags:
      - 'stg-frontend-v*'
      - 'prod-frontend-v*'
  workflow_dispatch:
```

*Note: On tag pushes, GitHub Actions ignores `paths:`. Do not nest `tags:` under `paths:`.*

---

## 5. Workflow Architecture & Step-by-Step Implementation

The workflow consists of two sequential jobs: `detect-env` and `deploy-frontend`.

### 5.1 Environment & Release Detection (`detect-env` job)
Analyzes the execution event and resolves environment metadata:
```bash
if [[ "${{ github.ref_type }}" == "tag" ]]; then
  # Tag pattern: {env}-frontend-v{major}.{minor}.{patch}
  TAG_NAME="${{ github.ref_name }}"
  ENV=$(echo "$TAG_NAME" | cut -d'-' -f1)
  VERSION=$(echo "$TAG_NAME" | sed -E 's/^[a-z]+-frontend-//')
elif [[ ("${{ github.event_name }}" == "push" && "${{ github.ref_name }}" == "dev") || "${{ github.event_name }}" == "workflow_dispatch" ]]; then
  ENV="dev"
  VERSION="0.0.0"
fi

SHORT_SHA=$(git rev-parse --short HEAD)
COMMIT_SHA="${{ github.sha }}"

echo "env=$ENV" >> $GITHUB_OUTPUT
echo "version=$VERSION" >> $GITHUB_OUTPUT
echo "short_sha=$SHORT_SHA" >> $GITHUB_OUTPUT
echo "commit_sha=$COMMIT_SHA" >> $GITHUB_OUTPUT
```

---

### 5.2 Deployment & Promotion Pipeline (`deploy-frontend` job)

* **Environment Gate**: Binds to `environment: ${{ needs.detect-env.outputs.env }}` to enforce required reviewer approvals for `stg` and `prod`.
* **Concurrency Lock**: `concurrency: deploy-frontend-${{ needs.detect-env.outputs.env }}`.

#### Step 1: AWS OIDC Authentication
Assumes the GitHub Actions CI role via `aws-actions/configure-aws-credentials` using `vars.TF_VAR_GITHUB_ACTIONS_CI_ROLE` and `vars.AWS_REGION`.

#### Step 2: Query Infrastructure Outputs via `infra/terraform/query`
Utilizes the zero-provider query module to read target environment outputs:
1. `working-directory: infra/terraform/query`
2. `terraform init`
3. `terraform apply -auto-approve -input=false -var-file="../aws/environments/${{ env.ENV }}/backend.config.hcl"`
4. Extract JSON outputs using `jq`:
   - `FRONTEND_BUCKET_ID`
   - `CLOUDFRONT_DOMAIN`
   - `CLOUDFRONT_DIST_ID`

#### Step 3: Artifact Resolution & Promotion Logic

##### Branch A: Development Environment (`ENV == 'dev'`)
1. Set up Node.js 24 and install dependencies (`npm ci`).
2. Run universal build: `npm run build` in `apps/frontend/` (outputs static files to `apps/frontend/out/`).
3. Package build artifact:
   ```bash
   tar -czf "/tmp/frontend-${COMMIT_SHA}.tar.gz" -C apps/frontend/out .
   ```
4. Upload to central artifact bucket:
   ```bash
   aws s3 cp "/tmp/frontend-${COMMIT_SHA}.tar.gz" \
     "s3://${{ vars.ARTIFACT_BUCKET_NAME }}/builds/${COMMIT_SHA}.tar.gz"
   ```

##### Branch B: Staging Environment (`ENV == 'stg'`)
1. Verify and download the dev build corresponding to the tag's commit:
   ```bash
   aws s3 cp "s3://${{ vars.ARTIFACT_BUCKET_NAME }}/builds/${COMMIT_SHA}.tar.gz" "/tmp/build.tar.gz" || {
     echo "::error::Build artifact for commit ${COMMIT_SHA} not found in s3://${{ vars.ARTIFACT_BUCKET_NAME }}/builds/. Ensure this commit was merged and built in dev first!"
     exit 1
   }
   ```
2. Promote artifact in S3:
   ```bash
   aws s3 cp "/tmp/build.tar.gz" \
     "s3://${{ vars.ARTIFACT_BUCKET_NAME }}/releases/stg/${VERSION}.tar.gz"
   ```
3. Unpack into deployment directory:
   ```bash
   mkdir -p apps/frontend/out
   tar -xzf "/tmp/build.tar.gz" -C apps/frontend/out
   ```

##### Branch C: Production Environment (`ENV == 'prod'`)
1. Verify and download the validated release artifact from staging:
   ```bash
   aws s3 cp "s3://${{ vars.ARTIFACT_BUCKET_NAME }}/releases/stg/${VERSION}.tar.gz" "/tmp/build.tar.gz" || {
     echo "::error::Release ${VERSION} was not found in staging releases (s3://${{ vars.ARTIFACT_BUCKET_NAME }}/releases/stg/${VERSION}.tar.gz). Deploy to staging before promoting to production!"
     exit 1
   }
   ```
2. Promote artifact in S3:
   ```bash
   aws s3 cp "/tmp/build.tar.gz" \
     "s3://${{ vars.ARTIFACT_BUCKET_NAME }}/releases/prod/${VERSION}.tar.gz"
   ```
3. Unpack into deployment directory:
   ```bash
   mkdir -p apps/frontend/out
   tar -xzf "/tmp/build.tar.gz" -C apps/frontend/out
   ```

---

#### Step 4: Runtime Configuration Injection (`config.js`)
Generate the environment-specific `config.js` directly inside `apps/frontend/out/config.js`:
```bash
cat <<EOF > apps/frontend/out/config.js
window.__APP_CONFIG__ = {
  API_URL: "https://${CLOUDFRONT_DOMAIN}/api",
  API_MODE: "$([ "${ENV}" == "dev" ] && echo "hybrid" || echo "api")",
  APP_VERSION: "${VERSION}"
};
EOF
```

---

#### Step 5: S3 Static Asset Synchronization with Strict Cache Headers
Execute deployment in two separate commands to ensure optimal CDN caching without browser cache lock-in:

1. **Sync Immutable Content-Hashed Assets**:
   ```bash
   aws s3 sync apps/frontend/out "s3://${FRONTEND_BUCKET_ID}" \
     --delete \
     --exclude "config.js"
   ```
2. **Upload Runtime Configuration (Edge-Cached + Browser-Revalidated)**:
   ```bash
   aws s3 cp apps/frontend/out/config.js "s3://${FRONTEND_BUCKET_ID}/config.js" \
     --content-type "application/javascript" \
     --cache-control "public, max-age=0, s-maxage=86400, must-revalidate"
   ```

---

#### Step 6: Invalidate CloudFront CDN Cache
Purge edge caches so the new release is served immediately:
```bash
if [ -n "$CLOUDFRONT_DIST_ID" ] && [ "$CLOUDFRONT_DIST_ID" != "None" ]; then
  aws cloudfront create-invalidation \
    --distribution-id "$CLOUDFRONT_DIST_ID" \
    --paths "/*"
fi
```

---

#### Step 7: Selective Audit Tracking Commit (`stg` & `prod` tags only)
Preserve an immutable chronological Git history of what is running in each environment:
```bash
if [[ "${{ github.ref_type }}" == "tag" ]]; then
  git config --global user.name "github-actions[bot]"
  git config --global user.email "github-actions[bot]@users.noreply.github.com"

  # Switch to tracking branch
  if git ls-remote --exit-code --heads origin "${ENV}/app" >/dev/null 2>&1; then
    git checkout "${ENV}/app"
    git pull --rebase origin "${ENV}/app"
  else
    git checkout -b "${ENV}/app"
  fi

  # Non-destructive selective checkout of apps/frontend from release tag
  git checkout "tags/${{ github.ref_name }}" -- apps/frontend 2>/dev/null || \
  git checkout "${{ github.ref_name }}" -- apps/frontend 2>/dev/null || true

  git add apps/frontend
  git commit -m "release(frontend): deploy frontend ${VERSION} [skip ci]" \
             -m "Release Tag: ${{ github.ref_name }}" \
             -m "Source Commit: ${COMMIT_SHA}" \
             -m "Workflow Run: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}" \
    || echo "No changes to commit"

  git pull --rebase origin "${ENV}/app" || true
  git push origin HEAD:"${ENV}/app"
fi
```

---

## 6. Acceptance Criteria

- [ ] Prerequisites in Task 503 are verified and completed prior to workflow execution.
- [ ] Workflow triggers on `push: branches: [dev]` (`apps/frontend/**`), tags `stg-frontend-v*` / `prod-frontend-v*`, and manual `workflow_dispatch`.
- [ ] Environment detection job dynamically derives `ENV`, `VERSION`, and commit SHA.
- [ ] Target environment outputs (`frontend_bucket_id`, `cloudfront_domain`, `cloudfront_distribution_id`) are extracted dynamically via `infra/terraform/query`.
- [ ] `dev` runs `npm run build` once and publishes `frontend-${COMMIT_SHA}.tar.gz` to `s3://${vars.ARTIFACT_BUCKET_NAME}/builds/`.
- [ ] `stg` verifies and promotes the dev build artifact to `s3://${vars.ARTIFACT_BUCKET_NAME}/releases/stg/${VERSION}.tar.gz` (fails fast if dev build is missing).
- [ ] `prod` verifies and promotes the staging release artifact to `s3://${vars.ARTIFACT_BUCKET_NAME}/releases/prod/${VERSION}.tar.gz` (fails fast if staging release is missing).
- [ ] Manual approval gates are enforced for `stg` and `prod` via GitHub Environments.
- [ ] `config.js` is generated dynamically on the runner and uploaded with `Cache-Control: public, max-age=0, s-maxage=86400, must-revalidate`.
- [ ] CloudFront cache invalidation runs for all deployments.
- [ ] Tagged releases selectively update the consolidated `{env}/app` audit tracking branches without destructive `git rm` wipes.

