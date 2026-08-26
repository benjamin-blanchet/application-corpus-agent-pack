#!/usr/bin/env node
/**
 * estimate-token-cost.mjs
 *
 * Approximate token cost of the pack's always-on context surface.
 *
 * Strategy:
 *   - "Always-on" surface = files loaded by every session before any tool call:
 *     AGENTS.md, .github/copilot-instructions.md, every .agent.md persona,
 *     and the frontmatter (name + description) of every SKILL.md.
 *   - We approximate tokens as ceil(chars / 3.5). This is a rough proxy used
 *     consistently before/after a change — not an exact billing simulator.
 *
 * Usage:
 *   node scripts/estimate-token-cost.mjs               # human report
 *   node scripts/estimate-token-cost.mjs --json        # machine output
 *   node scripts/estimate-token-cost.mjs --baseline    # write current to .baseline
 *   node scripts/estimate-token-cost.mjs --compare     # compare to .baseline
 *   node scripts/estimate-token-cost.mjs --check       # exit non-zero if bootstrap
 *                                                       drifted > +5% vs .baseline
 *                                                       (override with --threshold=N)
 *
 * Why this exists:
 *   Token-saving work needs a baseline. Without before/after numbers, every
 *   "we slimmed AGENTS.md" claim is hand-waving.
 *   `--check` makes drift fail loudly — wire it into a pre-commit hook or CI
 *   step to keep the gains.
 */

import fs from 'node:fs';
import path from 'node:path';
import { normalizeText } from './lib/text.mjs';

const CHARS_PER_TOKEN = 3.5;
const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const BASELINE_FILE = path.join(REPO_ROOT, '.token-cost-baseline.json');

const ALWAYS_ON_FILES = [
  'AGENTS.md',
  'KICKSTART.md',
  '.github/copilot-instructions.md',
];

const PERSONA_GLOB = '.github/agents';
const SKILLS_ROOT = '.github/skills';

function fileTokens(absPath) {
  try {
    const buf = fs.readFileSync(absPath, 'utf8');
    return { chars: buf.length, tokens: Math.ceil(buf.length / CHARS_PER_TOKEN) };
  } catch {
    return { chars: 0, tokens: 0, missing: true };
  }
}

function frontmatterOnly(absPath) {
  try {
    const buf = normalizeText(fs.readFileSync(absPath, 'utf8'));
    const match = buf.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return { chars: 0, tokens: 0 };
    const front = match[0];
    return { chars: front.length, tokens: Math.ceil(front.length / CHARS_PER_TOKEN) };
  } catch {
    return { chars: 0, tokens: 0, missing: true };
  }
}

function walkSync(dir, ext) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkSync(full, ext));
    else if (entry.isFile() && (!ext || full.endsWith(ext))) out.push(full);
  }
  return out;
}

function buildReport() {
  const sections = [];

  // 1. Top-level always-on files
  let alwaysOn = { chars: 0, tokens: 0, files: [] };
  for (const rel of ALWAYS_ON_FILES) {
    const full = path.join(REPO_ROOT, rel);
    const m = fileTokens(full);
    alwaysOn.chars += m.chars;
    alwaysOn.tokens += m.tokens;
    alwaysOn.files.push({ file: rel, ...m });
  }
  sections.push({ name: 'Top-level always-on', ...alwaysOn });

  // 2. Personas (agents)
  let personas = { chars: 0, tokens: 0, files: [] };
  const personaFiles = walkSync(path.join(REPO_ROOT, PERSONA_GLOB), '.agent.md');
  for (const full of personaFiles) {
    const m = fileTokens(full);
    personas.chars += m.chars;
    personas.tokens += m.tokens;
    personas.files.push({ file: path.relative(REPO_ROOT, full), ...m });
  }
  // Sort by tokens desc to highlight hotspots
  personas.files.sort((a, b) => b.tokens - a.tokens);
  sections.push({ name: 'Personas (.agent.md)', ...personas });

  // 3. Skills metadata-only (frontmatter)
  let skillsMeta = { chars: 0, tokens: 0, count: 0 };
  let skillsFull = { chars: 0, tokens: 0, files: [] };
  const skillFiles = walkSync(path.join(REPO_ROOT, SKILLS_ROOT), 'SKILL.md');
  for (const full of skillFiles) {
    const meta = frontmatterOnly(full);
    skillsMeta.chars += meta.chars;
    skillsMeta.tokens += meta.tokens;
    skillsMeta.count += 1;
    const full_m = fileTokens(full);
    skillsFull.chars += full_m.chars;
    skillsFull.tokens += full_m.tokens;
    skillsFull.files.push({ file: path.relative(REPO_ROOT, full), ...full_m });
  }
  skillsFull.files.sort((a, b) => b.tokens - a.tokens);
  sections.push({ name: `Skills metadata-only (${skillsMeta.count} skills)`, ...skillsMeta });
  sections.push({ name: 'Skills full body (loaded only when invoked)', ...skillsFull });

  // Totals
  const bootstrap = alwaysOn.tokens + personas.tokens + skillsMeta.tokens;
  const worstCase = bootstrap + skillsFull.tokens;

  return {
    chars_per_token_assumption: CHARS_PER_TOKEN,
    timestamp: new Date().toISOString(),
    sections,
    totals: {
      bootstrap_tokens: bootstrap,
      bootstrap_chars: alwaysOn.chars + personas.chars + skillsMeta.chars,
      worst_case_all_skills_loaded_tokens: worstCase,
    },
  };
}

