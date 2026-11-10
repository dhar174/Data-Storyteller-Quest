<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Data Storyteller Quest

This app is deployed as a single Cloud Run service:
- React/Vite frontend served from `dist/`
- Express backend for Gemini evaluation at `POST /api/evaluate-boss-response`

`GEMINI_API_KEY` is server-side only and is never bundled into frontend assets.

## Local development

Prerequisites:
- Node.js 22+

1. Install dependencies:
   ```bash
   npm ci
   ```
2. Copy `.env.example` to `.env.local` and set `GEMINI_API_KEY`.
3. Start the frontend dev server:
   ```bash
   npm run dev
   ```
4. Start the API server in a second terminal:
   ```powershell
   $env:GEMINI_API_KEY="YOUR_KEY"; npm run dev:server
   ```
   The Vite dev server proxies `/api/*` to `http://localhost:8080` by default.

Production-like local run:
```powershell
npm run build
$env:GEMINI_API_KEY="YOUR_KEY"; npm run start
```

## Cloud Run deployment (GitHub Actions + OIDC)

The workflow at `.github/workflows/deploy-cloud-run.yml` deploys on push to `main` and on manual dispatch.

### 1) One-time Google Cloud setup

Set variables for commands:
```bash
PROJECT_ID="YOUR_PROJECT_ID"
PROJECT_NUMBER="YOUR_PROJECT_NUMBER"
REGION="us-east1"
REPOSITORY="webapps"
DEPLOYER_SA="github-cloudrun-deployer"
RUNTIME_SA="cloudrun-runtime"
POOL_ID="github-pool"
PROVIDER_ID="github-provider"
```

Enable required APIs:
```bash
gcloud services enable run.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com iamcredentials.googleapis.com --project $PROJECT_ID
```

Create Artifact Registry repository:
```bash
gcloud artifacts repositories create $REPOSITORY --repository-format=docker --location $REGION --project $PROJECT_ID
```

Create service accounts:
```bash
gcloud iam service-accounts create $DEPLOYER_SA --project $PROJECT_ID
gcloud iam service-accounts create $RUNTIME_SA --project $PROJECT_ID
```

Grant deployer roles:
```bash
gcloud projects add-iam-policy-binding $PROJECT_ID --member "serviceAccount:${DEPLOYER_SA}@${PROJECT_ID}.iam.gserviceaccount.com" --role "roles/run.admin"
gcloud projects add-iam-policy-binding $PROJECT_ID --member "serviceAccount:${DEPLOYER_SA}@${PROJECT_ID}.iam.gserviceaccount.com" --role "roles/artifactregistry.writer"
gcloud iam service-accounts add-iam-policy-binding "${RUNTIME_SA}@${PROJECT_ID}.iam.gserviceaccount.com" --member "serviceAccount:${DEPLOYER_SA}@${PROJECT_ID}.iam.gserviceaccount.com" --role "roles/iam.serviceAccountUser"
```

Create and populate the Gemini secret:
```bash
echo -n "YOUR_GEMINI_API_KEY" | gcloud secrets create gemini-api-key --data-file=- --replication-policy=automatic --project $PROJECT_ID
```
If the secret already exists:
```bash
echo -n "YOUR_GEMINI_API_KEY" | gcloud secrets versions add gemini-api-key --data-file=- --project $PROJECT_ID
```

Grant runtime secret access:
```bash
gcloud secrets add-iam-policy-binding gemini-api-key --member "serviceAccount:${RUNTIME_SA}@${PROJECT_ID}.iam.gserviceaccount.com" --role "roles/secretmanager.secretAccessor" --project $PROJECT_ID
```

Configure Workload Identity Federation for GitHub:
```bash
gcloud iam workload-identity-pools create $POOL_ID --location=global --display-name="GitHub Pool" --project $PROJECT_ID
gcloud iam workload-identity-pools providers create-oidc $PROVIDER_ID --location=global --workload-identity-pool=$POOL_ID --display-name="GitHub Provider" --issuer-uri="https://token.actions.githubusercontent.com" --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" --attribute-condition="assertion.repository=='dhar174/Data-Storyteller-Quest'" --project $PROJECT_ID
gcloud iam service-accounts add-iam-policy-binding "${DEPLOYER_SA}@${PROJECT_ID}.iam.gserviceaccount.com" --role "roles/iam.workloadIdentityUser" --member "principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/attribute.repository/dhar174/Data-Storyteller-Quest" --project $PROJECT_ID
```

WIF provider value for GitHub config:
```text
projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/POOL_ID/providers/PROVIDER_ID
```

### 2) Configure GitHub repo variables or secrets

Required keys:
- `GCP_PROJECT_ID`
- `GCP_PROJECT_NUMBER`
- `GCP_WIF_PROVIDER`
- `GCP_DEPLOYER_SA_EMAIL` (example: `github-cloudrun-deployer@YOUR_PROJECT_ID.iam.gserviceaccount.com`)

Optional override:
- `GCP_RUNTIME_SA_EMAIL` (defaults to `cloudrun-runtime@YOUR_PROJECT_ID.iam.gserviceaccount.com`)

### 3) Deploy

- Push to `main` or run the `Deploy to Cloud Run` workflow manually.
- Workflow builds and pushes the container to Artifact Registry, then deploys Cloud Run service `data-storyteller-quest` in `us-east1`.

### 4) Rollback

If a guarded revision is bad, disable evaluations first. Never route traffic to an old unguarded image with a newly funded credential. Only roll back to a revision whose image, credential and evaluation policy have been reviewed together:
```bash
gcloud run services update-traffic data-storyteller-quest --region us-east1 --to-revisions PREVIOUS_REVISION=100 --project YOUR_PROJECT_ID
```

## Education regression checks (no model calls)

The public-preserving API guardrails, shared-budget setup and activation gates are
documented in [Public evaluation guardrails](docs/public-evaluation-guardrails.md).
Run `npm run test:server` for the mocked route and cross-instance admission tests.

Run `npm run test:education`, `npm run lint`, and `npm run build`.
The education tests cover the Day 3 narrative against its chart data and final
assessment coverage, including skipped, invalid, missing, and duplicate scores.

For local UI checks, start `node tests/local-evaluation-fixture.mjs` in one
terminal. In a second terminal, set `VITE_API_PROXY_TARGET` to
`http://127.0.0.1:18081`, then run
`npm run dev -- --host 127.0.0.1 --port 13000 --strictPort`.
Open `http://127.0.0.1:13000`. Do not start the production API server for this
check. The fixture binds only to loopback and never calls Gemini.

- A response containing `[scored]` returns a fixed score of 85.
- Any other response returns an evaluation-unavailable error for testing the
  **Continue Without Score** flow.
- Complete both scenarios after skipping one or both boss evaluations. The
  result must say **Practice Complete**, **Assessment incomplete**, and
  **Provisional Trust Score**, even when the trust score is 100%.
- Complete both boss evaluations successfully to verify **Simulation Complete**
  and **Final Trust Score**.
- Check the marketing chart at 320px, 375px, and desktop widths. Narrow chart
  containers show CPA in dollars only; user totals remain in the scenario
  context. Wider containers show CPA and Users on separately labeled axes.

The desktop dual-axis change builds on PR #31. This local implementation also
adds the narrow-container CPA-only layout to keep both campaign labels readable.
