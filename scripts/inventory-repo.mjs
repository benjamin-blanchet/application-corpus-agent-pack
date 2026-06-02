#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const now = new Date().toISOString();
const includeGenerated = process.argv.includes('--include-generated');
const dryRun = process.argv.includes('--dry-run');

const generatedDirs = new Set([
  'node_modules', 'vendor', 'target', 'build', 'dist', 'out', 'bin', 'obj',
  '__pycache__', '.next', '.nuxt', 'coverage', '.gradle', '.mvn/wrapper/dists',
]);

const vcsDirs = new Set(['.git', '.svn', '.hg']);
const packDirs = new Set(['doc', '.github/skills', '.github/agents', '.github/templates']);
const ideDirs = new Set(['.idea', '.vscode', '.fleet']);

const sourceExt = new Map([
  ['.java', 'java'], ['.ts', 'typescript'], ['.tsx', 'typescript'], ['.js', 'javascript'],
  ['.jsx', 'javascript'], ['.py', 'python'], ['.cs', 'csharp'], ['.go', 'go'],
  ['.kt', 'kotlin'], ['.rb', 'ruby'], ['.php', 'php'], ['.scala', 'scala'],
  ['.rs', 'rust'], ['.swift', 'swift'], ['.m', 'objective-c'], ['.cpp', 'cpp'],
  ['.cc', 'cpp'], ['.cxx', 'cpp'], ['.c', 'c'], ['.h', 'c/cpp'], ['.hpp', 'cpp'],
  ['.lua', 'lua'], ['.dart', 'dart'],
]);

const uiExt = new Set(['.html', '.xhtml', '.vue', '.svelte', '.razor', '.cshtml', '.fxml']);
const styleExt = new Set(['.css', '.scss', '.less', '.styl']);
const protoExt = new Set(['.proto', '.graphql', '.avsc', '.thrift', '.wsdl', '.xsd']);
const assetExt = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.woff', '.woff2', '.ttf', '.eot', '.mp3', '.mp4', '.mov', '.pdf']);

const buckets = {};
const excluded = [];
const unreadDirectories = [];
const unknownFiles = [];
const modules = [];
const topLevel = new Map();
const buildSystems = new Set();
const packageManagers = new Set();
const languages = new Map();
const ciSystems = new Map();
let totalFiles = 0;
let totalDirs = 0;

function rel(abs) {
  return path.relative(root, abs).split(path.sep).join('/');
}

function addBucket(bucket, fileRel, extra = {}) {
  if (!buckets[bucket]) buckets[bucket] = { total: 0, files: [] };
  buckets[bucket].total += 1;
  if (buckets[bucket].files.length < 500) buckets[bucket].files.push(fileRel);
  if (extra.language) {
    if (!buckets[bucket].by_language) buckets[bucket].by_language = {};
    if (!buckets[bucket].by_language[extra.language]) buckets[bucket].by_language[extra.language] = { files: 0, lines: 'unknown' };
    buckets[bucket].by_language[extra.language].files += 1;
    languages.set(extra.language, (languages.get(extra.language) || 0) + 1);
  }
}

function isInside(relPath, dir) {
  return relPath === dir || relPath.startsWith(`${dir}/`);
}

function shouldExcludeDir(dirRel) {
  const base = path.basename(dirRel);
  if (vcsDirs.has(base)) return { bucket: 'vcs_meta', reason: 'version-control metadata' };
  if (ideDirs.has(base)) return { bucket: 'ide_meta', reason: 'IDE metadata, listed but not deeply scanned' };
  if (!includeGenerated && generatedDirs.has(base)) return { bucket: 'generated', reason: 'generated or dependency output; rerun with --include-generated to scan' };
  for (const packDir of packDirs) {
    if (isInside(dirRel, packDir)) return { bucket: 'corpus_pack', reason: 'application corpus pack files; excluded from application code inventory' };
  }
  return null;
}

