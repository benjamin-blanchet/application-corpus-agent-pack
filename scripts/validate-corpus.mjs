#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const docRoot = path.join(root, 'doc');
const jsonMode = process.argv.includes('--json');

const findings = [];

function add(severity, code, message, file = null, detail = null) {
  findings.push({ severity, code, message, file, detail });
}

function exists(relPath) {
  return fs.existsSync(path.join(root, relPath));
}

function isDirectory(relPath) {
  try {
    return fs.statSync(path.join(root, relPath)).isDirectory();
  } catch {
    return false;
  }
}

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf8');
}

function walk(dirAbs) {
  if (!fs.existsSync(dirAbs)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dirAbs, { withFileTypes: true })) {
    const abs = path.join(dirAbs, entry.name);
    if (entry.isDirectory()) out.push(...walk(abs));
    else out.push(abs);
  }
  return out;
}

function rel(abs) {
  return path.relative(root, abs).split(path.sep).join('/');
}

function parseSimpleYamlMap(text) {
  const result = {};
  const stack = [{ indent: -1, value: result }];
  for (const rawLine of text.split(/\r?\n/)) {
    if (!rawLine.trim() || rawLine.trim().startsWith('#')) continue;
    const indent = rawLine.match(/^\s*/)[0].length;
    const line = rawLine.trim();
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const parent = stack[stack.length - 1].value;
    let value;
    if (rawValue === '') {
      value = {};
      parent[key] = value;
      stack.push({ indent, value });
    } else if (rawValue === 'true') {
      parent[key] = true;
    } else if (rawValue === 'false') {
      parent[key] = false;
    } else if (rawValue === 'null') {
      parent[key] = null;
    } else if (/^-?\d+$/.test(rawValue)) {
      parent[key] = Number(rawValue);
    } else if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
      parent[key] = rawValue === '[]' ? [] : rawValue.slice(1, -1).split(',').map((v) => v.trim());
    } else {
      parent[key] = rawValue.replace(/^['"]|['"]$/g, '');
    }
  }
  return result;
}

function hasFrontmatter(content) {
  return content.startsWith('---\n') && content.indexOf('\n---', 4) !== -1;
}

function frontmatter(content) {
  if (!hasFrontmatter(content)) return {};
  const end = content.indexOf('\n---', 4);
  return parseSimpleYamlMap(content.slice(4, end));
}

function checkRequiredStructure() {
  const requiredFiles = [
    'doc/README.md',
    'doc/CORPUS_MAP.md',
    'doc/CORPUS_MANIFEST.md',
    'doc/_meta/app-profile.yaml',
    'doc/_meta/corpus-state.yaml',
    'doc/_meta/code-pipeline-state.yaml',
    'doc/_meta/open-questions.md',
    'doc/_meta/update-candidates.md',
    'doc/_meta/validation-checklist.md',
    'doc/_meta/discovery-coverage.md',
    'doc/_meta/blocking-questions.md',
    'doc/_meta/deep-analysis-plan.md',
    'doc/_meta/brick-inventory.yaml',
    'doc/_meta/actionable-readiness.md',
    'doc/_meta/kickstart-progress.md',
    'doc/_meta/mcp-source-wizard.md',
    'doc/_meta/mcp-readiness.md',
    'doc/_meta/interaction-history/README.md',
    'doc/_meta/interaction-history/SESSION-template.md',
    'doc/_roadmap/README.md',
    'doc/_roadmap/CORPUS_ROADMAP.md',
    'doc/_roadmap/CORPUS_ROADMAP.yaml',
    'doc/_roadmap/ROADMAP_STATE.md',
    'doc/_roadmap/NEXT_BEST_ACTIONS.md',
    'doc/_roadmap/ROADMAP_DECISIONS.md',
    'doc/_graph/README.md',
    'doc/_graph/nodes.yaml',
    'doc/_graph/edges.yaml',
    'doc/_graph/evidence.yaml',
    'doc/_runs/README.md',
    'doc/_runs/RUN_LEDGER.md',
    'doc/_runs/RUN_TEMPLATE.md',
    'doc/mcp/MCP_READINESS.md',
    'doc/project/cicd/README.md',
    'doc/project/cicd/PIPELINES.md',
    'doc/project/cicd/RECENT_ACTIVITY.md',
    '.github/agents/corpus-control-plane-subagent.agent.md',
    '.github/skills/exploration/production-temporal-correlation/SKILL.md',
    '.github/skills/exploration/ci-cd-activity-discovery/SKILL.md',
    '.github/templates/prod-knowledge/production-temporal-correlation-template.md',
    'scripts/inventory-repo.mjs',
    'scripts/export-graph-json.mjs',
  ];
  const requiredDirs = [
    'doc/_meta',
    'doc/_meta/interaction-history',
    'doc/_indexes',
    'doc/_roadmap',
    'doc/_graph',
    'doc/_runs',
    'doc/_handover',
    'doc/project',
    'doc/prod',
    'doc/spec',
    'doc/mcp',
  ];
  for (const file of requiredFiles) {
    if (!exists(file)) add('P0', 'missing-required-file', `Missing required corpus file: ${file}`, file);
  }
  for (const dir of requiredDirs) {
    if (!isDirectory(dir)) add('P0', 'missing-required-directory', `Missing required corpus directory: ${dir}`, dir);
  }
  const expectedIndexes = [
    'by-feature.md',
    'by-component.md',
    'by-technical-component.md',
    'by-api.md',
    'by-batch.md',
    'by-screen.md',
    'by-use-case.md',
    'by-business-entity.md',
    'by-risk.md',
    'by-bug.md',
    'by-production-signal.md',
    'by-project-signal.md',
    'by-source.md',
    'by-brick.md',
  ];
  for (const indexName of expectedIndexes) {
    const file = `doc/_indexes/${indexName}`;
    if (!exists(file)) add('P1', 'missing-index', `Missing expected index file: ${file}`, file);
  }
}

function checkMarkdownLinks() {
  const markdownFiles = walk(docRoot).filter((file) => file.endsWith('.md'));
  const linkPattern = /\[[^\]]+\]\(([^)]+)\)/g;
  for (const abs of markdownFiles) {
    const fileRel = rel(abs);
    const content = fs.readFileSync(abs, 'utf8');
    let match;
    while ((match = linkPattern.exec(content))) {
      let target = match[1].trim();
      if (!target || target.startsWith('#')) continue;
      if (/^(https?:|mailto:)/.test(target)) continue;
      target = target.replace(/^<|>$/g, '').split('#')[0];
      if (!target) continue;
      const resolved = path.normalize(path.join(path.dirname(abs), target));
      if (!fs.existsSync(resolved)) {
        add('P1', 'broken-markdown-link', `Broken Markdown link to ${match[1]}`, fileRel, rel(resolved));
      }
    }
  }
}

function checkFrontmatter() {
  const requiredFields = ['type', 'status', 'confidence', 'source'];
  const markdownFiles = walk(docRoot).filter((file) => file.endsWith('.md') && !file.endsWith('.template'));
  const important = markdownFiles.filter((abs) => {
    const fileRel = rel(abs);
    if (fileRel.includes('/spec/template/')) return false;
    if (fileRel.includes('/_indexes/')) return true;
    if (fileRel.includes('/_meta/')) return true;
    if (fileRel.includes('/_handover/')) return true;
    return /\/(README|ARCHITECTURE|WORKFLOWS|BUSINESS_RULES|OPERATIONS|AI_AGENT_GUIDE|INDEX|CORPUS_MAP|CORPUS_MANIFEST)\.md$/.test(fileRel);
  });
  for (const abs of important) {
    const fileRel = rel(abs);
    const content = fs.readFileSync(abs, 'utf8');
    if (!hasFrontmatter(content)) {
      add('P2', 'missing-frontmatter', 'Important corpus Markdown file has no frontmatter', fileRel);
      continue;
    }
    const fm = frontmatter(content);
    for (const field of requiredFields) {
      if (!(field in fm)) add('P2', 'missing-frontmatter-field', `Missing frontmatter field: ${field}`, fileRel);
    }
  }
}

function checkFeatureFolders() {
  const featureRoot = path.join(root, 'doc/project/features');
  if (!fs.existsSync(featureRoot)) return;
  const expected = ['README.md', 'ARCHITECTURE.md', 'WORKFLOWS.md', 'BUSINESS_RULES.md', 'OPERATIONS.md', 'AI_AGENT_GUIDE.md'];
  for (const entry of fs.readdirSync(featureRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('_')) continue;
    for (const file of expected) {
      const relPath = `doc/project/features/${entry.name}/${file}`;
      if (!exists(relPath)) add('P2', 'incomplete-feature-folder', `Feature folder is missing ${file}`, relPath);
    }
  }
}

function checkProductionKnowledge() {
  const checks = [
    ['doc/prod/known-bugs', /^BUG-[A-Za-z0-9_-]+-.+\.md$/],
    ['doc/prod/structural-risks', /^RISK-[A-Za-z0-9_-]+-.+\.md$/],
    ['doc/prod/root-cause-playbooks', /^PLAYBOOK-.+\.md$/],
    ['doc/prod/watchlist', /^WATCH-.+\.md$/],
  ];
  for (const [dir, pattern] of checks) {
    const absDir = path.join(root, dir);
    if (!fs.existsSync(absDir)) continue;
    for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
      if (!entry.isFile() || entry.name === 'README.md' || entry.name === 'INDEX.md' || entry.name.endsWith('template.md')) continue;
      if (!pattern.test(entry.name)) {
        add('P2', 'nonstandard-prod-knowledge-name', `Production knowledge file does not follow naming convention: ${entry.name}`, `${dir}/${entry.name}`);
      }
    }
  }
}