function fmt(n) {
  return n.toLocaleString('en-US');
}

function printHuman(report, baseline) {
  console.log('================================================================');
  console.log('  corpus-pack token-cost estimate');
  console.log('================================================================');
  console.log(`  Assumption: 1 token ≈ ${CHARS_PER_TOKEN} chars`);
  console.log(`  Timestamp:  ${report.timestamp}`);
  console.log('');

  for (const section of report.sections) {
    console.log(`▶ ${section.name}`);
    console.log(`   ${fmt(section.tokens)} tokens  (${fmt(section.chars)} chars)`);
    if (section.files && section.files.length) {
      const top = section.files.slice(0, 8);
      for (const f of top) {
        console.log(`     ${String(fmt(f.tokens)).padStart(7)} tok  ${f.file}`);
      }
      if (section.files.length > top.length) {
        console.log(`     … ${section.files.length - top.length} more files`);
      }
    }
    console.log('');
  }

  console.log('================================================================');
  console.log('  TOTALS');
  console.log('================================================================');
  console.log(`  Amorçage (every session, before any tool call):`);
  console.log(`    = top-level + personas + skills metadata`);
  console.log(`    = ${fmt(report.totals.bootstrap_tokens)} tokens`);
  console.log('');
  console.log(`  Worst case (all skill bodies loaded):`);
  console.log(`    = ${fmt(report.totals.worst_case_all_skills_loaded_tokens)} tokens`);
  console.log('');

  if (baseline) {
    const delta = report.totals.bootstrap_tokens - baseline.totals.bootstrap_tokens;
    const pct = baseline.totals.bootstrap_tokens
      ? ((delta / baseline.totals.bootstrap_tokens) * 100).toFixed(1)
      : '0';
    console.log('  vs. baseline:');
    console.log(`    baseline bootstrap = ${fmt(baseline.totals.bootstrap_tokens)} tokens (${baseline.timestamp})`);
    console.log(`    current  bootstrap = ${fmt(report.totals.bootstrap_tokens)} tokens`);
    const sign = delta >= 0 ? '+' : '';
    console.log(`    delta             = ${sign}${fmt(delta)} tokens (${sign}${pct}%)`);
    console.log('');
  }
}

function main() {
  const args = process.argv.slice(2);
  const report = buildReport();

  if (args.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (args.includes('--baseline')) {
    fs.writeFileSync(BASELINE_FILE, JSON.stringify(report, null, 2));
    console.log(`Wrote baseline → ${path.relative(REPO_ROOT, BASELINE_FILE)}`);
    printHuman(report);
    return;
  }

  let baseline = null;
  if (args.includes('--compare') || args.includes('--check')) {
    if (!fs.existsSync(BASELINE_FILE)) {
      console.error(`No baseline file at ${BASELINE_FILE}. Run with --baseline first.`);
      process.exit(2);
    }
    baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
  }

  if (args.includes('--check')) {
    const thresholdArg = args.find((a) => a.startsWith('--threshold='));
    const thresholdPct = thresholdArg ? Number(thresholdArg.split('=')[1]) : 5;
    const base = baseline.totals.bootstrap_tokens;
    const cur = report.totals.bootstrap_tokens;
    const delta = cur - base;
    const pct = base ? (delta / base) * 100 : 0;
    const sign = delta >= 0 ? '+' : '';
    if (pct > thresholdPct) {
      console.error(
        `❌ Amorçage drift exceeds threshold:\n` +
          `   baseline = ${fmt(base)} tok (${baseline.timestamp})\n` +
          `   current  = ${fmt(cur)} tok\n` +
          `   delta    = ${sign}${fmt(delta)} tok (${sign}${pct.toFixed(1)}%, max +${thresholdPct}%)\n` +
          `   Either slim the offending file(s) or re-baseline with` +
          ` --baseline if the growth is intentional.`,
      );
      process.exit(1);
    }
    console.log(
      `✓ Amorçage within threshold: ${fmt(cur)} tok (${sign}${pct.toFixed(1)}% vs baseline ${fmt(base)}, max +${thresholdPct}%).`,
    );
    return;
  }

  printHuman(report, baseline);
}

main();