function countFiles(absDir) {
  let count = 0;
  try {
    for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
      const abs = path.join(absDir, entry.name);
      if (entry.isDirectory()) count += countFiles(abs);
      else count += 1;
    }
  } catch {
    return count;
  }
  return count;
}

function classify(fileRel) {
  const base = path.basename(fileRel);
  const ext = path.extname(base).toLowerCase();
  const lower = fileRel.toLowerCase();

  if (sourceExt.has(ext)) {
    if (/(\btest\b|\bspec\b|__tests__|src\/test|tests\/|cypress\/|playwright\/)/i.test(fileRel)) return { bucket: 'test', language: sourceExt.get(ext) };
    if (ext === '.tsx' || ext === '.jsx') return { bucket: 'ui', language: sourceExt.get(ext) };
    return { bucket: 'source', language: sourceExt.get(ext) };
  }
  if (uiExt.has(ext)) return { bucket: 'ui' };
  if (styleExt.has(ext)) return { bucket: 'style' };
  if (protoExt.has(ext) || /openapi|swagger/i.test(base)) return { bucket: 'proto_schema' };
  if (/application\.(ya?ml|properties)$|bootstrap\.ya?ml$|appsettings\.json$|web\.xml$/i.test(base)) return { bucket: 'config_app' };
  if (/^(pom\.xml|build\.gradle|build\.gradle\.kts|package\.json|composer\.json|pyproject\.toml|cargo\.toml|go\.mod|makefile)$/i.test(base) || /\.(csproj|fsproj|vbproj)$/i.test(base)) return { bucket: 'config_build' };
  if (/^jenkinsfile/i.test(base) || /^\.gitlab-ci\.ya?ml$/i.test(base) || /^azure-pipelines\.ya?ml$/i.test(base) || /^bitbucket-pipelines\.ya?ml$/i.test(base) || /^\.drone\.ya?ml$/i.test(base) || isInside(fileRel, '.github/workflows') || isInside(fileRel, '.circleci')) return { bucket: 'config_ci' };
  if (/^dockerfile/i.test(base) || /^docker-compose/i.test(base) || /\.(tf|tfvars)$/i.test(base) || /helm|k8s|kubernetes|ansible|serverless\.yml|pulumi/i.test(fileRel)) return { bucket: 'config_iac' };
  if (/eslint|prettier|checkstyle|editorconfig|tslint|pylint|flake8|rubocop/i.test(base)) return { bucket: 'config_lint' };
  if (/migration|liquibase|flyway|alembic|prisma\/migrations/i.test(fileRel) && /\.(sql|xml|ya?ml|json|py)$/i.test(base)) return { bucket: 'data_migration' };
  if (/seed|fixture/i.test(fileRel) && /\.(sql|json|ya?ml|csv|tsv|xml)$/i.test(base)) return { bucket: 'data_seed' };
  if (/\.(json|ya?ml|csv|tsv|properties|ini|toml)$/i.test(base)) return { bucket: 'data_static' };
  if (/\.(sh|ps1|bat|cmd)$/i.test(base) || isInside(fileRel, 'scripts')) return { bucket: 'script' };
  if (/^(readme|changelog|contributing|license)(\..*)?$/i.test(base) || ext === '.md' || isInside(fileRel, 'docs')) return { bucket: 'doc_repo' };
  if (assetExt.has(ext)) return { bucket: 'asset' };
  return { bucket: 'unknown' };
}

function detectBuildHints(fileRel) {
  const base = path.basename(fileRel).toLowerCase();
  if (base === 'pom.xml') buildSystems.add('maven');
  if (base === 'build.gradle' || base === 'build.gradle.kts') buildSystems.add('gradle');
  if (base === 'package.json') buildSystems.add('npm');
  if (base === 'pyproject.toml') buildSystems.add('python-pyproject');
  if (base === 'cargo.toml') buildSystems.add('cargo');
  if (base === 'go.mod') buildSystems.add('go-modules');
  if (base.endsWith('.csproj')) buildSystems.add('dotnet');
  if (base === 'package-lock.json') packageManagers.add('npm');
  if (base === 'yarn.lock') packageManagers.add('yarn');
  if (base === 'pnpm-lock.yaml') packageManagers.add('pnpm');
  if (base === 'composer.lock') packageManagers.add('composer');
  if (base === 'poetry.lock') packageManagers.add('poetry');
}