function checkIndexes() {
  const featureRoot = path.join(root, 'doc/project/features');
  if (fs.existsSync(featureRoot) && exists('doc/_indexes/by-feature.md')) {
    const index = read('doc/_indexes/by-feature.md');
    for (const entry of fs.readdirSync(featureRoot, { withFileTypes: true })) {
      if (entry.isDirectory() && !entry.name.startsWith('_') && !index.includes(entry.name)) {
        add('P1', 'feature-missing-from-index', `Feature folder is not referenced in by-feature index: ${entry.name}`, 'doc/_indexes/by-feature.md');
      }
    }
  }

  const bugRoot = path.join(root, 'doc/prod/known-bugs');
  if (fs.existsSync(bugRoot) && exists('doc/_indexes/by-bug.md')) {
    const index = read('doc/_indexes/by-bug.md');
    const localIndex = exists('doc/prod/known-bugs/INDEX.md') ? read('doc/prod/known-bugs/INDEX.md') : '';
    for (const entry of fs.readdirSync(bugRoot, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.startsWith('BUG-') && !entry.name.includes('template') && !index.includes(entry.name)) {
        add('P1', 'bug-missing-from-index', `Known bug is not referenced in by-bug index: ${entry.name}`, 'doc/_indexes/by-bug.md');
      }
      if (entry.isFile() && entry.name.startsWith('BUG-') && !entry.name.includes('template') && !localIndex.includes(entry.name)) {
        add('P1', 'bug-missing-from-local-index', `Known bug is not referenced in local known-bugs INDEX: ${entry.name}`, 'doc/prod/known-bugs/INDEX.md');
      }
    }
  }

  const riskRoot = path.join(root, 'doc/prod/structural-risks');
  if (fs.existsSync(riskRoot) && exists('doc/_indexes/by-risk.md')) {
    const index = read('doc/_indexes/by-risk.md');
    const localIndex = exists('doc/prod/structural-risks/INDEX.md') ? read('doc/prod/structural-risks/INDEX.md') : '';
    for (const entry of fs.readdirSync(riskRoot, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.startsWith('RISK-') && !entry.name.includes('template') && !index.includes(entry.name)) {
        add('P1', 'risk-missing-from-index', `Structural risk is not referenced in by-risk index: ${entry.name}`, 'doc/_indexes/by-risk.md');
      }
      if (entry.isFile() && entry.name.startsWith('RISK-') && !entry.name.includes('template') && !localIndex.includes(entry.name)) {
        add('P1', 'risk-missing-from-local-index', `Structural risk is not referenced in local structural-risks INDEX: ${entry.name}`, 'doc/prod/structural-risks/INDEX.md');
      }
    }
  }

  const watchRoot = path.join(root, 'doc/prod/watchlist');
  if (fs.existsSync(watchRoot) && exists('doc/prod/watchlist/INDEX.md')) {
    const localIndex = read('doc/prod/watchlist/INDEX.md');
    for (const entry of fs.readdirSync(watchRoot, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.startsWith('WATCH-') && !entry.name.includes('template') && !localIndex.includes(entry.name)) {
        add('P1', 'watch-missing-from-local-index', `Watchlist item is not referenced in local watchlist INDEX: ${entry.name}`, 'doc/prod/watchlist/INDEX.md');
      }
    }
  }

  const playbookRoot = path.join(root, 'doc/prod/root-cause-playbooks');
  if (fs.existsSync(playbookRoot) && exists('doc/prod/root-cause-playbooks/INDEX.md')) {
    const localIndex = read('doc/prod/root-cause-playbooks/INDEX.md');
    for (const entry of fs.readdirSync(playbookRoot, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.startsWith('PLAYBOOK-') && !entry.name.includes('template') && !localIndex.includes(entry.name)) {
        add('P1', 'playbook-missing-from-local-index', `Root-cause playbook is not referenced in local playbook INDEX: ${entry.name}`, 'doc/prod/root-cause-playbooks/INDEX.md');
      }
    }
  }
}

function checkCorpusState() {
  if (!exists('doc/_meta/corpus-state.yaml')) return;
  const state = parseSimpleYamlMap(read('doc/_meta/corpus-state.yaml'));
  const corpus = state.corpus || {};
  if (corpus.indexes_initialized === true) {
    const indexFiles = walk(path.join(root, 'doc/_indexes')).filter((file) => file.endsWith('.md'));
    if (indexFiles.length === 0) add('P1', 'state-indexes-missing', 'corpus-state says indexes are initialized, but no index files exist', 'doc/_meta/corpus-state.yaml');
  }
  if (corpus.first_code_pass_done === true) {
    for (const file of ['doc/_meta/repository-map.yaml', 'doc/_meta/source-inventory.md']) {
      if (!exists(file)) add('P1', 'state-code-pass-artifact-missing', `first_code_pass_done=true but ${file} is missing`, 'doc/_meta/corpus-state.yaml');
    }
  }
  if (corpus.first_prod_pass_done === true || corpus.prod_discovery_status === 'done') {
    const snapshotDir = path.join(root, 'doc/prod/snapshots');
    const snapshots = fs.existsSync(snapshotDir)
      ? fs.readdirSync(snapshotDir).filter((name) => /production-discovery\.md$/.test(name))
      : [];
    if (snapshots.length === 0) add('P1', 'state-prod-snapshot-missing', 'Production discovery is marked done, but no production discovery snapshot exists', 'doc/_meta/corpus-state.yaml');
  }
  if (corpus.operating_mode === 'continuous_enrichment') {
    for (const file of ['doc/_roadmap/CORPUS_ROADMAP.yaml', 'doc/_roadmap/ROADMAP_STATE.md', 'doc/_runs/RUN_LEDGER.md']) {
      if (!exists(file)) add('P0', 'continuous-enrichment-artifact-missing', `operating_mode=continuous_enrichment but ${file} is missing`, 'doc/_meta/corpus-state.yaml');
    }
  }
}

// Detects backward drift: artefacts have advanced on disk but corpus-state.yaml
// is still stuck on a pre-advance value (false, null, not_started, skeleton,
// initialized, empty {}). Complementary to checkCorpusState above, which only
// catches the inverse case ("state claims yes, artefact missing"). Backward
// drift is the slow-staleness pattern observed on real corpora.
function checkCorpusStateBackwardDrift() {
  if (!exists('doc/_meta/corpus-state.yaml')) return;
  const stateText = read('doc/_meta/corpus-state.yaml');
  const state = parseSimpleYamlMap(stateText);
  const corpus = state.corpus || {};
  const inventory = state.corpus_inventory || {};

  const isNotStarted = (v) => v == null || v === false || v === '' || v === 'not_started';
  const isSkeleton = (v) => v === 'skeleton' || v === 'initialized' || isNotStarted(v);

  if (corpus.indexes_initialized !== true) {
    const indexDir = path.join(root, 'doc/_indexes');
    if (fs.existsSync(indexDir)) {
      // `by-source.md` ships with 2 template seed rows in the pack — exclude it
      // from the populated count so the pack template itself doesn't trigger.
      const populated = walk(indexDir)
        .filter((file) => file.endsWith('.md') && path.basename(file) !== 'by-source.md')
        .filter((file) => countMarkdownTableRows(fs.readFileSync(file, 'utf8')) > 1);
      if (populated.length >= 1) {
        add('P1', 'corpus-state-backward-drift-indexes', `${populated.length} index file(s) under doc/_indexes/ have data rows, but corpus.indexes_initialized is ${corpus.indexes_initialized ?? 'unset'}`, 'doc/_meta/corpus-state.yaml');
      }
    }
  }

  if (corpus.first_code_pass_done !== true) {
    // repository-map.yaml ships in the pack with name: "unknown" as a template;
    // only flag once it has been populated with a real repository name.
    if (exists('doc/_meta/repository-map.yaml')) {
      const repoMap = read('doc/_meta/repository-map.yaml');
      if (!/name:\s*['"]?unknown['"]?/i.test(repoMap) && /name:\s*['"]?[^'"\s]+['"]?/i.test(repoMap)) {
        add('P1', 'corpus-state-backward-drift-code-pass', `doc/_meta/repository-map.yaml has been populated with a real repository name, but corpus.first_code_pass_done is ${corpus.first_code_pass_done ?? 'unset'}`, 'doc/_meta/corpus-state.yaml');
      }
    } else if (exists('doc/_meta/source-inventory.md')) {
      add('P1', 'corpus-state-backward-drift-code-pass', `doc/_meta/source-inventory.md exists, but corpus.first_code_pass_done is ${corpus.first_code_pass_done ?? 'unset'}`, 'doc/_meta/corpus-state.yaml');
    }
  }

  if (exists('doc/_meta/code-pipeline-state.yaml')) {
    const pipe = parseSimpleYamlMap(read('doc/_meta/code-pipeline-state.yaml')).pipeline || {};
    const overall = pipe.overall_status;
    const stateCode = corpus.code_analysis_status;
    if (overall === 'covered' && stateCode !== 'covered') {
      add('P0', 'corpus-state-backward-drift-code-analysis', `code-pipeline-state.yaml pipeline.overall_status=covered, but corpus.code_analysis_status=${stateCode ?? 'unset'}`, 'doc/_meta/corpus-state.yaml');
    } else if (['started', 'partial', 'in_progress', 'deep'].includes(overall) && isNotStarted(stateCode)) {
      add('P1', 'corpus-state-backward-drift-code-analysis', `code-pipeline-state.yaml pipeline.overall_status=${overall}, but corpus.code_analysis_status=${stateCode ?? 'unset'}`, 'doc/_meta/corpus-state.yaml');
    }
  }

  if (isNotStarted(corpus.brick_inventory_status) && exists('doc/_meta/brick-inventory.yaml')) {
    const briText = read('doc/_meta/brick-inventory.yaml');
    if (/^\s*-\s+/m.test(briText) || /bricks:\s*\n\s+-/.test(briText)) {
      add('P1', 'corpus-state-backward-drift-brick-inventory', `doc/_meta/brick-inventory.yaml has entries, but corpus.brick_inventory_status=${corpus.brick_inventory_status ?? 'unset'}`, 'doc/_meta/corpus-state.yaml');
    }
  }

  if (isSkeleton(corpus.roadmap_status) && exists('doc/_roadmap/CORPUS_ROADMAP.yaml')) {
    const nodeCount = yamlTopLevelListCount('doc/_roadmap/CORPUS_ROADMAP.yaml', 'nodes');
    if (nodeCount >= 2) {
      add('P1', 'corpus-state-backward-drift-roadmap', `CORPUS_ROADMAP.yaml has ${nodeCount} nodes, but corpus.roadmap_status=${corpus.roadmap_status ?? 'unset'}`, 'doc/_meta/corpus-state.yaml');
    }
  }

  if (isSkeleton(corpus.graph_status) && exists('doc/_graph/nodes.yaml')) {
    const graphText = read('doc/_graph/nodes.yaml');
    const nodeEntries = (graphText.match(/^\s+-\s+(id|name):/gm) || []).length;
    if (nodeEntries >= 2) {
      add('P1', 'corpus-state-backward-drift-graph', `doc/_graph/nodes.yaml has ${nodeEntries} entries, but corpus.graph_status=${corpus.graph_status ?? 'unset'}`, 'doc/_meta/corpus-state.yaml');
    }
  }

  if (exists('doc/_runs/RUN_LEDGER.md')) {
    // Count rows that actually carry content (at least one non-empty cell).
    // The pack template ships a placeholder row `| | | | | | | |` that must
    // not be counted as a real run entry.
    const ledgerLines = read('doc/_runs/RUN_LEDGER.md').split(/\r?\n/);
    const ledgerRows = ledgerLines.filter((line) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith('|')) return false;
      if (/^\|\s*-+/.test(trimmed)) return false;
      const cells = trimmed.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      if (cells.every((c) => c === '')) return false;
      // skip the header row (cells that look like a header — all letters or words like Date/Run/Intent)
      if (cells.length >= 4 && cells.every((c) => /^[A-Za-z][A-Za-z _-]*$/.test(c))) return false;
      return true;
    }).length;
    if (ledgerRows >= 1 && (corpus.last_continuous_run == null || corpus.last_continuous_run === '')) {
      add('P1', 'corpus-state-backward-drift-last-run', `doc/_runs/RUN_LEDGER.md has ${ledgerRows} real run entries, but corpus.last_continuous_run is null`, 'doc/_meta/corpus-state.yaml');
    }
    if (corpus.last_continuous_run && typeof corpus.last_continuous_run === 'string') {
      const lastRunTs = Date.parse(corpus.last_continuous_run);
      if (Number.isFinite(lastRunTs)) {
        const ledgerMtime = fs.statSync(path.join(root, 'doc/_runs/RUN_LEDGER.md')).mtimeMs;
        const driftDays = (ledgerMtime - lastRunTs) / (1000 * 60 * 60 * 24);
        if (driftDays > 2) {
          add('P1', 'corpus-state-backward-drift-last-run-stale', `RUN_LEDGER.md was modified ~${Math.round(driftDays)} day(s) after corpus.last_continuous_run (${corpus.last_continuous_run}); corpus-state is behind the ledger`, 'doc/_meta/corpus-state.yaml');
        }
      }
    }
  }

  if (isNotStarted(corpus.prod_discovery_status) && corpus.first_prod_pass_done !== true) {
    const snapDir = path.join(root, 'doc/prod/snapshots');
    if (fs.existsSync(snapDir)) {
      const snaps = fs.readdirSync(snapDir).filter((name) => /production-discovery\.md$/.test(name));
      if (snaps.length > 0) {
        add('P1', 'corpus-state-backward-drift-prod-discovery', `${snaps.length} production-discovery snapshot(s) under doc/prod/snapshots/, but corpus.prod_discovery_status=${corpus.prod_discovery_status ?? 'unset'} and first_prod_pass_done=${corpus.first_prod_pass_done ?? 'unset'}`, 'doc/_meta/corpus-state.yaml');
      }
    }
  }

  // corpus_inventory entries — raw-text check because parseSimpleYamlMap does not handle {} as empty object
  const inventoryChecks = [
    { key: 'bugs', dir: 'doc/prod/known-bugs', prefix: 'BUG-' },
    { key: 'risks', dir: 'doc/prod/structural-risks', prefix: 'RISK-' },
  ];
  for (const { key, dir, prefix } of inventoryChecks) {
    const dirAbs = path.join(root, dir);
    if (!fs.existsSync(dirAbs)) continue;
    const files = fs.readdirSync(dirAbs).filter((name) => name.startsWith(prefix) && name.endsWith('.md') && !name.toLowerCase().includes('template') && name !== 'INDEX.md');
    if (files.length === 0) continue;
    const emptyRe = new RegExp(`^\\s+${key}:\\s*\\{\\}\\s*$`, 'm');
    if (emptyRe.test(stateText)) {
      add('P1', `corpus-state-backward-drift-inventory-${key}`, `${files.length} ${prefix}*.md file(s) under ${dir}/, but corpus_inventory.${key} is empty ({})`, 'doc/_meta/corpus-state.yaml');
    }
  }
}

