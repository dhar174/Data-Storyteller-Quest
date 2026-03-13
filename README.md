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

If a new revision is bad, route traffic back to the previous revision:
```bash
gcloud run services update-traffic data-storyteller-quest --region us-east1 --to-revisions PREVIOUS_REVISION=100 --project YOUR_PROJECT_ID
```