function addCiSystem(name, fileRel) {
  if (!ciSystems.has(name)) ciSystems.set(name, []);
  ciSystems.get(name).push(fileRel);
}

function detectCiSystem(fileRel) {
  const base = path.basename(fileRel).toLowerCase();
  if (/^jenkinsfile/i.test(path.basename(fileRel))) addCiSystem('jenkins', fileRel);
  else if (isInside(fileRel, '.github/workflows')) addCiSystem('github-actions', fileRel);
  else if (/^\.gitlab-ci\.ya?ml$/i.test(base)) addCiSystem('gitlab-ci', fileRel);
  else if (/^azure-pipelines\.ya?ml$/i.test(base)) addCiSystem('azure-pipelines', fileRel);
  else if (/^bitbucket-pipelines\.ya?ml$/i.test(base)) addCiSystem('bitbucket-pipelines', fileRel);
  else if (isInside(fileRel, '.circleci')) addCiSystem('circleci', fileRel);
  else if (/^\.drone\.ya?ml$/i.test(base)) addCiSystem('drone', fileRel);
}

function walk(absDir) {
  let entries;
  try {
    entries = fs.readdirSync(absDir, { withFileTypes: true });
  } catch (error) {
    unreadDirectories.push({ path: rel(absDir), reason: error.message });
    return;
  }
  totalDirs += 1;
  for (const entry of entries) {
    const abs = path.join(absDir, entry.name);
    const fileRel = rel(abs);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      const exclusion = shouldExcludeDir(fileRel);
      if (exclusion) {
        excluded.push({ path: fileRel, bucket: exclusion.bucket, reason: exclusion.reason, file_count: countFiles(abs) });
        addBucket(exclusion.bucket, `${fileRel}/`);
        continue;
      }
      walk(abs);
      continue;
    }
    totalFiles += 1;
    const { bucket, language } = classify(fileRel);
    addBucket(bucket, fileRel, { language });
    detectBuildHints(fileRel);
    if (bucket === 'config_ci') detectCiSystem(fileRel);
    if (bucket === 'unknown') unknownFiles.push(fileRel);
    const top = fileRel.split('/')[0];
    topLevel.set(top, (topLevel.get(top) || 0) + 1);
  }
}

walk(root);

for (const [name, fileCount] of topLevel.entries()) {
  if (name === 'doc' || name === '.github') continue;
  try {
    if (!fs.statSync(path.join(root, name)).isDirectory()) continue;
  } catch {
    continue;
  }
  modules.push({
    path: `${name}/`,
    type: 'unknown',
    primary_language: 'unknown',
    file_count: fileCount,
    has_tests: false,
    notes: 'P2 must classify this top-level area.',
  });
}

function yamlString(value, indent = 0) {
  const pad = ' '.repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return value.map((item) => {
      if (typeof item === 'object' && item !== null) {
        return `${pad}- ${yamlString(item, indent + 2).trimStart()}`;
      }
      return `${pad}- ${JSON.stringify(item)}`;
    }).join('\n');
  }
  if (typeof value === 'object' && value !== null) {
    const lines = [];
    for (const [key, child] of Object.entries(value)) {
      if (Array.isArray(child) && child.length === 0) lines.push(`${pad}${key}: []`);
      else if (typeof child === 'object' && child !== null) lines.push(`${pad}${key}:\n${yamlString(child, indent + 2)}`);
      else lines.push(`${pad}${key}: ${JSON.stringify(child)}`);
    }
    return lines.join('\n');
  }
  return JSON.stringify(value);
}