function checkRoadmapGraph() {
  if (!exists('doc/_roadmap/CORPUS_ROADMAP.yaml')) return;
  const roadmapText = read('doc/_roadmap/CORPUS_ROADMAP.yaml');
  if (!/mode:\s*continuous_enrichment/.test(roadmapText)) {
    add('P1', 'roadmap-mode-missing', 'CORPUS_ROADMAP.yaml should declare mode: continuous_enrichment', 'doc/_roadmap/CORPUS_ROADMAP.yaml');
  }
  if (!/interest_to_continue:\s*(10|[0-9])/.test(roadmapText)) {
    add('P1', 'roadmap-interest-missing', 'Roadmap has no interest_to_continue score', 'doc/_roadmap/CORPUS_ROADMAP.yaml');
  }
  if (!/interest_justification:/.test(roadmapText)) {
    add('P1', 'roadmap-interest-justification-missing', 'Roadmap interest score has no justification', 'doc/_roadmap/CORPUS_ROADMAP.yaml');
  }
  const graphFiles = ['doc/_graph/nodes.yaml', 'doc/_graph/edges.yaml', 'doc/_graph/evidence.yaml'];
  for (const file of graphFiles) {
    if (!exists(file)) continue;
    const text = read(file);
    if (!/graph:\s*\n/.test(text)) add('P1', 'graph-root-missing', `${file} should contain a graph root`, file);
  }
}

function countMarkdownTableRows(text) {
  return text.split(/\r?\n/).filter((line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) return false;
    if (/^\|\s*-+/.test(trimmed)) return false;
    return true;
  }).length;
}

function hasMarkdownDataRows(relPath) {
  if (!exists(relPath)) return false;
  return countMarkdownTableRows(read(relPath)) > 1;
}

function yamlTopLevelListCount(relPath, key) {
  if (!exists(relPath)) return 0;
  const lines = read(relPath).split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `${key}:`);
  if (start === -1) return 0;
  const keyIndent = lines[start].match(/^\s*/)[0].length;
  let count = 0;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const indent = line.match(/^\s*/)[0].length;
    if (indent <= keyIndent) break;
    if (indent === keyIndent + 2 && line.trim().startsWith('- ')) count += 1;
  }
  return count;
}

function stateClaimsStrongAdoption(state) {
  const corpus = state.corpus || {};
  const adoption = state.adoption || {};
  const maturityLevel = typeof corpus.maturity_level === 'number' ? corpus.maturity_level : Number(corpus.maturity_level || 0);
  const adoptionStage = typeof adoption.maturity_stage === 'number' ? adoption.maturity_stage : Number(adoption.maturity_stage || 0);
  return (
    maturityLevel >= 4 ||
    adoptionStage >= 4 ||
    corpus.actionable_readiness_status === 'covered' ||
    corpus.phase === 'actionable_corpus_ready' ||
    corpus.phase === 'adoption_ready' ||
    adoption.readiness_status === 'adoption_candidate' ||
    adoption.readiness_status === 'adoption_ready'
  );
}

function checkCatalogIndexSync(indexRel, sourceRel, label, severity = 'P0') {
  if (!exists(indexRel) || !exists(sourceRel)) return;
  if (hasMarkdownDataRows(sourceRel) && !hasMarkdownDataRows(indexRel)) {
    add(severity, 'catalog-index-empty', `${indexRel} is empty while ${sourceRel} contains ${label}; navigation is not initialized`, indexRel);
  }
}

