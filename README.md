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

Before starting, configure these values for your GCP project:

| Parameter | How to get it |
|-----------|---------------|
| **Project ID** | Your GCP project ID (e.g., `my-project-123`) |
| **Project Number** | Run: `gcloud projects describe YOUR_PROJECT_ID --format='value(projectNumber)'` |
| **Region** | Choose deployment region (e.g., `europe-central2`, `us-central1`) |
| **Account** | Your GCP account email |
| **Artifact Registry** | Repository name for Docker images (e.g., `gcp-apps`) |

**Set environment variables:**
```bash
export PROJECT_ID=your-gcp-project-id
export REGION=your-region
export ACCOUNT=your-email@example.com
export AR_REPO=your-artifact-registry-repo
```

---

## Setup: Workload Identity Federation

⚠️ **Complete Steps 1-8 below first, then configure GitHub Repository Variables (Step 10)**

### Prerequisites

- GCP project (get Project ID: `gcloud config get-value project`)
- GitHub repo created (e.g., `your-username/gcp-github-actions`)
- `gcloud` CLI authenticated (`gcloud auth login`)

### Setup Environment Variables

Set these variables before running setup commands:

```bash
export PROJECT_ID=$(gcloud config get-value project)
export PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
export ACCOUNT=$(gcloud config get-value account)
export GITHUB_OWNER=your-github-username
export GITHUB_REPO=gcp-github-actions
export REGION=europe-central2
export AR_REPO=gcp-apps
```

### Step 1: Enable Required APIs

```bash
gcloud services enable iamcredentials.googleapis.com \
  sts.googleapis.com \
  artifactregistry.googleapis.com \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  --account=$ACCOUNT \
  --project=$PROJECT_ID
```

### Step 2: Create Workload Identity Pool

```bash
gcloud iam workload-identity-pools create github-actions-pool \
  --account=$ACCOUNT \
  --project=$PROJECT_ID \
  --location=global \
  --display-name="GitHub Actions Pool"
```

**Verify:** (should show `state: ACTIVE`)
```bash
gcloud iam workload-identity-pools describe github-actions-pool \
  --account=$ACCOUNT \
  --project=$PROJECT_ID \
  --location=global
```

### Step 3: Create WIF Provider (GitHub OIDC)

```bash
gcloud iam workload-identity-pools providers create-oidc github-provider \
  --account=$ACCOUNT \
  --project=$PROJECT_ID \
  --location=global \
  --workload-identity-pool=github-actions-pool \
  --display-name="GitHub OIDC Provider" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner" \
  --attribute-condition="assertion.repository_owner == '$GITHUB_OWNER'" \
  --issuer-uri="https://token.actions.githubusercontent.com"
```

**What this does:**
- Sets GitHub as trusted OIDC issuer (`token.actions.githubusercontent.com`)
- Maps JWT claims to GCP attributes
- **Security:** Only tokens from `$GITHUB_OWNER/*` repos are accepted

**Verify:** (should show `state: ACTIVE` and your attribute-condition)
```bash
gcloud iam workload-identity-pools providers describe github-provider \
  --account=$ACCOUNT \
  --project=$PROJECT_ID \
  --location=global \
  --workload-identity-pool=github-actions-pool
```

### Step 4: Create Service Account

```bash
gcloud iam service-accounts create github-actions-sa \
  --account=$ACCOUNT \
  --project=$PROJECT_ID \
  --display-name="GitHub Actions Service Account" \
  --description="Service account for GitHub Actions CI/CD deployments"
```

**Service Account Email:**
```bash
echo "github-actions-sa@${PROJECT_ID}.iam.gserviceaccount.com"
```

**Verify:** (should show email and displayName)
```bash
gcloud iam service-accounts describe github-actions-sa@${PROJECT_ID}.iam.gserviceaccount.com \
  --account=$ACCOUNT \
  --project=$PROJECT_ID
```

### Step 5: Grant IAM Roles to Service Account

#### Phase 1 (Backend on Cloud Run):

```bash
# Artifact Registry Writer — push Docker images
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --account=$ACCOUNT \
  --member="serviceAccount:github-actions-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"

# Cloud Run Admin — deploy services
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --account=$ACCOUNT \
  --member="serviceAccount:github-actions-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/run.admin"

# Service Account User — allow impersonation of compute SA (SA-specific, not project-wide)
gcloud iam service-accounts add-iam-policy-binding ${PROJECT_NUMBER}-compute@developer.gserviceaccount.com \
  --account=$ACCOUNT \
  --project=$PROJECT_ID \
  --member="serviceAccount:github-actions-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"

# Cloud Build Service Account — submit builds
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --account=$ACCOUNT \
  --member="serviceAccount:github-actions-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/cloudbuild.builds.editor"

# Service Usage Consumer — use enabled GCP APIs
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --account=$ACCOUNT \
  --member="serviceAccount:github-actions-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/serviceusage.serviceUsageConsumer"

# Logging Viewer — read Cloud Build logs
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --account=$ACCOUNT \
  --member="serviceAccount:github-actions-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/logging.viewer"
```

