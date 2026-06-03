#!/usr/bin/env node

// Deterministic recomposition of the cross-application integration graph from
// the sanctuarized boundary contracts (doc/architecture/boundary.yaml) of this
// app and any locally-available peers (workspace siblings / .corpus-cache/*).
//
// This is the algorithmic counterpart of sources/ecosystem-corpus-discovery:
// the SKILL fetches peer boundary.yaml via the GitHub MCP and materializes them
// (cache); THIS SCRIPT joins them. Joining is deterministic, so it is code, not
// prose. MCP-only peers not present on disk are simply not in scope for a run.
//
// Join (per governance/boundary-contract channel conventions):
//   async/file : outbound.channel == inbound.channel (produce↔consume, export↔ingest)
//   sync       : outbound.to == provider.app_id AND normalized channel match
//
// Findings (knowledge, never tasks):
//   orphan-produced  · unknown-producer · contract-drift · missing-link
//
// Outputs (with --apply): doc/_graph/ecosystem.yaml + doc/architecture/ECOSYSTEM.md
//   (regenerable — never hand-edited).
//
// Usage:
//   node scripts/recompose-ecosystem.mjs [--apply] [--json] [--extra <boundary.yaml>]...
//   node scripts/recompose-ecosystem.mjs --selftest     # run embedded fixture + assertions

import fs from 'node:fs';
import path from 'node:path';
import { parseBoundary, normChannel } from './lib/boundary.mjs';

const root = process.cwd();

// Boundary parsing + channel normalization are shared with
// scripts/validate-corpus.mjs via scripts/lib/boundary.mjs (single source of
// truth — validation and recomposition read the format identically).

