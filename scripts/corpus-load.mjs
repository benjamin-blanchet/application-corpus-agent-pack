#!/usr/bin/env node

/*
 * corpus-load.mjs
 *
 * Deterministic, budgeted context retrieval over a `doc/` corpus.
 *
 * The pack already keeps the always-on surface small through progressive
 * disclosure, but at runtime an agent still decides which corpus files to
 * open by hand. This command turns that into a deterministic step: given a
 * task (and optional feature / workspace-path hints) it scores the corpus,
 * then serves the highest-relevance slices that fit a token budget, listing
 * what it dropped so nothing is silently hidden.
 *
 * It is read-only. It never writes to the corpus.
 *
 * The token budget uses a deliberately simple ceil(chars / 3.5) approximation
 * for slice selection only. It is not a cost estimate or billing claim.
 *
 * Usage:
 *   node scripts/corpus-load.mjs --task "refund webhook retries"
 *   node scripts/corpus-load.mjs --task "..." --doc doc
 *   node scripts/corpus-load.mjs --feature billing --budget 4000
 *   node scripts/corpus-load.mjs --task "..." --paths src/billing,src/api
 *   node scripts/corpus-load.mjs --task "..." --json
 *   node scripts/corpus-load.mjs --task "..." --expand   # ignore the budget
 *
 * Options:
 *   --task "<text>"   Task description to score the corpus against.
 *   --feature <slug>  Strongly boost files under project/features/<slug>/.
 *   --paths a,b       Workspace path hints; boost features/files that mention them.
 *   --budget <N>      Token budget for the loaded slice (default 2000).
 *   --doc <dir>       Corpus root (default ./doc).
 *   --content         Print the full content of each selected slice.
 *   --expand          Load every scored slice, ignoring the budget.
 *   --json            Machine-readable output.
 *   -h, --help        Show this help.
 *
 * At least one of --task or --feature is required.
 */

import fs from 'node:fs';
import path from 'node:path';
import { normalizeText } from './lib/text.mjs';

const CHARS_PER_TOKEN = 3.5;
const DEFAULT_BUDGET = 2000;

// Stopwords kept tiny and bilingual (corpora are often FR or EN). Anything
// shorter than 3 chars is dropped anyway, so this only needs the common glue.
const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'are', 'was',
  'has', 'have', 'how', 'what', 'when', 'where', 'which', 'use', 'used',
  'les', 'des', 'une', 'pour', 'dans', 'avec', 'que', 'qui', 'sur', 'par',
  'est', 'sont', 'aux', 'ses', 'son', 'comment', 'quand',
]);