function checkPostKickstartCompleteness() {
  if (!exists('doc/_meta/corpus-state.yaml')) return;
  const state = parseSimpleYamlMap(read('doc/_meta/corpus-state.yaml'));
  const corpus = state.corpus || {};
  const codeCovered = corpus.code_analysis_status === 'covered';
  const strongAdoptionClaim = stateClaimsStrongAdoption(state);
  const strictSeverity = strongAdoptionClaim ? 'P0' : 'P1';

  if (codeCovered || strongAdoptionClaim) {
    const requiredIndexes = [
      'doc/_indexes/by-feature.md',
      'doc/_indexes/by-component.md',
      'doc/_indexes/by-technical-component.md',
      'doc/_indexes/by-api.md',
      'doc/_indexes/by-batch.md',
      'doc/_indexes/by-business-entity.md',
      'doc/_indexes/by-risk.md',
      'doc/_indexes/by-bug.md',
      'doc/_indexes/by-brick.md',
    ];
    for (const indexRel of requiredIndexes) {
      if (exists(indexRel) && !hasMarkdownDataRows(indexRel)) {
        add(strictSeverity, 'post-kickstart-empty-index', `${indexRel} is still an empty skeleton after the code baseline/adoption claim`, indexRel);
      }
    }

    checkCatalogIndexSync('doc/_indexes/by-api.md', 'doc/project/apis/CATALOG.md', 'APIs', strictSeverity);
    checkCatalogIndexSync('doc/_indexes/by-business-entity.md', 'doc/project/domain/ENTITIES.md', 'domain entities', strictSeverity);
    checkCatalogIndexSync('doc/_indexes/by-component.md', 'doc/project/architecture/MODULES.md', 'components/modules', strictSeverity);
    checkCatalogIndexSync('doc/_indexes/by-batch.md', 'doc/project/batchs/README.md', 'batches/jobs', strictSeverity);

    if (exists('doc/_meta/repository-map.yaml')) {
      const map = read('doc/_meta/repository-map.yaml');
      if (/\bname:\s*["']?unknown["']?/.test(map) || /\bdescription:\s*["']?unknown["']?/.test(map)) {
        add(strictSeverity, 'repository-map-still-unknown', 'repository-map.yaml still contains unknown name/description after code baseline/adoption claim', 'doc/_meta/repository-map.yaml');
      }
    }

    if (exists('doc/_meta/coverage-matrix.md') && /\|\s*[^|]+\s*\|\s*empty\s*\|/i.test(read('doc/_meta/coverage-matrix.md'))) {
      add(strictSeverity, 'coverage-matrix-still-empty', 'coverage-matrix.md still has empty rows after code baseline/adoption claim', 'doc/_meta/coverage-matrix.md');
    }

    if (exists('doc/_meta/discovery-coverage.md') && /repository[^\n|]*\|\s*not_started\b/i.test(read('doc/_meta/discovery-coverage.md'))) {
      add(strictSeverity, 'repository-discovery-not-started-after-code-covered', 'discovery-coverage.md still marks repository discovery not_started while code baseline/adoption is claimed', 'doc/_meta/discovery-coverage.md');
    }

    if (exists('doc/_meta/source-inventory.md')) {
      const sourceInventory = read('doc/_meta/source-inventory.md');
      const rows = countMarkdownTableRows(sourceInventory);
      if (rows <= 2 || /Repository files[^\n]+\|\s*unknown\s*\|/i.test(sourceInventory)) {
        add(strictSeverity, 'source-inventory-too-thin', 'source-inventory.md is still too thin or marks repository confidence unknown after code baseline/adoption claim', 'doc/_meta/source-inventory.md');
      }
    }
  }

  if (strongAdoptionClaim) {
    const nodeCount = yamlTopLevelListCount('doc/_graph/nodes.yaml', 'nodes');
    const edgeCount = yamlTopLevelListCount('doc/_graph/edges.yaml', 'edges');
    const evidenceCount = yamlTopLevelListCount('doc/_graph/evidence.yaml', 'evidence');
    if (nodeCount <= 1 || edgeCount <= 1 || evidenceCount <= 1) {
      add('P0', 'adoption-claim-with-skeleton-graph', `Strong adoption/readiness is claimed but graph is still skeleton (nodes=${nodeCount}, edges=${edgeCount}, evidence=${evidenceCount})`, 'doc/_graph/nodes.yaml');
    }
    if (exists('doc/_roadmap/CORPUS_ROADMAP.yaml')) {
      const roadmapNodes = yamlTopLevelListCount('doc/_roadmap/CORPUS_ROADMAP.yaml', 'nodes');
      if (roadmapNodes <= 1) {
        add('P0', 'adoption-claim-with-skeleton-roadmap', `Strong adoption/readiness is claimed but roadmap has only ${roadmapNodes} node(s)`, 'doc/_roadmap/CORPUS_ROADMAP.yaml');
      }
    }
    if (exists('doc/_meta/actionable-readiness.md')) {
      const readiness = read('doc/_meta/actionable-readiness.md');
      if (/\|\s*Indexes populated\s*\|\s*(not_started|partial|blocked)/i.test(readiness)) {
        add('P0', 'adoption-claim-with-index-gate-open', 'Actionable/adoption readiness is claimed while actionable-readiness.md says indexes are not covered', 'doc/_meta/actionable-readiness.md');
      }
      if (/\|\s*(developer|functional-analyst|reliability-analyst)\s*\|[^|\n]+\|\s*(not_started|partial|blocked)/i.test(readiness)) {
        add('P0', 'adoption-claim-with-agent-readiness-open', 'Actionable/adoption readiness is claimed while at least one agent task readiness row is not covered', 'doc/_meta/actionable-readiness.md');
      }
    }
  }
}

function checkUnknowns() {
  const metadataFiles = ['doc/_meta/app-profile.yaml', 'doc/_meta/corpus-state.yaml', 'doc/_meta/information-sources.yaml'];
  const openQuestions = exists('doc/_meta/open-questions.md') ? read('doc/_meta/open-questions.md') : '';
  for (const file of metadataFiles) {
    if (!exists(file)) continue;
    const content = read(file);
    const unknownCount = (content.match(/\bunknown\b/g) || []).length;
    if (unknownCount > 0 && !/unknown|TBD|question|open/i.test(openQuestions)) {
      add('P2', 'unknowns-not-reflected-in-open-questions', `${file} contains ${unknownCount} unknown value(s), but open questions do not appear to track unknowns`, file);
    }
  }
}

const PIPELINE_PASSES = [
  { key: 'p1_tree_inventory', label: 'P1 code-tree-inventory', artifacts: ['doc/_meta/code-inventory.yaml', 'doc/_meta/code-inventory.md'] },
  {
    key: 'p2_logical_boundaries',
    label: 'P2 logical-boundaries',
    artifacts: ['doc/_meta/logical-boundaries.yaml', 'doc/project/architecture/MODULES.md', 'doc/project/architecture/ARCH_STYLE.md'],
    diagrams: ['doc/project/architecture/diagrams/modules-deps.md', 'doc/project/architecture/diagrams/layers.md', 'doc/project/architecture/diagrams/arch-style.md'],
  },
  { key: 'p3_feature_candidates', label: 'P3 feature-candidates', artifacts: ['doc/_meta/feature-candidates.yaml'] },
  { key: 'p4_feature_silo_deep_dive', label: 'P4 feature-silo-deep-dive', artifacts: [] },
  {
    key: 'p5_cross_cutting_extraction',
    label: 'P5 cross-cutting-extraction',
    artifacts: ['doc/_meta/cross-cutting-state.yaml', 'doc/project/apis/CATALOG.md', 'doc/project/domain/ENTITIES.md', 'doc/project/architecture/INTEGRATION_MAP.md', 'doc/project/services/MESSAGING.md', 'doc/project/architecture/PERSISTENCE.md', 'doc/project/technical/CROSS_CUTTING.md'],
    diagrams: ['doc/project/architecture/diagrams/integration-context.md', 'doc/project/architecture/diagrams/integration-flow.md', 'doc/project/architecture/diagrams/messaging-topology.md', 'doc/project/architecture/diagrams/domain-er.md', 'doc/project/architecture/diagrams/persistence.md'],
  },
  { key: 'p6_code_style_naming', label: 'P6 code-style-naming', artifacts: ['doc/_meta/code-style-state.yaml', 'doc/project/technical/CODE_STYLE.md', 'doc/project/technical/NAMING_CONVENTIONS.md'] },
  { key: 'p7_structural_issues', label: 'P7 structural-issues', artifacts: ['doc/_meta/structural-issues.yaml', 'doc/project/technical/STRUCTURAL_ISSUES.md'] },
  { key: 'p8_code_maturity', label: 'P8 code-maturity', artifacts: ['doc/_meta/code-maturity.yaml', 'doc/_meta/code-maturity.md'] },
  { key: 'p9_code_reconciliation_gate', label: 'P9 code-reconciliation-gate', artifacts: ['doc/_meta/reconciliation-ledger.yaml'] },
];

function fileContainsMermaid(relPath) {
  if (!exists(relPath)) return false;
  return /```\s*mermaid/.test(read(relPath));
}

const generatedDirs = new Set([
  'node_modules', 'vendor', 'target', 'build', 'dist', 'out', 'bin', 'obj',
  '__pycache__', '.next', '.nuxt', 'coverage', '.gradle',
]);
const vcsDirs = new Set(['.git', '.svn', '.hg']);
const packDirs = ['doc', '.github/skills', '.github/agents', '.github/templates'];

function isInsideRel(relPath, dir) {
  return relPath === dir || relPath.startsWith(`${dir}/`);
}

function shouldExcludeFromInventory(relPath) {
  const base = path.basename(relPath);
  if (vcsDirs.has(base)) return true;
  if (generatedDirs.has(base)) return true;
  return packDirs.some((dir) => isInsideRel(relPath, dir));
}

function countInventoryFilesystem(absDir = root) {
  let files = 0;
  let directories = 0;
  function visit(dir) {
    const dirRel = rel(dir);
    if (dirRel && shouldExcludeFromInventory(dirRel)) return;
    directories += 1;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      const entryRel = rel(abs);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) visit(abs);
      else if (!shouldExcludeFromInventory(entryRel)) files += 1;
    }
  }
  visit(absDir);
  return { files, directories };
}

function extractNumberAfterKey(text, key) {
  const match = text.match(new RegExp(`${key}:\\s*["']?(\\d+)["']?`));
  return match ? Number(match[1]) : null;
}

function readPipelineState() {
  if (!exists('doc/_meta/code-pipeline-state.yaml')) return null;
  const parsed = parseSimpleYamlMap(read('doc/_meta/code-pipeline-state.yaml'));
  return parsed.pipeline || null;
}

function yamlListHasEntries(text, key) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => new RegExp(`^${key}:\\s*(\\[\\])?\\s*$`).test(line.trim()));
  if (start === -1) return false;
  if (/\[\]/.test(lines[start])) return false;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    if (/^\S/.test(line)) break;
    if (/^\s*-\s+/.test(line)) return true;
  }
  return false;
}

