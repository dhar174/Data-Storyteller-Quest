# Public evaluation guardrails

Status: locally implemented and mock-tested; not deployed or live-provider tested.
The public page remains public. Evaluations fail closed until explicitly enabled
with an approved policy and an existing shared Firestore ledger.

## What is enforced

- The only generation route is POST `/api/evaluate-boss-response`.
- Input is exactly `{scenarioId,userResponse}`. Only the two known scenarios are
  accepted. The server supplies the stakeholder, question, facts and evaluation
  instruction. Caller-supplied model, role, question, system prompt, upstream URL,
  tools, token limits and extra parameters are rejected.
- Request body is at most 12 KiB, with a nonempty response at most 2,000 JavaScript
  characters and 6,000 UTF-8 bytes. Compressed request bodies are not accepted.
- Fixed `gemini-3-flash-preview`, one candidate, minimal thinking, no tools, no
  provider retries, at most 8,192 authoritative input tokens and 2,048 configured
  output tokens. Provider token counting happens after admission and before
  generation. Count/generation have timeouts. Cancellation does not prove the
  remote operation stopped, so uncertain calls keep their reservation.
- JSON output is validated for an integer score 1–100, feedback at most 1,200
  characters, and reaction at most 400 characters. Failures produce no fake score.
- Unknown API/general-proxy routes return 404. WebSocket upgrades are rejected.
- Logs contain request ID, scenario, model, counted input and safe error codes,
  not student answers, credentials or full provider/store errors.

## Atomic shared admission

`server/firestore-admission.js` uses Firestore REST GET plus conditional PATCH on
the document update time. Every instance and revision uses the same stable
`aiAdmission/data-storyteller-quest` document. A known precondition conflict may
retry at most six times. Missing, inaccessible, corrupt or uncertain state denies
evaluation before any provider request. Production never auto-creates a ledger.

The document enforces:

- A global sliding 60-second request allowance.
- A global UTC-day request allowance.
- An irreversible aggregate reservation allowance, which does not reset at
  midnight, on instance restart, after a failure or after deployment.
- Concurrent admission leases. Verified success releases a lease only. Failed
  or uncertain work retains it until its five-minute expiry.
- Exact agreement between the stored and deployed policy. Changing environment
  values does not silently reset spending or weaken limits.
- Hashed request-ID history, capped at 4,000 reservations, then fail closed.

This is an application-level reservation control, not a promise about the total
Google Cloud invoice. It does not cover the other apps, direct use of the API key,
old unguarded revisions, Cloud Run traffic, Firestore reads/writes, logging,
network or provider price changes. Public traffic can consume the allowance and
cause denial of service. Rate, hosting and infrastructure cost controls are also
needed. CORS/referrers/hidden URLs do not establish that traffic came from the UI.
Natural-language prompt restrictions cannot guarantee the model stays on topic.
Lease expiry is not proof that an uncertain provider operation completed.

## Configuration and approval gates

No new numeric spending allowance is enabled by default. Configure all of:

- `EVALUATION_ENABLED=true`
- `EVALUATION_PRICE_VERSION=gemini-3-flash-preview-2026-11-10-v1`
- `EVALUATION_STORE_PROJECT` and optional `EVALUATION_STORE_DATABASE` (`(default)`)
- `EVALUATION_RATE_PER_MINUTE` (1–60)
- `EVALUATION_DAILY_REQUEST_LIMIT` (1–10,000)
- `EVALUATION_TOTAL_BUDGET_MICRO_USD` (20,000–80,000,000)
- `EVALUATION_MAX_CONCURRENT` (1–20)
- Existing server-side `GEMINI_API_KEY` secret binding.

One attempted evaluation permanently reserves 20,000 micro-USD ($0.02), even if
counting or generation fails. This is a conservative reservation, not its actual
bill. At the reviewed text rates of $0.50/M input and $3/M output, the configured
8,192/2,048 token maximum is about $0.01024 for generation. The allowance includes
extra headroom. Prices and model behavior must be rechecked before enabling.
No grounding, external tools, audio or image generation is configured.

The owner approved a $20 application allowance on 2026-11-10. This maps to
`EVALUATION_TOTAL_BUDGET_MICRO_USD=20000000`, at most 1,000 conservative attempted
evaluations. It is a lifetime, nonresetting ledger allowance, not a monthly
provider cap. It has not yet been configured in production.

Other values to discuss with the owner, NOT existing approvals:
- A classroom could start with 30/minute, 250/day and 5 concurrent, subject to
  the owner’s class size and permission. Contention and provider quota may still
  reject a burst safely; these numbers are not a throughput guarantee.

The `(default)` Standard Native-mode Firestore database was created in
`llm-text-adventure-464222`, `us-east1`, on 2026-11-10 with restrictive client rules
and real-time updates disabled. The ledger is not yet initialized. Initialize
the zero-balance ledger once after the complete policy is agreed.
`node server/prepare-ledger.js` prints the document JSON from explicit local
environment settings; it does not provision or call a service. Never overwrite an
existing ledger with a zero balance or delete it to replenish spending. A policy
change needs an approved migration preserving previous reservations.