**Why Service Usage Consumer?**
- Grants `serviceusage.services.use` permission
- Required for Cloud Build to use enabled APIs in the project
- Read-only permissions for quota checking (`quotas.get`, `operations.get`)

**Why Service Account User on specific SA (not project-level)?**
- SA-specific binding allows `github-actions-sa` to impersonate **only** the compute SA
- Project-level would allow impersonating **all** SAs in the project (security risk)
- Follows least privilege principle

**Why Logging Viewer?**
- **Optional** - Cloud Build works without this role
- Allows streaming build logs in real-time during GitHub Actions workflow
- Without it, workflow shows "can't stream logs" warning, but build still succeeds
- Helpful for debugging - you can see build output live instead of checking Cloud Console

#### Future Phases (add when needed):

```bash
# Phase 3: Cloud Functions
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --account=$ACCOUNT \
  --member="serviceAccount:github-actions-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/cloudfunctions.admin"

# Phase 2: Firebase Hosting
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --account=$ACCOUNT \
  --member="serviceAccount:github-actions-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/firebase.admin"
```

**Verify all roles:** (should list 5 roles: artifactregistry.writer, run.admin, cloudbuild.builds.editor, serviceusage.serviceUsageConsumer, logging.viewer)
```bash
gcloud projects get-iam-policy $PROJECT_ID \
  --account=$ACCOUNT \
  --flatten="bindings[].members" \
  --filter="bindings.members:github-actions-sa@${PROJECT_ID}.iam.gserviceaccount.com"
```

⚠️ **IAM Propagation Delay:** Wait 2-3 minutes after adding permissions before proceeding. IAM changes need time to propagate across Google's infrastructure.

### Step 6: Grant Cloud Build Bucket Permissions

Cloud Build needs to upload source code to a Cloud Storage bucket. Grant permissions **only to the Cloud Build bucket** for both the GitHub Actions SA and the default Cloud Build SA.

**Note:** The `gs://{PROJECT_ID}_cloudbuild` bucket is automatically created by Cloud Build on first use. If the bucket doesn't exist yet, these commands will fail - run your first `gcloud builds submit` (Step "Manual Deploy") to create it, then come back to add permissions.

```bash
# Ensure PROJECT_NUMBER is set (needed for Cloud Build SA email)
export PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')

# Grant bucket viewer access to GitHub Actions SA (read-only metadata)
gcloud storage buckets add-iam-policy-binding gs://${PROJECT_ID}_cloudbuild \
  --account=$ACCOUNT \
  --member="serviceAccount:github-actions-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/storage.bucketViewer"

# Grant object admin to GitHub Actions SA (manage objects for logs)
gcloud storage buckets add-iam-policy-binding gs://${PROJECT_ID}_cloudbuild \
  --account=$ACCOUNT \
  --member="serviceAccount:github-actions-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"

# Grant bucket access to default Cloud Build SA (executes the build)
gcloud storage buckets add-iam-policy-binding gs://${PROJECT_ID}_cloudbuild \
  --account=$ACCOUNT \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/storage.admin"
```

**How Cloud Build uses two Service Accounts:**
```
YOU (via github-actions-sa)
  ↓ triggers
gcloud builds submit
  ↓ spawns
Cloud Build (runs as PROJECT_NUMBER@cloudbuild.gserviceaccount.com)
  ↓ uploads source, builds image
gs://PROJECT_ID_cloudbuild bucket
```

Both Service Accounts need bucket access:
- `github-actions-sa` → read bucket metadata + manage log objects (WIF authentication)
- `{PROJECT_NUMBER}@cloudbuild.gserviceaccount.com` → full control (executes the actual build)

**Why these specific roles?**
- `storage.bucketViewer` (github-actions-sa) → read bucket metadata (lightweight, read-only)
- `storage.objectAdmin` (github-actions-sa) → manage log objects in `--gcs-log-dir`
- `storage.admin` (Cloud Build SA) → full control for source uploads and staging
- All bucket-specific (not project-wide) → follows least privilege principle

**Why bucket-specific?**
- Service Accounts only need access to the Cloud Build staging bucket
- **NOT** to other buckets in the project (user data, logs, backups)
- Follows the principle of least privilege

**Verify:** (should show both SAs with their roles: github-actions-sa with bucketViewer+objectAdmin, Cloud Build SA with storage.admin)
```bash
gcloud storage buckets get-iam-policy gs://${PROJECT_ID}_cloudbuild \
  --account=$ACCOUNT
```

