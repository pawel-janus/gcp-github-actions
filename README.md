# GCP GitHub Actions — CI/CD with Workload Identity Federation

Monorepo demonstrating CI/CD with GitHub Actions and Workload Identity Federation (WIF) for multi-service GCP deployments. Zero long-lived credentials — GitHub's OIDC token is exchanged for a short-lived GCP access token at runtime.

**Key features:**
- Keyless authentication (no service account JSON keys stored anywhere)
- Smart deployment with path filtering (deploy only changed workspaces)
- Automated deployment pipeline (push to main → build → deploy)
- Multi-service orchestration (Cloud Run, Cloud Functions, Firebase Hosting)
- Production-ready security patterns (least privilege IAM, bucket-specific permissions)

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
  — roles: Artifact Registry Writer, Cloud Run Admin, Cloud Build Editor
        ↓
Cloud Build → Artifact Registry → GCP Services
```

**Zero static credentials.** GitHub's OIDC token is exchanged for a GCP access token at deployment time.

---

## Workspaces

This is an npm workspaces monorepo. Each workspace demonstrates a different GCP deployment pattern.

| Workspace | GCP Service | Status | Docs |
|-----------|-------------|--------|------|
| `backend` | Cloud Run (public) | ✅ Phase 1 | [→ README](workspaces/backend/) |
| `frontend` | Firebase Hosting | ✅ Phase 2 | [→ README](workspaces/frontend/) |
| — | Smart deployment refactor | ✅ Phase 3 | [→ Workflow docs](.github/workflows/) |
| `functions` | Cloud Functions 2nd gen | 📋 Phase 4 | Coming soon |
| `worker` | Cloud Run (private) | 📋 Phase 5 | Coming soon |
| `cron` | Cloud Scheduler | 📋 Phase 6 | Coming soon |

**Implementation order:** Phase 1 (backend) → 2 (frontend) → 3 (smart deployment) → 4 (functions) → 5 (worker) → 6 (cron)

Workspaces are independent examples — they don't need to be logically connected.

---

## Quick Start

### 1. One-time setup

Complete Workload Identity Federation setup: **[SETUP.md](SETUP.md)**

This configures:
- WIF Pool + Provider (GitHub OIDC)
- Service Account with minimal-privilege roles
- Artifact Registry
- GitHub Repository Variables

### 2. Choose a workspace

See workspace README files for local development and manual deployment:
- [Backend (Phase 1)](workspaces/backend/) — Hono API on Cloud Run ✅
- [Frontend (Phase 2)](workspaces/frontend/) — React Weather App on Firebase Hosting ✅
- Functions (Phase 3) — Coming soon
- Worker (Phase 4) — Coming soon
- Cron (Phase 5) — Coming soon

### 3. Deploy

**Manual:**
```bash
# See workspace README for manual deploy commands
# Example: workspaces/backend/README.md
```

**Automated (GitHub Actions):**
```bash
git push origin main
# GitHub Actions workflow automatically detects changes and deploys only affected workspaces
# See .github/workflows/README.md for deployment rules and path filtering details
```

---

## Tech Stack

- **Monorepo:** npm workspaces
- **Backend:** Hono + TypeScript
- **Frontend:** React + Vite
- **Functions:** TypeScript (Cloud Functions 2nd gen)
- **CI/CD:** GitHub Actions + Workload Identity Federation
- **GCP Services:** Cloud Run, Cloud Functions, Firebase Hosting, Artifact Registry, Cloud Build, Cloud Scheduler

---

## Project Structure

```
gcp-github-actions/
├── README.md              # This file — overview + quick start
├── SETUP.md               # WIF one-time setup (9 steps)
├── package.json           # Root — npm workspaces config
├── .github/workflows/
│   ├── README.md          # Workflow documentation (smart deployment)
│   ├── deploy.yml         # Main orchestrator (path filtering + conditional deploy)
│   └── _deploy-service.yml # Reusable workflow template
└── workspaces/
    ├── backend/           # Phase 1: Hono API on Cloud Run
    │   ├── README.md      # Backend-specific docs
    │   ├── src/
    │   ├── Dockerfile
    │   └── cloudbuild.yaml
    ├── frontend/          # Phase 2: React SPA on Firebase Hosting
    ├── functions/         # Phase 4: Cloud Functions 2nd gen (planned)
    ├── worker/            # Phase 5: Private Cloud Run (planned)
    └── cron/              # Phase 6: Cloud Scheduler (planned)
```

---

## Skills Demonstrated

- **GitHub Actions** — workflow syntax, triggers, jobs, OIDC authentication, reusable workflows
- **Workload Identity Federation** — pool/provider setup, keyless authentication
- **Path filtering** — conditional deployment based on changed files (CI/CD optimization)
- **Reusable workflows** — DRY principle for GitHub Actions
- **Security patterns** — least privilege IAM, SA-specific permissions, bucket-specific access
- **Cloud Build** — two Service Accounts pattern (trigger SA + execution SA)
- **Artifact Registry** — Docker image management
- **Cloud Run** — serverless HTTP services (public + private)
- **Firebase Hosting** — static site deployment
- **Cloud Functions** — event-driven functions
- **Cloud Scheduler** — scheduled tasks
- **npm workspaces** — monorepo management

---

## Documentation

- **[SETUP.md](SETUP.md)** — Complete WIF setup (one-time)
- **[.github/workflows/README.md](.github/workflows/)** — Smart deployment system (path filtering, reusable workflows)
- **[workspaces/backend/README.md](workspaces/backend/)** — Backend workspace (Phase 1)
- **[workspaces/frontend/README.md](workspaces/frontend/)** — Frontend workspace (Phase 2)

---

## License

MIT

---

## Author

Built by [Paweł Janus](https://github.com/pawel-janus) as part of GCP learning path.

**Certifications:**
- Google Cloud Associate Cloud Engineer
- Google Cloud Associate Data Practitioner