// Path priors: code-derived application knowledge ranks above navigation and
// meta scaffolding. Matched on the corpus-relative path (first segments).
const PATH_PRIORS = [
  [/^project\/features\//, 3],
  [/^project\/apis\//, 3],
  [/^project\/integrations\//, 3],
  [/^project\/batchs\//, 3],
  [/^project\/screens\//, 3],
  [/^project\/services\//, 3],
  [/^project\/domain\//, 3],
  [/^architecture\//, 3],
  [/^project\/architecture\//, 2],
  [/^prod\//, 2],
  [/^project\/README\.md$/, 2],
  [/^_graph\//, 1],
  [/^spec\/template\//, -2], // scaffolding, not real knowledge
];

const CONFIDENCE_PRIOR = { confirmed: 2, probable: 1, suspected: 0.5, unknown: 0 };

function parseArgs(argv) {
  const opts = { budget: DEFAULT_BUDGET, doc: 'doc', paths: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') opts.help = true;
    else if (a === '--json') opts.json = true;
    else if (a === '--expand') opts.expand = true;
    else if (a === '--content') opts.content = true;
    else if (a === '--task') opts.task = argv[++i] || '';
    else if (a === '--feature') opts.feature = argv[++i] || '';
    else if (a === '--budget') opts.budget = Number(argv[++i]) || DEFAULT_BUDGET;
    else if (a === '--doc') opts.doc = argv[++i] || 'doc';
    else if (a === '--paths') opts.paths = (argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
  }
  return opts;
}

function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .split(/[^a-z0-9à-ÿ]+/i)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

function walkSync(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkSync(full));
    else if (entry.isFile() && full.endsWith('.md')) out.push(full);
  }
  return out;
}

function parseFrontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  const fm = {};
  if (!match) return fm;
  for (const line of match[1].split('\n')) {
    const m = line.match(/^([a-z_]+):\s*(.*)$/i);
    if (m) fm[m[1].toLowerCase()] = m[2].replace(/^["']|["']$/g, '').trim();
  }
  return fm;
}

function pathPrior(rel) {
  for (const [re, weight] of PATH_PRIORS) if (re.test(rel)) return weight;
  return 0;
}

// Score one corpus file against the tokenized task. Title/description/path
// matches weigh more than body matches; body counts are capped so a long file
// cannot dominate on keyword volume alone.
function scoreFile(file, taskTerms, opts) {
  const { rel, text, fm } = file;
  let score = 0;
  const reasons = [];

  if (taskTerms.length) {
    const title = tokenize(fm.title || '');
    const desc = tokenize(fm.description || '');
    const pathTerms = tokenize(rel.replace(/[/.]/g, ' '));
    const headings = tokenize((text.match(/^#{1,6}\s+.*/gm) || []).join(' '));
    const bodyTerms = tokenize(text);
    const bodyCount = bodyTerms.reduce((acc, t) => {
      acc[t] = (acc[t] || 0) + 1;
      return acc;
    }, {});

    let matched = 0;
    for (const term of new Set(taskTerms)) {
      let s = 0;
      if (title.includes(term)) s += 5;
      if (pathTerms.includes(term)) s += 4;
      if (desc.includes(term)) s += 3;
      if (headings.includes(term)) s += 2;
      if (bodyCount[term]) s += Math.min(bodyCount[term], 3);
      if (s > 0) matched++;
      score += s;
    }
    if (matched > 1) score += matched; // reward breadth of overlap
  }

  // --feature: files under the feature dir are loaded regardless of keywords.
  if (opts.feature) {
    if (rel.startsWith(`project/features/${opts.feature}/`)) {
      score += 10;
      reasons.push('feature');
    }
  }

  // --paths workspace hints: boost files whose path or body references a hint.
  for (const hint of opts.paths) {
    const needle = hint.toLowerCase();
    if (rel.toLowerCase().includes(needle) || text.toLowerCase().includes(needle)) {
      score += 4;
      reasons.push(`path:${hint}`);
    }
  }

  if (score <= 0) return null;

  const prior = pathPrior(rel);
  score += prior;
  score += CONFIDENCE_PRIOR[(fm.confidence || '').toLowerCase()] || 0;

  return {
    rel,
    tokens: Math.ceil(text.length / CHARS_PER_TOKEN),
    score: Math.round(score * 100) / 100,
    confidence: fm.confidence || 'unknown',
    source: fm.source || 'unknown',
    title: fm.title || '',
    reasons,
    text,
  };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help || (!opts.task && !opts.feature)) {
    printHelp();
    process.exit(opts.help ? 0 : 2);
  }

  const docRoot = path.resolve(opts.doc);
  if (!fs.existsSync(docRoot)) {
    console.error(`Corpus root not found: ${docRoot}`);
    console.error('Pass --doc <dir> (e.g. --doc doc).');
    process.exit(2);
  }

  const taskTerms = tokenize(opts.task);
  const scored = [];
  for (const abs of walkSync(docRoot)) {
    const text = normalizeText(fs.readFileSync(abs, 'utf8'));
    const rel = path.relative(docRoot, abs).split(path.sep).join('/');
    const entry = scoreFile({ rel, text, fm: parseFrontmatter(text) }, taskTerms, opts);
    if (entry) scored.push(entry);
  }

  // Deterministic ranking: score desc, then path asc for stable tie-breaks.
  scored.sort((a, b) => b.score - a.score || a.rel.localeCompare(b.rel));

  // Greedy knapsack by rank: take the next slice if it fits the remaining
  // budget; otherwise drop it (budget) and keep trying smaller slices.
  const selected = [];
  const dropped = [];
  let used = 0;
  for (const entry of scored) {
    if (opts.expand || used + entry.tokens <= opts.budget) {
      selected.push(entry);
      used += entry.tokens;
    } else {
      dropped.push({ ...entry, reason: 'budget' });
    }
  }

  if (opts.json) {
    const strip = ({ text, ...rest }) => (opts.content ? { ...rest, content: text } : rest);
    process.stdout.write(JSON.stringify({
      task: opts.task || null,
      feature: opts.feature || null,
      budget: opts.expand ? null : opts.budget,
      used_tokens: used,
      selected: selected.map(strip),
      dropped: dropped.map(strip),
    }, null, 2) + '\n');
    return;
  }

  printReport(opts, selected, dropped, used);
}

function printReport(opts, selected, dropped, used) {
  const budgetLabel = opts.expand ? 'unbounded (--expand)' : `${opts.budget} tokens`;
  console.log(`# Corpus load`);
  console.log(`task:    ${opts.task || '(none)'}`);
  if (opts.feature) console.log(`feature: ${opts.feature}`);
  if (opts.paths.length) console.log(`paths:   ${opts.paths.join(', ')}`);
  console.log(`budget:  ${budgetLabel}`);
  console.log(`loaded:  ${selected.length} slice(s), ~${used} tokens; ${dropped.length} dropped\n`);

  if (!selected.length) {
    console.log('No matching corpus slices. Try broader terms, --feature, or --expand.');
    return;
  }

  console.log('## Loaded slices (highest relevance first)\n');
  for (const s of selected) {
    const why = s.reasons.length ? ` [${s.reasons.join(', ')}]` : '';
    console.log(`- ${s.rel}  (score ${s.score}, ~${s.tokens} tok, ${s.confidence}/${s.source})${why}`);
  }

  if (dropped.length) {
    console.log('\n## Dropped for budget (re-run with --expand to include)\n');
    for (const d of dropped) {
      console.log(`- ${d.rel}  (score ${d.score}, ~${d.tokens} tok)`);
    }
  }

  if (opts.content) {
    console.log('\n---\n');
    for (const s of selected) {
      console.log(`\n===== ${s.rel} =====\n`);
      console.log(s.text);
    }
  } else {
    console.log('\nAdd --content to print the slice bodies, or --json for machine output.');
  }
}

function printHelp() {
  console.log(`corpus-load — deterministic, budgeted context retrieval over a doc/ corpus

Usage:
  node scripts/corpus-load.mjs --task "<text>" [options]
  node scripts/corpus-load.mjs --feature <slug> [options]

Options:
  --task "<text>"   Task description to score the corpus against.
  --feature <slug>  Strongly boost files under project/features/<slug>/.
  --paths a,b       Workspace path hints; boost files mentioning them.
  --budget <N>      Token budget for the loaded slice (default ${DEFAULT_BUDGET}).
  --doc <dir>       Corpus root (default ./doc).
  --content         Print the full content of each selected slice.
  --expand          Load every scored slice, ignoring the budget.
  --json            Machine-readable output.
  -h, --help        Show this help.

At least one of --task or --feature is required. Read-only: never writes the corpus.`);
}

main();
