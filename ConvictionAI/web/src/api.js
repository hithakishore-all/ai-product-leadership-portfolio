// The only file in the UI that talks to the server.
// The API speaks Salesforce object names (Opportunity, Account, customer_arr__c...);
// this file translates them into the shapes the screens already use, so no screen changes.
//
// Served by the API (http://localhost:8000) → every call goes to Postgres.
// Opened as a file (offline demo) → BASE is null and the screens use bundled fixtures.
const BASE = typeof location !== "undefined" && location.protocol.startsWith("http") ? "" : null;

async function call(path, opts = {}) {
  if (BASE === null) throw new Error("offline");
  const json = opts.body && !(opts.body instanceof FormData);
  const res = await fetch(BASE + path, { headers: json ? { "Content-Type": "application/json" } : {}, ...opts });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error((body && body.detail) || `HTTP ${res.status}`);
  return body;
}

// Opportunity record → the deal card shape used by the Pipeline screen.
const toDeal = (o) => ({ id: o.id, company: o.account_name, slug: o.account_slug, round: o.round_label, seg: o.segment_id, stage: o.stage_name, owner: o.owner_name, flag: o.flag });

export const api = {
  online: BASE !== null,
  health: () => call("/api/health"),
  deals: () => call("/api/opportunities").then((rows) => rows.map(toDeal)),
  moveDeal: (id, stage, changedBy) => call(`/api/opportunities/${id}`, { method: "PATCH", body: JSON.stringify({ stage_name: stage, changed_by: changedBy }) }),
  retention: (slug) => call(`/api/accounts/${slug}/retention`),
  uploadCohort: (slug, file) => { const fd = new FormData(); fd.append("file", file); return call(`/api/accounts/${slug}/customer-arr`, { method: "POST", body: fd }); },
  resolveClaim: (id, resolution, reviewer) => call(`/api/claims/${id}/resolve`, { method: "POST", body: JSON.stringify({ resolution, reviewer }) }),
  reset: () => call("/api/demo/reset", { method: "POST" }),
  companies: () => call("/api/accounts?with_evidence=true"),
  profile: (slug) => call(`/api/accounts/${slug}/profile`),
  importPack: (file) => { const fd = new FormData(); fd.append("file", file); return call("/api/packs", { method: "POST", body: fd }); },
};
