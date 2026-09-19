# GCP GitHub Actions — CI/CD with Workload Identity Federation

Monorepo demonstrating CI/CD with GitHub Actions and Workload Identity Federation (WIF) for multi-service GCP deployments.

**Key features:**
- Keyless authentication (no service account JSON keys in GitHub secrets)
- Multi-service deployment orchestration (Cloud Run, Cloud Functions, Firebase Hosting)
- Path-based conditional deployment (deploy only changed workspaces)
- Production-ready patterns for GCP CI/CD pipelines

---

## Architecture

```
GitHub Actions workflow
        ↓  OIDC token (JWT, expires in minutes)
Workload Identity Pool (GCP)
  — validates token issuer (token.actions.githubusercontent.com)
  — maps GitHub repo → service account
        ↓  short-lived access token
Service Account (github-actions-sa)
  — roles: Artifact Registry Writer, Cloud Run Admin, etc.
        ↓
docker build → Artifact Registry → gcloud run deploy
```

**Zero long-lived credentials.** GitHub's OIDC token is exchanged for a GCP access token at runtime.

---

## Workspaces

| Workspace | GCP Service | Status | Description |
|-----------|-------------|--------|-------------|
| `backend` | Cloud Run | ✅ Phase 1 | Hono API (Hello World, health check) |
| `frontend` | Firebase Hosting | 📋 Phase 2 | React SPA (static site) |
| `functions` | Cloud Functions 2nd gen | 📋 Phase 3 | HTTP trigger (webhook handler) |
| `worker` | Cloud Run (private) | 📋 Phase 4 | Background job processor |
| `cron` | Cloud Scheduler | 📋 Phase 5 | Scheduled task |

**Implementation order:** 1 → 2 → (smart workflow refactor) → 3 → 4 → 5

Each workspace demonstrates a different GCP deployment pattern. Workspaces don't need to be logically connected — they're independent examples.

---

## Tech Stack

- **Monorepo:** npm workspaces
- **Backend:** Hono + TypeScript
- **Frontend:** React + Vite
- **Functions:** TypeScript (Cloud Functions 2nd gen)
- **CI/CD:** GitHub Actions + Workload Identity Federation
- **GCP Services:** Cloud Run, Cloud Functions, Firebase Hosting, Artifact Registry, Cloud Scheduler

---

## GCP Configuration

| Parameter | Value |
|-----------|-------|
| **Project ID** | `native-dev-506112` |
| **Project Number** | `216135873902` |
| **Region** | `europe-central2` |
| **Account** | `paweljanus.gcp@gmail.com` |
| **Artifact Registry** | `gcp-apps` (europe-central2) |

---

## Setup: Workload Identity Federation

### Prerequisites

- GCP project: `native-dev-506112`
- GitHub repo: `pawel-janus/gcp-github-actions`
- `gcloud` CLI authenticated as `paweljanus.gcp@gmail.com`

### Step 1: Enable Required APIs

```bash
gcloud services enable iamcredentials.googleapis.com \
  sts.googleapis.com \
  artifactregistry.googleapis.com \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  --account=paweljanus.gcp@gmail.com \
  --project=native-dev-506112
```

### Step 2: Create Workload Identity Pool

```bash
gcloud iam workload-identity-pools create github-actions-pool \
  --account=paweljanus.gcp@gmail.com \
  --project=native-dev-506112 \
  --location=global \
  --display-name="GitHub Actions Pool"
```

**Verify:**
```bash
gcloud iam workload-identity-pools describe github-actions-pool \
  --account=paweljanus.gcp@gmail.com \
  --project=native-dev-506112 \
  --location=global
```

### Step 3: Create WIF Provider (GitHub OIDC)

```bash
gcloud iam workload-identity-pools providers create-oidc github-provider \
  --account=paweljanus.gcp@gmail.com \
  --project=native-dev-506112 \
  --location=global \
  --workload-identity-pool=github-actions-pool \
  --display-name="GitHub OIDC Provider" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner" \
  --attribute-condition="assertion.repository_owner == 'pawel-janus'" \
  --issuer-uri="https://token.actions.githubusercontent.com"
```

**What this does:**
- Sets GitHub as trusted OIDC issuer (`token.actions.githubusercontent.com`)
- Maps JWT claims to GCP attributes
- **Security:** Only tokens from `pawel-janus/*` repos are accepted

**Verify:**
```bash
gcloud iam workload-identity-pools providers describe github-provider \
  --account=paweljanus.gcp@gmail.com \
  --project=native-dev-506112 \
  --location=global \
  --workload-identity-pool=github-actions-pool
```

### Step 4: Create Service Account

```bash
gcloud iam service-accounts create github-actions-sa \
  --account=paweljanus.gcp@gmail.com \
  --project=native-dev-506112 \
  --display-name="GitHub Actions Service Account" \
  --description="Service account for GitHub Actions CI/CD deployments"
```