⚠️ **IAM Propagation Delay:** Wait 2-3 minutes before testing the workflow.

### Step 7: Bind GitHub Repo → Service Account

```bash
gcloud iam service-accounts add-iam-policy-binding github-actions-sa@${PROJECT_ID}.iam.gserviceaccount.com \
  --account=$ACCOUNT \
  --project=$PROJECT_ID \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github-actions-pool/attribute.repository/${GITHUB_OWNER}/${GITHUB_REPO}"
```

**What this does:**
- Allows WIF Pool to impersonate this Service Account
- **Only** for repo `$GITHUB_OWNER/$GITHUB_REPO` (security)

**Verify:** (should show workloadIdentityUser binding with principalSet for your GitHub repo)
```bash
gcloud iam service-accounts get-iam-policy github-actions-sa@${PROJECT_ID}.iam.gserviceaccount.com \
  --account=$ACCOUNT \
  --project=$PROJECT_ID
```

### Step 8: Get Workload Identity Provider Name

```bash
gcloud iam workload-identity-pools providers describe github-provider \
  --account=$ACCOUNT \
  --project=$PROJECT_ID \
  --location=global \
  --workload-identity-pool=github-actions-pool \
  --format="value(name)"
```

**Output (used in GitHub Actions workflow):**
```
projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github-actions-pool/providers/github-provider
```

Save this value - you'll need it for GitHub Repository Variable `GCP_WORKLOAD_IDENTITY_PROVIDER`.

### Step 9: Create Artifact Registry Repository

```bash
# Check if exists
gcloud artifacts repositories describe $AR_REPO \
  --account=$ACCOUNT \
  --project=$PROJECT_ID \
  --location=$REGION

# If not exists, create
gcloud artifacts repositories create $AR_REPO \
  --account=$ACCOUNT \
  --project=$PROJECT_ID \
  --repository-format=docker \
  --location=$REGION \
  --description="Docker images for GCP POCs"
```

**Image path template:**
```
${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}/${SERVICE_NAME}:latest
```

### Step 10: Configure GitHub Repository Variables

Now that WIF setup is complete, configure these variables in your GitHub repository:

**Settings → Secrets and variables → Actions → Variables → New repository variable**

| Variable Name | Description | Example Value |
|---------------|-------------|---------------|
| `GCP_PROJECT_ID` | Your GCP Project ID | `my-project-123` |
| `GCP_REGION` | Deployment region | `europe-central2` |
| `GCP_AR_REPO` | Artifact Registry repository name | `gcp-apps` |
| `GCP_CLOUD_RUN_SA` | Cloud Run runtime Service Account | `123456789012-compute@developer.gserviceaccount.com` |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | WIF Provider name (from Step 8 above) | `projects/123.../providers/github-provider` |
| `GCP_SERVICE_ACCOUNT` | GitHub Actions Service Account email | `github-actions-sa@PROJECT_ID.iam.gserviceaccount.com` |

**Important notes:**
- **`GCP_CLOUD_RUN_SA` should be a dedicated Service Account in production** (e.g., `backend-sa@PROJECT_ID.iam.gserviceaccount.com`), not the default compute SA. For this POC, we use the default compute SA (`PROJECT_NUMBER-compute@developer.gserviceaccount.com`) for simplicity. If using a dedicated SA, create it and grant necessary permissions (least privilege).

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
  --account=$ACCOUNT \
  --project=$PROJECT_ID \
  --gcs-source-staging-dir=gs://${PROJECT_ID}_cloudbuild/source \
  --gcs-log-dir=gs://${PROJECT_ID}_cloudbuild/logs \
  --config=workspaces/backend/cloudbuild.yaml \
  .

# Deploy to Cloud Run
# Note: Use dedicated SA in production (e.g., backend-sa@PROJECT_ID.iam.gserviceaccount.com)
# For this POC, we use the default compute SA
gcloud run deploy backend \
  --account=$ACCOUNT \
  --project=$PROJECT_ID \
  --image=${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}/backend:latest \
  --service-account=${PROJECT_NUMBER}-compute@developer.gserviceaccount.com \
  --platform=managed \
  --region=$REGION \
  --allow-unauthenticated \
  --port=3000 \
  --memory=512Mi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=10

# Get Service URL
SERVICE_URL=$(gcloud run services describe backend \
  --account=$ACCOUNT \
  --project=$PROJECT_ID \
  --region=$REGION \
  --format='value(status.url)')

echo "Service URL: $SERVICE_URL"
```

**Test deployed service:**
```bash
# Use the SERVICE_URL from previous step
curl ${SERVICE_URL}/health
curl "${SERVICE_URL}/api/hello?name=Test"
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