function checkCodeAnalysisPipeline() {
  if (!exists('doc/_meta/code-pipeline-state.yaml')) {
    add('P1', 'code-pipeline-state-missing', 'doc/_meta/code-pipeline-state.yaml is missing — required for P1→P9 code analysis tracking', 'doc/_meta/code-pipeline-state.yaml');
    return;
  }
  const pipeline = readPipelineState();
  if (!pipeline) {
    add('P1', 'code-pipeline-state-empty', 'doc/_meta/code-pipeline-state.yaml exists but has no `pipeline:` block', 'doc/_meta/code-pipeline-state.yaml');
    return;
  }
  const passStatuses = {};
  for (const pass of PIPELINE_PASSES) {
    const node = pipeline[pass.key];
    const status = node && typeof node === 'object' ? node.status : null;
    passStatuses[pass.key] = status || 'not_started';
    if (status === 'covered') {
      for (const artifact of pass.artifacts) {
        if (!exists(artifact)) {
          add('P1', 'code-pipeline-artifact-missing', `${pass.label} marked covered but artifact is missing: ${artifact}`, 'doc/_meta/code-pipeline-state.yaml', artifact);
        }
      }
      for (const diagram of pass.diagrams || []) {
        if (!exists(diagram)) {
          add('P0', 'code-pipeline-diagram-missing', `${pass.label} marked covered but mandatory diagram is missing: ${diagram}`, 'doc/_meta/code-pipeline-state.yaml', diagram);
        } else if (!fileContainsMermaid(diagram)) {
          add('P0', 'code-pipeline-diagram-empty', `${pass.label} diagram exists but contains no mermaid block: ${diagram}`, diagram);
        }
      }
    }
  }
  for (let i = 1; i < PIPELINE_PASSES.length; i++) {
    const prev = PIPELINE_PASSES[i - 1];
    const cur = PIPELINE_PASSES[i];
    if (passStatuses[cur.key] === 'covered' && passStatuses[prev.key] !== 'covered') {
      add('P0', 'code-pipeline-out-of-order', `${cur.label} is covered but ${prev.label} is ${passStatuses[prev.key]} (passes must be covered in order)`, 'doc/_meta/code-pipeline-state.yaml');
    }
  }
  const overall = pipeline.overall_status;
  const allCovered = PIPELINE_PASSES.every((pass) => passStatuses[pass.key] === 'covered');
  if (overall === 'covered' && !allCovered) {
    add('P0', 'code-pipeline-overall-mismatch', 'pipeline.overall_status is covered but not all P1→P9 passes are covered', 'doc/_meta/code-pipeline-state.yaml');
  }
  const p1Covered = passStatuses.p1_tree_inventory === 'covered';
  if (p1Covered && exists('doc/_meta/code-inventory.yaml')) {
    const inventoryText = read('doc/_meta/code-inventory.yaml');
    const measuredFiles = extractNumberAfterKey(inventoryText, 'total_files_inventoried');
    const measuredDirs = extractNumberAfterKey(inventoryText, 'total_directories_inventoried');
    const current = countInventoryFilesystem();
    if (!/generator:\s*["']?scripts\/inventory-repo\.mjs["']?/.test(inventoryText)) {
      add('P1', 'p1-inventory-generator-missing', 'P1 is covered but code-inventory.yaml does not identify scripts/inventory-repo.mjs as the generator', 'doc/_meta/code-inventory.yaml');
    }
    if (measuredFiles !== null && measuredFiles !== current.files) {
      add('P0', 'p1-inventory-file-count-stale', `P1 is covered but inventory file count (${measuredFiles}) does not match current filesystem count (${current.files}) under default inventory exclusions`, 'doc/_meta/code-inventory.yaml');
    }
    if (measuredDirs !== null && measuredDirs !== current.directories) {
      add('P1', 'p1-inventory-directory-count-stale', `P1 directory count (${measuredDirs}) does not match current filesystem count (${current.directories}) under default inventory exclusions`, 'doc/_meta/code-inventory.yaml');
    }
  }
}

function checkFeatureCandidatesProcessed() {
  if (!exists('doc/_meta/feature-candidates.yaml')) return;
  const pipeline = readPipelineState();
  const p4 = pipeline && pipeline.p4_feature_silo_deep_dive;
  if (!p4 || p4.status !== 'covered') return;
  const featureRoot = path.join(root, 'doc/project/features');
  if (!fs.existsSync(featureRoot)) return;
  const expected = ['README.md', 'ARCHITECTURE.md', 'WORKFLOWS.md', 'BUSINESS_RULES.md', 'OPERATIONS.md', 'AI_AGENT_GUIDE.md'];
  for (const entry of fs.readdirSync(featureRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('_')) continue;
    const readmeRel = `doc/project/features/${entry.name}/README.md`;
    if (!exists(readmeRel)) continue;
    const fm = frontmatter(read(readmeRel));
    if (fm.status === 'candidate') {
      add('P0', 'p4-incomplete-candidate', `P4 marked covered but feature still has status: candidate — ${entry.name}`, readmeRel);
    }
    if (fm.status === 'documented' || fm.status === 'active') {
      for (const file of expected) {
        const relPath = `doc/project/features/${entry.name}/${file}`;
        if (!exists(relPath)) {
          add('P0', 'p4-documented-feature-missing-file', `Feature ${entry.name} is documented but ${file} is missing (P4 non-stub bar)`, relPath);
        }
      }
      const archRel = `doc/project/features/${entry.name}/ARCHITECTURE.md`;
      const workflowsRel = `doc/project/features/${entry.name}/WORKFLOWS.md`;
      if (exists(archRel) && !fileContainsMermaid(archRel)) {
        add('P0', 'p4-feature-arch-diagram-missing', `Feature ${entry.name}/ARCHITECTURE.md has no mermaid component diagram (P4 mandates one)`, archRel);
      }
      if (exists(workflowsRel) && !fileContainsMermaid(workflowsRel)) {
        add('P0', 'p4-feature-workflow-diagram-missing', `Feature ${entry.name}/WORKFLOWS.md has no mermaid sequence diagram (P4 mandates one)`, workflowsRel);
      }
      const interviewRel = `doc/_meta/code-interview/${entry.name}.md`;
      const evidenceRel = `doc/project/features/${entry.name}/_evidence.yaml`;
      const evidenceFm = exists(evidenceRel) ? parseSimpleYamlMap(read(evidenceRel)) : {};
      const evidenceText = exists(evidenceRel) ? read(evidenceRel) : '';
      if (!exists(evidenceRel)) {
        add('P0', 'p4-evidence-missing', `Feature ${entry.name} is documented but _evidence.yaml is missing`, evidenceRel);
      } else if (!yamlListHasEntries(evidenceText, 'files_read_in_silo')) {
        add('P0', 'p4-feature-no-silo-files-read', `P4 is covered but feature ${entry.name} has no files_read_in_silo entries; this is a structural map, not a deep dive`, evidenceRel);
      }
      const interviewSkipped = evidenceFm.interview && evidenceFm.interview.skipped === true;
      if (!exists(interviewRel) && !interviewSkipped) {
        add('P0', 'p4-interview-missing', `Feature ${entry.name} is documented but per-feature interview is missing (and not explicitly skipped in _evidence.yaml)`, interviewRel);
      }
      if (interviewSkipped && /\b(deferred|inferred|not read|low change frequency|standard .* pattern)\b/i.test(evidenceText)) {
        add('P1', 'p4-interview-skip-weak-reason', `Feature ${entry.name} skipped interview with a weak/deferred reason while P4 is covered`, evidenceRel);
      }
    }
  }
}

function checkCriticalIndexNonEmpty(file, sourceFile, code) {
  if (!exists(sourceFile) || !exists(file)) return;
  const source = read(sourceFile);
  const index = read(file);
  const sourceHasRows = source.split(/\r?\n/).filter((line) => /^\|/.test(line)).length > 2;
  const indexHasRows = index.split(/\r?\n/).filter((line) => /^\|/.test(line)).length > 2;
  if (sourceHasRows && !indexHasRows) {
    add('P0', code, `${file} is empty while ${sourceFile} contains catalog rows; actionable readiness requires navigation indexes`, file);
  }
}

function checkActionableReadinessGate() {
  if (!exists('doc/_meta/corpus-state.yaml')) return;
  const state = parseSimpleYamlMap(read('doc/_meta/corpus-state.yaml'));
  const corpus = state.corpus || {};
  const handover = state.handover || {};
  const actionableStatus = corpus.actionable_readiness_status;
  const handoverActiveStates = new Set(['ready_to_prepare', 'in_progress', 'started', 'ready', 'done', 'completed', 'active']);
  const handoverStarted = handover.status && handoverActiveStates.has(handover.status);
  if (handoverStarted && actionableStatus !== 'covered') {
    add('P0', 'handover-without-actionable-readiness', `handover.status=${handover.status}, but corpus.actionable_readiness_status is ${actionableStatus || 'unset'} (must be covered before team handover)`, 'doc/_meta/corpus-state.yaml');
  }
  if (actionableStatus === 'covered') {
    if (!exists('doc/_meta/brick-inventory.yaml')) {
      add('P0', 'actionable-readiness-missing-brick-inventory', 'Actionable readiness is covered but brick inventory is missing', 'doc/_meta/brick-inventory.yaml');
    } else if (!/status:\s*covered/.test(read('doc/_meta/brick-inventory.yaml'))) {
      add('P0', 'actionable-readiness-brick-inventory-not-covered', 'Actionable readiness is covered but brick inventory is not status: covered', 'doc/_meta/brick-inventory.yaml');
    }
    if (!exists('doc/_meta/actionable-readiness.md')) {
      add('P0', 'actionable-readiness-report-missing', 'Actionable readiness is covered but actionable-readiness.md is missing', 'doc/_meta/actionable-readiness.md');
    } else {
      const readiness = read('doc/_meta/actionable-readiness.md');
      if (!/(adoption_ready|handover_ready|actionable_for_priority_scope)/.test(readiness)) {
        add('P0', 'actionable-readiness-conclusion-missing', 'Actionable readiness is covered but the report does not state adoption_ready/actionable_for_priority_scope', 'doc/_meta/actionable-readiness.md');
      }
      if (/\|\s*(critical|high)\s*\|\s*\d+\s*\|\s*0\s*\|/.test(readiness)) {
        add('P0', 'actionable-readiness-no-critical-high-actionable', 'Actionable readiness is covered but critical/high brick metrics show zero actionable bricks', 'doc/_meta/actionable-readiness.md');
      }
    }
    checkCriticalIndexNonEmpty('doc/_indexes/by-api.md', 'doc/project/apis/CATALOG.md', 'actionable-empty-api-index');
    checkCriticalIndexNonEmpty('doc/_indexes/by-business-entity.md', 'doc/project/domain/ENTITIES.md', 'actionable-empty-entity-index');
    checkCriticalIndexNonEmpty('doc/_indexes/by-component.md', 'doc/project/architecture/MODULES.md', 'actionable-empty-component-index');
  }
}

function checkHandoverGate() {
  if (!exists('doc/_meta/corpus-state.yaml')) return;
  const state = parseSimpleYamlMap(read('doc/_meta/corpus-state.yaml'));
  const corpus = state.corpus || {};
  const handover = state.handover || {};
  const codeStatus = corpus.code_analysis_status;
  const handoverActiveStates = new Set(['in_progress', 'started', 'ready', 'done', 'completed', 'active']);
  const handoverStarted = handover.status && handoverActiveStates.has(handover.status);
  const handoverDir = path.join(root, 'doc/_handover');
  const activeHandoverFiles = [];
  if (fs.existsSync(handoverDir)) {
    for (const name of fs.readdirSync(handoverDir)) {
      if (!name.endsWith('.md') || name === 'README.md') continue;
      const fm = frontmatter(read(`doc/_handover/${name}`));
      if (fm.status && fm.status !== 'draft' && fm.status !== 'template') {
        activeHandoverFiles.push(name);
      }
    }
  }
  if ((handoverStarted || activeHandoverFiles.length > 0) && codeStatus !== 'covered') {
    const trigger = activeHandoverFiles.length > 0
      ? `${activeHandoverFiles.length} handover file(s) with non-draft status (${activeHandoverFiles.join(', ')})`
      : `handover.status=${handover.status}`;
    add('P0', 'handover-without-code-analysis', `${trigger}, but corpus.code_analysis_status is ${codeStatus || 'unset'} (must be covered before handover)`, 'doc/_meta/corpus-state.yaml');
  }
  if ((handoverStarted || activeHandoverFiles.length > 0) && corpus.actionable_readiness_status !== 'covered') {
    add('P0', 'handover-files-without-actionable-readiness', `Handover material is active, but corpus.actionable_readiness_status is ${corpus.actionable_readiness_status || 'unset'} (must be covered before handover)`, 'doc/_meta/corpus-state.yaml');
  }
  const adoptionStage = (state.adoption || {}).maturity_stage;
  if (typeof adoptionStage === 'number' && adoptionStage >= 3 && codeStatus !== 'covered') {
    add('P0', 'adoption-stage-without-code-analysis', `adoption.maturity_stage is ${adoptionStage} but code_analysis_status is ${codeStatus || 'unset'}`, 'doc/_meta/corpus-state.yaml');
  }
}

function checkCorpusScopeLeak() {
  // Detects the corpus agent leaking outside its scope: naming other agents,
  // pointing to authoring/development skills, or framing a finding as a
  // dispatch / hand-off. Observed in run-030 (May 2026) as a "Next action:
  // spec-sous678" while the corpus was in continuous_enrichment and the
  // handover gate was not passed.
  //
  // Patterns are conservative on purpose: each matches a recommendation /
  // hand-off context, not a benign mention. False positives here would
  // erode trust in the gate; missing a leak only delays detection by one run.
  const patterns = [
    // Structured "Next action: spec-..." or implementation/PR/ticket pointers
    [/^\s*Next\s+action\s*[:=]\s*(spec[-_]|implement[-_]|pr[-_]|jira[-_]|ticket[-_]|fix[-_])/im, 'leak-next-action-points-to-delivery'],
    // "Recommended next:" line pointing to an authoring/development skill name
    [/^\s*Recommended\s+next[^\n]*(spec-from-need|spec-writing|spec-completeness|implement-spec|jira-ticket-writing|pr-readiness|change-triage)/im, 'leak-recommended-next-names-delivery-skill'],
    // "Recommended next:" line dispatching to another agent
    [/^\s*Recommended\s+next[^\n]*\b(invoke|hand[ -]?off|dispatch|trigger|enchaîne[rz]?|delegate)\b[^\n]*\b(developer|functional[ -]?analyst|reliability[ -]?analyst)\b/im, 'leak-recommended-next-dispatches'],
    // Explicit hand-off / invoke patterns anywhere
    [/\bhand[ -]?off\s+to\s+`?(developer|functional[ -]?analyst|reliability[ -]?analyst)`?/i, 'leak-handoff-named'],
    [/\binvoke\s+`?(developer|functional[ -]?analyst|reliability[ -]?analyst)`?\s+(on|for|sur)\b/i, 'leak-invoke-named'],
    // Skill-path references inside corpus output files
    [/`?authoring\/(spec-|implement-|jira-ticket|incident-investigation|analyze-incident|reconciliation|scope-deepening)/i, 'leak-authoring-skill-path'],
    [/`?development\/(pr-readiness|change-triage|risk-analysis|verify-by-change|corpus-closeout)/i, 'leak-development-skill-path'],
    // Dispatch verbs paired with a finding in a recommendation context
    [/à\s+corriger\s+en\s+priorit[ée]/i, 'leak-corriger-en-priorite'],
    [/\bneeds?\s+fix\b/i, 'leak-needs-fix'],
    [/prioritaire\s+pour\s+`?(developer|functional[ -]?analyst|reliability[ -]?analyst)`?/i, 'leak-prioritaire-pour-agent'],
  ];

  const scanFiles = [];
  const nextBest = 'doc/_roadmap/NEXT_BEST_ACTIONS.md';
  if (exists(nextBest)) scanFiles.push(nextBest);
  const runLedger = 'doc/_runs/RUN_LEDGER.md';
  if (exists(runLedger)) scanFiles.push(runLedger);
  const runsDir = path.join(root, 'doc/_runs');
  if (isDirectory('doc/_runs')) {
    for (const entry of fs.readdirSync(runsDir)) {
      if (entry.endsWith('.md') && entry !== 'RUN_LEDGER.md' && entry !== 'README.md') {
        scanFiles.push(`doc/_runs/${entry}`);
      }
    }
  }

  for (const relPath of scanFiles) {
    let content;
    try {
      content = read(relPath);
    } catch {
      continue;
    }
    // Strip fenced code blocks — examples of forbidden wording inside
    // ```text ... ``` blocks are documentation, not actual emitted output.
    const stripped = content.replace(/```[\s\S]*?```/g, '');
    for (const [pattern, code] of patterns) {
      const match = stripped.match(pattern);
      if (match) {
        const snippet = match[0].slice(0, 120).replace(/\s+/g, ' ').trim();
        add('P0', code, `Corpus scope leak detected: corpus output mentions delivery / hand-off / non-corpus skill. Corpus must identify and capitalize, never dispatch.`, relPath, `match: "${snippet}"`);
      }
    }
  }
}

// Schema-drift lint: load every `schemas/*.schema.yaml` from the pack and apply
// it against its target YAML file. Findings emitted at P2 (informational) so
// existing corpora still pass; the goal is to nudge the next regeneration
// toward the canonical names without breaking handover gates today.
//
// The schema format is documented in schemas/README.md. Only the subset
// needed for the drift checks of today is implemented:
//   - `item.inside_block` scopes the lint to lines under that top-level key
//   - `item.nested_path` further scopes to a nested map under each item
//   - `item.forbidden_aliases: {variant: canonical}` flags `variant: VALUE`
//     when VALUE matches one of `item.enums.<canonical>` (or any non-empty
//     value when no enum is declared for `canonical`)
function loadSchemas() {
  const schemaDir = path.join(root, 'schemas');
  if (!fs.existsSync(schemaDir)) return [];
  return fs
    .readdirSync(schemaDir)
    .filter((f) => f.endsWith('.schema.yaml'))
    .map((f) => {
      const parsed = parseSimpleYamlMap(read(`schemas/${f}`));
      return { schemaFile: `schemas/${f}`, ...parsed };
    });
}

// Lint every markdown file under `file_glob:` against a frontmatter contract.
// Used by schemas with `file_kind: markdown-frontmatter`.
function lintFrontmatterContract(schema) {
  if (schema.file_kind !== 'markdown-frontmatter' || !schema.file_glob) return;
  const skillAnchor = schema.skill_anchor || `Schema: ${schema.schemaFile}`;
  const fm = schema.frontmatter || {};
  const required = (fm.required_fields && parseInlineList(fm.required_fields)) || [];
  const aliases = fm.forbidden_aliases || {};
  const enums = fm.enums || {};
  const idRegex = fm.id_regex ? new RegExp(fm.id_regex) : null;
  const filenameRegex = schema.filename_regex ? new RegExp(schema.filename_regex) : null;

  const files = findFilesByGlob(schema.file_glob);
  for (const abs of files) {
    const fileRel = rel(abs);
    const basename = path.basename(abs);

    // Filename convention
    if (filenameRegex && !filenameRegex.test(basename)) {
      add(
        'P2',
        `${path.basename(schema.schemaFile, '.schema.yaml')}-filename-violation`,
        `Filename \`${basename}\` does not match canonical regex \`${schema.filename_regex}\``,
        fileRel,
        `See ${skillAnchor}`,
      );
    }

    const text = fs.readFileSync(abs, 'utf8');
    if (!hasFrontmatter(text)) {
      // checkFrontmatter already reports missing frontmatter separately; skip
      continue;
    }
    const front = frontmatter(text);

    // Required fields present
    for (const field of required) {
      const v = front[field];
      const isEmpty =
        v === undefined
        || v === null
        || v === ''
        || (typeof v === 'object' && Object.keys(v).length === 0);
      if (isEmpty) {
        add(
          'P2',
          `${path.basename(schema.schemaFile, '.schema.yaml')}-missing-${field}`,
          `Required frontmatter field \`${field}:\` is missing or empty`,
          fileRel,
          `See ${skillAnchor}`,
        );
      }
    }

    // Forbidden aliases
    for (const [variant, canonical] of Object.entries(aliases)) {
      if (variant in front) {
        add(
          'P2',
          `${path.basename(schema.schemaFile, '.schema.yaml')}-alias-${variant}`,
          `Frontmatter uses \`${variant}:\` — canonical schema uses \`${canonical}:\``,
          fileRel,
          `See ${skillAnchor}`,
        );
      }
    }

    // Enum values
    for (const [field, allowedRaw] of Object.entries(enums)) {
      const allowed = parseInlineList(allowedRaw);
      const v = front[field];
      if (v == null || v === '' || typeof v === 'object') continue;
      if (!allowed.includes(String(v))) {
        add(
          'P2',
          `${path.basename(schema.schemaFile, '.schema.yaml')}-enum-${field}`,
          `Frontmatter \`${field}: ${v}\` is not in allowed values [${allowed.join(', ')}]`,
          fileRel,
          `See ${skillAnchor}`,
        );
      }
    }

    // ID regex
    if (idRegex && front.id && typeof front.id === 'string' && !idRegex.test(front.id)) {
      add(
        'P2',
        `${path.basename(schema.schemaFile, '.schema.yaml')}-id-regex`,
        `Frontmatter \`id: ${front.id}\` does not match canonical regex \`${schema.frontmatter.id_regex}\``,
        fileRel,
        `See ${skillAnchor}`,
      );
    }
  }
}

// Parse a value that may be either a JS array (already-parsed YAML inline list
// like `[a, b, c]`) or a comma-separated string.
function parseInlineList(v) {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === 'string') return v.split(',').map((s) => s.trim()).filter(Boolean);
  return [];
}

