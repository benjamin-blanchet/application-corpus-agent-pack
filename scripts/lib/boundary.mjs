// scripts/lib/boundary.mjs
// SINGLE SOURCE OF TRUTH for reading the sanctuarized boundary contract
// (doc/architecture/boundary.yaml) and for the channel-normalization used to
// join edges across apps. Imported by scripts/validate-corpus.mjs (validation
// tier), scripts/recompose-ecosystem.mjs (join tier) and scripts/build-corpus-site.mjs
// (view tier) so all three read the format and normalize channels IDENTICALLY.
//
// Convention: list fields (from/to/entities/evidence) are INLINE arrays
// (`[a, b]`). Trailing `# comments` on unquoted scalars are stripped.
// Grammar mirrors schemas/boundary.yaml.schema.yaml + governance/boundary-contract.

// Closed vocabularies (also documented in schemas/boundary.yaml.schema.yaml).
export const KINDS_INBOUND = ['sync-api', 'async-consume', 'webhook', 'file-ingest'];
export const KINDS_OUTBOUND = ['sync-call', 'async-produce', 'db-write', 'file-export', 'notification'];
export const PROTOCOLS = ['rest', 'grpc', 'graphql', 'soap', 'kafka', 'amqp', 'sqs', 'pubsub', 'webhook', 'sftp', 's3', 'jdbc', 'other'];
export const CRITICALITY = ['critical', 'high', 'medium', 'low'];
export const CONFIDENCE = ['suspected', 'probable', 'confirmed', 'unknown'];
export const SOURCE = ['code', 'prod', 'jira', 'confluence', 'human', 'mixed', 'unknown'];
export const CONFIRMED_SOURCES = ['code', 'prod', 'mixed'];
export const SYNC_KINDS = new Set(['sync-call', 'sync-api', 'webhook']);

export function stripVal(v) {
  if (v == null) return null;
  let t = v.trim();
  if (t === '') return null;
  if (t[0] === '"' || t[0] === "'") {
    const q = t[0]; const end = t.indexOf(q, 1);
    return end !== -1 ? t.slice(1, end) : t.slice(1);
  }
  t = t.replace(/\s+#.*$/, '').trim();   // strip trailing comment on unquoted scalars
  return t === '' ? null : t;
}

export function inlineList(v) {
  let t = (v || '').trim();
  if (t.startsWith('[')) { const end = t.lastIndexOf(']'); if (end !== -1) t = t.slice(1, end); }
  else t = t.replace(/\s+#.*$/, '').trim();
  if (!t) return [];
  return t.split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
}

// Parse boundary.yaml text → { appId, appName, appRepo, inbound[], outbound[], file }.
// Each edge: { id, kind, protocol, channel, from[], to[], entities[], criticality,
//              confidence, source, evidence[], _line }.
export function parseBoundary(text, file = null) {
  const lines = text.split(/\r?\n/);
  const out = { appId: null, appName: null, appRepo: null, inbound: [], outbound: [], file };
  const listKeys = new Set(['from', 'to', 'entities', 'evidence']);
  let section = null;
  let inApp = false;
  let cur = null;
  let dashIndent = -1;
  const pushCur = () => { if (cur && section) out[section].push(cur); cur = null; };
  const assign = (entry, kv) => {
    const m = kv.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!m) return;
    if (listKeys.has(m[1])) entry[m[1]] = inlineList(m[2]);
    else entry[m[1]] = stripVal(m[2]);
  };
  const newEntry = (line) => ({ id: null, kind: null, protocol: null, channel: null, from: [], to: [], entities: [], criticality: null, confidence: null, source: null, evidence: [], _line: line });

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    const indent = raw.match(/^\s*/)[0].length;
    const trimmed = raw.trim();
    if (indent === 0) {
      pushCur(); section = null; inApp = /^app:\s*$/.test(trimmed);
      continue;
    }
    if (inApp && indent === 2) {
      const m = trimmed.match(/^(id|name|repo):\s*(.*)$/);
      if (m) {
        if (m[1] === 'id') out.appId = stripVal(m[2]);
        else if (m[1] === 'name') out.appName = stripVal(m[2]);
        else out.appRepo = stripVal(m[2]);
      }
      continue;
    }
    if (indent === 2 && /^(inbound|outbound):\s*(\[\])?\s*$/.test(trimmed)) {
      pushCur(); section = trimmed.replace(/:.*$/, ''); inApp = false; dashIndent = -1;
      continue;
    }
    if (!section) continue;
    const dash = raw.match(/^(\s*)-\s+(.*)$/);
    if (dash && dash[1].length >= 4) {
      pushCur();
      dashIndent = dash[1].length;
      cur = newEntry(i + 1);
      assign(cur, dash[2]);
      continue;
    }
    if (cur && indent > dashIndent) assign(cur, trimmed);
  }
  pushCur();
  return out;
}

// Normalize a channel for joining (governance/boundary-contract conventions).
// sync: "METHOD /path" with params collapsed to {}; async/db/file: verbatim trim.
export function normChannel(kind, channel) {
  if (!channel) return '';
  let c = channel.trim();
  if (SYNC_KINDS.has(kind) || /^[A-Z]+\s+\//.test(c)) {
    const m = c.match(/^(\w+)\s+(.*)$/);
    if (m) {
      const method = m[1].toUpperCase();
      const p = m[2].replace(/\{[^}]+\}/g, '{}').replace(/:[A-Za-z_][A-Za-z0-9_]*/g, '{}').replace(/\/+$/, '');
      return `${method} ${p}`;
    }
  }
  return c;
}