Use Cloud Run metadata identity, not a downloadable service-account key. Runtime
access needs `datastore.entities.get` and `datastore.entities.update` for the
database; initial provisioning is a separate operator action. Use a dedicated
least-privilege identity and appropriate database-scoped IAM condition rather
than granting database admin. Server credentials bypass Firebase client rules;
do not rely on client rules to constrain this runtime. A runtime identity able
to update the ledger remains a trusted boundary.

Approved identity setup completed on 2026-11-10:
`data-storyteller-runtime@llm-text-adventure-464222.iam.gserviceaccount.com` was
created with no key file. Its custom `storytellerLedgerAccess` role contains only
`datastore.entities.get` and `datastore.entities.update`, with this binding
condition:

`resource.name == "projects/llm-text-adventure-464222/databases/(default)"`

The condition was explicitly entered and saved in Console. This is database-wide
access, not document-only access. The identity also has Secret Manager Secret
Accessor granted directly on the existing `gemini-api-key` secret, not at project
level. No secret payload was opened and no new Gemini API key was created.

An identity-only deployment completed at 2026-11-10 17:53:17 UTC. Revision
`data-storyteller-quest-00018-tdr` is healthy and serving 100% traffic. The Console
diff contained only the service account change. It still uses the original image
digest `bd6453861aa38aab05cdce8f076cea4c76847d886e5733e12a9e7ecdc48eb1ab` and the
existing `gemini-api-key:latest` binding. Guardrail/educational code is still local;
the ledger and evaluation policy are not activated. The previous shared identity
`cloud-run-openai@llm-text-adventure-464222.iam.gserviceaccount.com` retains its
existing Editor (Legacy) and Secret Manager Admin grants and was not modified.

The local deployment workflow now requires an explicit `GCP_RUNTIME_SA_EMAIL`
rather than falling back to an unverified identity. It also requires
`GCP_GEMINI_SECRET_REF`, a non-secret reference with a pinned numeric version:
`SECRET_NAME:VERSION` or `projects/PROJECT_NUMBER/secrets/SECRET_NAME:VERSION`.
It never takes a key payload from repository variables, and no longer silently
restores the shared secret. Both settings must be checked against the approved
deployment configuration before any further deployment. Set the runtime variable
to the dedicated identity above; repository configuration has not been changed
remotely. Offline server/education tests, type checking and frontend build run
before the workflow authenticates to Google Cloud.

Before activation, approve and verify database/resource creation, ledger write,
IAM access changes, any credentials, exact numeric limits, publication/deployment
and provider spending. All serving revisions must use the guarded API; remove
unguarded tagged paths and avoid sharing this app's provider credential with
generic proxies. The current exhausted Gemini project cap is an independent
blocker: this patch neither raises nor bypasses it.

## Cost and validation notes

Firestore Standard's default eligible database includes 50,000 reads and 20,000
writes/day. Successful uncontended calls use approximately two reads/two writes
(reserve and complete); conflicts, rejected requests, storage and network add
usage. The creation Console displayed $0.06/100,000 reads and $0.18/100,000 writes
beyond free quota, plus $0.18/GiB/month storage beyond 1 GiB free. These observed
account/location prices supersede the earlier regional reference estimate.
Named databases may not qualify for free quota. Database and identity setup were
separately approved. No ledger initialization, repair-code deployment, Gemini
cap/billing change or paid test has occurred.

Run `npm run test:server`, `npm run test:education`, `npm run lint`, and
`npm run build`. Server tests use only loopback HTTP and mocked Firestore/Gemini.
They include two independent HTTP app instances contending on one shared ledger,
lost acknowledgments, restart/midnight persistence, malformed inputs, fixed
provider options, timeouts, invalid output and safe error responses. Tests do not
replace a live staging check of Firestore IAM/CAS, SDK compatibility, pricing and
a separately approved minimal Gemini evaluation.

References:
- https://ai.google.dev/gemini-api/docs/pricing/
- https://ai.google.dev/gemini-api/docs/billing
- https://cloud.google.com/firestore/pricing
- https://docs.cloud.google.com/firestore/native/docs/security/iam
- https://firebase.google.com/docs/firestore/security/iam#required_permissions_for_api_methods
- https://cloud.google.com/firestore/docs/manage-databases#configure_per-database_access_permissions

### Token-count SDK compatibility

The locked Gemini SDK rejects `config.systemInstruction` in its `countTokens`
converter. The server therefore uses the documented REST `generateContentRequest`
form at the fixed Gemini endpoint, including the exact normalized system instruction
and contents used by generation. This request is bounded, has no retries and rejects
redirects. Generation still uses the installed SDK. An offline regression exercises
both paths with mocked network responses, rather than replacing the SDK methods.

The provider count covers contents and system instruction, not output/thinking or
all schema/configuration overhead. The $0.02 per-attempt reservation includes margin
over the reviewed maximum input/output estimate; it is an application allowance,
not a guarantee of the overall invoice. Cloud Run/Firestore and other project usage
are separate. No failed attempt is refunded, including local SDK errors.

References: https://ai.google.dev/api/tokens and
https://discuss.ai.google.dev/t/gemini-api-counttokens/188451 .
