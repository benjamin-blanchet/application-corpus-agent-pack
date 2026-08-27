#!/usr/bin/env node
//
// Fixture-based regression tests for the pack sync engine.
//
// Every fixture is created under the operating system's temporary directory.
// The tests execute the public local-checkout entrypoint with piped stdin so
// non-interactive agent preservation is deterministic even when npm is run
// from an interactive terminal.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const UPDATE_PACK = path.join(here, 'update-pack.mjs');
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corpus-pack-upgrade-tests-'));

const INCOMING_AGENT = '# incoming corpus agent\n';
const LOCAL_AGENT = '# locally customized corpus agent\n';
const STABLE_AGENT = '# stable agent\n';
const STATE_TEMPLATE = "corpus:\n  pack_version: '1.2.0'\n  last_pack_upgrade: null\n";
const INCOMING_ROLE_POLICY = 'version: 1\ndefault: deny\npolicy_revision: incoming\n';
const LOCAL_ROLE_POLICY = 'version: 1\ndefault: deny\npolicy_revision: stale-local\n';
const INCOMING_FACTORY_WORKFLOW = 'name: Factory policy v3\n';
const LOCAL_FACTORY_WORKFLOW = 'name: Factory policy v1\n';
const INCOMING_SPEC_TEMPLATE = '# Reusable V3 spec template\n';
const LOCAL_SPEC_TEMPLATE = '# Reusable V1 spec template\n';
const INCOMING_FACTORY_LEARNING = 'schema_version: 2\npromotions: []\n';
const LOCAL_FACTORY_LEARNING = 'schema_version: 1\npromotions: []\n';
const LEGACY_MCP_READINESS_SKILL = '# obsolete readiness skill\n';
const LOCAL_EXTENSION_SKILL = '# local extension must survive\n';
const PROFILE_CONFIG = fs.readFileSync(path.join(repoRoot, 'pack/profiles.json'), 'utf8');
const PUBLIC_CLI = fs.readFileSync(path.join(repoRoot, 'scripts/cli.mjs'), 'utf8');
const UPGRADE_CORE = fs.readFileSync(path.join(repoRoot, 'scripts/lib/upgrade-core.mjs'), 'utf8');
const PROFILE_BUNDLES = fs.readFileSync(path.join(repoRoot, 'scripts/lib/profile-bundles.mjs'), 'utf8');

function sourceFixture() {
  return {
    'PACK_VERSION': '1.2.0\nreleased: 2026-08-26\n',
    'pack/profiles.json': PROFILE_CONFIG,
    'AGENTS.md': '# Incoming operating guide\n',
    '.github/copilot-instructions.md': '# Incoming Copilot instructions\n',
    'scripts/cli.mjs': PUBLIC_CLI,
    'scripts/lib/upgrade-core.mjs': UPGRADE_CORE,
    'scripts/lib/profile-bundles.mjs': PROFILE_BUNDLES,
    'scripts/tool.mjs': 'export const version = "1.2.0";\n',
    'schemas/corpus-state.yaml.template': STATE_TEMPLATE,
    '.github/prompts/coverage.prompt.md': '# incoming prompt\n',
    '.github/templates/software-factory/roles/role-capabilities.yaml': INCOMING_ROLE_POLICY,
    '.github/templates/software-factory/delivery/factory-policy.workflow.yml': INCOMING_FACTORY_WORKFLOW,
    '.github/agents/corpus.agent.md': INCOMING_AGENT,
    '.github/agents/stable.agent.md': STABLE_AGENT,
    '.github/agents/new.agent.md': '# new agent\n',
    '.github/skills/actionable/brick-deep-dive/SKILL.md': '# incoming core skill\n',
    '.github/skills/sources/runtime-source-probe/SKILL.md': '# runtime source probe\n',
    'doc/README.md': '# Incoming corpus readme\n',
    'doc/_meta/corpus-state.yaml': STATE_TEMPLATE,
    'doc/_meta/corpus-changelog.md': '| Date | Change | Reason | Actor |\n|---|---|---|---|\n',
    'doc/_meta/new-scaffold.md': '# New scaffold\n',
    'doc/_meta/factory-learning.yaml': INCOMING_FACTORY_LEARNING,
    'doc/spec/template/README.md': INCOMING_SPEC_TEMPLATE,
    'doc/spec/1.2.0/pack-internal/README.md': '# Pack development spec\n',
  };
}