**Email:** `github-actions-sa@native-dev-506112.iam.gserviceaccount.com`

**Verify:**
```bash
gcloud iam service-accounts describe github-actions-sa@native-dev-506112.iam.gserviceaccount.com \
  --account=paweljanus.gcp@gmail.com \
  --project=native-dev-506112
```

### Step 5: Grant IAM Roles to Service Account

#### Phase 1 (Backend on Cloud Run):

```bash
# Artifact Registry Writer — push Docker images
gcloud projects add-iam-policy-binding native-dev-506112 \
  --account=paweljanus.gcp@gmail.com \
  --member="serviceAccount:github-actions-sa@native-dev-506112.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"

# Cloud Run Admin — deploy services
gcloud projects add-iam-policy-binding native-dev-506112 \
  --account=paweljanus.gcp@gmail.com \
  --member="serviceAccount:github-actions-sa@native-dev-506112.iam.gserviceaccount.com" \
  --role="roles/run.admin"

# Service Account User — deploy as another SA
gcloud projects add-iam-policy-binding native-dev-506112 \
  --account=paweljanus.gcp@gmail.com \
  --member="serviceAccount:github-actions-sa@native-dev-506112.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"

# Cloud Build Service Account — submit builds
gcloud projects add-iam-policy-binding native-dev-506112 \
  --account=paweljanus.gcp@gmail.com \
  --member="serviceAccount:github-actions-sa@native-dev-506112.iam.gserviceaccount.com" \
  --role="roles/cloudbuild.builds.editor"
```

#### Future Phases (add when needed):

```bash
# Phase 3: Cloud Functions
gcloud projects add-iam-policy-binding native-dev-506112 \
  --account=paweljanus.gcp@gmail.com \
  --member="serviceAccount:github-actions-sa@native-dev-506112.iam.gserviceaccount.com" \
  --role="roles/cloudfunctions.admin"

# Phase 2: Firebase Hosting
gcloud projects add-iam-policy-binding native-dev-506112 \
  --account=paweljanus.gcp@gmail.com \
  --member="serviceAccount:github-actions-sa@native-dev-506112.iam.gserviceaccount.com" \
  --role="roles/firebase.admin"
```

**Verify all roles:**
```bash
gcloud projects get-iam-policy native-dev-506112 \
  --account=paweljanus.gcp@gmail.com \
  --flatten="bindings[].members" \
  --filter="bindings.members:github-actions-sa@native-dev-506112.iam.gserviceaccount.com"
```

### Step 6: Bind GitHub Repo → Service Account

```bash
gcloud iam service-accounts add-iam-policy-binding github-actions-sa@native-dev-506112.iam.gserviceaccount.com \
  --account=paweljanus.gcp@gmail.com \
  --project=native-dev-506112 \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/216135873902/locations/global/workloadIdentityPools/github-actions-pool/attribute.repository/pawel-janus/gcp-github-actions"
```

**What this does:**
- Allows WIF Pool to impersonate this Service Account
- **Only** for repo `pawel-janus/gcp-github-actions` (security)

**Verify:**
```bash
gcloud iam service-accounts get-iam-policy github-actions-sa@native-dev-506112.iam.gserviceaccount.com \
  --account=paweljanus.gcp@gmail.com \
  --project=native-dev-506112
```

### Step 7: Get Workload Identity Provider Name

```bash
gcloud iam workload-identity-pools providers describe github-provider \
  --account=paweljanus.gcp@gmail.com \
  --project=native-dev-506112 \
  --location=global \
  --workload-identity-pool=github-actions-pool \
  --format="value(name)"
```

**Output (used in GitHub Actions workflow):**
```
projects/216135873902/locations/global/workloadIdentityPools/github-actions-pool/providers/github-provider
```

### Step 8: Create Artifact Registry Repository

```bash
# Check if exists
gcloud artifacts repositories describe gcp-apps \
  --account=paweljanus.gcp@gmail.com \
  --project=native-dev-506112 \
  --location=europe-central2

# If not exists, create
gcloud artifacts repositories create gcp-apps \
  --account=paweljanus.gcp@gmail.com \
  --project=native-dev-506112 \
  --repository-format=docker \
  --location=europe-central2 \
  --description="Docker images for GCP POCs (GitHub Actions, Pub/Sub, Terraform, BigQuery)"
```

**Image path:**
```
europe-central2-docker.pkg.dev/native-dev-506112/gcp-apps/${SERVICE_NAME}:latest
```

---

## Workflow Evolution: Naive → Smart

### Naive Approach (Phase 1-2)

Deploy all workspaces on every push to `main`:

```yaml
jobs:
  deploy-backend:
    steps: [build backend, deploy backend]
  
  deploy-frontend:
    steps: [build frontend, deploy frontend]
```

**Pros:** Simple, always works  
**Cons:** Slow when many workspaces exist (rebuilds everything)

### Smart Approach (Phase 3+)