// Resolve a simple file glob `dir/prefix*.md` to absolute paths under root.
// Only supports a single `*` segment in the basename (which is all schemas need).
function findFilesByGlob(globRel) {
  const dir = path.dirname(globRel);
  const pattern = path.basename(globRel);
  const dirAbs = path.join(root, dir);
  if (!fs.existsSync(dirAbs)) return [];
  // Build a regex from the simple glob: `BUG-*.md` → /^BUG-.*\.md$/
  const re = new RegExp('^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
  return fs
    .readdirSync(dirAbs)
    .filter((n) => re.test(n))
    .filter((n) => !/(?:INDEX|README|template|TEMPLATE)\.md$/i.test(n))
    .map((n) => path.join(dirAbs, n));
}

function lintAgainstSchema(schema) {
  if (schema.file_kind === 'markdown-frontmatter') {
    lintFrontmatterContract(schema);
    return;
  }
  const targetRel = schema.file;
  if (!targetRel || !exists(targetRel)) return;
  const skillAnchor = schema.skill_anchor || `Schema: ${schema.schemaFile}`;
  const lines = read(targetRel).split(/\r?\n/);
  const seen = new Set();

  // -- 1. Item-level forbidden_aliases (lines indented ≥ 2 spaces) --
  const item = schema.item || {};
  const itemAliases = item.forbidden_aliases || {};
  const itemEnums = item.enums || {};

  for (const line of lines) {
    for (const [variant, canonical] of Object.entries(itemAliases)) {
      const code = `${path.basename(targetRel, '.yaml')}-schema-drift-${variant}`;
      if (seen.has(code)) continue;
      // Anchor on the canonical enum when available, otherwise any non-empty
      // value. Safe because variant names are indicative on their own.
      const enumValues = itemEnums[canonical];
      const valuePattern = enumValues && enumValues.length
        ? `(?:${enumValues.join('|')})\\b`
        : `\\S`;
      const re = new RegExp(`^\\s{2,}${variant}:\\s*${valuePattern}`);
      if (re.test(line)) {
        add(
          'P2',
          code,
          `\`${variant}:\` — canonical schema uses \`${canonical}:\``,
          targetRel,
          `See ${skillAnchor}`,
        );
        seen.add(code);
      }
    }
  }

  // -- 2. Root-level forbidden_aliases (lines at indent 0) --
  const root = schema.root || {};
  const rootAliases = root.forbidden_aliases || {};
  for (const line of lines) {
    for (const [variant, canonical] of Object.entries(rootAliases)) {
      const code = `${path.basename(targetRel, '.yaml')}-root-drift-${variant}`;
      if (seen.has(code)) continue;
      const re = new RegExp(`^${variant}:\\s*\\S?`);
      if (re.test(line)) {
        add(
          'P2',
          code,
          `Root key \`${variant}:\` — canonical schema uses \`${canonical}:\``,
          targetRel,
          `See ${skillAnchor}`,
        );
        seen.add(code);
      }
    }
  }

  // -- 3. id_regex on items: every `id: <value>` should match the schema regex --
  if (schema.id_regex) {
    const idRe = new RegExp(schema.id_regex);
    const code = `${path.basename(targetRel, '.yaml')}-id-regex-violation`;
    for (const line of lines) {
      if (seen.has(code)) break;
      const m = line.match(/^\s*-?\s*id:\s*["']?([^"'\s]+)/);
      if (m && !idRe.test(m[1])) {
        add(
          'P2',
          code,
          `Item id \`${m[1]}\` does not match canonical regex \`${schema.id_regex}\``,
          targetRel,
          `See ${skillAnchor}`,
        );
        seen.add(code);
      }
    }
  }
}

function checkSchemaDrift() {
  for (const schema of loadSchemas()) {
    lintAgainstSchema(schema);
  }

  // corpus-state.yaml: free-text `*_note:` fields under `corpus:` are journal
  // creep. The state file is read at session start to set direction — narrative
  // about what happened in a run belongs in `_runs/<date>-<topic>.md` or in
  // `corpus-changelog.md`, not as state fields. Flag once per file with a count.
  const stateRel = 'doc/_meta/corpus-state.yaml';
  if (exists(stateRel)) {
    const text = read(stateRel);
    const lines = text.split(/\r?\n/);
    // Track whether we are inside the top-level `corpus:` block (2-space indent body).
    let inCorpus = false;
    let noteCount = 0;
    for (const line of lines) {
      if (/^corpus:\s*$/.test(line)) { inCorpus = true; continue; }
      // Any other top-level key ends the corpus: block.
      if (/^[A-Za-z0-9_-]+:\s*$/.test(line) && !/^\s/.test(line)) { inCorpus = false; continue; }
      if (!inCorpus) continue;
      // Match `  some_thing_note: ...` (2-space indent body of corpus:).
      if (/^\s{2}[a-z][a-z0-9_]*_note:\s*\S/.test(line)) noteCount++;
    }
    if (noteCount > 0) {
      add(
        'P2',
        'corpus-state-note-creep',
        `corpus-state.yaml carries ${noteCount} free-text \`*_note:\` field(s) under \`corpus:\` — narrative belongs in \`_runs/<date>-<topic>.md\` or \`corpus-changelog.md\`, not in state`,
        stateRel,
        'State fields are read at session start to set direction; narrative there fragments the agent\'s read',
      );
    }
  }

  // corpus-state.yaml: corpus_inventory.{features,apis,batches,components,screens}
  // must be a map (slug -> path), not a scalar count. Canonical shape mirrors
  // corpus_inventory.bugs / corpus_inventory.risks already enumerated by
  // recompute-corpus-state.mjs.
  if (exists(stateRel)) {
    const text = read(stateRel);
    const lines = text.split(/\r?\n/);
    let inInventory = false;
    for (const line of lines) {
      if (/^corpus_inventory:\s*$/.test(line)) { inInventory = true; continue; }
      if (/^[A-Za-z0-9_-]+:\s*$/.test(line) && !/^\s/.test(line)) { inInventory = false; continue; }
      if (!inInventory) continue;
      // Match `  features: 12` or `  apis: "6 endpoints"` — anything non-empty
      // after the colon at 2-space indent means the key carries a scalar.
      const m = line.match(/^\s{2}(features|apis|batches|components|screens):\s*(.+)$/);
      if (m && m[2].trim() && !m[2].trim().startsWith('{}')) {
        add(
          'P2',
          'corpus-inventory-scalar-shape',
          `corpus_inventory.${m[1]} is a scalar (\`${m[2].trim()}\`) — canonical shape is a map of slug → path, like corpus_inventory.bugs / corpus_inventory.risks`,
          stateRel,
          'See scripts/recompute-corpus-state.mjs for the canonical enumeration pattern',
        );
      }
    }
  }

  // (Brick-inventory and reconciliation-ledger drift are handled by their
  // schemas under schemas/*.schema.yaml — loaded above via loadSchemas().
  // Note-creep and inventory-shape checks below are corpus-state-specific
  // patterns that don't fit the simple alias model.)
}

// YAML hygiene: parse every `.yaml` file under `doc/` and surface:
//   - files that start with `---` (frontmatter marker) — these are markdown
//     files masquerading as YAML and break any agent that loads them with
//     a YAML parser. P0.
//   - duplicate keys at the same nesting level — silently dropped by YAML
//     loaders and one of the worst silent-data-loss bugs in a corpus. P1.
//   - missing colon / malformed key lines that aren't list items or comments. P1.
//
// We don't require `js-yaml` — the pack ships dependency-free. The check is
// line-based and conservative; it catches the failure modes seen in real
// corpora rather than aiming for full YAML 1.2 conformance.
function checkYamlHygiene() {
  const yamlFiles = walk(docRoot).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));
  for (const abs of yamlFiles) {
    const fileRel = rel(abs);
    const text = fs.readFileSync(abs, 'utf8');

    // 1. Markdown-in-yaml detector: the file starts with `---\n` and contains
    // a second `---` on its own line. That's a Markdown frontmatter pattern,
    // not a YAML document. Real YAML may start with `---` (document marker)
    // but won't have a closing `---` followed by a body.
    if (/^---\s*\n/.test(text)) {
      const closing = text.indexOf('\n---', 4);
      if (closing !== -1) {
        const afterClose = text.slice(closing + 4).trim();
        if (afterClose.length > 0) {
          add(
            'P0',
            'yaml-is-markdown',
            'File is Markdown-with-frontmatter masquerading as YAML — agents loading it with a YAML parser will fail',
            fileRel,
            'Rename to .md or rewrite the file as pure YAML',
          );
          continue; // no point dup-key scanning a non-YAML file
        }
      }
    }

    // 2. Duplicate-key check + 3. malformed indentation. Track a stack of
    // (keyIndent, keys) frames. Each frame represents a YAML mapping: its
    // children's keys appear at `keyIndent` columns. Sibling list items reset
    // their inner mapping so `kind:` inside item A and `kind:` inside item B
    // are NOT treated as duplicates.
    const lines = text.split(/\r?\n/);
    const stack = [{ keyIndent: 0, keys: new Set() }];
    let inBlockScalar = false;
    let blockScalarIndent = -1;
    let dupReported = false;

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      if (!raw.trim() || raw.trim().startsWith('#')) continue;
      const line = raw.replace(/\s+#.*$/, '');
      if (!line.trim()) continue;
      if (/^---\s*$/.test(line) || /^\.\.\.\s*$/.test(line)) {
        stack.length = 1;
        stack[0] = { keyIndent: 0, keys: new Set() };
        inBlockScalar = false;
        continue;
      }
      const indent = line.match(/^( *)/)[1].length;
      if (/^\t/.test(line)) {
        add('P1', 'yaml-tab-indent', 'Tab character in indentation — YAML requires spaces only', fileRel, `line ${i + 1}`);
        continue;
      }
      if (inBlockScalar) {
        if (indent > blockScalarIndent) continue;
        inBlockScalar = false;
      }

      // Case A: list item that opens an inline mapping (`<indent>- key: value`).
      // Each such line starts a fresh inner mapping at `indent + 2`. Replace
      // any previous list-item inner frame with a clean one so sibling items
      // do not share keys.
      const listKeyMatch = line.match(/^( *)-\s+([A-Za-z0-9_.-]+):(\s|$)/);
      if (listKeyMatch) {
        const dashIndent = listKeyMatch[1].length;
        const innerIndent = dashIndent + 2;
        const key = listKeyMatch[2];
        while (stack.length > 1 && stack[stack.length - 1].keyIndent > dashIndent) stack.pop();
        stack.push({ keyIndent: innerIndent, keys: new Set([key]) });
        const valuePart = line.slice(listKeyMatch[0].length);
        if (/^\s*[|>][-+]?\s*$/.test(valuePart)) { inBlockScalar = true; blockScalarIndent = innerIndent; }
        continue;
      }

      // Bare list items (`- scalar` or empty dash) carry no keys.
      if (/^\s*-\s/.test(line) || /^\s*-\s*$/.test(line)) continue;

      // Case B: regular `<indent>key: value` line.
      const keyMatch = line.match(/^( *)([A-Za-z0-9_.-]+):(\s|$)/);
      if (!keyMatch) continue;
      const lineIndent = keyMatch[1].length;
      const key = keyMatch[2];

      // Pop frames we have left (their keys live at deeper indent than this line).
      while (stack.length > 1 && stack[stack.length - 1].keyIndent > lineIndent) stack.pop();
      // If we entered a new nested mapping (top frame is shallower), open it.
      if (stack[stack.length - 1].keyIndent < lineIndent) {
        stack.push({ keyIndent: lineIndent, keys: new Set() });
      }

      const top = stack[stack.length - 1];
      if (top.keys.has(key) && !dupReported) {
        add(
          'P1',
          'yaml-duplicate-key',
          `Duplicate key \`${key}:\` at the same level — YAML loaders silently drop the earlier value`,
          fileRel,
          `line ${i + 1}`,
        );
        dupReported = true;
      }
      top.keys.add(key);

      const valuePart = line.slice(keyMatch[0].length);
      if (/^\s*[|>][-+]?\s*$/.test(valuePart)) { inBlockScalar = true; blockScalarIndent = lineIndent; }
    }
  }
}

// MCP knowledge staleness: when a tool is reported `connected` or `available`
// in corpus-state but the corresponding `doc/mcp/<tool>.md` reference file is
// still the pack draft template, what the operator/agent discovered while using
// the MCP has not been captured back. The next agent that opens the corpus
// will re-discover what was already known. Emitted at P2 (warn).
//
// See SKILL.md sources/mcp-data-reading § Post-session capitalization.
function checkMcpKnowledgeStale() {
  const stateRel = 'doc/_meta/corpus-state.yaml';
  if (!exists(stateRel)) return;
  const state = parseSimpleYamlMap(read(stateRel));
  const corpus = state.corpus || {};

  // Map state-field-name → mcp file. Several fields can target the same file
  // (Jira and Confluence both land in atlassian.md).
  const toolMap = {
    dynatrace_mcp_status: 'doc/mcp/dynatrace.md',
    jira_mcp_status: 'doc/mcp/atlassian.md',
    confluence_mcp_status: 'doc/mcp/atlassian.md',
    github_mcp_status: 'doc/mcp/github.md',
    servicenow_mcp_status: 'doc/mcp/servicenow.md',
  };

  const ACTIVE = /^(available|connected)$/;
  const seenFile = new Set();

  for (const [stateField, mcpRel] of Object.entries(toolMap)) {
    const status = corpus[stateField];
    if (!status || !ACTIVE.test(String(status))) continue;
    if (seenFile.has(mcpRel)) continue;

    if (!exists(mcpRel)) {
      add(
        'P2',
        'mcp-knowledge-missing-file',
        `${stateField}=${status} but ${mcpRel} is missing — pack template should exist for any active MCP`,
        mcpRel,
      );
      seenFile.add(mcpRel);
      continue;
    }

    const fm = frontmatter(read(mcpRel));
    // parseSimpleYamlMap returns `{}` for keys with empty values
    // (e.g. `last_validated:` with nothing after the colon). Normalize to ''.
    const normalize = (v) => (typeof v === 'string' ? v : '');
    const fmStatus = normalize(fm.status);
    const fmValidated = normalize(fm.last_validated);
    const fmConfidence = normalize(fm.confidence);
    const isTemplate =
      fmStatus === 'draft'
      || fmValidated === ''
      || fmConfidence === 'unknown';

    if (isTemplate) {
      add(
        'P2',
        'mcp-knowledge-stale',
        `${stateField}=${status} but ${mcpRel} is still pack template (status=${fmStatus || '∅'}, last_validated=${fmValidated || '∅'}, confidence=${fmConfidence || '∅'}) — capture what was discovered while using this MCP`,
        mcpRel,
        'See SKILL.md sources/mcp-data-reading § Post-session capitalization',
      );
      seenFile.add(mcpRel);
    }
  }
}

// Index column convention: every `doc/_indexes/by-*.md` table must use the
// canonical 5-col header `<Entity> | Canonical file | Related files | Confidence | Notes`.
// This is what the dashboard reads to build its drilldowns; custom column
// layouts break navigation between corpora (e.g. `by-api` with
// `Groupe | Endpoints | Controller | Feature | Canonical file` cannot be
// rendered the same way as `by-api` with the canonical 5-col). Emitted at P2.
function checkIndexColumns() {
  const dir = path.join(docRoot, '_indexes');
  if (!fs.existsSync(dir)) return;
  const CANONICAL_TAIL = ['Canonical file', 'Related files', 'Confidence', 'Notes'];
  for (const name of fs.readdirSync(dir)) {
    if (!/^by-.+\.md$/.test(name)) continue;
    const abs = path.join(dir, name);
    const text = fs.readFileSync(abs, 'utf8');
    const lines = text.split(/\r?\n/);
    const headerLine = lines.find((l) => /^\|\s*\S/.test(l));
    if (!headerLine) {
      add('P2', 'index-table-missing', `Index file has no table — at minimum the canonical header \`| <Entity> | Canonical file | Related files | Confidence | Notes |\` should be present`, `doc/_indexes/${name}`);
      continue;
    }
    // Parse header columns by splitting on `|` and trimming
    const cols = headerLine.split('|').map((c) => c.trim()).filter(Boolean);
    // The canonical shape: 5 columns where columns 2..5 match CANONICAL_TAIL exactly
    const matches =
      cols.length === 5
      && cols[1] === CANONICAL_TAIL[0]
      && cols[2] === CANONICAL_TAIL[1]
      && cols[3] === CANONICAL_TAIL[2]
      && cols[4] === CANONICAL_TAIL[3];
    if (!matches) {
      add(
        'P2',
        'index-table-noncanonical',
        `Index table header does not match canonical 5-col \`| <Entity> | Canonical file | Related files | Confidence | Notes |\` — found: [${cols.join(' | ')}]`,
        `doc/_indexes/${name}`,
        'See SKILL.md `update-indexes` (or the SKILL that owns this index) for the canonical layout',
      );
    }
  }
}

// Cross-file existence: when a state file declares that an artefact exists or
// should exist, verify it on disk. Two passes today:
//   1. `corpus-state.yaml.corpus_inventory.features` map keys → expect a
//      matching `_meta/code-interview/<slug>.md` (where the deep-dive notes live).
//   2. `code-pipeline-state.yaml.pipeline.<step>.output_file` → file must exist.
function checkCrossFileExistence() {
  // 1. Features → code-interview files
  const stateRel = 'doc/_meta/corpus-state.yaml';
  if (exists(stateRel)) {
    const text = read(stateRel);
    // Extract feature slugs from the `corpus_inventory.features:` block
    // (skips when the value is a scalar — already flagged by corpus-inventory-scalar-shape)
    const lines = text.split(/\r?\n/);
    let inFeatures = false;
    let featuresIndent = -1;
    const slugs = [];
    for (const line of lines) {
      if (/^\s{2}features:\s*$/.test(line)) {
        inFeatures = true;
        featuresIndent = 2;
        continue;
      }
      if (!inFeatures) continue;
      const ind = line.match(/^( *)/)[1].length;
      if (line.trim() !== '' && ind <= featuresIndent) { inFeatures = false; continue; }
      const m = line.match(/^\s+([a-z][a-z0-9-]+):\s*["']?(.+?)["']?\s*$/);
      if (m) slugs.push(m[1]);
    }
    for (const slug of slugs) {
      const interviewRel = `doc/_meta/code-interview/${slug}.md`;
      if (!exists(interviewRel)) {
        add(
          'P2',
          'cross-file-missing-code-interview',
          `Feature \`${slug}\` is in corpus_inventory.features but \`${interviewRel}\` is missing — P4 deep-dive notes expected`,
          interviewRel,
          'See SKILL.md pipeline/p4-feature-silo-deep-dive',
        );
      }
    }
  }

  // 2. Pipeline output_file references
  const pipeRel = 'doc/_meta/code-pipeline-state.yaml';
  if (exists(pipeRel)) {
    const text = read(pipeRel);
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^\s+output_file:\s*["']?([^"'\s]+)["']?/);
      if (!m) continue;
      const outRel = m[1];
      // Skip if line indicates the step is not_started
      // (look back a few lines for `status: not_started`)
      let isNotStarted = false;
      for (let j = Math.max(0, i - 6); j < i; j++) {
        if (/^\s+status:\s*not_started/.test(lines[j])) isNotStarted = true;
      }
      if (isNotStarted) continue;
      if (!exists(outRel)) {
        add(
          'P2',
          'cross-file-missing-pipeline-output',
          `code-pipeline-state.yaml declares output_file \`${outRel}\` but it does not exist on disk`,
          pipeRel,
          `line ${i + 1}`,
        );
      }
    }
  }
}

// Timestamp hygiene: `last_*:` keys in `_meta/*.yaml` must carry an ISO date
// (`YYYY-MM-DD`) or ISO datetime (`YYYY-MM-DDThh:mm:ss[.sss][Z|±hh:mm]`),
// or be `null`/empty. Free-text values like `"jamais"`, `"hier"`, `"2026-05"`,
// or padded narrative are drift and confuse downstream computation (dashboard
// `Last X` chips, recompute-corpus-state advance logic).
function checkTimestampFormat() {
  const iso = /^["']?(?:null|)$|^["']?\d{4}-\d{2}-\d{2}(?:T[\d:.+\-Z]+)?["']?$/;
  const yamlFiles = walk(docRoot).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));
  for (const abs of yamlFiles) {
    const fileRel = rel(abs);
    const text = fs.readFileSync(abs, 'utf8');
    const lines = text.split(/\r?\n/);
    const seen = new Set();
    for (let i = 0; i < lines.length; i++) {
      // Only check keys that semantically carry a timestamp. Skipping keys
      // like `last_completed_node_id`, `last_pack_upgrade_note`,
      // `last_year_commits` that share the `last_` prefix but aren't dates.
      const m = lines[i].match(/^\s*(last_(?:validated|updated|kickstart|quality_check|continuous_run|reconciliation|prod_discovery|run|pack_upgrade|api_deep_dive|jira_exploration|source_registry_review|multi_repo_interview|adjacent_sync_check|project_activity_discovery|cicd_activity_discovery|reorientation|observed|seen)|completed_at|date):\s*(.*?)\s*(?:#.*)?$/);
      if (!m) continue;
      const key = m[1];
      const value = m[2].trim();
      // Skip if value is empty (already caught elsewhere) or null
      if (value === '' || value === 'null' || value === '"null"' || value === "'null'") continue;
      if (iso.test(value)) continue;
      const code = `timestamp-not-iso-${key}`;
      if (seen.has(code)) continue;
      add(
        'P2',
        'timestamp-not-iso',
        `\`${key}: ${value}\` is not ISO date/datetime (\`YYYY-MM-DD\` or \`YYYY-MM-DDThh:mm:ss[.sss][Z|±hh:mm]\`)`,
        fileRel,
        `line ${i + 1}`,
      );
      seen.add(code);
    }
  }
}

// Spec layout contract: each `doc/spec/<key>/` (or `doc/spec/<version>/<key>/`)
// directory must be either:
//   (a) a skeleton — only `README.md`, with frontmatter `status: skeleton`, or
//   (b) a full spec — at least README + SPECIFICATION + IMPACTS + SUMMARY +
//       TESTS (the canonical template subset).
// Anything in between is a half-baked spec masquerading as ready.
// Leaf folder name must match either ticket regex `^[A-Z]+-\d+$` or kebab-slug
// `^[a-z][a-z0-9-]+$`.
function checkSpecLayout() {
  const specRoot = path.join(docRoot, 'spec');
  if (!fs.existsSync(specRoot)) return;
  const REQUIRED_FULL = ['README.md', 'SPECIFICATION.md', 'IMPACTS.md', 'SUMMARY.md', 'TESTS.md'];
  const TICKET_RE = /^[A-Z]+-\d+$/;
  const SLUG_RE = /^[a-z][a-z0-9-]+$/;
  const VERSION_RE = /^\d+(\.\d+)*$/;
  const EXCLUDE = new Set(['template', '_TEMPLATE', 'README.md']);

  function checkLeafFolder(name, dirAbs) {
    if (EXCLUDE.has(name)) return;
    const dirRel = path.relative(root, dirAbs).split(path.sep).join('/');
    if (!TICKET_RE.test(name) && !SLUG_RE.test(name)) {
      add(
        'P2',
        'spec-folder-name',
        `Spec folder \`${name}\` does not match canonical naming (ticket \`^[A-Z]+-\\d+$\` or kebab-slug \`^[a-z][a-z0-9-]+$\`)`,
        dirRel,
        'See SKILL.md spec-authoring § Folder naming',
      );
    }
    const files = fs.readdirSync(dirAbs).filter((n) => n.endsWith('.md'));
    if (files.length === 0) return;
    const isSkeleton = files.length === 1 && files[0] === 'README.md';
    if (isSkeleton) {
      const fm = frontmatter(fs.readFileSync(path.join(dirAbs, 'README.md'), 'utf8'));
      const normalize = (v) => (typeof v === 'string' ? v : '');
      if (normalize(fm.status) !== 'skeleton') {
        add(
          'P2',
          'spec-skeleton-not-declared',
          `Spec \`${name}\` contains only README.md but its frontmatter \`status: ${normalize(fm.status) || '∅'}\` does not declare \`skeleton\` — a one-file spec must be flagged as skeleton or fleshed out`,
          `${dirRel}/README.md`,
          'See SKILL.md spec-authoring § Skeleton vs full',
        );
      }
      return;
    }
    // Full-spec expectation: must contain every REQUIRED_FULL file.
    const missing = REQUIRED_FULL.filter((f) => !files.includes(f));
    if (missing.length > 0) {
      add(
        'P2',
        'spec-incomplete',
        `Spec \`${name}\` has ${files.length} files but is missing canonical [${missing.join(', ')}] — either complete the template or shrink to skeleton (README only, status:skeleton)`,
        dirRel,
        'See SKILL.md spec-authoring § Required files',
      );
    }
  }

  for (const entry of fs.readdirSync(specRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (EXCLUDE.has(entry.name)) continue;
    const entryAbs = path.join(specRoot, entry.name);
    if (VERSION_RE.test(entry.name)) {
      // Versioned grouping: recurse one level
      for (const inner of fs.readdirSync(entryAbs, { withFileTypes: true })) {
        if (!inner.isDirectory()) continue;
        checkLeafFolder(inner.name, path.join(entryAbs, inner.name));
      }
    } else {
      checkLeafFolder(entry.name, entryAbs);
    }
  }
}

function checkSecrets() {
  const files = walk(docRoot).filter((file) => /\.(md|ya?ml|json|txt)$/.test(file));
  const patterns = [
    [/AKIA[0-9A-Z]{16}/, 'possible-aws-access-key'],
    [/-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/, 'possible-private-key'],
    [/\b(password|passwd|pwd)\s*[:=]\s*['"]?[^'"\s]{8,}/i, 'possible-password'],
    [/\b(api[_-]?key|token|secret)\s*[:=]\s*['"]?[A-Za-z0-9._~+/=-]{16,}/i, 'possible-token-or-secret'],
  ];
  for (const abs of files) {
    const content = fs.readFileSync(abs, 'utf8');
    for (const [pattern, code] of patterns) {
      if (pattern.test(content)) add('P0', code, `Potential secret detected by pattern: ${code}`, rel(abs));
    }
  }
}

checkRequiredStructure();
checkMarkdownLinks();
checkFrontmatter();
checkFeatureFolders();
checkProductionKnowledge();
checkIndexes();
checkCorpusState();
checkCorpusStateBackwardDrift();
checkRoadmapGraph();
checkCodeAnalysisPipeline();
checkFeatureCandidatesProcessed();
checkActionableReadinessGate();
checkHandoverGate();
checkPostKickstartCompleteness();
checkUnknowns();
checkCorpusScopeLeak();
checkYamlHygiene();
checkSchemaDrift();
checkMcpKnowledgeStale();
checkIndexColumns();
checkCrossFileExistence();
checkTimestampFormat();
checkSpecLayout();
checkSecrets();

const severityOrder = { P0: 0, P1: 1, P2: 2 };
findings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity] || a.code.localeCompare(b.code));

const summary = {
  ok: findings.filter((finding) => finding.severity === 'P0').length === 0,
  counts: {
    P0: findings.filter((finding) => finding.severity === 'P0').length,
    P1: findings.filter((finding) => finding.severity === 'P1').length,
    P2: findings.filter((finding) => finding.severity === 'P2').length,
  },
};

if (jsonMode) {
  console.log(JSON.stringify({ summary, findings }, null, 2));
} else {
  console.log('Corpus validation');
  console.log(`P0: ${summary.counts.P0}  P1: ${summary.counts.P1}  P2: ${summary.counts.P2}`);
  if (findings.length === 0) {
    console.log('No findings.');
  } else {
    for (const finding of findings) {
      const location = finding.file ? ` (${finding.file})` : '';
      const detail = finding.detail ? ` -> ${finding.detail}` : '';
      console.log(`[${finding.severity}] ${finding.code}: ${finding.message}${location}${detail}`);
    }
  }
}

process.exit(summary.counts.P0 > 0 ? 1 : 0);