function existingFixture({ state = true } = {}) {
  const files = {
    'PACK_VERSION': '1.0.0\nreleased: 2026-05-23\n',
    'AGENTS.md': '# Local old operating guide\n',
    'scripts/tool.mjs': 'export const version = "1.0.0";\n',
    '.github/prompts/coverage.prompt.md': '# local old prompt\n',
    '.github/skills/sources/mcp-readiness-check/SKILL.md': LEGACY_MCP_READINESS_SKILL,
    '.github/skills/sources/local-extension/SKILL.md': LOCAL_EXTENSION_SKILL,
    '.github/templates/software-factory/roles/role-capabilities.yaml': LOCAL_ROLE_POLICY,
    '.github/templates/software-factory/delivery/factory-policy.workflow.yml': LOCAL_FACTORY_WORKFLOW,
    '.github/agents/corpus.agent.md': LOCAL_AGENT,
    '.github/agents/stable.agent.md': STABLE_AGENT,
    'doc/README.md': '# Local corpus readme\n',
    'doc/_meta/corpus-changelog.md': '| Date | Change | Reason | Actor |\n|---|---|---|---|\n| old | local | keep | team |\n',
    'doc/_meta/factory-learning.yaml': LOCAL_FACTORY_LEARNING,
    'doc/project/features/demo/README.md': '# Local evidence\n',
    'doc/spec/template/README.md': LOCAL_SPEC_TEMPLATE,
    'doc/spec/template/factory-state.yaml': 'version: 1\nphase: planned\n',
    'doc/spec/template/technical-plan.yaml': 'version: 1\nlots: []\n',
  };
  if (state) {
    files['doc/_meta/corpus-state.yaml'] = "corpus:\n  pack_version: '1.0.0'\n  custom_field: keep-me\n";
  }
  return files;
}

function materialise(root, files) {
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
}

function walkFiles(root) {
  if (!fs.existsSync(root)) return [];
  const out = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const abs = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(abs));
    else out.push(abs);
  }
  return out.sort();
}

function snapshot(root) {
  const files = new Map();
  for (const abs of walkFiles(root)) {
    const rel = path.relative(root, abs).replace(/\\/g, '/');
    files.set(rel, fs.readFileSync(abs));
  }
  return files;
}

function assertExactSnapshot(root, expected) {
  const actual = snapshot(root);
  assert.deepEqual([...actual.keys()], [...expected.keys()]);
  for (const [rel, bytes] of expected) assert.deepEqual(actual.get(rel), bytes, `${rel} changed`);
}

function assertPreexistingBytes(root, expected) {
  for (const [rel, bytes] of expected) {
    const abs = path.join(root, rel);
    assert.ok(fs.existsSync(abs), `${rel} was removed`);
    assert.deepEqual(fs.readFileSync(abs), bytes, `${rel} changed`);
  }
}