// ---------------------------------------------------------------------------
// Recomposition: apps[] -> { nodes, edges, findings }
// ---------------------------------------------------------------------------
function recompose(apps) {
  const known = new Set(apps.map((a) => a.appId).filter(Boolean));
  const aliasToId = new Map();
  for (const a of apps) if (a.appId) aliasToId.set(a.appId, a.appId);

  // Index inbound for joining.
  const asyncConsumers = new Map();   // normChannel -> [{app, edgeId}]
  const fileConsumers = new Map();
  const providerApis = new Map();      // appId -> Set(normChannel)
  const consumedChannels = [];         // {app, kind, channel}
  for (const a of apps) {
    if (!a.appId) continue;
    for (const e of a.inbound) {
      const nc = normChannel(e.kind, e.channel);
      if (e.kind === 'async-consume') { (asyncConsumers.get(nc) || asyncConsumers.set(nc, []).get(nc)).push({ app: a.appId, edgeId: e.id }); consumedChannels.push({ app: a.appId, kind: e.kind, channel: e.channel }); }
      else if (e.kind === 'file-ingest') { (fileConsumers.get(nc) || fileConsumers.set(nc, []).get(nc)).push({ app: a.appId, edgeId: e.id }); consumedChannels.push({ app: a.appId, kind: e.kind, channel: e.channel }); }
      else if (e.kind === 'sync-api') { if (!providerApis.has(a.appId)) providerApis.set(a.appId, new Set()); providerApis.get(a.appId).add(nc); }
    }
  }

  const nodes = new Map();             // id -> {id, type}
  const addNode = (id, type) => { if (id && !nodes.has(id)) nodes.set(id, { id, type }); };
  for (const id of known) addNode(id, 'app');

  const edges = [];
  const findings = [];
  const edgeKey = new Set();
  const addEdge = (from, to, channel, kind, protocol, fromEdge, toEdge, fc, tc) => {
    const k = `${from}|${to}|${channel}|${kind}`;
    if (edgeKey.has(k)) return;
    edgeKey.add(k);
    edges.push({ from, to, channel, kind, protocol: protocol || null, via: [fromEdge, toEdge].filter(Boolean), from_confidence: fc || null, to_confidence: tc || null });
  };

  const producedChannels = new Set();

  for (const a of apps) {
    if (!a.appId) continue;
    for (const e of a.outbound) {
      const nc = normChannel(e.kind, e.channel);
      // Ensure external/known counterparty nodes exist.
      for (const cp of e.to) {
        if (cp === 'any' || cp === 'unknown') continue;
        if (cp.startsWith('external:')) addNode(cp, 'external');
        else addNode(cp, 'app');
      }

      if (e.kind === 'async-produce') {
        producedChannels.add(nc);
        const cons = asyncConsumers.get(nc) || [];
        let linked = 0;
        for (const c of cons) { if (c.app !== a.appId) { addEdge(a.appId, c.app, e.channel, 'async', e.protocol, e.id, c.edgeId, e.confidence, null); linked++; } }
        for (const cp of e.to) if (cp.startsWith('external:')) { addEdge(a.appId, cp, e.channel, 'async', e.protocol, e.id, null, e.confidence, null); linked++; }
        if (linked === 0) findings.push({ type: 'orphan-produced', app: a.appId, channel: e.channel, detail: `produced async channel "${e.channel}" has no consumer among ${known.size} known app(s)` });
      } else if (e.kind === 'file-export') {
        const cons = fileConsumers.get(nc) || [];
        let linked = 0;
        for (const c of cons) { if (c.app !== a.appId) { addEdge(a.appId, c.app, e.channel, 'file', e.protocol, e.id, c.edgeId, e.confidence, null); linked++; } }
        for (const cp of e.to) if (cp.startsWith('external:')) { addEdge(a.appId, cp, e.channel, 'file', e.protocol, e.id, null, e.confidence, null); linked++; }
        if (linked === 0) findings.push({ type: 'orphan-produced', app: a.appId, channel: e.channel, detail: `exported file channel "${e.channel}" has no ingesting app` });
      } else if (e.kind === 'sync-call') {
        const targets = e.to.filter((cp) => cp !== 'any' && cp !== 'unknown');
        if (targets.length === 0) {
          findings.push({ type: 'unknown-producer', app: a.appId, channel: e.channel, detail: `sync call "${e.channel}" has no resolved provider (to: any/unknown)` });
        }
        for (const cp of targets) {
          if (cp.startsWith('external:')) { addEdge(a.appId, cp, e.channel, 'sync', e.protocol, e.id, null, e.confidence, null); continue; }
          if (known.has(cp)) {
            const apis = providerApis.get(cp);
            if (apis && apis.has(nc)) addEdge(a.appId, cp, e.channel, 'sync', e.protocol, e.id, null, e.confidence, null);
            else findings.push({ type: 'contract-drift', app: a.appId, channel: e.channel, provider: cp, detail: `"${a.appId}" calls "${e.channel}" on "${cp}" but provider declares no matching inbound sync-api` });
          } else {
            addNode(cp, 'external'); addEdge(a.appId, cp, e.channel, 'sync', e.protocol, e.id, null, e.confidence, null);
          }
        }
      } else if (e.kind === 'db-write' || e.kind === 'notification') {
        for (const cp of e.to) {
          if (cp === 'any' || cp === 'unknown') continue;
          addEdge(a.appId, cp, e.channel, e.kind === 'db-write' ? 'db' : 'notification', e.protocol, e.id, null, e.confidence, null);
        }
      }
    }
  }

  // unknown-producer: consumed channels nobody produces.
  for (const c of consumedChannels) {
    if (!producedChannels.has(normChannel(c.kind, c.channel))) {
      findings.push({ type: 'unknown-producer', app: c.app, channel: c.channel, detail: `consumed channel "${c.channel}" is produced by no known app (external or undocumented producer)` });
    }
  }

  // missing-link: external:<slug> that matches a known app_id.
  for (const n of nodes.values()) {
    if (n.type === 'external') {
      const slug = n.id.slice('external:'.length);
      if (known.has(slug) || aliasToId.has(slug)) {
        findings.push({ type: 'missing-link', channel: n.id, detail: `counterparty "${n.id}" matches registered app "${slug}" — should be a first-class edge, not external` });
      }
    }
  }

  return {
    nodes: [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id)),
    edges: edges.sort((a, b) => (a.from + a.to + a.channel).localeCompare(b.from + b.to + b.channel)),
    findings: findings.sort((a, b) => (a.type + (a.app || '') + a.channel).localeCompare(b.type + (b.app || '') + b.channel)),
    sourceApps: [...known].sort(),
  };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
