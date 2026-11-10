// Local document preparation only. This script makes no network requests.
// Operator must separately approve/provision the database, IAM and this document.
import { readEvaluationPolicy } from './evaluation-policy.js';
const policy = readEvaluationPolicy(process.env);
const project = process.env.EVALUATION_STORE_PROJECT;
const database = process.env.EVALUATION_STORE_DATABASE ?? '(default)';
if (!project || !/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(project) || !/^(\(default\)|[a-z][a-z0-9-]{0,61}[a-z0-9])$/.test(database)) {
  throw new Error('Set a valid EVALUATION_STORE_PROJECT and EVALUATION_STORE_DATABASE');
}
const now = Date.now();
const state = {
  schema: 1, app: 'data-storyteller-quest', policy, reservedMicroUsd: 0,
  day: new Date(now).toISOString().slice(0, 10), dailyCount: 0,
  recent: [], leases: {}, seen: [], lastNow: now,
};
console.log(JSON.stringify({
  name: `projects/${project}/databases/${database}/documents/aiAdmission/data-storyteller-quest`,
  fields: { state: { stringValue: JSON.stringify(state) } },
}, null, 2));
