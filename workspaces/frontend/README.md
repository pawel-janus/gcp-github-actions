# Frontend — React Weather App on Firebase Hosting

React SPA demonstrating Firebase Hosting deployment via GitHub Actions with Workload Identity Federation.

**Tech stack:** React 19, Vite, TypeScript

**Features:**
- Client-side weather fetching (wttr.in API)
- Input field for city name
- Display: temperature, description, wind speed, weather icon
- Minimal CSS (light/dark mode support)

---

## Local Development

```bash
# From repo root
npm run dev:frontend

# Or from this directory
npm run dev
```

App runs on http://localhost:5173

**Try it:**
1. Enter city name (default: Warsaw)
2. Click "Get Weather"
3. Weather data fetched from wttr.in API (CORS-enabled, no backend needed)

---

## Build

```bash
# From repo root
npm run build:frontend

# Or from this directory
npm run build
```

Outputs to `dist/` (static files: HTML, CSS, JS, assets)

---

## Deploy

### Automated (GitHub Actions)

Push to `main` branch triggers `.github/workflows/deploy.yml`:

```bash
git push origin main
```

Workflow:
1. `npm ci` — install dependencies
2. `npm run build:frontend` — Vite build → dist/
3. WIF authentication (github-actions-sa)
4. `firebase deploy --only hosting` — push dist/ to Firebase Hosting CDN

### Manual Deploy

```bash
# Authenticate
gcloud auth login

# Build
npm run build

# Deploy
npx firebase deploy --project=YOUR_PROJECT_ID --only hosting
```

**Get deployed URL:**

```bash
# Option 1: Check Firebase console
open https://console.firebase.google.com/project/YOUR_PROJECT_ID/hosting

# Option 2: Firebase CLI
npx firebase hosting:channel:list --project=YOUR_PROJECT_ID

# Default URL format:
# https://YOUR_PROJECT_ID.web.app
# https://YOUR_PROJECT_ID.firebaseapp.com
```

---

## Firebase Configuration

### firebase.json

```json
{
  "hosting": {
    "public": "dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  }
}
```

- `public: "dist"` — deploy Vite output directory
- `rewrites` — SPA routing (all routes → index.html)

### .firebaserc

```json
{
  "projects": {
    "default": "YOUR_PROJECT_ID"
  }
}
```

Links this workspace to your GCP project.

---

## API

**wttr.in** — free weather API with CORS enabled

```bash
# Example request
curl "https://wttr.in/Warsaw?format=j1"
```

Response structure:
```json
{
  "current_condition": [{
    "temp_C": "15",
    "weatherDesc": [{"value": "Partly cloudy"}],
    "windspeedKmph": "10",
    "weatherIconUrl": [{"value": "https://..."}]
  }]
}
```

**CORS:** `access-control-allow-origin: *` — browser fetch works without proxy.

---

## Workflow Integration

This workspace is deployed via `.github/workflows/deploy.yml` job:

```yaml
deploy-frontend:
  steps:
    - Checkout code
    - Set up Node.js
    - npm ci
    - npm run build:frontend
    - WIF authentication
    - firebase deploy --only hosting
```

**Current behavior (Phase 2):** Deploys on every push to `main` (naive approach).

**Next (Phase 3):** Smart path filtering — deploy only when `workspaces/frontend/**` changes.

---

## Structure

```
workspaces/frontend/
├── src/
│   ├── App.tsx         # Weather component (fetch + display)
│   ├── App.css         # Component styles
│   ├── main.tsx        # React entry point
│   └── index.css       # Global reset
├── public/
│   └── favicon.svg     # Site icon
├── firebase.json       # Firebase Hosting config
├── .firebaserc         # Project binding
├── package.json        # Dependencies + scripts
├── vite.config.ts      # Vite config
└── README.md
```

---

## GCP Requirements

### Required APIs

Enable Firebase Hosting API:

```bash
gcloud services enable firebase.googleapis.com \
  firebasehosting.googleapis.com \
  --project=YOUR_PROJECT_ID
```

**Note:** If you completed POC #1 (Cloud Functions + Firestore + Firebase Auth), these APIs are already enabled.

### IAM Permissions

Service Account needs `roles/firebasehosting.admin`:

```bash
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:github-actions-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/firebasehosting.admin"
```

**Complete list of roles for github-actions-sa:**
- `roles/firebasehosting.admin` (Phase 2 — this workspace)
- `roles/artifactregistry.writer` (Phase 1)
- `roles/cloudbuild.builds.editor` (Phase 1)
- `roles/run.admin` (Phase 1)
- `roles/logging.viewer` (Phase 1)
- `roles/serviceusage.serviceUsageConsumer` (Phase 1)

See [SETUP.md](../../SETUP.md) for complete WIF configuration.

---

## Next Steps

- **Phase 3:** Add path filtering to workflow (deploy frontend only when this workspace changes)
- **Phase 4:** Add Cloud Functions workspace (HTTP trigger + IAM automation)
- **Phase 5:** Add Cloud Run worker (private, service-to-service auth)
