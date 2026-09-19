# GitHub Actions Workflows

Smart deployment system with path filtering and reusable workflows.

## How it works

On every push to `main`:

1. **Detect changes** — check which workspaces changed
2. **Deploy selectively** — deploy only changed services
3. **Skip unnecessary deploys** — save CI time and costs

```
git push → main
     ↓
detect-changes (paths-filter)
     ↓
   [backend changed?] → deploy-backend (reusable workflow)
   [frontend changed?] → deploy-frontend (reusable workflow)
   [deploy-all files changed?] → deploy both
```

## Files

| File | Purpose |
|------|---------|
| `deploy.yml` | Main orchestrator — detects changes, calls reusable workflows |
| `_deploy-service.yml` | Reusable workflow template — handles Cloud Run, Firebase Hosting, Cloud Functions |

**Convention:** Reusable workflows start with `_` (not meant to be triggered directly).

## Path filtering rules

### Workspace-specific changes

Deploy only the changed workspace:

```yaml
workspaces/backend/**   → deploy backend only
workspaces/frontend/**  → deploy frontend only
workspaces/functions/** → deploy functions only
```

### Global changes (deploy all)

Some files affect all workspaces — deploy everything:

```yaml
package.json           → deploy all (root dependencies)
package-lock.json      → deploy all (lockfile change)
.github/workflows/**   → deploy all (test new workflow)
```

### Documentation changes (skip deployment)

Changes to docs don't affect runtime — skip deployment:

```yaml
README.md          → workflow runs, all jobs skipped
CLAUDE.md          → workflow runs, all jobs skipped
*.md (any docs)    → workflow runs, all jobs skipped
```

**Result:** Workflow always runs (to report status), but deployment jobs are skipped when not needed.

## Deployment conditions

Each deployment job checks two conditions (OR logic):

```yaml
deploy-backend:
  if: |
    needs.detect-changes.outputs.backend == 'true' ||
    needs.detect-changes.outputs.deploy-all == 'true'
```

**Translation:**
- Deploy backend if `workspaces/backend/**` changed
- OR deploy backend if `package.json` / `package-lock.json` / `.github/workflows/**` changed

## Reusable workflow parameters

`.github/workflows/_deploy-service.yml` accepts:

| Parameter | Required | Options | Example |
|-----------|----------|---------|---------|
| `service-name` | ✅ | Any string | `backend`, `frontend`, `functions` |
| `service-type` | ✅ | `cloud-run`, `firebase-hosting`, `cloud-functions` | `cloud-run` |
| `workspace` | ✅ | Workspace path | `workspaces/backend` |
| `region` | ❌ | GCP region | `europe-central2` (default from vars) |

**Example usage:**

```yaml
deploy-backend:
  uses: ./.github/workflows/_deploy-service.yml
  with:
    service-name: backend
    service-type: cloud-run
    workspace: workspaces/backend
```

## Adding a new workspace

1. **Create workspace** in `workspaces/new-service/`

2. **Add path filter** to `deploy.yml`:

```yaml
detect-changes:
  outputs:
    new-service: ${{ steps.filter.outputs.new-service }}  # add output
  steps:
    - uses: dorny/paths-filter@v3
      id: filter
      with:
        filters: |
          new-service: 'workspaces/new-service/**'  # add filter
```

3. **Add deployment job** to `deploy.yml`:

```yaml
deploy-new-service:
  name: Deploy New Service
  needs: detect-changes
  if: |
    needs.detect-changes.outputs.new-service == 'true' ||
    needs.detect-changes.outputs.deploy-all == 'true'
  uses: ./.github/workflows/_deploy-service.yml
  with:
    service-name: new-service
    service-type: cloud-run  # or firebase-hosting, cloud-functions
    workspace: workspaces/new-service
```

4. **Push to main** — workflow will deploy only the new service

## Service types

### Cloud Run

```yaml
service-type: cloud-run
```

Requires:
- `workspaces/{service}/Dockerfile`
- `workspaces/{service}/cloudbuild.yaml` (build config)
- Artifact Registry repository
- Cloud Run service account

Deploys to: Cloud Run (public or private)

### Firebase Hosting

```yaml
service-type: firebase-hosting
```

Requires:
- `workspaces/{service}/firebase.json`
- `workspaces/{service}/.firebaserc`
- Build script in root `package.json`: `build:{service}`
- Firebase Hosting enabled

Deploys to: Firebase Hosting (CDN)

### Cloud Functions

```yaml
service-type: cloud-functions
```

Requires:
- `workspaces/{service}/index.ts` (entry point)
- `workspaces/{service}/package.json`
- Cloud Functions API enabled
- Service account with Cloud Functions Admin role

Deploys to: Cloud Functions 2nd gen

## Workflow evolution

### Phase 1-2: Naive deployment
```yaml
jobs:
  deploy-backend: [always deploy]
  deploy-frontend: [always deploy]
```

Simple, works, good for start. Every push deploys everything.

### Phase 3: Smart deployment (current)
```yaml
jobs:
  detect-changes: [path filtering]
  deploy-backend: [conditional]
  deploy-frontend: [conditional]
```

Optimized — deploy only changed workspaces. Saves CI time and GCP costs.

**Savings example:**
- Push with backend change only: 1 deployment instead of 2 (50% reduction)
- Push with README change: 0 deployments instead of 2 (100% reduction)

## Debugging

### Check what triggered deployment

GitHub Actions UI → workflow run → job details:

```
detect-changes
  ✅ backend: true
  ❌ frontend: false
  ❌ deploy-all: false

Result: deploy backend only
```

### Force deploy all

Two options:

1. **Modify deploy-all files** (trigger condition):
   ```bash
   git commit --allow-empty -m "Force deploy all"
   git push
   ```

2. **Temporary disable conditions** (not recommended):
   ```yaml
   deploy-backend:
     if: true  # override condition
   ```

### Workflow not running

Check:
- Branch is `main` (workflow only triggers on `main`)
- Push succeeded (not just commit)
- Workflow file is valid YAML (GitHub Actions tab shows errors)

## Cost optimization

Smart deployment reduces GCP costs:

| Scenario | Naive | Smart | Savings |
|----------|-------|-------|---------|
| Backend change only | 2 deploys | 1 deploy | 50% |
| Frontend change only | 2 deploys | 1 deploy | 50% |
| README change | 2 deploys | 0 deploys | 100% |
| Both changed | 2 deploys | 2 deploys | 0% |
| Root deps change | 2 deploys | 2 deploys | 0% |

**Cloud Build costs:** ~$0.003/build-minute (after free tier)  
**Typical build:** ~2 minutes  
**Savings:** ~$0.006 per skipped deployment

With 50 commits/month:
- Naive: ~100 deploys = ~$0.60
- Smart: ~50-60 deploys = ~$0.30-0.36 (40% reduction)

Not huge absolute savings, but good practice for CI/CD hygiene.