Deploy only changed workspaces using path filtering:

```yaml
jobs:
  detect-changes:
    outputs:
      backend: ${{ steps.changes.outputs.backend }}
      frontend: ${{ steps.changes.outputs.frontend }}
      functions: ${{ steps.changes.outputs.functions }}
    steps:
      - uses: dorny/paths-filter@v2
        id: changes
        with:
          filters: |
            backend: 'workspaces/backend/**'
            frontend: 'workspaces/frontend/**'
            functions: 'workspaces/functions/**'

  deploy-backend:
    needs: detect-changes
    if: needs.detect-changes.outputs.backend == 'true'
    steps: [build backend, deploy backend]
```

**Transition:** After Phase 2 (2 workspaces working), refactor workflow to smart approach.

---

## Project Structure

```
gcp-github-actions/
├── .github/
│   └── workflows/
│       └── deploy.yml         # CI/CD pipeline
├── workspaces/
│   ├── backend/               # Phase 1: Hono API on Cloud Run
│   ├── frontend/              # Phase 2: React SPA on Firebase Hosting
│   ├── functions/             # Phase 3: Cloud Functions 2nd gen
│   ├── worker/                # Phase 4: Cloud Run (private)
│   └── cron/                  # Phase 5: Cloud Scheduler
├── package.json               # npm workspaces root
├── .gitignore
└── README.md
```

---

## Workspace: Backend (Phase 1)

**Status:** ✅ Implemented  
**Service:** Cloud Run  
**Tech:** Hono + TypeScript + @hono/node-server

### Endpoints

- `GET /` — Service info and available endpoints
- `GET /health` — Health check (status, timestamp)
- `GET /api/hello?name=X` — Hello World with optional name parameter

### Local Structure

```
workspaces/backend/
├── src/
│   └── index.ts          # Hono app with 3 endpoints
├── package.json          # Dependencies: hono, @hono/node-server
├── tsconfig.json         # TypeScript config (ESNext, strict)
├── Dockerfile            # Multi-stage Docker build
├── cloudbuild.yaml       # Cloud Build configuration
├── .dockerignore
└── dist/                 # Built JavaScript (after npm run build)
```

---

## Development

### Install dependencies

```bash
npm install
```

### Run backend locally

```bash
npm run dev:backend
```

### Build backend

```bash
npm run build:backend
```

### Test backend locally

```bash
npm run start:backend
# In another terminal:
curl http://localhost:3000/health
curl "http://localhost:3000/api/hello?name=Test"
```

### Add new workspace

1. Create directory: `workspaces/<workspace-name>/`
2. Add `package.json` with `name` matching workspace directory
3. Add workspace to root scripts (optional)
4. Update `.github/workflows/deploy.yml` to deploy new workspace

---

## Deployment

### Manual Deploy (for testing)

```bash
# Build Docker image using Cloud Build
gcloud builds submit \
  --account=paweljanus.gcp@gmail.com \
  --project=native-dev-506112 \
  --config=workspaces/backend/cloudbuild.yaml \
  .

# Deploy to Cloud Run
gcloud run deploy backend \
  --account=paweljanus.gcp@gmail.com \
  --project=native-dev-506112 \
  --image=europe-central2-docker.pkg.dev/native-dev-506112/gcp-apps/backend:latest \
  --platform=managed \
  --region=europe-central2 \
  --allow-unauthenticated \
  --port=3000 \
  --memory=512Mi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=10

# Get Service URL
gcloud run services describe backend \
  --account=paweljanus.gcp@gmail.com \
  --project=native-dev-506112 \
  --region=europe-central2 \
  --format='value(status.url)'
```

**Test deployed service:**
```bash
curl https://backend-216135873902.europe-central2.run.app/health
curl "https://backend-216135873902.europe-central2.run.app/api/hello?name=Test"
```

### Automated Deploy (GitHub Actions)

1. Push to `main` branch
2. GitHub Actions workflow triggers
3. WIF authenticates to GCP
4. Changed workspaces are built and deployed
5. Deployment URL available in workflow logs

---

## Skills Demonstrated

- GitHub Actions — workflow syntax, triggers, jobs, steps, matrix builds
- Workload Identity Federation — OIDC token exchange, pool/provider setup
- Keyless authentication pattern — industry standard for CI/CD on GCP
- Minimal-privilege service account design for deployment pipelines
- Artifact Registry — Docker image push from CI
- Monorepo CI/CD — path filtering, conditional deployment, multi-service orchestration
- Cloud Run deployment automation — build + push + deploy in one workflow
- Cloud Functions IAM automation — `add-invoker-policy-binding` (idempotent)
- Firebase Hosting deployment — static site deployment from CI
- Cloud Scheduler + Terraform — scheduled tasks as code

---

## License

MIT

---

## Author

**Paweł Janus**  
GitHub: [@pawel-janus](https://github.com/pawel-janus)  
Email: paweljanus.dev@gmail.com