function read(root, rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function durableReports(root) {
  const meta = path.join(root, 'doc/_meta');
  if (!fs.existsSync(meta)) return [];
  return fs.readdirSync(meta).filter((name) => /^pack-(?:install|upgrade)-.*\.md$/.test(name));
}

function runSync(source, target, ...args) {
  const result = spawnSync(process.execPath, [UPDATE_PACK, source, ...args], {
    cwd: target,
    encoding: 'utf8',
    input: '',
    maxBuffer: 8 * 1024 * 1024,
  });
  assert.equal(result.status, 0, `sync failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  return `${result.stdout}${result.stderr}`;
}

function runSyncFailure(source, target, ...args) {
  const result = spawnSync(process.execPath, [UPDATE_PACK, source, ...args], {
    cwd: target,
    encoding: 'utf8',
    input: '',
    maxBuffer: 8 * 1024 * 1024,
  });
  assert.notEqual(result.status, 0, `sync unexpectedly succeeded\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  return `${result.stdout}${result.stderr}`;
}

function runInstalledCli(target, ...args) {
  const result = spawnSync(process.execPath, [path.join(target, 'scripts/cli.mjs'), ...args], {
    cwd: target,
    encoding: 'utf8',
    input: '',
    maxBuffer: 8 * 1024 * 1024,
  });
  assert.equal(result.status, 0, `installed CLI failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  return `${result.stdout}${result.stderr}`;
}

function runInstalledCliFailure(target, ...args) {
  const result = spawnSync(process.execPath, [path.join(target, 'scripts/cli.mjs'), ...args], {
    cwd: target,
    encoding: 'utf8',
    input: '',
    maxBuffer: 8 * 1024 * 1024,
  });
  assert.notEqual(result.status, 0, `installed CLI unexpectedly succeeded\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  return `${result.stdout}${result.stderr}`;
}

function fixture(name, files = {}) {
  const root = path.join(tmpRoot, name);
  fs.mkdirSync(root, { recursive: true });
  materialise(root, files);
  return root;
}

const source = fixture('source', sourceFixture());
const tests = [
  {
    name: 'public-help-describes-the-versioned-doc-exceptions-and-backup',
    run() {
      const result = spawnSync(process.execPath, [path.join(repoRoot, 'scripts/cli.mjs'), '--help'], {
        cwd: repoRoot,
        encoding: 'utf8',
      });
      assert.equal(result.status, 0, result.stderr || result.stdout);
      assert.match(result.stdout, /doc\/spec\/template/);
      assert.match(result.stdout, /factory-learning\.yaml/);
      assert.match(result.stdout, /\.corpus-pack-backups/);
      assert.doesNotMatch(result.stdout, /existing files under doc\/ are never overwritten/i);
    },
  },
  {
    name: 'release-contract-is-coherent',
    run() {
      const pkg = JSON.parse(read(repoRoot, 'package.json'));
      const packVersion = read(repoRoot, 'PACK_VERSION').split(/\r?\n/)[0].trim();
      const state = read(repoRoot, 'doc/_meta/corpus-state.yaml');
      const migrationTemplate = read(repoRoot, 'schemas/corpus-state.yaml.template');
      const stateVersion = state.match(/^\s*pack_version:\s*['"]?([^'"\s]+)/m)?.[1];

      assert.equal(pkg.version, packVersion, 'package.json and PACK_VERSION differ');
      assert.equal(stateVersion, packVersion, 'fresh corpus-state template and PACK_VERSION differ');
      assert.equal(migrationTemplate, state, 'migration scaffold and fresh corpus-state model differ');
      assert.match(read(repoRoot, 'PACK_VERSION'), /^1\.1\.0\r?\nreleased: 2026-08-27\r?\nnotes: .+/);

      const upgradeCore = read(repoRoot, 'scripts/lib/upgrade-core.mjs');
      assert.doesNotMatch(upgradeCore, /function\s+(?:stampState|buildReport)\b/);
      const migrationSkillDir = '.github/skills/governance/pack-upgrade';
      const migrationSkill = [
        'SKILL.md',
        'procedure-operator-sync.md',
        'procedure-migration.md',
        'procedure-finalization.md',
      ].map((name) => read(repoRoot, `${migrationSkillDir}/${name}`)).join('\n');
      assert.match(migrationSkill, /schemas\/corpus-state\.yaml\.template/);
      assert.match(migrationSkill, /previous_pack_version: <from_version>/);
      assert.match(migrationSkill, /recompute-corpus-state\.mjs --apply --json/);
      assert.match(migrationSkill, /<from_slug>-to-<to_slug>/);
      assert.match(migrationSkill, /validation_status: pending/);
      assert.match(migrationSkill, /read-only validator/i);
      const corpusAgent = read(repoRoot, '.github/agents/corpus.agent.md');
      assert.match(corpusAgent, /Pack-upgrade preflight exception/);
      assert.match(corpusAgent, /schemas\/corpus-state\.yaml\.template/);
      assert.match(corpusAgent, /validation_status: passed/);

      for (const command of Object.values(pkg.scripts || {})) {
        for (const match of command.matchAll(/\bnode(?:\s+--[A-Za-z0-9=._-]+)*\s+(scripts\/[A-Za-z0-9._/-]+\.mjs)/g)) {
          assert.ok(fs.existsSync(path.join(repoRoot, match[1])), `npm script target does not exist: ${match[1]}`);
        }
      }

      // Repository-facing release docs are deliberately excluded from the npm
      // payload. Validate them in a checkout, while keeping the shipped test
      // suite runnable from the actual tarball.
      const installationPath = path.join(repoRoot, 'docs/installation.md');
      if (fs.existsSync(installationPath)) {
        const installation = read(repoRoot, 'docs/installation.md');
        const pinnedVersions = [...installation.matchAll(/(?:#|=)v(\d+\.\d+\.\d+)/g)].map((match) => match[1]);
        assert.ok(pinnedVersions.length >= 2, 'expected pinned public version examples');
        assert.deepEqual(new Set(pinnedVersions), new Set([packVersion]));
        assert.doesNotMatch(installation, /Every run writes a .*pack-.* report/i);
      }

      const operatorGuides = ['doc/_agents/pack-upgrade.md'];
      assert.ok(fs.existsSync(path.join(repoRoot, operatorGuides[0])), 'canonical operator guide is missing');
      for (const rel of operatorGuides) {
        if (!fs.existsSync(path.join(repoRoot, rel))) continue;
        const guide = read(repoRoot, rel);
        assert.doesNotMatch(guide, /^\s*rsync\s+.*--delete/m, `${rel} prescribes destructive rsync`);
        assert.match(guide, /sync --apply/);
        assert.match(guide, /Corpus/);
      }
    },
  },
  {
    name: 'dry-run-is-read-only',
    run() {
      const target = fixture('dry-run-target', existingFixture());
      const before = snapshot(target);
      const output = runSync(source, target);

      assertExactSnapshot(target, before);
      assert.match(output, /Version: 1\.0\.0 → 1\.2\.0/);
      assert.match(output, /Sync preview complete; no files were written\./);
      assert.doesNotMatch(output, /(?:Would write|Report written)/);
    },
  },
  {
    name: 'executable-factory-templates-are-replaced-with-the-runtime-on-upgrade',
    run() {
      const target = fixture('role-policy-target', existingFixture());
      const output = runSync(source, target, '--apply');

      assert.equal(read(target, '.github/templates/software-factory/roles/role-capabilities.yaml'), INCOMING_ROLE_POLICY);
      assert.equal(read(target, '.github/templates/software-factory/delivery/factory-policy.workflow.yml'), INCOMING_FACTORY_WORKFLOW);
      const backupRoot = '.corpus-pack-backups/1.0.0-to-1.2.0';
      assert.equal(read(target, `${backupRoot}/.github/templates/software-factory/roles/role-capabilities.yaml`), LOCAL_ROLE_POLICY);
      assert.equal(read(target, `${backupRoot}/.github/templates/software-factory/delivery/factory-policy.workflow.yml`), LOCAL_FACTORY_WORKFLOW);
      assert.equal(read(target, `${backupRoot}/doc/spec/template/README.md`), LOCAL_SPEC_TEMPLATE);
      assert.equal(read(target, `${backupRoot}/doc/_meta/factory-learning.yaml`), LOCAL_FACTORY_LEARNING);
      assert.equal(read(target, `${backupRoot}/.github/skills/sources/mcp-readiness-check/SKILL.md`), LEGACY_MCP_READINESS_SKILL);
      assert.equal(read(target, `${backupRoot}/doc/spec/template/factory-state.yaml`), 'version: 1\nphase: planned\n');
      assert.equal(read(target, `${backupRoot}/doc/spec/template/technical-plan.yaml`), 'version: 1\nlots: []\n');
      assert.equal(fs.existsSync(path.join(target, '.github/skills/sources/mcp-readiness-check/SKILL.md')), false);
      assert.equal(read(target, '.github/skills/sources/local-extension/SKILL.md'), LOCAL_EXTENSION_SKILL);
      assert.match(output, /role-capabilities\.yaml/);
      assert.doesNotMatch(output, /role-capabilities\.yaml · template, missing locally/);
    },
  },
  {
    name: 'existing-upgrade-preserves-doc-and-local-agent',
    run() {
      const target = fixture('existing-target', existingFixture());
      const docBefore = snapshot(path.join(target, 'doc'));
      docBefore.delete('_meta/factory-learning.yaml');
      docBefore.delete('spec/template/README.md');
      docBefore.delete('spec/template/factory-state.yaml');
      docBefore.delete('spec/template/technical-plan.yaml');
      const output = runSync(source, target, '--apply');

      assertPreexistingBytes(path.join(target, 'doc'), docBefore);
      assert.equal(read(target, 'PACK_VERSION').split(/\r?\n/)[0], '1.2.0');
      assert.equal(read(target, 'scripts/tool.mjs'), sourceFixture()['scripts/tool.mjs']);
      assert.equal(read(target, 'schemas/corpus-state.yaml.template'), STATE_TEMPLATE);
      assert.equal(read(target, '.github/prompts/coverage.prompt.md'), '# incoming prompt\n');
      assert.equal(read(target, '.github/templates/software-factory/roles/role-capabilities.yaml'), INCOMING_ROLE_POLICY);
      assert.equal(read(target, '.github/agents/corpus.agent.md'), LOCAL_AGENT);
      assert.equal(read(target, '.github/agents/stable.agent.md'), STABLE_AGENT);
      assert.equal(read(target, '.github/agents/new.agent.md'), '# new agent\n');
      assert.equal(read(target, 'doc/_meta/new-scaffold.md'), '# New scaffold\n');
      assert.equal(read(target, 'doc/spec/template/README.md'), INCOMING_SPEC_TEMPLATE);
      assert.equal(fs.existsSync(path.join(target, 'doc/spec/template/factory-state.yaml')), false);
      assert.equal(fs.existsSync(path.join(target, 'doc/spec/template/technical-plan.yaml')), false);
      assert.equal(read(target, 'doc/_meta/factory-learning.yaml'), INCOMING_FACTORY_LEARNING);
      assert.equal(read(target, '.github/templates/software-factory/delivery/factory-policy.workflow.yml'), INCOMING_FACTORY_WORKFLOW);
      assert.equal(fs.existsSync(path.join(target, 'doc/spec/1.2.0/pack-internal/README.md')), false);
      assert.deepEqual(durableReports(target), []);
      assert.match(output, /locally-modified agent\(s\) preserved/);
      assert.match(output, /Retire \(exact obsolete pack surfaces\): 3/);
      assert.match(output, /Locally-modified agents preserved: 1/);
      assert.match(output, /Next step: open the Corpus agent and run the pack migration\./);
    },
  },
  {
    name: 'copy-refuses-a-symlinked-target-parent-without-touching-the-external-file',
    run() {
      const target = fixture('copy-symlink-target', existingFixture());
      const outside = fixture('copy-symlink-outside', { 'tool.mjs': 'external sentinel\n' });
      fs.rmSync(path.join(target, 'scripts'), { recursive: true, force: true });
      fs.symlinkSync(outside, path.join(target, 'scripts'), 'dir');

      const output = runSyncFailure(source, target, '--apply');

      assert.equal(read(outside, 'tool.mjs'), 'external sentinel\n');
      assert.match(output, /symbolic link|symlink/i);
    },
  },
  {
    name: 'retirement-refuses-a-symlinked-parent-without-deleting-the-external-file',
    run() {
      const target = fixture('retire-symlink-target', existingFixture());
      const outside = fixture('retire-symlink-outside', { 'SKILL.md': 'external sentinel\n' });
      const legacy = path.join(target, '.github/skills/sources/mcp-readiness-check');
      fs.rmSync(legacy, { recursive: true, force: true });
      fs.symlinkSync(outside, legacy, 'dir');

      const output = runSyncFailure(source, target, '--apply');

      assert.equal(read(outside, 'SKILL.md'), 'external sentinel\n');
      assert.match(output, /symbolic link|symlink/i);
    },
  },
  {
    name: 'force-only-overwrites-the-local-agent',
    run() {
      const target = fixture('force-target', existingFixture());
      const docBefore = snapshot(path.join(target, 'doc'));
      docBefore.delete('_meta/factory-learning.yaml');
      docBefore.delete('spec/template/README.md');
      docBefore.delete('spec/template/factory-state.yaml');
      docBefore.delete('spec/template/technical-plan.yaml');
      const output = runSync(source, target, '--apply', '--force');

      assertPreexistingBytes(path.join(target, 'doc'), docBefore);
      assert.equal(read(target, '.github/agents/corpus.agent.md'), INCOMING_AGENT);
      assert.deepEqual(durableReports(target), []);
      assert.match(output, /Agents modified locally \(confirm before overwrite — forced\): 1/);
      assert.match(output, /Locally-modified agents preserved: 0/);
    },
  },
  {
    name: 'fresh-install-copies-the-versioned-state-template',
    run() {
      const target = fixture('fresh-target');
      const output = runSync(source, target, '--apply');

      assert.equal(read(target, 'PACK_VERSION').split(/\r?\n/)[0], '1.2.0');
      assert.match(read(target, 'doc/_meta/corpus-state.yaml'), /pack_version: '1\.2\.0'/);
      assert.equal(read(target, 'schemas/corpus-state.yaml.template'), read(target, 'doc/_meta/corpus-state.yaml'));
      assert.equal(read(target, '.github/agents/corpus.agent.md'), INCOMING_AGENT);
      assert.equal(fs.existsSync(path.join(target, '.github/templates/software-factory/roles/role-capabilities.yaml')), false);
      assert.equal(fs.existsSync(path.join(target, '.github/skills/sources/runtime-source-probe/SKILL.md')), false);
      const installState = JSON.parse(read(target, '.corpus-pack/install-state.json'));
      assert.deepEqual(installState.activeProfiles, ['core']);
      assert.equal(installState.packVersion, '1.2.0');
      assert.equal(installState.source.version, '1.2.0');
      assert.match(installState.source.treeSha256, /^[a-f0-9]{64}$/);
      assert.equal(installState.managedFiles['AGENTS.md'].profile, 'core');
      const bundleManifest = JSON.parse(read(target, '.corpus-pack/manifest.json'));
      assert.match(bundleManifest.profiles.sources.sha256, /^[a-f0-9]{64}$/);
      assert.match(bundleManifest.profiles.factory.sha256, /^[a-f0-9]{64}$/);
      assert.deepEqual(durableReports(target), []);
      assert.match(output, /Version: <missing> → 1\.2\.0/);
      assert.match(output, /Next step: open the Corpus agent and start the corpus\./);
    },
  },
  {
    name: 'fresh-install-preserves-conflicts-and-stages-incoming-even-with-force',
    run() {
      const target = fixture('fresh-conflict-target', {
        'AGENTS.md': '# Project-owned agent instructions\n',
        '.github/copilot-instructions.md': '# Project-owned Copilot instructions\n',
        '.github/skills/actionable/brick-deep-dive/SKILL.md': '# Project-owned skill\n',
        'scripts/tool.mjs': 'export const projectTool = true;\n',
      });
      const output = runSync(source, target, '--apply', '--force');

      assert.equal(read(target, 'AGENTS.md'), '# Project-owned agent instructions\n');
      assert.equal(read(target, '.github/copilot-instructions.md'), '# Project-owned Copilot instructions\n');
      assert.equal(read(target, '.github/skills/actionable/brick-deep-dive/SKILL.md'), '# Project-owned skill\n');
      assert.equal(read(target, 'scripts/tool.mjs'), 'export const projectTool = true;\n');
      assert.equal(read(target, '.corpus-pack/incoming/1.2.0/AGENTS.md'), '# Incoming operating guide\n');
      assert.equal(read(target, '.corpus-pack/incoming/1.2.0/.github/copilot-instructions.md'), '# Incoming Copilot instructions\n');
      assert.equal(read(target, '.corpus-pack/incoming/1.2.0/.github/skills/actionable/brick-deep-dive/SKILL.md'), '# incoming core skill\n');
      assert.equal(read(target, '.corpus-pack/incoming/1.2.0/scripts/tool.mjs'), 'export const version = "1.2.0";\n');
      const state = JSON.parse(read(target, '.corpus-pack/install-state.json'));
      assert.deepEqual(state.conflicts, [
        '.github/copilot-instructions.md',
        '.github/skills/actionable/brick-deep-dive/SKILL.md',
        'AGENTS.md',
        'scripts/tool.mjs',
      ]);
      assert.deepEqual(state.pendingProfiles, ['core']);
      assert.equal(state.managedFiles['AGENTS.md'], undefined);
      assert.match(output, /Protected conflicts preserved: 4/);

      // A second non-forced sync must not turn the first-run conflict into a
      // pack-owned overwrite merely because PACK_VERSION now exists.
      runSync(source, target, '--apply');
      assert.equal(read(target, 'AGENTS.md'), '# Project-owned agent instructions\n');
      assert.equal(read(target, '.github/copilot-instructions.md'), '# Project-owned Copilot instructions\n');
      assert.equal(read(target, '.github/skills/actionable/brick-deep-dive/SKILL.md'), '# Project-owned skill\n');
      assert.equal(read(target, 'scripts/tool.mjs'), 'export const projectTool = true;\n');
    },
  },
  {
    name: 'fresh-install-refuses-preexisting-reserved-metadata-before-writing',
    run() {
      const target = fixture('reserved-metadata-target', {
        '.corpus-pack/manifest.json': '{"projectOwned":true}\n',
        'sentinel.txt': 'untouched\n',
      });
      const before = snapshot(target);
      const output = runSyncFailure(source, target, '--apply');
      assertExactSnapshot(target, before);
      assert.match(output, /reserved pack metadata already exists/i);
    },
  },
  {
    name: 'offline-profile-enable-is-dry-run-first-and-preserves-conflicts',
    run() {
      const target = fixture('offline-profile-target', {
        '.github/templates/software-factory/roles/role-capabilities.yaml': 'project-owned factory policy\n',
      });
      runSync(source, target, '--apply');
      const before = snapshot(target);
      const preview = runInstalledCli(target, 'profile', 'enable', 'factory');
      assertExactSnapshot(target, before);
      assert.match(preview, /DRY-RUN/);
      assert.match(preview, /Conflicts preserved: 1/);

      const output = runInstalledCli(target, 'profile', 'enable', 'factory', '--apply');
      assert.equal(read(target, '.github/templates/software-factory/roles/role-capabilities.yaml'), 'project-owned factory policy\n');
      assert.equal(read(target, '.corpus-pack/incoming/1.2.0/.github/templates/software-factory/roles/role-capabilities.yaml'), INCOMING_ROLE_POLICY);
      assert.equal(read(target, '.github/templates/software-factory/delivery/factory-policy.workflow.yml'), INCOMING_FACTORY_WORKFLOW);
      let state = JSON.parse(read(target, '.corpus-pack/install-state.json'));
      assert.deepEqual(state.activeProfiles, ['core']);
      assert.deepEqual(state.pendingProfiles, ['factory']);
      assert.match(output, /pending review/);
      assert.match(runInstalledCli(target, 'profile', 'status'), /factory: pending review · available offline/);

      fs.copyFileSync(
        path.join(target, '.corpus-pack/incoming/1.2.0/.github/templates/software-factory/roles/role-capabilities.yaml'),
        path.join(target, '.github/templates/software-factory/roles/role-capabilities.yaml'),
      );
      const resolved = runInstalledCli(target, 'profile', 'enable', 'factory', '--apply');
      state = JSON.parse(read(target, '.corpus-pack/install-state.json'));
      assert.deepEqual(state.activeProfiles, ['core', 'factory']);
      assert.deepEqual(state.pendingProfiles, []);
      assert.match(resolved, /enabled from the local offline bundle/);
      assert.match(runInstalledCli(target, 'profile', 'status'), /factory: active · available offline/);
    },
  },
  {
    name: 'offline-profile-enable-rejects-a-tampered-bundle',
    run() {
      const target = fixture('tampered-bundle-target');
      runSync(source, target, '--apply');
      fs.appendFileSync(path.join(target, '.corpus-pack/bundles/sources.bundle.json.gz'), 'tampered');
      const output = runInstalledCliFailure(target, 'profile', 'enable', 'sources', '--apply');
      assert.match(output, /digest mismatch/i);
      assert.equal(fs.existsSync(path.join(target, '.github/skills/sources/runtime-source-probe/SKILL.md')), false);
    },
  },
  {
    name: 'missing-state-is-deferred-on-upgrade',
    run() {
      const target = fixture('missing-state-target', existingFixture({ state: false }));
      const output = runSync(source, target, '--apply', '--force');

      assert.equal(fs.existsSync(path.join(target, 'doc/_meta/corpus-state.yaml')), false);
      assert.equal(read(target, 'schemas/corpus-state.yaml.template'), STATE_TEMPLATE);
      assert.equal(read(target, 'doc/_meta/new-scaffold.md'), '# New scaffold\n');
      assert.match(output, /Deferred to Corpus migration: 1/);
      assert.match(output, /doc\/_meta\/corpus-state\.yaml/);
      assert.deepEqual(durableReports(target), []);
    },
  },
  {
    name: 'unversioned-existing-corpus-is-not-a-fresh-install',
    run() {
      const files = existingFixture({ state: false });
      delete files.PACK_VERSION;
      files['doc/CORPUS_MANIFEST.md'] = '# Existing unversioned corpus\n';
      const target = fixture('unversioned-target', files);
      const output = runSync(source, target, '--apply', '--force');

      assert.equal(fs.existsSync(path.join(target, 'doc/_meta/corpus-state.yaml')), false);
      assert.equal(read(target, 'schemas/corpus-state.yaml.template'), STATE_TEMPLATE);
      assert.match(output, /Pack upgrade · APPLY/);
      assert.match(output, /Version: <missing> → 1\.2\.0/);
      assert.match(output, /Deferred to Corpus migration: 1/);
      assert.match(output, /Next step: open the Corpus agent and run the pack migration\./);
    },
  },
  {
    name: 'real-core-install-can-run-the-shipped-validator',
    run() {
      const target = fixture('real-core-validator-target');
      const install = spawnSync(process.execPath, [path.join(repoRoot, 'scripts/cli.mjs'), 'sync', '--apply'], {
        cwd: target,
        encoding: 'utf8',
        input: '',
        maxBuffer: 16 * 1024 * 1024,
      });
      assert.equal(install.status, 0, `real core install failed\n${install.stdout}\n${install.stderr}`);
      const state = JSON.parse(read(target, '.corpus-pack/install-state.json'));
      assert.deepEqual(state.activeProfiles, ['core']);
      assert.ok(fs.existsSync(path.join(target, 'scripts/check-runtime-sources.mjs')), 'validator runtime dependency was not installed in core');
      for (const rel of ['doc/project/apis', 'doc/project/batchs', 'doc/project/features', 'doc/prod']) {
        assert.equal(fs.existsSync(path.join(target, rel)), false, `${rel} should remain lazy on a fresh core install`);
      }
      assert.ok(fs.existsSync(path.join(target, '.github/templates/corpus-sections/apis/README.md')), 'offline section templates must be installed in core');

      const validation = spawnSync(process.execPath, [path.join(target, 'scripts/validate-corpus.mjs')], {
        cwd: target,
        encoding: 'utf8',
        input: '',
        maxBuffer: 16 * 1024 * 1024,
      });
      assert.equal(validation.status, 0, `installed core validator failed\n${validation.stdout}\n${validation.stderr}`);
      assert.doesNotMatch(`${validation.stdout}${validation.stderr}`, /ERR_MODULE_NOT_FOUND/);
    },
  },
];

let failed = 0;
try {
  for (const test of tests) {
    try {
      test.run();
      console.log(`ok    ${test.name}`);
    } catch (error) {
      failed += 1;
      console.log(`FAIL  ${test.name}`);
      console.log(`        ${error.stack || error.message}`);
    }
  }
} finally {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}

console.log(`\n${tests.length - failed}/${tests.length} passing`);
process.exit(failed > 0 ? 1 : 0);