function renderYaml(g, files, nowIso) {
  const q = (s) => (s == null ? 'null' : `"${String(s).replace(/"/g, '\\"')}"`);
  const L = [];
  L.push('graph:');
  L.push('  version: 1');
  L.push('  generated_by: scripts/recompose-ecosystem.mjs');
  L.push(`  generated_at: ${nowIso}`);
  L.push(`  source_apps: [${g.sourceApps.join(', ')}]`);
  L.push('  source_files:');
  for (const f of files) L.push(`    - ${f}`);
  L.push('  nodes:');
  for (const n of g.nodes) { L.push(`    - id: ${q(n.id)}`); L.push(`      type: ${n.type}`); }
  L.push('  edges:');
  for (const e of g.edges) {
    L.push(`    - from: ${q(e.from)}`);
    L.push(`      to: ${q(e.to)}`);
    L.push(`      channel: ${q(e.channel)}`);
    L.push(`      kind: ${e.kind}`);
    if (e.protocol) L.push(`      protocol: ${e.protocol}`);
    L.push(`      via: [${e.via.map(q).join(', ')}]`);
  }
  L.push('  findings:');
  for (const f of g.findings) {
    L.push(`    - type: ${f.type}`);
    if (f.app) L.push(`      app: ${q(f.app)}`);
    if (f.provider) L.push(`      provider: ${q(f.provider)}`);
    if (f.channel) L.push(`      channel: ${q(f.channel)}`);
    L.push(`      detail: ${q(f.detail)}`);
  }
  return L.join('\n') + '\n';
}

function mermaidId(s) { return s.replace(/[^A-Za-z0-9_]/g, '_'); }
function renderMd(g, nowIso) {
  const L = [];
  L.push('---');
  L.push('type: architecture-ecosystem-view');
  L.push('status: active');
  L.push('confidence: probable');
  L.push('source: mixed');
  L.push('last_validated:');
  L.push('---');
  L.push('');
  L.push('# Ecosystem — Cross-Application Integration Graph');
  L.push('');
  L.push('> **Derived view.** Regenerated by `scripts/recompose-ecosystem.mjs` from each');
  L.push('> app\'s `doc/architecture/boundary.yaml` — do not hand-edit. Conventions:');
  L.push('> [`sources/ecosystem-corpus-discovery`](../../.github/skills/sources/ecosystem-corpus-discovery/SKILL.md).');
  L.push('');
  L.push(`Recomposed ${g.sourceApps.length} app(s): ${g.sourceApps.join(', ') || '(none)'}.`);
  L.push('');
  L.push('## Topology');
  L.push('');
  L.push('```mermaid');
  L.push('flowchart LR');
  for (const n of g.nodes) {
    const shape = n.type === 'external' ? `["${n.id}"]:::ext` : `(["${n.id}"])`;
    L.push(`  ${mermaidId(n.id)}${shape}`);
  }
  for (const e of g.edges) L.push(`  ${mermaidId(e.from)} -->|${e.channel}| ${mermaidId(e.to)}`);
  L.push('  classDef ext fill:#222,stroke:#888,color:#ddd;');
  L.push('```');
  L.push('');
  L.push('## Edges');
  L.push('');
  L.push('| From | To | Channel | Kind | Protocol |');
  L.push('|---|---|---|---|---|');
  for (const e of g.edges) L.push(`| ${e.from} | ${e.to} | ${e.channel} | ${e.kind} | ${e.protocol || ''} |`);
  if (g.edges.length === 0) L.push('| | | | | |');
  L.push('');
  L.push('## Findings');
  L.push('');
  L.push('> Captured knowledge, not tasks.');
  L.push('');
  L.push('| Type | App | Channel | Detail |');
  L.push('|---|---|---|---|');
  for (const f of g.findings) L.push(`| ${f.type} | ${f.app || ''} | ${f.channel || ''} | ${f.detail} |`);
  if (g.findings.length === 0) L.push('| | | | |');
  L.push('');
  return L.join('\n');
}

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------
function collectBoundaryFiles(extra) {
  const files = [];
  const localRel = 'doc/architecture/boundary.yaml';
  if (fs.existsSync(path.join(root, localRel))) files.push(localRel);
  const cacheRoot = path.join(root, '.corpus-cache');
  if (fs.existsSync(cacheRoot)) {
    for (const peer of fs.readdirSync(cacheRoot)) {
      const rel = path.join('.corpus-cache', peer, 'doc/architecture/boundary.yaml');
      if (fs.existsSync(path.join(root, rel))) files.push(rel);
    }
  }
  for (const x of extra) if (fs.existsSync(path.join(root, x)) || fs.existsSync(x)) files.push(x);
  return [...new Set(files)];
}

