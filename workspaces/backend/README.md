# Backend Workspace (Phase 1)

Hono API deployed to Cloud Run demonstrating basic HTTP endpoints and WIF-based CI/CD.

**Status:** ✅ Implemented  
**Service:** Cloud Run  
**Tech:** Hono + TypeScript + @hono/node-server

---

## Endpoints

- `GET /` — Service info and available endpoints
- `GET /health` — Health check (status, timestamp)
- `GET /api/hello?name=X` — Hello World with optional name parameter

---

## Local Structure

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

From repo root:
```bash
npm install
```

### Run backend locally

```bash
npm run dev:backend
```

Server starts on `http://localhost:3000`

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

---

## Deployment

### Prerequisites

Complete WIF setup first: [../../SETUP.md](../../SETUP.md)

Set environment variables:
```bash
export PROJECT_ID=your-gcp-project-id
export PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
export ACCOUNT=your-email@example.com
export REGION=europe-central2
export AR_REPO=gcp-apps
```

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

1. Complete WIF setup: [../../SETUP.md](../../SETUP.md)
2. Push to `main` branch
3. GitHub Actions workflow triggers
4. WIF authenticates to GCP
5. Backend is built and deployed
6. Deployment URL available in workflow logs

---

## Architecture

### Request Flow

```
User
  ↓
Cloud Run (backend service)
  ↓
Hono app (@hono/node-server adapter)
  ↓
Route handlers (/, /health, /api/hello)
```

### Docker Build

Multi-stage build optimized for npm workspaces:

1. **Build stage:** Full dependencies + TypeScript compilation
2. **Production stage:** Production dependencies only + built code

### Cloud Build

`cloudbuild.yaml` builds Docker image from repo root (supports npm workspaces structure).

---

## Patterns Demonstrated

- **Hono framework** — fast, lightweight web framework
- **@hono/node-server adapter** — Node.js HTTP server for Hono
- **npm workspaces** — monorepo structure
- **Multi-stage Docker build** — minimal production image
- **Cloud Build** — GCP-native image building
- **Cloud Run** — serverless HTTP service
- **WIF-based CI/CD** — keyless authentication

---

## Next Steps

- See [../../SETUP.md](../../SETUP.md) for WIF configuration
- See [../../README.md](../../README.md) for architecture overview
- Phase 2: Frontend workspace (React SPA on Firebase Hosting)