const inventory = {
  inventory: {
    generated_at: now,
    generator: 'scripts/inventory-repo.mjs',
    repo_root_files: fs.readdirSync(root).filter((name) => fs.statSync(path.join(root, name)).isFile()).length,
    total_files_inventoried: totalFiles,
    total_directories_inventoried: totalDirs,
    unread_directories: unreadDirectories,
    excluded,
    by_bucket: buckets,
    unknown_files: unknownFiles,
  },
  modules,
  build_systems_detected: [...buildSystems].sort(),
  package_managers_detected: [...packageManagers].sort(),
  languages_detected: [...languages.entries()].sort((a, b) => b[1] - a[1]).map(([language]) => language),
  top_level_directories: [...topLevel.entries()].sort().map(([name, file_count]) => ({ name, file_count })),
};

if (buckets.config_ci) {
  buckets.config_ci.systems_found = [...ciSystems.entries()].sort().map(([name, files]) => ({
    name,
    files: files.sort(),
  }));
}

const status = unreadDirectories.length === 0 && unknownFiles.length === 0 ? 'covered' : 'partial';
const yaml = `${yamlString(inventory)}\n`;
const md = `---\ntype: code-inventory\nstatus: ${status}\nconfidence: confirmed\nsource: code\nlast_validated: "${now.slice(0, 10)}"\n---\n\n# Code Inventory\n\nGenerated by \`scripts/inventory-repo.mjs\` at ${now}.\n\n## Summary\n\n| Metric | Value |\n|---|---:|\n| Files inventoried | ${totalFiles} |\n| Directories inventoried | ${totalDirs} |\n| Excluded directories | ${excluded.length} |\n| Unread directories | ${unreadDirectories.length} |\n| Unknown files | ${unknownFiles.length} |\n\n## Buckets\n\n| Bucket | Count |\n|---|---:|\n${Object.entries(buckets).sort().map(([bucket, data]) => `| ${bucket} | ${data.total} |`).join('\n')}\n\n## Build Systems\n\n${[...buildSystems].sort().map((item) => `- ${item}`).join('\n') || '- none detected'}\n\n## CI/CD Systems\n\n${[...ciSystems.entries()].sort().map(([name, files]) => `- ${name}: ${files.length} file(s)`).join('\n') || '- none detected'}\n\n## Notes\n\n- This script inventories application repository evidence and excludes corpus pack folders by default.\n- If a generated/dependency tree must be scanned, rerun with \`--include-generated\` and record why.\n`;

function ensureDir(relDir) {
  fs.mkdirSync(path.join(root, relDir), { recursive: true });
}

function updatePipelineState() {
  const file = path.join(root, 'doc/_meta/code-pipeline-state.yaml');
  if (!fs.existsSync(file)) return;
  let content = fs.readFileSync(file, 'utf8');
  const replacement = `  p1_tree_inventory:\n    status: ${status}\n    last_run: "${now}"\n    files_inventoried: ${totalFiles}\n    directories_inventoried: ${totalDirs}\n    unread_directories: ${unreadDirectories.length}\n    unknown_files: ${unknownFiles.length}\n    excluded_directories: ${excluded.length}\n    generator: scripts/inventory-repo.mjs\n    blocks_next_pass: ${status === 'covered' ? 'false' : 'true'}`;
  content = content.replace(/  p1_tree_inventory:\n(?:    .*\n)*/m, `${replacement}\n`);
  fs.writeFileSync(file, content);
}

if (dryRun) {
  console.log(yaml);
} else {
  ensureDir('doc/_meta');
  fs.writeFileSync(path.join(root, 'doc/_meta/code-inventory.yaml'), yaml);
  fs.writeFileSync(path.join(root, 'doc/_meta/code-inventory.md'), md);
  updatePipelineState();
  console.log(`Inventory written: files=${totalFiles} dirs=${totalDirs} excluded=${excluded.length} unknown=${unknownFiles.length} status=${status}`);
}
