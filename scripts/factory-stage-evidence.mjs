#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import { asArray, isWithin, parseArgs, printResult, resolveContainedRegularFile, sha256File, sha256Object } from './lib/factory-delivery/core.mjs';
import { readData, writeData } from './lib/factory-delivery/files.mjs';
import { inspectEvidenceMedia, scanEvidenceFile } from './lib/factory-delivery/minimize.mjs';

const args = parseArgs(process.argv.slice(2));

function emptyDirectory(value) {
  const target = path.resolve(value);
  if (fs.existsSync(target)) {
    if (fs.lstatSync(target).isSymbolicLink() || !fs.statSync(target).isDirectory() || fs.readdirSync(target).length) throw new Error('--out must be a real empty directory');
    return fs.realpathSync(target);
  }
  const parent = fs.realpathSync(path.dirname(target));
  fs.mkdirSync(path.join(parent, path.basename(target)));
  return fs.realpathSync(path.join(parent, path.basename(target)));
}

function walk(directory, root, entries = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    const relative = path.relative(root, absolute).split(path.sep).join('/');
    if (entry.isSymbolicLink()) entries.push({ relative, kind: 'symlink' });
    else if (entry.isDirectory()) walk(absolute, root, entries);
    else if (entry.isFile()) entries.push({ relative, kind: 'file' });
    else entries.push({ relative, kind: 'special' });
  }
  return entries;
}

try {
  for (const required of ['raw-root', 'out', 'manifest-out', 'plan']) if (!args[required]) throw new Error(`--${required} is required`);
  const rawRoot = fs.realpathSync(path.resolve(args['raw-root']));
  if (fs.lstatSync(rawRoot).isSymbolicLink() || !fs.statSync(rawRoot).isDirectory()) throw new Error('--raw-root must be a real directory');
  const out = emptyDirectory(args.out);
  if (isWithin(rawRoot, out) || isWithin(out, rawRoot)) throw new Error('raw and staging directories must be disjoint');
  const plan = readData(path.resolve(args.plan));
  const resultsFile = resolveContainedRegularFile(rawRoot, path.join(rawRoot, 'results.json')).absolute;
  const results = readData(resultsFile);
  const allowed = new Set(['results.json']);
  for (const control of ['environment-observation.json', 'factory-lifecycle.json', 'junit.xml']) if (fs.existsSync(path.join(rawRoot, control))) allowed.add(control);
  const evidenceByPath = new Map();
  for (const testCase of asArray(results?.cases)) for (const evidence of asArray(testCase?.evidence)) {
    if (typeof evidence?.path === 'string') {
      allowed.add(evidence.path);
      evidenceByPath.set(evidence.path, evidence);
    }
  }
  const declaredRaw = new Set(asArray(results?.raw_artifacts).map((artifact) => artifact?.path).filter((value) => typeof value === 'string'));
  const findings = [];
  const quarantined = [];
  const inventory = [];
  for (const entry of walk(rawRoot, rawRoot).sort((left, right) => left.relative.localeCompare(right.relative))) {
    if (entry.kind !== 'file') {
      findings.push({ code: 'evidence-staging-non-regular', message: `${entry.relative} is ${entry.kind} and was not published` });
      quarantined.push({ path: entry.relative, reason: entry.kind });
      continue;
    }
    const source = resolveContainedRegularFile(rawRoot, path.join(rawRoot, entry.relative)).absolute;
    const quarantineProof = { path: entry.relative, sha256: sha256File(source), bytes: fs.statSync(source).size };
    const automaticRaw = declaredRaw.has(entry.relative) || entry.relative.startsWith('html-report/') || entry.relative.startsWith('test-results/');
    if (!allowed.has(entry.relative)) {
      quarantined.push({ ...quarantineProof, reason: automaticRaw ? 'raw_replay_only' : 'unreferenced' });
      if (!automaticRaw) findings.push({ code: 'evidence-staging-unreferenced-file', message: `${entry.relative} was not referenced by the controller allowlist and was not published` });
      continue;
    }
    const inspection = inspectEvidenceMedia(source, entry.relative);
    const evidence = evidenceByPath.get(entry.relative);
    const plannedCase = asArray(plan?.cases).find((candidate) => asArray(results?.cases).find((actual) => actual.id === candidate.id)?.evidence?.some((item) => item.path === entry.relative));
    const requirement = asArray(plannedCase?.evidence?.required).find((candidate) => candidate.id === evidence?.requirement_id);
    if (inspection.kind === 'pixel_media' || inspection.kind === 'archive') {
      findings.push({ code: inspection.kind === 'pixel_media' ? 'evidence-media-protected-attestation-required' : 'evidence-uninspectable-archive', message: `${entry.relative} remains quarantined until a protected digest-bound media attestation is supplied` });
      quarantined.push({ ...quarantineProof, reason: inspection.kind });
      continue;
    }
    const issues = scanEvidenceFile(source, entry.relative, { mediaPiiPolicy: requirement?.media_pii_policy || null });
    if (issues.length) {
      findings.push(...issues);
      quarantined.push({ ...quarantineProof, reason: 'scan_failed' });
      continue;
    }
    const destination = path.join(out, entry.relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
    inventory.push({ path: entry.relative, sha256: sha256File(destination), bytes: fs.statSync(destination).size });
  }
  inventory.sort((left, right) => left.path.localeCompare(right.path));
  const manifest = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    inventory,
    bundle_digest: sha256Object(inventory),
    quarantined,
    findings,
  };
  writeData(path.resolve(args['manifest-out']), manifest);
  printResult({
    title: 'Factory minimized evidence staging',
    summary: { published: inventory.length, quarantined: quarantined.length, findings: findings.length, bundle_digest: manifest.bundle_digest },
    manifest: args.json === true ? manifest : undefined,
    findings,
  }, args.json === true);
  if (findings.length) process.exit(2);
} catch (error) {
  printResult({ title: 'Factory minimized evidence staging', summary: { internal: 1 }, findings: [{ severity: 'P0', code: 'factory-evidence-staging-error', message: error.message }] }, args.json === true);
  process.exit(1);
}