// ---------------------------------------------------------------------------
// Self-test (embedded fixture + assertions)
// ---------------------------------------------------------------------------
function selftest() {
  const orderSvc = `version: 1
app:
  id: order-service
  name: Order
  repo: acme/order
interfaces:
  inbound:
    - id: in-create
      kind: sync-api
      protocol: rest
      channel: "POST /v1/orders/{id}"
      from: [any]
      criticality: high
      confidence: confirmed
      source: code
      evidence: ["a.ts:1"]
  outbound:
    - id: out-created
      kind: async-produce
      protocol: kafka
      channel: "orders.created"
      to: [billing-service]
      criticality: high
      confidence: confirmed
      source: code
      evidence: ["b.ts:1"]
    - id: out-orphan
      kind: async-produce
      protocol: kafka
      channel: "orders.ghost"
      to: [any]
      criticality: low
      confidence: probable
      source: code
    - id: out-pay
      kind: sync-call
      protocol: rest
      channel: "POST /v1/charge"
      to: [billing-service]
      criticality: high
      confidence: probable
      source: code`;
  const billingSvc = `version: 1
app:
  id: billing-service
  name: Billing
  repo: acme/billing
interfaces:
  inbound:
    - id: in-order-created
      kind: async-consume
      protocol: kafka
      channel: "orders.created"
      from: [order-service]
      criticality: high
      confidence: confirmed
      source: code
      evidence: ["c.ts:1"]
  outbound: []`;
  const apps = [parseBoundary(orderSvc, 'order'), parseBoundary(billingSvc, 'billing')];
  const g = recompose(apps);
  const checks = [];
  const has = (cond, label) => checks.push({ ok: !!cond, label });
  has(g.edges.find((e) => e.from === 'order-service' && e.to === 'billing-service' && e.kind === 'async'), 'async edge order->billing on orders.created');
  has(g.findings.find((f) => f.type === 'orphan-produced' && f.channel === 'orders.ghost'), 'orphan-produced for orders.ghost');
  has(g.findings.find((f) => f.type === 'contract-drift' && f.provider === 'billing-service'), 'contract-drift: billing has no matching sync-api for POST /v1/charge');
  has(!g.edges.find((e) => e.kind === 'sync' && e.from === 'order-service' && e.to === 'billing-service'), 'no sync edge created on drift');
  has(g.nodes.find((n) => n.id === 'order-service' && n.type === 'app') && g.nodes.find((n) => n.id === 'billing-service'), 'both apps are nodes');
  const failed = checks.filter((c) => !c.ok);
  for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.label}`);
  console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--selftest')) return selftest();
  const apply = argv.includes('--apply');
  const json = argv.includes('--json');
  const extra = [];
  for (let i = 0; i < argv.length; i++) if (argv[i] === '--extra' && argv[i + 1]) extra.push(argv[++i]);

  const files = collectBoundaryFiles(extra);
  const apps = files
    .map((f) => { try { return parseBoundary(fs.readFileSync(path.isAbsolute(f) ? f : path.join(root, f), 'utf8'), f); } catch { return null; } })
    .filter((a) => a && a.appId && a.appId !== 'unknown');

  const g = recompose(apps);
  const nowIso = new Date().toISOString();
  const yaml = renderYaml(g, files, nowIso);
  const md = renderMd(g, nowIso);

  if (apply) {
    fs.mkdirSync(path.join(root, 'doc/_graph'), { recursive: true });
    fs.mkdirSync(path.join(root, 'doc/architecture'), { recursive: true });
    fs.writeFileSync(path.join(root, 'doc/_graph/ecosystem.yaml'), yaml);
    fs.writeFileSync(path.join(root, 'doc/architecture/ECOSYSTEM.md'), md);
  }

  if (json) {
    process.stdout.write(JSON.stringify({ source_apps: g.sourceApps, source_files: files, nodes: g.nodes, edges: g.edges, findings: g.findings, applied: apply }, null, 2) + '\n');
  } else {
    console.log(`Ecosystem recomposition`);
    console.log(`  apps: ${g.sourceApps.length} (${g.sourceApps.join(', ') || 'none'})`);
    console.log(`  nodes: ${g.nodes.length}  edges: ${g.edges.length}  findings: ${g.findings.length}`);
    for (const f of g.findings) console.log(`  [${f.type}] ${f.channel || ''} ${f.app ? '(' + f.app + ')' : ''}`);
    console.log(apply ? '  written: doc/_graph/ecosystem.yaml, doc/architecture/ECOSYSTEM.md' : '  (dry-run — pass --apply to write)');
  }
}

main();
