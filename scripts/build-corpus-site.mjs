#!/usr/bin/env node
// generate-dashboard.mjs
// Read the corpus under `doc/` and emit a self-contained HTML dashboard
// to `doc/_site/corpus.html`. Pure node, no deps.
//
// Usage:
//   node scripts/generate-dashboard.mjs [docRoot] [outPath]
//
// Goals:
// - Show a clear, scan-friendly picture of the corpus AND the application
//   itself (place in the SI, architecture, features, code, prod).
// - Degrade gracefully when files are missing (no crash, "no data" cards).
// - Stay a single static .html — no external assets, no fetch at runtime.

import fs from 'node:fs';
import path from 'node:path';
import { parseBoundary } from './lib/boundary.mjs';
import { normalizeText } from './lib/text.mjs';

// =====================================================================
// Inlined dashboard theme — embedded at build time. Single self-contained script.
// =====================================================================
const INLINED_CSS = `:root {
  /* Surfaces — deep cool slate, lightly blue */
  --bg:        #06070a;
  --bg-1:      #0b0d12;
  --bg-2:      #10131a;
  --bg-3:      #161a23;
  --bg-elev:   #1b1f29;
  --line:      #1f2531;
  --line-2:    #2a3140;
  --line-3:    #3a4152;
  --line-soft: rgba(255,255,255,0.035);

  /* Foregrounds */
  --fg:    #f1f4f9;
  --fg-2:  #c1c7d3;
  --fg-3:  #818897;
  --fg-4:  #565d6c;
  --fg-5:  #3a4050;

  /* Accent — indigo→teal duotone, intentionally not "blue dashboard" */
  --accent:     #8c7bff;
  --accent-hi:  #a899ff;
  --accent-lo:  #6b58e6;
  --accent-2:   #4fd9c8;
  --accent-2-hi:#7fe7da;
  --accent-3:   #ff7eb6;

  /* Status palette */
  --good:      #41d680;
  --mid:       #f3b35a;
  --low:       #ef6a67;

  --confirmed: #41d680;
  --active:    #6ed1bc;
  --partial:   #f3b35a;
  --empty:     #485165;
  --unknown:   #8c7bff;

  --radius:    12px;
  --radius-sm: 7px;
  --radius-xs: 5px;

  --shadow-1:  0 1px 2px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.025);
  --shadow-2:  0 14px 40px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.4);
  --shadow-glow: 0 0 30px -10px rgba(140,123,255,0.45);

  --ease: cubic-bezier(0.22, 1, 0.36, 1);
  --ease-out: cubic-bezier(0.2, 0.8, 0.2, 1);
}

* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; min-height: 100%; }
body {
  position: relative;
  color: var(--fg);
  background:
    radial-gradient(1100px 520px at 78% -10%, rgba(140,123,255,0.10), transparent 62%),
    radial-gradient(900px 480px at -8% 8%, rgba(79,217,200,0.055), transparent 60%),
    radial-gradient(720px 420px at 50% 110%, rgba(255,126,182,0.04), transparent 62%),
    var(--bg);
  background-attachment: fixed;
  font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI Variable", "Segoe UI", system-ui, sans-serif;
  font-size: 13.5px;
  line-height: 1.55;
  font-feature-settings: "cv11", "ss01", "ss03", "calt";
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
  overflow-x: hidden;
}
::selection { background: rgba(140,123,255,0.38); color: #fff; }

/* Subtle dotted grid texture, doesn't move */
.bg-grid {
  position: fixed; inset: 0; z-index: 0; pointer-events: none;
  background-image:
    radial-gradient(circle at 1px 1px, rgba(255,255,255,0.025) 1px, transparent 0);
  background-size: 28px 28px;
  mask-image: radial-gradient(ellipse 70% 60% at 50% 30%, #000 30%, transparent 90%);
  -webkit-mask-image: radial-gradient(ellipse 70% 60% at 50% 30%, #000 30%, transparent 90%);
  opacity: 0.55;
}

/* Custom scrollbar */
* { scrollbar-width: thin; scrollbar-color: var(--line-3) transparent; }
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--line-2); border-radius: 999px; border: 2px solid transparent; background-clip: padding-box; }
::-webkit-scrollbar-thumb:hover { background: var(--line-3); background-clip: padding-box; border: 2px solid transparent; }

a { color: var(--accent-hi); text-decoration: none; transition: color 0.12s var(--ease); }
a:hover { color: var(--fg); }
code, .mono, .mono-cell { font-family: ui-monospace, "JetBrains Mono", "SF Mono", SFMono-Regular, Menlo, monospace; font-size: 0.88em; font-variant-ligatures: none; }
code { background: var(--bg-3); padding: 0.1em 0.42em; border-radius: 4px; color: var(--fg-2); border: 1px solid var(--line); font-size: 0.85em; }
.muted { color: var(--fg-4); }
.num, .pct-num, .idx-num, .t-value, .big-num { font-variant-numeric: tabular-nums; font-feature-settings: "tnum", "cv11"; }

button, input, select { font-family: inherit; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 4px; }

h1 { font-size: 22px; font-weight: 600; margin: 0; letter-spacing: -0.022em; color: var(--fg); line-height: 1.2; }
h2 { font-size: 15px; font-weight: 600; margin: 24px 0 10px; color: var(--fg); letter-spacing: -0.008em; }
h3 { font-size: 10.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.12em; color: var(--fg-3); margin: 0; }
p.lede { color: var(--fg-3); margin: 6px 0 0; font-size: 13px; max-width: 64ch; line-height: 1.55; }

/* ============================================================== */
/* Header                                                          */
/* ============================================================== */
.site-header {
  position: sticky; top: 0; z-index: 30;
  background: linear-gradient(180deg, rgba(6,7,10,0.92) 0%, rgba(6,7,10,0.82) 100%);
  backdrop-filter: saturate(160%) blur(18px);
  -webkit-backdrop-filter: saturate(160%) blur(18px);
  border-bottom: 1px solid var(--line);
  box-shadow: 0 1px 0 rgba(255,255,255,0.025) inset;
}
.site-header::after {
  content: ''; position: absolute; left: 0; right: 0; bottom: -1px; height: 1px;
  background: linear-gradient(90deg, transparent 0%, rgba(140,123,255,0.4) 50%, transparent 100%);
  opacity: 0.6;
}
.site-header-inner {
  position: relative;
  display: flex; align-items: center; justify-content: space-between;
  padding: 18px 32px;
  gap: 28px; flex-wrap: wrap;
  max-width: 1520px; margin: 0 auto;
}
.brand { display: flex; align-items: center; gap: 14px; min-width: 0; }
.mark {
  position: relative;
  display: grid; place-items: center;
  width: 44px; height: 44px;
  background:
    radial-gradient(circle at 30% 25%, rgba(168,153,255,0.35), transparent 60%),
    linear-gradient(140deg, rgba(140,123,255,0.18), rgba(79,217,200,0.08) 60%, transparent);
  border: 1px solid var(--line-2);
  border-radius: 11px;
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.06),
    inset 0 0 0 1px rgba(255,255,255,0.02),
    0 4px 12px -4px rgba(140,123,255,0.35);
}
.mark::after {
  content: ''; position: absolute; inset: -1px;
  border-radius: 12px;
  background: linear-gradient(140deg, rgba(140,123,255,0.4), transparent 50%);
  z-index: -1;
  opacity: 0.5;
  filter: blur(8px);
}
.brand-text { display: flex; flex-direction: column; min-width: 0; gap: 1px; }
.brand-kicker {
  font-size: 9.5px; font-weight: 600; letter-spacing: 0.18em;
  text-transform: uppercase; color: var(--fg-4);
  display: inline-flex; align-items: center; gap: 6px;
}
.brand-kicker::before {
  content: ''; width: 14px; height: 1px;
  background: linear-gradient(90deg, var(--accent), transparent);
}
.brand-line1 { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.brand-line2 { display: flex; align-items: center; gap: 8px; margin-top: 3px; flex-wrap: wrap; }
.app-name { font-size: 22px; font-weight: 600; letter-spacing: -0.024em; color: var(--fg); line-height: 1.15; }
.brand-domain {
  font-size: 12.5px; color: var(--fg-3); letter-spacing: 0.005em;
  padding-left: 12px; margin-left: 2px;
  border-left: 1px solid var(--line-2);
  line-height: 1.2;
}
.app-sub { color: var(--fg-3); font-size: 12px; letter-spacing: 0.005em; }
.brand-actions {
  display: flex; flex-direction: column; gap: 4px; align-items: flex-end;
  padding-left: 16px; border-left: 1px solid var(--line);
  margin-left: auto;
}
@media (max-width: 880px) { .brand-actions { display: none; } }
.freshness {
  display: inline-flex; align-items: center; gap: 7px;
  font-size: 11px; color: var(--fg-3);
  letter-spacing: 0.01em;
}
.freshness strong { color: var(--fg); font-weight: 600; font-variant-numeric: tabular-nums; }
.freshness-dot {
  width: 5px; height: 5px; border-radius: 999px;
  background: var(--mid);
  box-shadow: 0 0 0 3px rgba(243,179,90,0.16);
}
.freshness-dot-ok { background: var(--good); box-shadow: 0 0 0 3px rgba(65,214,128,0.16); }
.hero-phrase {
  margin: 10px 0 0; padding: 0;
  color: var(--fg-2); font-size: 13px; line-height: 1.5;
  max-width: 64ch; letter-spacing: 0.005em;
}

.badge {
  display: inline-flex; align-items: center; gap: 6px;
  height: 20px; padding: 0 9px;
  background: linear-gradient(180deg, rgba(140,123,255,0.18), rgba(140,123,255,0.10));
  border: 1px solid rgba(140,123,255,0.32);
  color: #cabfff;
  border-radius: 999px;
  font-size: 10.5px; font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: lowercase;
}
.badge.badge-outline {
  background: transparent;
  border-color: var(--line-2); color: var(--fg-3);
  text-transform: none;
  font-weight: 500;
}
.badge.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; letter-spacing: 0.04em; }
.badge-dot { width: 6px; height: 6px; border-radius: 999px; background: var(--accent-hi); box-shadow: 0 0 0 3px rgba(140,123,255,0.22), 0 0 8px rgba(140,123,255,0.6); }

.stats {
  display: flex; gap: 8px; flex-wrap: wrap;
  padding-left: 24px;
  border-left: 1px solid var(--line);
  position: relative;
}
@media (max-width: 1000px) {
  .stats { padding-left: 0; border-left: 0; }
}
.tile {
  position: relative;
  background:
    linear-gradient(180deg, rgba(255,255,255,0.025) 0%, transparent 35%),
    var(--bg-1);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  padding: 10px 14px;
  min-width: 86px;
  display: flex; flex-direction: column; gap: 1px;
  transition: border-color 0.18s var(--ease), background 0.18s var(--ease), transform 0.18s var(--ease);
  overflow: hidden;
}
.tile::before {
  content: ''; position: absolute; left: 0; top: 0; bottom: 0;
  width: 2px;
  background: linear-gradient(180deg, var(--accent), var(--accent-2));
  opacity: 0; transition: opacity 0.2s var(--ease);
}
.tile:hover { border-color: var(--line-2); background: linear-gradient(180deg, rgba(255,255,255,0.04), transparent 50%), var(--bg-2); }
.tile:hover::before { opacity: 1; }
.t-label {
  font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.14em;
  color: var(--fg-4); font-weight: 600;
}
.t-value {
  font-size: 22px; font-weight: 600;
  color: var(--fg);
  letter-spacing: -0.025em; line-height: 1.05;
  margin-top: 4px;
  font-variant-numeric: tabular-nums;
}
.t-sub { font-size: 10.5px; color: var(--fg-4); margin-top: 3px; letter-spacing: 0.01em; }
.tile.tone-low .t-value { color: var(--low); }
.tile.tone-mid .t-value { color: var(--mid); }
.tile.tone-high .t-value { color: var(--good); }
.tile.tone-unmeasured { opacity: 0.78; }
.tile.tone-unmeasured .t-value { color: var(--fg-4); }
.t-value-empty { font-weight: 400; letter-spacing: 0; color: var(--fg-4); }
.t-stack-empty .seg-empty { opacity: 0.5; }

.tile-coverage { min-width: 216px; }
.t-coverage { display: flex; align-items: center; gap: 14px; margin-top: 4px; }
.t-coverage-side { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.t-coverage .t-value { display: flex; align-items: baseline; gap: 1px; margin-top: 0; font-size: 24px; }
.pct-unit { font-size: 12px; font-weight: 500; color: var(--fg-4); margin-left: 2px; letter-spacing: 0; }
.t-stack {
  display: flex; height: 5px; width: 100%;
  background: var(--bg-3); border-radius: 999px; overflow: hidden;
  border: 1px solid var(--line-soft);
  position: relative;
}
.t-stack .seg { display: block; height: 100%; transition: width 0.6s var(--ease-out); }
.seg-confirmed { background: linear-gradient(90deg, var(--confirmed), #6de89b); }
.seg-active    { background: linear-gradient(90deg, var(--active), var(--accent-2-hi)); }
.seg-partial   { background: linear-gradient(90deg, var(--partial), #f8c97b); }
.seg-empty     { background: var(--empty); }
.seg-unknown   { background: linear-gradient(90deg, var(--unknown), var(--accent-hi)); }

.ring { display: block; flex-shrink: 0; filter: drop-shadow(0 0 6px rgba(140,123,255,0.18)); }
.ring-track { fill: none; stroke: var(--bg-3); stroke-width: 4; }
.ring-fill {
  fill: none; stroke: url(#ringGrad); stroke-width: 4; stroke-linecap: round;
  transition: stroke-dashoffset 0.8s var(--ease-out);
}
.tile.tone-low .ring-fill { stroke: var(--low); filter: drop-shadow(0 0 4px rgba(239,106,103,0.5)); }
.tile.tone-mid .ring-fill { stroke: var(--mid); filter: drop-shadow(0 0 4px rgba(243,179,90,0.5)); }
.tile.tone-high .ring-fill { stroke: var(--good); filter: drop-shadow(0 0 4px rgba(65,214,128,0.5)); }
.ring-dot {
  fill: var(--fg);
  opacity: 0.85;
}

/* ============================================================== */
/* Tabs                                                            */
/* ============================================================== */
.tabs {
  border-bottom: 1px solid var(--line);
  background: linear-gradient(180deg, rgba(6,7,10,0.6), rgba(6,7,10,0.3));
  position: relative;
  z-index: 20;
}
.tabs-inner { display: flex; gap: 2px; padding: 0 28px; max-width: 1520px; margin: 0 auto; }
.tab {
  background: none; border: none; color: var(--fg-3);
  padding: 13px 14px 12px;
  font-size: 13px; font-weight: 500; font-family: inherit;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  display: inline-flex; align-items: center; gap: 8px;
  transition: color 0.16s var(--ease), border-color 0.22s var(--ease);
  position: relative;
  letter-spacing: -0.005em;
}
.tab::before {
  content: ''; position: absolute; left: 4px; right: 4px; bottom: 0;
  height: 2px;
  background: linear-gradient(90deg, var(--accent), var(--accent-2));
  border-radius: 2px 2px 0 0;
  opacity: 0; transform: scaleX(0.6);
  transition: opacity 0.22s var(--ease), transform 0.22s var(--ease-out);
}
.tab:hover { color: var(--fg-2); }
.tab.active { color: var(--fg); }
.tab.active::before { opacity: 1; transform: scaleX(1); }
.tab.active { border-bottom-color: transparent; }
.tab-label { font-weight: 500; }
.tab-meta {
  font-size: 10px; font-weight: 600;
  color: var(--fg-4);
  background: var(--bg-2);
  border: 1px solid var(--line);
  padding: 1.5px 7px; border-radius: 999px;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
  transition: all 0.16s var(--ease);
}
.tab:hover .tab-meta { color: var(--fg-3); border-color: var(--line-2); }
.tab.active .tab-meta {
  color: var(--accent-hi);
  border-color: rgba(140,123,255,0.32);
  background: rgba(140,123,255,0.10);
}

/* ============================================================== */
/* Layout                                                          */
/* ============================================================== */
main { position: relative; z-index: 1; padding: 32px; max-width: 1520px; margin: 0 auto; }
.panel { display: none; animation: panelIn 0.32s var(--ease-out); }
.panel.active { display: block; }
@keyframes panelIn {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}

.panel-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; margin-bottom: 26px; flex-wrap: wrap; }
.panel-head h1 { letter-spacing: -0.025em; }
.panel-head-meta { display: flex; gap: 16px; flex-wrap: wrap; padding-top: 6px; }
.kv-inline { display: inline-flex; align-items: baseline; gap: 6px; font-size: 12px; }
.kv-inline .k { color: var(--fg-4); text-transform: uppercase; font-size: 10px; letter-spacing: 0.12em; font-weight: 600; }
.kv-inline .v { color: var(--fg); font-weight: 600; font-variant-numeric: tabular-nums; font-size: 13px; }

.card {
  background:
    linear-gradient(180deg, rgba(255,255,255,0.012) 0%, transparent 30%),
    var(--bg-1);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  overflow: hidden;
  box-shadow: var(--shadow-1);
}
.card + .card { margin-top: 18px; }
.card-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--line);
  background: linear-gradient(180deg, rgba(255,255,255,0.02), transparent 80%);
}
.card-head h3 { font-size: 10.5px; letter-spacing: 0.14em; color: var(--fg-2); }
.card-meta { font-size: 11px; color: var(--fg-4); font-variant-numeric: tabular-nums; }
.card-table table { margin: 0; }

.card-anchor { padding: 18px 22px 6px; }
.card-anchor .card-head { padding: 0 0 14px; margin: 0; border-bottom: 1px solid var(--line); background: transparent; }
.anchor-bar {
  position: relative;
  height: 26px;
  background: rgba(255,255,255,0.03);
  border: 1px solid var(--line);
  border-radius: 999px;
  margin: 16px 0 10px;
  overflow: hidden;
  display: flex; align-items: center;
}
.anchor-fill {
  position: absolute; left: 0; top: 0; bottom: 0;
  background: linear-gradient(90deg, var(--accent), var(--accent-2));
  border-radius: 999px;
  transition: width 0.4s var(--ease);
}
.anchor-bar.tone-low .anchor-fill { background: linear-gradient(90deg, var(--low), #f59f8a); }
.anchor-bar.tone-mid .anchor-fill { background: linear-gradient(90deg, var(--mid), #ffd09a); }
.anchor-bar.tone-high .anchor-fill { background: linear-gradient(90deg, var(--accent), var(--accent-2)); }
.anchor-pct {
  position: relative; z-index: 1;
  margin-left: auto; margin-right: 14px;
  font-size: 11.5px; font-weight: 600;
  color: #fff; letter-spacing: 0.01em;
  font-variant-numeric: tabular-nums;
  text-shadow: 0 1px 2px rgba(0,0,0,0.5);
}
.anchor-sub {
  display: flex; align-items: baseline; justify-content: space-between;
  margin: 18px 0 8px;
}
.anchor-sub-label {
  font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.14em;
  color: var(--fg-2); font-weight: 600;
}
.empty-small { padding: 14px 16px; margin: 12px 0 0; }
.empty-small .empty-title { font-size: 12px; color: var(--fg-2); }
.card > dl { padding: 16px 18px; }

/* ============================================================== */
/* Coverage                                                        */
/* ============================================================== */
.cov-grid {
  display: grid;
  grid-template-columns: minmax(0, 300px) 1fr;
  gap: 20px;
  align-items: start;
}
@media (max-width: 980px) { .cov-grid { grid-template-columns: 1fr; } }

.cov-dist { padding: 18px 18px 14px; }
.cov-dist .card-head { padding: 0 0 14px; margin: 0; border-bottom: 1px solid var(--line); background: transparent; }
.dist-row {
  display: grid;
  grid-template-columns: 10px 1fr auto 90px 42px;
  gap: 12px; align-items: center;
  padding: 11px 0;
  border-bottom: 1px solid var(--line-soft);
  font-size: 12.5px;
  transition: opacity 0.15s var(--ease);
}
.dist-row:last-child { border-bottom: 0; }
.dist-row:has(.dist-count:first-letter:not(:empty)) { /* no-op for browsers w/o :has */ }
.dist-dot {
  width: 8px; height: 8px; border-radius: 999px;
  box-shadow: 0 0 0 3px rgba(0,0,0,0.2), 0 0 6px currentColor;
}
.dist-confirmed .dist-dot { background: var(--confirmed); color: rgba(65,214,128,0.5); }
.dist-active .dist-dot    { background: var(--active); color: rgba(110,209,188,0.5); }
.dist-partial .dist-dot   { background: var(--partial); color: rgba(243,179,90,0.5); }
.dist-empty .dist-dot     { background: var(--empty); color: transparent; box-shadow: 0 0 0 2px var(--bg-3); }
.dist-unknown .dist-dot   { background: var(--unknown); color: rgba(140,123,255,0.5); }
.dist-label { color: var(--fg-2); font-weight: 500; letter-spacing: -0.005em; }
.dist-count { font-variant-numeric: tabular-nums; color: var(--fg); font-weight: 600; min-width: 18px; text-align: right; font-size: 13px; }
.dist-bar { height: 4px; background: var(--bg-3); border-radius: 999px; overflow: hidden; box-shadow: inset 0 0 0 1px var(--line-soft); }
.dist-bar-fill { display: block; height: 100%; transition: width 0.7s var(--ease-out); border-radius: 999px; }
.dist-confirmed .dist-bar-fill { background: linear-gradient(90deg, var(--confirmed), #6de89b); }
.dist-active .dist-bar-fill    { background: linear-gradient(90deg, var(--active), var(--accent-2-hi)); }
.dist-partial .dist-bar-fill   { background: linear-gradient(90deg, var(--partial), #f8c97b); }
.dist-empty .dist-bar-fill     { background: var(--empty); }
.dist-unknown .dist-bar-fill   { background: linear-gradient(90deg, var(--unknown), var(--accent-hi)); }
.dist-pct { text-align: right; color: var(--fg-3); font-variant-numeric: tabular-nums; font-size: 11.5px; font-weight: 500; }

/* ============================================================== */
/* Tables                                                          */
/* ============================================================== */
table.coverage, table.sources { width: 100%; border-collapse: collapse; }
table.coverage th, table.sources th {
  text-align: left; color: var(--fg-4); font-weight: 600;
  font-size: 10px; text-transform: uppercase; letter-spacing: 0.14em;
  padding: 12px 16px;
  background: var(--bg-2);
  border-bottom: 1px solid var(--line);
}
table.coverage td, table.sources td {
  padding: 14px 16px;
  border-bottom: 1px solid var(--line-soft);
  vertical-align: middle;
  font-size: 12.5px;
  color: var(--fg-2);
}
table.coverage tbody tr, table.sources tbody tr {
  cursor: pointer;
  transition: background 0.14s var(--ease);
  position: relative;
}
table.coverage tbody tr::after, table.sources tbody tr::after {
  content: ''; position: absolute; left: 0; right: 0; top: 0; bottom: 0;
  background: linear-gradient(90deg, rgba(140,123,255,0.05), transparent 40%);
  opacity: 0; transition: opacity 0.14s var(--ease);
  pointer-events: none;
}
table.coverage tbody tr:hover, table.sources tbody tr:hover { background: rgba(255,255,255,0.022); }
table.coverage tbody tr:hover::after, table.sources tbody tr:hover::after { opacity: 1; }
table.coverage tbody tr:last-child td, table.sources tbody tr:last-child td { border-bottom: 0; }

td.area {
  font-weight: 500; color: var(--fg); width: 22%;
  position: relative; padding-left: 22px;
  letter-spacing: -0.01em;
}
.bucket-bar {
  position: absolute; left: 0; top: 8px; bottom: 8px;
  width: 3px;
  border-radius: 2px;
  background: var(--empty);
}
.bucket-confirmed { background: linear-gradient(180deg, var(--confirmed), #6de89b); box-shadow: 0 0 8px rgba(65,214,128,0.4); }
.bucket-active    { background: linear-gradient(180deg, var(--active), var(--accent-2-hi)); box-shadow: 0 0 8px rgba(110,209,188,0.3); }
.bucket-partial   { background: linear-gradient(180deg, var(--partial), #f8c97b); box-shadow: 0 0 6px rgba(243,179,90,0.3); }
.bucket-empty     { background: var(--empty); opacity: 0.5; }
.bucket-unknown   { background: var(--unknown); box-shadow: 0 0 6px rgba(140,123,255,0.3); }

td.ev { color: var(--fg-3); font-size: 12px; }
td.gaps { color: var(--fg-2); }
td.next { font-size: 12px; }
.next-tag {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 3px 9px 3px 7px;
  background: linear-gradient(180deg, rgba(140,123,255,0.10), rgba(140,123,255,0.04));
  border: 1px solid rgba(140,123,255,0.22);
  border-radius: 6px;
  color: #c6bcff;
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0.01em;
  transition: all 0.14s var(--ease);
}
.next-tag::before {
  content: '→';
  font-family: inherit;
  color: var(--accent);
  font-size: 11px;
  opacity: 0.7;
}
tr:hover .next-tag { border-color: rgba(140,123,255,0.4); color: var(--accent-hi); }
.src-name { font-weight: 500; color: var(--fg); letter-spacing: -0.005em; }
.mono-cell { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11.5px; color: var(--fg-3); }

.chip {
  display: inline-block; padding: 2.5px 8px;
  background: var(--bg-3);
  border: 1px solid var(--line);
  border-radius: 5px;
  color: var(--fg-2);
  font-size: 10.5px;
  letter-spacing: 0.02em;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

/* ============================================================== */
/* Pills                                                           */
/* ============================================================== */
.pill {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 10.5px; font-weight: 600;
  letter-spacing: 0.02em;
  border: 1px solid transparent;
  text-transform: lowercase;
}
.pill-dot {
  width: 5px; height: 5px; border-radius: 999px;
  background: currentColor;
  box-shadow: 0 0 0 2px currentColor, 0 0 6px currentColor;
  opacity: 0.9;
}
.pill-empty     { background: rgba(72,81,101,0.18);  color: #939aaa; border-color: rgba(72,81,101,0.4); }
.pill-partial   { background: rgba(243,179,90,0.10);  color: #f5be71; border-color: rgba(243,179,90,0.3); }
.pill-active    { background: rgba(110,209,188,0.10); color: #84dccb; border-color: rgba(110,209,188,0.3); }
.pill-confirmed { background: rgba(65,214,128,0.10);  color: #5fe096; border-color: rgba(65,214,128,0.3); }
.pill-unknown   { background: rgba(140,123,255,0.10); color: #c6bcff; border-color: rgba(140,123,255,0.3); }
.pill .pill-dot { width: 5px; height: 5px; }
.pill-empty .pill-dot { box-shadow: 0 0 0 2px currentColor; opacity: 0.7; }

/* ============================================================== */
/* Empty states                                                    */
/* ============================================================== */
.empty {
  text-align: center;
  padding: 36px 24px;
  color: var(--fg-3);
}
.empty-large { padding: 72px 24px; }
.empty-icon {
  display: inline-grid; place-items: center;
  width: 46px; height: 46px;
  margin: 0 auto 14px;
  border-radius: 50%;
  border: 1px dashed var(--line-2);
  color: var(--fg-4);
  font-size: 19px;
  background:
    radial-gradient(circle, rgba(140,123,255,0.06), transparent 70%),
    var(--bg-2);
  position: relative;
}
.empty-icon::after {
  content: ''; position: absolute; inset: -6px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(140,123,255,0.08), transparent 65%);
  z-index: -1;
  filter: blur(4px);
}
.empty-title { color: var(--fg-2); font-weight: 500; font-size: 13.5px; margin-bottom: 5px; letter-spacing: -0.01em; }
.empty-sub { font-size: 12px; color: var(--fg-4); max-width: 36ch; margin: 0 auto; line-height: 1.55; }
.empty-sub code { font-size: 11px; }

/* ============================================================== */
/* Indexes                                                         */
/* ============================================================== */
.idx-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
.idx-card {
  display: flex; flex-direction: column; gap: 12px;
  background:
    linear-gradient(180deg, rgba(255,255,255,0.015) 0%, transparent 40%),
    var(--bg-1);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 16px 18px;
  color: var(--fg);
  text-decoration: none;
  transition: all 0.2s var(--ease-out);
  position: relative;
  overflow: hidden;
}
.idx-card::before {
  content: ''; position: absolute; inset: 0;
  background:
    radial-gradient(circle at 100% 0%, rgba(140,123,255,0.10), transparent 50%),
    linear-gradient(135deg, rgba(140,123,255,0.05), transparent 50%);
  opacity: 0; transition: opacity 0.22s var(--ease);
  pointer-events: none;
}
.idx-card::after {
  content: ''; position: absolute; left: 0; right: 0; top: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--accent), var(--accent-2), transparent);
  opacity: 0; transition: opacity 0.22s var(--ease);
}
.idx-card:hover {
  border-color: rgba(140,123,255,0.45);
  transform: translateY(-3px);
  box-shadow: var(--shadow-2), 0 0 24px -10px rgba(140,123,255,0.55);
}
.idx-card:hover::before { opacity: 1; }
.idx-card:hover::after { opacity: 0.8; }
.idx-card:hover .idx-arrow { color: var(--accent-hi); transform: translate(2px, -2px); }
.idx-card.is-empty { opacity: 0.55; }
.idx-card.is-empty:hover { opacity: 0.85; }
.idx-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.idx-name {
  font-size: 10.5px; color: var(--fg-3); text-transform: uppercase;
  letter-spacing: 0.14em; font-weight: 600;
}
.idx-arrow { color: var(--fg-4); transition: all 0.2s var(--ease); font-size: 13px; line-height: 1; }
.idx-count { display: flex; align-items: baseline; gap: 6px; }
.idx-num {
  font-size: 30px; font-weight: 600;
  letter-spacing: -0.035em; color: var(--fg);
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.idx-unit { font-size: 11px; color: var(--fg-4); letter-spacing: 0.02em; }
.idx-bar { height: 3px; background: var(--bg-3); border-radius: 999px; overflow: hidden; box-shadow: inset 0 0 0 1px var(--line-soft); }
.idx-bar-fill {
  display: block; height: 100%;
  background: linear-gradient(90deg, var(--accent), var(--accent-2));
  border-radius: 999px;
  transition: width 0.7s var(--ease-out);
  box-shadow: 0 0 8px rgba(140,123,255,0.5);
}
.idx-card.is-empty .idx-bar-fill { background: var(--empty); box-shadow: none; }

/* ============================================================== */
/* About                                                           */
/* ============================================================== */
.cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 18px; }
dl { display: grid; grid-template-columns: minmax(90px, max-content) 1fr; gap: 12px 20px; margin: 0; }
dt {
  color: var(--fg-4); font-size: 10px;
  text-transform: uppercase; letter-spacing: 0.12em;
  font-weight: 600; align-self: center;
}
dd { margin: 0; color: var(--fg); font-size: 13px; letter-spacing: -0.005em; }
.dd-chips { display: flex; flex-wrap: wrap; gap: 5px; }
.big-num { font-size: 22px; font-weight: 600; letter-spacing: -0.025em; }

/* ============================================================== */
/* Graph                                                           */
/* ============================================================== */
.graph-wrap {
  position: relative;
  height: calc(100vh - 300px);
  min-height: 520px;
  background:
    radial-gradient(ellipse 80% 60% at 50% 40%, rgba(140,123,255,0.07), transparent 65%),
    radial-gradient(ellipse 60% 40% at 30% 80%, rgba(79,217,200,0.04), transparent 65%),
    var(--bg-1);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  overflow: hidden;
  box-shadow: var(--shadow-1);
}
.graph-wrap::before {
  content: ''; position: absolute; inset: 0;
  background-image:
    linear-gradient(rgba(255,255,255,0.018) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.018) 1px, transparent 1px);
  background-size: 40px 40px;
  mask-image: radial-gradient(ellipse at center, #000 30%, transparent 80%);
  -webkit-mask-image: radial-gradient(ellipse at center, #000 30%, transparent 80%);
  pointer-events: none;
}
.graph-wrap.is-empty #graph { opacity: 0; }
#graph { position: relative; z-index: 1; width: 100%; height: 100%; display: block; }
.graph-legend {
  position: absolute; bottom: 14px; left: 14px;
  background: rgba(11,13,18,0.85);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid var(--line);
  border-radius: 9px;
  padding: 10px 14px;
  font-size: 11px; color: var(--fg-3);
  display: flex; gap: 16px; flex-wrap: wrap;
  max-width: calc(100% - 28px);
  z-index: 2;
  box-shadow: var(--shadow-1);
}
.legend-item { display: flex; align-items: center; gap: 7px; }
.legend-dot { width: 8px; height: 8px; border-radius: 999px; box-shadow: 0 0 0 2px rgba(0,0,0,0.4), 0 0 8px currentColor; }
.graph-empty {
  position: absolute; inset: 0;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  text-align: center;
  color: var(--fg-3);
  z-index: 2;
}
.graph-empty .empty-icon { width: 64px; height: 64px; font-size: 28px; margin-bottom: 16px; }
.graph-empty .empty-title { font-size: 14px; }

/* SVG node hover */
.graph-node circle { transition: r 0.18s var(--ease), filter 0.18s var(--ease); }
.graph-node:hover circle { filter: drop-shadow(0 0 8px currentColor) drop-shadow(0 0 16px currentColor); }
.graph-node text { pointer-events: none; user-select: none; }

/* ============================================================== */
/* Universe / orrery view                                          */
/* ============================================================== */
/* Universe panel breaks out of <main> width/padding to occupy the viewport. */
#tab-universe.panel.active {
  max-width: none;
  margin: 0 -28px;
  padding: 0;
}
#tab-universe .panel-head {
  padding: 4px 28px 18px;
}
.universe-wrap {
  position: relative;
  background: #000;
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  overflow: hidden;
  margin-top: 0;
  height: calc(100vh - 230px);
  min-height: 540px;
  width: 100%;
}
.universe { display: block; width: 100%; height: 100%; user-select: none; }

.universe text { font-family: inherit; pointer-events: none; }
.u-label { fill: #D6E2F2; font-size: 9.5px; letter-spacing: 0.22em; font-weight: 400; }
.u-label-strong { fill: #ffffff; font-size: 13px; letter-spacing: 0.28em; font-weight: 500; }
.u-label-sub { fill: #7E8BA3; font-size: 8px; letter-spacing: 0.18em; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.u-label-mono { fill: #C0C8D8; font-size: 9px; letter-spacing: 0.18em; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.u-skill-label { fill: #a899ff; }
.u-chrome { fill: #475069; font-size: 9px; letter-spacing: 0.28em; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.u-chrome-sub { fill: #2c3344; font-size: 8px; letter-spacing: 0.22em; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }

.u-orbit {
  fill: none;
  stroke: rgba(0, 194, 212, 0.15);
  stroke-width: 0.7;
  stroke-dasharray: 1.5 6;
}

.u-stars circle { animation: u-twinkle 4s ease-in-out infinite; }
.u-stars circle:nth-child(3n) { animation-delay: -1s; }
.u-stars circle:nth-child(5n) { animation-delay: -2.4s; }
@keyframes u-twinkle { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }

@keyframes u-pulse-halo { 0%, 100% { opacity: 0.10; } 50% { opacity: 0.22; } }
.u-center circle:first-child { animation: u-pulse-halo 3.4s ease-in-out infinite; }

/* Orbit groups are intentionally static — CSS transform on SVG <g> conflicts
   with the per-moon translate() attribute. We keep visual life via the
   starfield twinkle and the central body halo pulse only. */
.u-orbit-anim, .u-rotate-slow, .u-rotate-slower { transform-origin: 0 0; }

.u-body { cursor: pointer; transition: filter 0.2s var(--ease); }
.u-body:hover { filter: drop-shadow(0 0 14px currentColor); }
.u-body:focus { outline: none; filter: drop-shadow(0 0 16px #00C2D4); }
.u-body:focus-visible { filter: drop-shadow(0 0 16px #00C2D4); }
.u-sat-off { cursor: default; }
.u-sat-off:hover { filter: none; }

.u-legend-bar {
  margin-top: 14px;
  border: 1px solid var(--line);
  border-bottom: none;
  border-radius: var(--radius-md) var(--radius-md) 0 0;
  background: linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.25) 100%);
}
.u-legend-bar-inner {
  display: flex; flex-wrap: wrap; align-items: center;
  gap: 8px 22px;
  padding: 10px 18px;
  font-size: 11px; color: #C0C8D8;
}
.u-legend-row { display: inline-flex; align-items: center; gap: 8px; line-height: 1.4; white-space: nowrap; }
.u-legend-row .muted { color: var(--fg-4); font-size: 10.5px; }
.universe-wrap { margin-top: 0 !important; border-radius: 0 0 var(--radius-md) var(--radius-md); border-top: 0; }
.u-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; box-shadow: 0 0 8px currentColor; }
.u-dot-teal { background: #00C2D4; color: #00C2D4; }
.u-dot-silver { background: #C0C8D8; color: #C0C8D8; border-radius: 2px; transform: rotate(45deg); }
.u-dot-green { background: #10B981; color: #10B981; }
.u-dot-amber { background: #F59E0B; color: #F59E0B; }
.u-dot-nebula { background: #7c5cff; color: #7c5cff; }
.u-dot-orange { background: #FB923C; color: #FB923C; }
.u-dot-purple { background: #C084FC; color: #C084FC; }

.u-ring-label {
  fill: #475069; font-size: 9px; letter-spacing: 0.32em;
  text-transform: uppercase; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  pointer-events: none;
}
.u-empty-overlay { pointer-events: none; }
.u-empty-title {
  fill: #7E8BA3; font-size: 14px; letter-spacing: 0.38em;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 500;
}
.u-empty-sub {
  fill: #475069; font-size: 10px; letter-spacing: 0.10em;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.u-edges path { transition: stroke-opacity 0.2s var(--ease); }
.u-feature-label { fill: #b6f0f6; }

/* ---- Breadcrumb ---- */
.u-breadcrumb {
  display: flex; align-items: center; gap: 12px;
  margin-top: 0;
  padding: 12px 28px;
  background: rgba(4, 8, 16, 0.65);
  border-top: 1px solid rgba(0, 194, 212, 0.18);
  border-bottom: 1px solid rgba(0, 194, 212, 0.10);
  font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase;
}
.u-breadcrumb + .u-legend-bar { margin-top: 0; border-radius: 0; border-top: none; }
.u-legend-bar { border-radius: 0; }
.u-bc-dot { width: 6px; height: 6px; border-radius: 50%; background: #00C2D4; box-shadow: 0 0 10px #00C2D4; flex-shrink: 0; }
.u-bc-item {
  background: none; border: none; padding: 0; cursor: pointer;
  font: inherit; color: rgba(180, 200, 220, 0.45);
  letter-spacing: inherit; text-transform: inherit;
  transition: color 0.2s var(--ease);
}
.u-bc-item:hover { color: #00C2D4; }
.u-bc-current { color: #E8F0F8; font-weight: 600; cursor: default; }
.u-bc-current:hover { color: #E8F0F8; }
.u-bc-sep { color: rgba(180, 200, 220, 0.22); font-size: 18px; line-height: 1; margin: 0 -4px; }

/* ---- Back button ---- */
.u-back-btn {
  position: absolute; top: 16px; right: 18px; z-index: 5;
  display: inline-flex; align-items: center; gap: 8px;
  background: rgba(5, 8, 18, 0.85);
  backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(0, 194, 212, 0.22);
  color: #7E8BA3;
  padding: 7px 14px;
  font: 500 10px ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0.2em;
  cursor: pointer; transition: all 0.2s var(--ease);
  border-radius: 4px;
}
.u-back-btn:hover { color: #00C2D4; border-color: #00C2D4; }
.u-back-btn[hidden] { display: none; }

/* ---- World/focus transitions ---- */
#u-world { transition: transform 0.42s cubic-bezier(.55,.06,.32,1), opacity 0.32s ease; transform-origin: 0 0; }
#u-focus { transition: opacity 0.32s ease; }
.u-zoomed-out #u-world { opacity: 0.18; }
.u-zoomed-out #u-focus { opacity: 1; pointer-events: auto; }
.u-back-btn-visible .u-back-btn { display: inline-flex; }

.u-focus-center { filter: drop-shadow(0 0 18px rgba(0, 194, 212, 0.55)); }
.u-edge-label {
  font-size: 8.5px; letter-spacing: 0.18em;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-weight: 600; pointer-events: none;
}
.u-focus-neighbor { cursor: pointer; transition: filter 0.18s var(--ease); }
.u-focus-neighbor:hover { filter: drop-shadow(0 0 12px currentColor); }

/* ============================================================== */
/* Index groups (hierarchized)                                     */
/* ============================================================== */
.idx-group { margin-top: 22px; }
.idx-group:first-of-type { margin-top: 6px; }
.idx-group-head {
  display: flex; align-items: flex-end; justify-content: space-between;
  margin: 0 0 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--line);
}
.idx-group-head h3 {
  font-size: 10.5px; letter-spacing: 0.14em; color: var(--fg-2);
  text-transform: uppercase; font-weight: 600;
  margin: 0;
}
.idx-group-sub {
  font-size: 11.5px; color: var(--fg-4);
  margin: 4px 0 0; max-width: 60ch; letter-spacing: 0.01em;
}
.idx-group-meta { display: flex; align-items: center; gap: 12px; }
.idx-toggle {
  background: transparent; border: 1px solid var(--line-2);
  color: var(--fg-2); padding: 4px 10px; border-radius: 999px;
  font: inherit; font-size: 10.5px; font-weight: 600;
  letter-spacing: 0.06em; text-transform: uppercase;
  cursor: pointer; transition: all 0.15s var(--ease);
}
.idx-toggle:hover { color: var(--fg); border-color: var(--accent); background: rgba(140,123,255,0.08); }
.idx-grid-collapsed { display: none; }
.idx-group.is-expanded .idx-grid-collapsed { display: grid; }

/* ============================================================== */
/* Trajectory pulse tiles                                          */
/* ============================================================== */
.traj-pulse {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 10px; margin-bottom: 18px;
}
.pulse-tile {
  background: var(--bg-1); border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  padding: 12px 14px;
  position: relative; overflow: hidden;
}
.pulse-tile::before {
  content: ''; position: absolute; left: 0; top: 0; bottom: 0;
  width: 2px; background: var(--fg-4); opacity: 0.4;
}
.pulse-tile.pulse-fresh::before { background: var(--good); opacity: 1; }
.pulse-tile.pulse-aging::before { background: var(--mid); opacity: 1; }
.pulse-tile.pulse-stale::before { background: var(--low); opacity: 1; }
.pulse-tile.pulse-warn::before { background: var(--low); opacity: 1; }
.pulse-tile.pulse-warn { border-color: rgba(232, 109, 92, 0.45); }
.pulse-label {
  font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.14em;
  color: var(--fg-4); font-weight: 600;
}
.pulse-value {
  font-size: 22px; font-weight: 600;
  color: var(--fg); margin-top: 4px;
  letter-spacing: -0.025em; line-height: 1.05;
  font-variant-numeric: tabular-nums;
}
.pulse-tile.pulse-fresh .pulse-value { color: var(--good); }
.pulse-tile.pulse-aging .pulse-value { color: var(--mid); }
.pulse-tile.pulse-stale .pulse-value { color: var(--low); }
.pulse-tile.pulse-warn .pulse-value { color: var(--low); }
.pulse-tile.pulse-unmeasured .pulse-value { color: var(--fg-4); font-weight: 400; }
.pulse-unit { font-size: 11px; font-weight: 400; color: var(--fg-4); margin-left: 3px; letter-spacing: 0.01em; }
.pulse-sub { font-size: 10.5px; color: var(--fg-4); margin-top: 3px; }

/* ============================================================== */
/* Generic small table for trajectory blocks                       */
/* ============================================================== */
table.rows-table { width: 100%; border-collapse: collapse; }
table.rows-table th {
  text-align: left; padding: 9px 14px;
  font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em;
  color: var(--fg-4); font-weight: 600;
  border-bottom: 1px solid var(--line);
}
table.rows-table td {
  padding: 9px 14px; border-bottom: 1px solid var(--line);
  font-size: 12px; color: var(--fg-2);
  vertical-align: top;
}
table.rows-table tr:last-child td { border-bottom: none; }

/* ============================================================== */
/* Inline note under panels                                        */
/* ============================================================== */
.note { font-size: 11.5px; color: var(--fg-4); margin: 14px 4px 0; letter-spacing: 0.005em; }

/* ============================================================== */
/* Persistent status legend strip                                  */
/* ============================================================== */
.legend-strip {
  max-width: 1520px; margin: 30px auto 0;
  padding: 10px 32px;
  display: flex; align-items: center; gap: 18px; flex-wrap: wrap;
  border-top: 1px dashed var(--line);
  font-size: 10.5px; letter-spacing: 0.06em;
  color: var(--fg-4);
}
.legend-strip-kicker {
  text-transform: uppercase; font-weight: 600; letter-spacing: 0.14em;
  color: var(--fg-3); margin-right: 4px;
}
.legend-strip-item { display: inline-flex; align-items: center; gap: 6px; text-transform: uppercase; cursor: help; }
.legend-strip-dot { width: 8px; height: 8px; border-radius: 999px; box-shadow: 0 0 0 2px rgba(255,255,255,0.04); }
.legend-strip-dot.seg-confirmed { background: var(--good); }
.legend-strip-dot.seg-active { background: var(--accent-2); }
.legend-strip-dot.seg-partial { background: var(--mid); }
.legend-strip-dot.seg-empty { background: var(--fg-5, #4a5160); }
.legend-strip-dot.seg-unknown { background: var(--accent); }
.legend-strip-label { color: var(--fg-2); font-weight: 500; }

/* ============================================================== */
/* Tab meta warn (blocking questions)                              */
/* ============================================================== */
.tab-meta.tab-meta-warn {
  background: rgba(232, 109, 92, 0.18) !important;
  color: #ffa495 !important;
}

/* ============================================================== */
/* Footer                                                          */
/* ============================================================== */
.site-footer { border-top: 1px solid var(--line); margin-top: 40px; position: relative; z-index: 1; }
.site-footer-inner {
  max-width: 1520px; margin: 0 auto;
  padding: 16px 32px;
  color: var(--fg-4);
  font-size: 11px;
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  letter-spacing: 0.01em;
}
.site-footer time { font-variant-numeric: tabular-nums; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10.5px; }

/* ============================================================== */
/* Side panel                                                      */
/* ============================================================== */
.side {
  position: fixed; right: 0; top: 0; bottom: 0;
  width: min(520px, 92vw);
  background:
    linear-gradient(180deg, rgba(140,123,255,0.025) 0%, transparent 220px),
    var(--bg-1);
  border-left: 1px solid var(--line-2);
  box-shadow:
    -32px 0 80px -16px rgba(0,0,0,0.7),
    -8px 0 24px -8px rgba(0,0,0,0.5),
    -1px 0 0 var(--line);
  display: flex; flex-direction: column;
  z-index: 50;
  transform: translateX(0);
  transition: transform 0.32s var(--ease-out), opacity 0.22s var(--ease);
}
.side[hidden] { display: flex !important; transform: translateX(100%); opacity: 0; pointer-events: none; }
.side header {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
  padding: 24px 28px 18px;
  border-bottom: 1px solid var(--line);
  background: linear-gradient(180deg, rgba(140,123,255,0.04), transparent);
  position: relative;
}
#detail-body { flex: 1; overflow-y: auto; padding: 22px 28px 28px; }
#detail-body > * + * { margin-top: 14px; }
.side header::after {
  content: ''; position: absolute; left: 0; right: 0; bottom: -1px; height: 1px;
  background: linear-gradient(90deg, transparent, rgba(140,123,255,0.45) 50%, transparent);
}
.side-kicker {
  font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.18em;
  color: var(--accent-hi); font-weight: 600; margin-bottom: 5px;
  display: inline-flex; align-items: center; gap: 6px;
}
.side-kicker::before {
  content: ''; width: 10px; height: 1px;
  background: var(--accent);
}
.side header h2 { font-size: 16px; margin: 0; font-weight: 600; letter-spacing: -0.018em; color: var(--fg); word-break: break-word; line-height: 1.3; }
.side .close {
  background: var(--bg-2); border: 1px solid var(--line);
  color: var(--fg-3);
  width: 30px; height: 30px; border-radius: 7px;
  font-size: 18px; cursor: pointer; line-height: 1;
  display: grid; place-items: center;
  transition: all 0.14s var(--ease);
  flex-shrink: 0;
}
.side .close:hover { color: var(--fg); border-color: var(--line-2); background: var(--bg-3); transform: rotate(90deg); }
#side-body { padding: 18px 20px; overflow: auto; flex: 1; }
#side-body .key {
  color: var(--fg-4); font-size: 9.5px;
  text-transform: uppercase; letter-spacing: 0.14em;
  font-weight: 600; margin-top: 16px; margin-bottom: 5px;
}
#side-body .key:first-child { margin-top: 0; }
#side-body .val { font-size: 13px; color: var(--fg); word-break: break-word; line-height: 1.55; }
#side-body pre { background: var(--bg-3); padding: 11px 13px; border-radius: 7px; overflow: auto; font-size: 11.5px; color: var(--fg-2); border: 1px solid var(--line); }

/* Responsive */
@media (max-width: 980px) {
  .tabs { top: 0; }
}
@media (max-width: 640px) {
  .site-header-inner { padding: 14px 18px; gap: 16px; }
  main { padding: 20px 18px; }
  .tabs-inner { padding: 0 18px; overflow-x: auto; }
  .site-footer-inner { padding: 14px 18px; }
  .stats { width: 100%; padding-left: 0; border-left: 0; }
  .app-name { font-size: 17px; }
  .mark { width: 38px; height: 38px; }
}

/* ============================================================ */
/* Executive view — leader-audience scan, printable A4 in 1 page */
/* ============================================================ */
.executive-panel { max-width: 1100px; margin: 0 auto; }
.exec-head { margin-bottom: 18px; }
.exec-kicker { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--fg-4); margin-bottom: 6px; }
.exec-h1 { font-size: 26px; font-weight: 600; margin: 0 0 4px 0; color: var(--fg); letter-spacing: -0.01em; }
.exec-sub { margin: 0 0 10px 0; }
.exec-headline { margin: 6px 0 0 0; color: var(--fg-2); font-size: 14.5px; line-height: 1.5; }

.exec-section { background: var(--bg-2); border: 1px solid var(--line); border-radius: var(--radius); padding: 16px 18px; margin-bottom: 14px; }
.exec-section-title { font-size: 12.5px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--fg-3); margin: 0 0 4px 0; font-weight: 600; }
.exec-section-sub { margin: 0 0 12px 0; color: var(--fg-4); font-size: 12.5px; }

.exec-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
.exec-col { margin-bottom: 0; }

.exec-sig-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.exec-sig-cell { background: var(--bg-3); border: 1px solid var(--line); border-radius: 9px; padding: 12px 14px; text-align: left; }
.exec-sig-value { font-size: 26px; font-weight: 600; color: var(--fg); line-height: 1.1; font-variant-numeric: tabular-nums; }
.exec-sig-label { font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--fg-3); margin-top: 4px; font-weight: 600; }
.exec-sig-hint { font-size: 10.5px; color: var(--fg-4); margin-top: 2px; }

.exec-surprises, .exec-actions { list-style: none; padding: 0; margin: 0; counter-reset: surp; }
.exec-surprise, .exec-action { background: var(--bg-3); border: 1px solid var(--line); border-radius: 7px; padding: 10px 12px; margin-bottom: 8px; position: relative; }
.exec-surprise:last-child, .exec-action:last-child { margin-bottom: 0; }
.exec-surprise.tone-low { border-left: 3px solid var(--low); }
.exec-surprise.tone-mid { border-left: 3px solid var(--mid); }

.exec-surprise-head { display: flex; gap: 8px; align-items: center; margin-bottom: 4px; }
.exec-surprise-kind { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--fg-4); font-weight: 600; }
.exec-surprise-sev { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; padding: 2px 7px; border-radius: 999px; font-weight: 600; }
.exec-sev-critical { background: rgba(239,106,103,0.16); color: var(--low); }
.exec-sev-high { background: rgba(243,179,90,0.16); color: var(--mid); }
.exec-sev-medium { background: rgba(140,123,255,0.16); color: var(--accent); }
.exec-surprise-title { font-size: 13.5px; color: var(--fg); line-height: 1.4; }
.exec-surprise-detail { font-size: 11px; color: var(--fg-4); margin-top: 4px; word-break: break-all; }

.exec-action-title { font-size: 13.5px; color: var(--fg); line-height: 1.4; font-weight: 500; }
.exec-action-why { font-size: 12px; color: var(--fg-3); margin-top: 3px; line-height: 1.4; }
.exec-action-node { font-size: 10.5px; color: var(--fg-4); margin-top: 4px; }

.exec-list { list-style: none; padding: 0; margin: 0; }
.exec-list li { padding: 6px 0; border-bottom: 1px solid var(--line); color: var(--fg-2); font-size: 13px; line-height: 1.45; }
.exec-list li:last-child { border-bottom: 0; }
.exec-known li::before { content: '✓'; color: var(--good); margin-right: 8px; font-weight: 700; }
.exec-unknown li { display: flex; align-items: center; gap: 8px; }
.exec-unknown li.is-urgent { color: var(--fg); }
.urgent-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--low); box-shadow: 0 0 0 3px rgba(239,106,103,0.18); flex-shrink: 0; }

.exec-empty { color: var(--fg-4); font-size: 12.5px; font-style: italic; padding: 8px 0; }

.exec-footer-meta { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-top: 14px; padding-top: 12px; border-top: 1px dashed var(--line); font-size: 11.5px; }
.exec-print-hint { font-style: italic; }

@media (max-width: 980px) {
  .exec-cols { grid-template-columns: 1fr; }
  .exec-sig-grid { grid-template-columns: repeat(2, 1fr); }
}

/* ============================================================ */
/* Print mode — Executive view becomes a clean A4 1-pager        */
/* ============================================================ */
@media print {
  @page { size: A4; margin: 14mm 12mm; }

  /* Hide chrome and other tabs */
  .site-header .stats,
  .tabs,
  .legend-strip,
  .site-footer,
  .panel:not(.executive-panel),
  #side,
  .bg-grid,
  .exec-print-hint { display: none !important; }

  body, html {
    background: #ffffff !important;
    color: #111 !important;
    font-size: 10pt;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .site-header { border-bottom: 1px solid #999 !important; background: #ffffff !important; padding: 0 !important; }
  .site-header-inner { padding: 0 !important; }
  .brand { color: #111 !important; }
  .brand-kicker { color: #555 !important; font-size: 8pt !important; }
  .app-name, .brand-line1 { color: #111 !important; }
  .hero-phrase, .app-sub { color: #444 !important; }
  .badge, .badge-outline { background: #f3f3f3 !important; color: #222 !important; border-color: #bbb !important; }

  main { padding: 8mm 0 0 0 !important; }
  .executive-panel { max-width: 100% !important; margin: 0 !important; }
  .panel { padding: 0 !important; }

  /* Force backgrounds white, light borders */
  .exec-section { background: #ffffff !important; border-color: #bbb !important; padding: 6pt 8pt !important; margin-bottom: 6pt !important; page-break-inside: avoid; }
  .exec-sig-cell, .exec-surprise, .exec-action { background: #ffffff !important; border-color: #ccc !important; padding: 5pt 7pt !important; }
  .exec-h1 { color: #111 !important; font-size: 16pt !important; margin: 0 0 2pt 0 !important; }
  .exec-headline { color: #222 !important; font-size: 10pt !important; margin: 2pt 0 0 0 !important; }
  .exec-section-title { color: #444 !important; font-size: 8pt !important; }
  .exec-section-sub { color: #555 !important; font-size: 8.5pt !important; margin-bottom: 4pt !important; }

  .exec-sig-grid { gap: 4pt !important; }
  .exec-sig-value { color: #111 !important; font-size: 16pt !important; }
  .exec-sig-label { color: #444 !important; font-size: 7.5pt !important; }
  .exec-sig-hint { color: #666 !important; font-size: 7pt !important; }

  .exec-surprise-title, .exec-action-title { color: #111 !important; font-size: 9.5pt !important; }
  .exec-surprise-detail, .exec-action-why, .exec-action-node { color: #444 !important; font-size: 8pt !important; }
  .exec-surprise-kind { color: #555 !important; font-size: 7pt !important; }
  .exec-surprise-sev { border: 1px solid #999; background: #f8f8f8 !important; color: #333 !important; }
  .exec-sev-critical { background: #ffe6e5 !important; color: #a02a27 !important; border-color: #d97874 !important; }
  .exec-sev-high { background: #fff1dc !important; color: #8a5a17 !important; border-color: #d0a05a !important; }

  .exec-list li { color: #222 !important; border-bottom-color: #ddd !important; font-size: 9pt !important; padding: 3pt 0 !important; }
  .exec-known li::before { color: #1f8a4c !important; }
  .urgent-dot { background: #c0392b !important; box-shadow: none !important; }

  .exec-footer-meta { color: #555 !important; border-top-color: #999 !important; font-size: 7.5pt !important; padding-top: 4pt !important; }
  .exec-footer-meta code { background: transparent !important; color: #555 !important; border: 0 !important; padding: 0 !important; }

  /* Avoid orphan section titles */
  .exec-section-title { page-break-after: avoid; }
}
`;


// =====================================================================
// CLI
// =====================================================================
// Args supported (any combination):
//   --doc <dir>     doc root (default: ./doc)
//   --out <file>    output html (default: <docRoot>/_site/corpus.html)
//   <docRoot> <out> positional fallback for backward compat
function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}
const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const docRoot = path.resolve(argValue('--doc') || positional[0] || 'doc');
const outPath = path.resolve(argValue('--out') || positional[1] || path.join(docRoot, '_site', 'corpus.html'));

if (!fs.existsSync(docRoot)) {
  console.error(`docRoot not found: ${docRoot}`);
  process.exit(1);
}

// =====================================================================
// Tiny YAML parser (subset, tailored to corpus YAMLs)
//
// Supports:
// - top-level and nested mappings
// - lists of scalars and lists of mappings (`- key: val` style)
// - block scalars `>` (folded) and `|` (literal), with chomping `-` and `+`
// - quoted strings: single, double
// - inline scalars: number, bool, null
// - inline flow-style: `[a, b, c]` (scalars only)
// - comments starting with `#`
// - empty lines tolerated
// Does NOT support: anchors, references, tags, complex flow mappings.
// =====================================================================
function parseYaml(text) {
  if (!text) return {};
  const rawLines = text.replace(/\r\n/g, '\n').split('\n');

  // Pre-process: drop comments, trim trailing whitespace, but keep indentation.
  // Detect block scalars `>` `|` and concat their bodies into a single token line
  // so the main parser can handle them as single values.
  const lines = [];
  for (let i = 0; i < rawLines.length; i++) {
    const ln = rawLines[i];
    // skip pure-comment / empty lines later, but preserve indentation now
    lines.push(ln);
  }

  let i = 0;

  function isBlank(l) { return /^\s*$/.test(l) || /^\s*#/.test(l); }
  function indentOf(l) {
    const m = l.match(/^( *)/);
    return m ? m[1].length : 0;
  }
  function stripComment(l) {
    // Only strip trailing `#` if preceded by whitespace (avoid # inside quotes — rare in our corpus)
    // Quick heuristic: if a line contains a quoted string, leave it alone.
    if (/['"]/.test(l)) return l;
    const idx = l.indexOf(' #');
    return idx >= 0 ? l.slice(0, idx) : l;
  }

  function parseScalar(raw) {
    if (raw == null) return null;
    let s = String(raw).trim();
    if (s === '') return '';
    if (s === '~' || s === 'null' || s === 'Null' || s === 'NULL') return null;
    if (s === 'true' || s === 'True' || s === 'TRUE') return true;
    if (s === 'false' || s === 'False' || s === 'FALSE') return false;
    // Quoted
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
      return s.slice(1, -1).replace(/\\n/g, '\n').replace(/\\"/g, '"');
    }
    // Flow-style list of scalars: [a, b, "c"]
    if (s.startsWith('[') && s.endsWith(']')) {
      const inner = s.slice(1, -1).trim();
      if (!inner) return [];
      // simple split; doesn't handle nested
      return splitFlow(inner).map(parseScalar);
    }
    // Number
    if (/^-?\d+$/.test(s)) return Number(s);
    if (/^-?\d+\.\d+$/.test(s)) return Number(s);
    // ISO date — keep as string (we format ourselves)
    return s;
  }

  function splitFlow(s) {
    // split top-level commas, respecting "" '' brackets
    const out = [];
    let depth = 0, quote = null, cur = '';
    for (const c of s) {
      if (quote) {
        cur += c;
        if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'") { quote = c; cur += c; continue; }
      if (c === '[' || c === '{') { depth++; cur += c; continue; }
      if (c === ']' || c === '}') { depth--; cur += c; continue; }
      if (c === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
      cur += c;
    }
    if (cur.trim()) out.push(cur);
    return out.map((x) => x.trim());
  }

  // Read a block scalar starting at index `start` (line containing the `>` or `|` marker)
  // baseIndent is the indent of the parent KEY line; content lines must be deeper.
  function readBlockScalar(marker, start, baseIndent) {
    // marker is the suffix after `:` — e.g. ">", ">-", "|+", "|2-"
    let style = marker[0]; // > or |
    let chomp = '';
    for (const ch of marker.slice(1)) {
      if (ch === '-' || ch === '+') chomp = ch;
    }
    const out = [];
    let j = start + 1;
    let contentIndent = null;
    for (; j < lines.length; j++) {
      const line = lines[j];
      if (/^\s*$/.test(line)) { out.push(''); continue; }
      const ind = indentOf(line);
      if (ind <= baseIndent) break;
      if (contentIndent == null) contentIndent = ind;
      out.push(line.slice(contentIndent));
    }
    // Fold/literal
    let body;
    if (style === '|') {
      body = out.join('\n');
    } else {
      // folded: blank lines preserved, otherwise newlines become spaces.
      const parts = [];
      let buf = '';
      for (const l of out) {
        if (l === '') {
          if (buf !== '') { parts.push(buf); buf = ''; }
          parts.push('');
        } else if (buf === '') buf = l;
        else buf += ' ' + l;
      }
      if (buf !== '') parts.push(buf);
      body = parts.join('\n').replace(/\n\n+/g, '\n\n');
    }
    if (chomp === '-') body = body.replace(/\n+$/, '');
    else if (chomp !== '+') body = body.replace(/\n+$/, '\n').replace(/\n$/, '');
    return { value: body, nextIndex: j };
  }

  // Core recursive parser — parses lines [from..untilIndent>baseIndent)
  function parseBlock(baseIndent) {
    // returns [value, nextIndex]
    // determine if we are a mapping, a list, or a scalar by first non-blank line at indent > baseIndent
    while (i < lines.length && isBlank(lines[i])) i++;
    if (i >= lines.length) return null;

    let firstLine = stripComment(lines[i]);
    let ind = indentOf(firstLine);
    if (ind <= baseIndent) return null;

    const isList = /^-(\s|$)/.test(firstLine.slice(ind));
    if (isList) return parseList(ind);
    return parseMapping(ind);
  }

  function parseMapping(baseIndent) {
    const obj = {};
    while (i < lines.length) {
      while (i < lines.length && isBlank(lines[i])) i++;
      if (i >= lines.length) break;
      const raw = stripComment(lines[i]);
      const ind = indentOf(raw);
      if (ind < baseIndent) break;
      if (ind > baseIndent) {
        // unexpected deeper line — skip safely
        i++;
        continue;
      }
      // key: value
      const m = raw.slice(ind).match(/^([^:]+):(\s*)(.*)$/);
      if (!m) { i++; continue; }
      const key = m[1].trim();
      const rest = m[3];
      // block scalar?
      if (/^[>|][+\-\d]*\s*$/.test(rest)) {
        const block = readBlockScalar(rest.trim(), i, baseIndent);
        obj[key] = block.value;
        i = block.nextIndex;
        continue;
      }
      if (rest === '') {
        // nested
        i++;
        const child = parseBlock(baseIndent);
        obj[key] = child == null ? null : child;
        continue;
      }
      // inline value
      obj[key] = parseScalar(rest);
      i++;
    }
    return obj;
  }

  function parseList(baseIndent) {
    const arr = [];
    while (i < lines.length) {
      while (i < lines.length && isBlank(lines[i])) i++;
      if (i >= lines.length) break;
      const raw = stripComment(lines[i]);
      const ind = indentOf(raw);
      if (ind < baseIndent) break;
      const trimmed = raw.slice(ind);
      if (!/^-(\s|$)/.test(trimmed)) break;
      // item
      const after = trimmed.replace(/^-\s?/, '');
      if (after === '') {
        // empty item: next line nested
        i++;
        const child = parseBlock(baseIndent);
        arr.push(child);
        continue;
      }
      // either `- scalar` or `- key: val` (mapping item)
      // detect mapping item by `key:` pattern
      if (/^[A-Za-z0-9_.-]+:(\s|$)/.test(after)) {
        // pretend this line is a mapping line at indent (ind+2)
        const itemIndent = ind + 2;
        // Reconstruct: replace `- ` with `  ` on this line and let parseMapping handle
        const rebuilt = ' '.repeat(itemIndent) + after;
        lines[i] = rebuilt;
        const obj = parseMapping(itemIndent);
        arr.push(obj);
      } else {
        arr.push(parseScalar(after));
        i++;
      }
    }
    return arr;
  }

  // top-level
  const result = parseMapping(0);
  return result || {};
}

// =====================================================================
// File loaders — each returns a normalized JS object (or null/{})
// =====================================================================
function readFileSafe(rel) {
  const p = path.join(docRoot, rel);
  if (!fs.existsSync(p)) return null;
  try { return normalizeText(fs.readFileSync(p, 'utf8')); }
  catch { return null; }
}
function readYaml(rel) {
  const t = readFileSafe(rel);
  if (!t) return null;
  try { return parseYaml(t); }
  catch (e) {
    console.warn(`YAML parse error in ${rel}: ${e.message}`);
    return null;
  }
}

function listDirSafe(rel) {
  const p = path.join(docRoot, rel);
  if (!fs.existsSync(p)) return [];
  try { return fs.readdirSync(p, { withFileTypes: true }); }
  catch { return []; }
}

function parseFrontmatter(md) {
  if (!md) return { meta: {}, body: '' };
  const m = md.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: md };
  return { meta: parseYaml(m[1]) || {}, body: m[2] };
}

function parseMdTables(md) {
  // Returns array of { headers: [...], rows: [[..],..] }
  if (!md) return [];
  const lines = md.split(/\r?\n/);
  const tables = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*\|/.test(lines[i])) continue;
    if (i + 1 >= lines.length) break;
    if (!/^\s*\|[\s|:-]+\|\s*$/.test(lines[i + 1])) continue;
    const headers = splitMdRow(lines[i]);
    const rows = [];
    let j = i + 2;
    while (j < lines.length && /^\s*\|/.test(lines[j])) {
      rows.push(splitMdRow(lines[j]));
      j++;
    }
    tables.push({ headers, rows });
    i = j;
  }
  return tables;
}
function splitMdRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

// =====================================================================
// Main: build the corpus model
// =====================================================================
const corpus = {
  generated_at: new Date().toISOString(),
  doc_root: docRoot,
  app: readYaml('_meta/app-profile.yaml') || {},
  corpus_state: readYaml('_meta/corpus-state.yaml') || {},
  brick_inventory: readYaml('_meta/brick-inventory.yaml') || {},
  code_inventory: readYaml('_meta/code-inventory.yaml') || {},
  code_maturity: readYaml('_meta/code-maturity.yaml') || {},
  code_pipeline_state: readYaml('_meta/code-pipeline-state.yaml') || {},
  code_style: readYaml('_meta/code-style-state.yaml') || {},
  code_activity: readYaml('_meta/code-activity-signals.yaml') || {},
  cross_cutting: readYaml('_meta/cross-cutting-state.yaml') || {},
  feature_candidates: readYaml('_meta/feature-candidates.yaml') || {},
  info_sources: readYaml('_meta/information-sources.yaml') || {},
  source_coverage: readYaml('_meta/source-coverage.yaml') || {},
  logical_boundaries: readYaml('_meta/logical-boundaries.yaml') || {},
  reconciliation: readYaml('_meta/reconciliation-ledger.yaml') || {},
  repo_map: readYaml('_meta/repository-map.yaml') || {},
  structural_issues: readYaml('_meta/structural-issues.yaml') || {},
  graph: {
    nodes: readYaml('_graph/nodes.yaml') || {},
    edges: readYaml('_graph/edges.yaml') || {},
    evidence: readYaml('_graph/evidence.yaml') || {},
  },
  indexes: {},
  features: [],
  prod: {
    bugs: [],
    risks: [],
    watchlist: [],
    snapshots: [],
    baselines: readFileSafe('prod/BASELINES.md'),
    runtime: readFileSafe('prod/RUNTIME_ARCHITECTURE.md'),
    infra: readFileSafe('prod/INFRA_STATE.md'),
    batch_health: readFileSafe('prod/BATCH_HEALTH.md'),
  },
  project: {
    architecture: {
      modules: readFileSafe('project/architecture/MODULES.md'),
      layers: readFileSafe('project/architecture/LAYERS.md'),
      style: readFileSafe('project/architecture/ARCH_STYLE.md'),
      persistence: readFileSafe('project/architecture/PERSISTENCE.md'),
    },
    diagrams: {
      domain_er: readFileSafe('project/architecture/diagrams/domain-er.md'),
      integration_context: readFileSafe('project/architecture/diagrams/integration-context.md'),
      integration_flow: readFileSafe('project/architecture/diagrams/integration-flow.md'),
      messaging_topology: readFileSafe('project/architecture/diagrams/messaging-topology.md'),
      modules_deps: readFileSafe('project/architecture/diagrams/modules-deps.md'),
      persistence: readFileSafe('project/architecture/diagrams/persistence.md'),
      layers: readFileSafe('project/architecture/diagrams/layers.md'),
      arch_style: readFileSafe('project/architecture/diagrams/arch-style.md'),
    },
    apis: readFileSafe('project/apis/CATALOG.md'),
    integrations: readFileSafe('project/integrations/README.md'),
    integration_map: readFileSafe('project/architecture/INTEGRATION_MAP.md'),
    cicd: readFileSafe('project/cicd/PIPELINES.md'),
    domain_entities: readFileSafe('project/domain/ENTITIES.md'),
    trajectory: readFileSafe('project/activity/PROJECT_TRAJECTORY.md'),
    cross_atlassian: readFileSafe('project/activity/CROSS_ATLASSIAN_REFERENCES.md'),
  },
  actionable_readiness: readFileSafe('_meta/actionable-readiness.md'),
  handover: {
    summary: readFileSafe('_handover/HANDOVER_SUMMARY.md'),
    next30: readFileSafe('_handover/NEXT_30_DAYS.md'),
    open_decisions: readFileSafe('_handover/OPEN_DECISIONS.md'),
    rapport_etonnement: readFileSafe('_handover/RAPPORT_ETONNEMENT.md'),
    closeout: readFileSafe('_handover/KICKSTART_CLOSEOUT_CHECKLIST.md'),
    team_guide: readFileSafe('_handover/TEAM_USAGE_GUIDE.md'),
    ai_champion: readFileSafe('_handover/AI_CHAMPION_GUIDE.md'),
  },
  questions: {
    open: readFileSafe('_meta/open-questions.md'),
    blocking: readFileSafe('_meta/blocking-questions.md'),
    decisions: readFileSafe('_handover/OPEN_DECISIONS.md'),
  },
  specs: [],
};

// Load all spec packages from doc/spec/<id>/
const specDirs = listDirSafe('spec').filter((d) => d.isDirectory() && d.name !== 'template');
for (const sd of specDirs) {
  const files = listDirSafe(`spec/${sd.name}`).filter((f) => f.isFile() && f.name.endsWith('.md'));
  const docs = {};
  let meta = {};
  for (const f of files) {
    const key = f.name.replace(/\.md$/, '').toLowerCase();
    const text = readFileSafe(`spec/${sd.name}/${f.name}`);
    const fm = parseFrontmatter(text);
    docs[key] = { body: fm.body, meta: fm.meta };
    if (key === 'readme' || (!Object.keys(meta).length && fm.meta)) meta = { ...meta, ...fm.meta };
  }
  corpus.specs.push({ id: sd.name, meta, docs });
}

// load _indexes
const indexFiles = listDirSafe('_indexes').filter((d) => d.isFile() && d.name.endsWith('.md'));
for (const f of indexFiles) {
  const text = readFileSafe(`_indexes/${f.name}`);
  const fm = parseFrontmatter(text);
  const tables = parseMdTables(fm.body);
  corpus.indexes[f.name.replace(/\.md$/, '')] = { meta: fm.meta, tables, raw: fm.body };
}

// load features
const featureDirs = listDirSafe('project/features').filter((d) => d.isDirectory() && !d.name.startsWith('_'));
for (const d of featureDirs) {
  const readme = readFileSafe(`project/features/${d.name}/README.md`);
  if (!readme) continue;
  const fm = parseFrontmatter(readme);
  corpus.features.push({
    slug: d.name,
    title: extractH1(fm.body) || d.name,
    summary: extractFirstParagraph(fm.body),
    meta: fm.meta,
    body: fm.body,
  });
}

function extractFirstParagraph(body) {
  if (!body) return '';
  const paras = body.split(/\n\n+/).map((p) => p.trim());
  for (const p of paras) {
    if (!p) continue;
    if (p.startsWith('#')) continue;
    if (p.startsWith('|')) continue;
    if (p.startsWith('-')) continue;
    if (p.startsWith('>')) continue;
    if (p.startsWith('```')) continue;
    // strip inline markdown
    return p.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1').replace(/`([^`]+)`/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();
  }
  return '';
}

// load prod artefacts
function extractH1(body) {
  if (!body) return '';
  for (const ln of body.split(/\r?\n/)) {
    const m = ln.match(/^#\s+(.*)$/);
    if (m) return m[1].trim();
  }
  return '';
}
function loadProdGroup(subdir, key) {
  const dir = listDirSafe(`prod/${subdir}`).filter((d) => d.isFile() && d.name.endsWith('.md'));
  for (const f of dir) {
    if (f.name === 'README.md' || f.name === 'INDEX.md') continue;
    // Skip template files — they're scaffolds (BUG-template.md, RISK-template.md, etc.), not real claims
    if (/template/i.test(f.name) || /^_/.test(f.name)) continue;
    const md = readFileSafe(`prod/${subdir}/${f.name}`);
    if (!md) continue;
    const fm = parseFrontmatter(md);
    const slug = f.name.replace(/\.md$/, '');
    corpus.prod[key].push({
      slug,
      title: extractH1(fm.body) || slug,
      meta: fm.meta,
      body: fm.body,
    });
  }
}
loadProdGroup('known-bugs', 'bugs');
loadProdGroup('structural-risks', 'risks');
loadProdGroup('watchlist', 'watchlist');
loadProdGroup('snapshots', 'snapshots');

// =====================================================================
// HTML helpers
// =====================================================================
function esc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function md(s) {
  // Tiny inline-only markdown: bold, italic, code, links
  if (!s) return '';
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}
function chip(text, cls = '') {
  return `<span class="chip ${cls}">${esc(text)}</span>`;
}
function pill(text, tone) {
  // tone: confirmed | active | partial | empty | unknown | high | mid | low | critical
  return `<span class="pill pill-${tone}">${esc(text)}</span>`;
}
function joinChips(arr) {
  if (!arr || !arr.length) return '<span class="muted">—</span>';
  return arr.map((x) => chip(x)).join(' ');
}
function asList(v) {
  if (v == null) return [];
  if (Array.isArray(v)) return v;
  return [v];
}
function nonEmpty(x) {
  if (x == null) return false;
  if (Array.isArray(x)) return x.length > 0;
  if (typeof x === 'object') return Object.keys(x).length > 0;
  return String(x).trim() !== '';
}
function shorten(s, n = 200) {
  if (!s) return '';
  s = String(s).replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
// Multi-paragraph trim keeping newlines (vs `shorten` which collapses them)
function truncateBody(s, n = 4000) {
  if (!s) return '';
  s = String(s).replace(/\r/g, '');
  if (s.length <= n) return s;
  // try to cut at a paragraph boundary
  const slice = s.slice(0, n);
  const lastBreak = slice.lastIndexOf('\n\n');
  return (lastBreak > n * 0.6 ? slice.slice(0, lastBreak) : slice) + '\n\n…';
}
function fmtDate(s) {
  if (!s) return '—';
  const d = String(s);
  return d.length >= 10 ? d.slice(0, 10) : d;
}
function severityTone(s) {
  s = String(s || '').toLowerCase();
  if (s === 'critical' || s === 'high') return 'low'; // red
  if (s === 'medium' || s === 'mid' || s === 'warn') return 'mid'; // orange
  if (s === 'low' || s === 'info') return 'unknown'; // accent
  return 'unknown';
}

// =====================================================================
// Tab renderers (each returns an HTML string for the <section> panel body)
// =====================================================================
function renderOverview() {
  const app = corpus.app?.application || {};
  const cs = corpus.corpus_state?.corpus || corpus.corpus_state || {};
  const bi = corpus.brick_inventory?.brick_inventory || {};
  const act = corpus.code_activity || {};
  const cc = corpus.cross_cutting || {};
  const bugs = corpus.prod.bugs || [];
  const risks = corpus.prod.risks || [];

  const featuresN = corpus.features.length || asList(corpus.feature_candidates?.candidates).length;
  const apis = cc.apis_count ?? asList(cc.apis).length ?? 0;
  const integrations = cc.integrations_count ?? asList(cc.integrations).length ?? 0;
  const modules = asList(corpus.logical_boundaries?.modules).length || 0;
  const entitiesN = cc.domain_entities_count ?? 0;
  const totalBricks = bi.summary?.total ?? asList(bi.bricks).length;
  const criticalBricks = bi.summary?.critical ?? 0;
  const highBricks = bi.summary?.high ?? 0;
  const commits = act.total_commits ?? '—';
  const avgPerMonth = act.average_monthly_commits_last_12m ?? '';

  const sigCells = [
    { v: featuresN || '—', l: 'Features', h: 'documented' },
    { v: apis || '—', l: 'APIs', h: 'catalogued' },
    { v: modules || '—', l: 'Modules', h: 'logical boundaries' },
    { v: integrations || '—', l: 'Integrations', h: 'inbound + outbound' },
    { v: entitiesN || '—', l: 'Entities', h: 'domain model' },
    { v: totalBricks || '—', l: 'Bricks', h: `${criticalBricks} critical · ${highBricks} high` },
    { v: bugs.length || '—', l: 'Open bugs', h: 'production' },
    { v: risks.length || '—', l: 'Risks', h: 'tracked' },
    { v: commits, l: 'Commits', h: avgPerMonth ? `~${avgPerMonth}/month` : 'last 12 months' },
  ];

  // critical / high risks
  const criticalRisks = risks.filter((r) => /critical|high/i.test(r.meta?.severity || r.meta?.impact || ''))
    .slice(0, 5);
  const criticalBugs = bugs.filter((b) => /critical|high/i.test(b.meta?.severity || ''))
    .slice(0, 5);

  return `
    <div class="panel-head exec-head">
      <div>
        <div class="exec-kicker">Executive view · scan-friendly · printable A4</div>
        <h1 class="exec-h1">${esc(app.name || 'application')}</h1>
        <p class="lede exec-sub">${esc(cs.phase || cs.operating_mode || 'unknown phase')} · L${esc(cs.maturity_level ?? '?')} maturity · last kickstart ${fmtDate(cs.last_kickstart || app.last_updated)}${cs.last_continuous_run ? ' · last run ' + fmtDate(cs.last_continuous_run) : ''}</p>
        <p class="exec-headline">${esc(shorten(app.description || app.business_domain || '', 240))}</p>
      </div>
    </div>

    <section class="exec-section exec-scale">
      <h2 class="exec-section-title">Scale signals</h2>
      <div class="exec-sig-grid">
        ${sigCells.map((c) => `
        <div class="exec-sig-cell">
          <div class="exec-sig-value">${esc(c.v)}</div>
          <div class="exec-sig-label">${esc(c.l)}</div>
          <div class="exec-sig-hint">${esc(c.h)}</div>
        </div>`).join('')}
      </div>
    </section>

    <div class="exec-cols">
      <section class="exec-section exec-col">
        <h2 class="exec-section-title">Top production risks</h2>
        <p class="exec-section-sub">Critical & high severity items from <code>prod/structural-risks/</code> and <code>prod/known-bugs/</code>.</p>
        ${criticalRisks.length || criticalBugs.length
          ? `<ol class="exec-surprises">${[...criticalRisks.map((r) => surpriseItem('risk', r)), ...criticalBugs.map((b) => surpriseItem('bug', b))].join('')}</ol>`
          : `<div class="exec-empty">No critical/high items detected.</div>`}
      </section>

      <section class="exec-section exec-col">
        <h2 class="exec-section-title">Next 30 days</h2>
        <p class="exec-section-sub">Recommended actions from <code>_handover/NEXT_30_DAYS.md</code>.</p>
        ${renderNext30Bullets()}
      </section>
    </div>

    <div class="exec-cols">
      <section class="exec-section exec-col">
        <h2 class="exec-section-title">Application snapshot</h2>
        ${renderAppSnapshotList()}
      </section>

      <section class="exec-section exec-col">
        <h2 class="exec-section-title">Corpus snapshot</h2>
        ${renderCorpusSnapshotList()}
      </section>
    </div>

    <div class="exec-footer-meta">
      <span class="muted">Sources: <code>_meta/app-profile.yaml</code> · <code>_meta/corpus-state.yaml</code> · <code>_meta/brick-inventory.yaml</code> · <code>prod/</code> · <code>_handover/</code></span>
      <span class="muted exec-print-hint">Tip: print to PDF (Cmd/Ctrl+P) for a 1-page leader handout.</span>
    </div>
  `;
}

function shortAppHeadline(app) {
  if (!app || !app.application) return '';
  const desc = app.application.description || app.application.business_domain || '';
  return shorten(desc, 220);
}

function surpriseItem(kind, item) {
  const sev = (item.meta?.severity || item.meta?.impact || 'medium').toLowerCase();
  const sevClass = `exec-sev-${sev}`;
  const tone = sev === 'critical' ? 'tone-low' : sev === 'high' ? 'tone-mid' : '';
  const title = item.meta?.title || item.meta?.name || item.slug;
  const detail = item.meta?.summary || item.meta?.location || item.meta?.id || '';
  return `
    <li class="exec-surprise ${tone}">
      <div class="exec-surprise-head">
        <span class="exec-surprise-kind">${esc(kind)}</span>
        <span class="exec-surprise-sev ${sevClass}">${esc(sev)}</span>
      </div>
      <div class="exec-surprise-title">${esc(title)}</div>
      ${detail ? `<div class="exec-surprise-detail mono-cell">${esc(shorten(detail, 140))}</div>` : ''}
    </li>`;
}

function renderNext30Bullets() {
  const md = corpus.handover?.next30;
  if (!md) return `<div class="exec-empty">No <code>_handover/NEXT_30_DAYS.md</code> found.</div>`;
  // Pull first-level bullets
  const bullets = [];
  for (const ln of md.split(/\r?\n/)) {
    const m = ln.match(/^\s*[-*]\s+(.+)$/);
    if (m && !ln.startsWith('    ')) bullets.push(m[1].replace(/^\*\*([^*]+)\*\*:\s*/, '$1 — ').replace(/`/g, ''));
    if (bullets.length >= 6) break;
  }
  if (!bullets.length) return `<div class="exec-empty">No actionable bullets parsed.</div>`;
  return `<ul class="exec-list">${bullets.map((b) => `<li>${esc(shorten(b, 180))}</li>`).join('')}</ul>`;
}

function renderAppSnapshotList() {
  const a = corpus.app?.application || {};
  const items = [
    a.business_domain ? ['Business', shorten(a.business_domain, 240)] : null,
    a.organization_history?.current ? ['Organization', a.organization_history.current] : null,
    a.repository?.url ? ['Repository', a.repository.url] : null,
    a.repository?.version ? ['Version', a.repository.version] : null,
    a.multi_repo?.status ? ['Multi-repo', a.multi_repo.status] : null,
  ].filter(Boolean);
  if (!items.length) return `<div class="exec-empty">No application profile data.</div>`;
  return `<ul class="exec-list">${items.map(([k, v]) => `<li><strong>${esc(k)}</strong> · ${esc(v)}</li>`).join('')}</ul>`;
}

function renderCorpusSnapshotList() {
  const cs = corpus.corpus_state?.corpus || corpus.corpus_state || {};
  const items = [];
  if (cs.maturity_level != null) items.push(['Maturity', `level ${cs.maturity_level} · ${cs.phase ?? cs.operating_mode ?? '?'}`]);
  if (cs.last_kickstart) items.push(['Last kickstart', fmtDate(cs.last_kickstart)]);
  if (cs.last_quality_check) items.push(['Last QC', fmtDate(cs.last_quality_check)]);
  if (cs.last_reconciliation) items.push(['Last reconciliation', fmtDate(cs.last_reconciliation)]);
  const passes = collectPipelinePasses();
  if (passes.length) {
    const covered = passes.filter((p) => /covered|done/i.test(p.status || '')).length;
    items.push(['Pipeline', `${covered}/${passes.length} passes covered`]);
  }
  const recon = asList(corpus.reconciliation?.contradictions);
  if (recon.length) {
    const resolved = recon.filter((r) => /resolved/i.test(r.status || '')).length;
    items.push(['Contradictions', `${resolved}/${recon.length} resolved`]);
  }
  if (cs.open_questions_count != null) items.push(['Open questions', String(cs.open_questions_count)]);
  if (cs.active_blocking_questions_count != null && cs.active_blocking_questions_count > 0) items.push(['Blocking questions', String(cs.active_blocking_questions_count)]);
  if (!items.length) return `<div class="exec-empty">No corpus state data.</div>`;
  return `<ul class="exec-list">${items.map(([k, v]) => `<li><strong>${esc(k)}</strong> · ${esc(v)}</li>`).join('')}</ul>`;
}

// Collect P1..P9 entries from code-pipeline-state.yaml (nested object form, not list)
function collectPipelinePasses() {
  const pl = corpus.code_pipeline_state?.pipeline;
  if (!pl) return [];
  const out = [];
  for (const [k, v] of Object.entries(pl)) {
    if (!/^p\d/i.test(k)) continue;
    if (typeof v !== 'object' || v == null) continue;
    out.push({
      id: k.toUpperCase().split('_')[0],
      name: k.replace(/^p\d+_/i, '').replace(/_/g, ' '),
      status: v.status,
      last_run: v.last_run,
      summary: v.note || v.summary || '',
      details: v,
    });
  }
  return out;
}

// ----- Application tab ------------------------------------------------
function renderApplication() {
  const a = corpus.app?.application || {};
  if (!nonEmpty(a)) return panelEmpty('Application', 'No _meta/app-profile.yaml found.');

  const repo = a.repository || {};
  const org = a.organization_history || {};
  const mr = a.multi_repo || {};
  const dep = a.deployment || {};
  const ds = asList(a.data_stores);
  const aliases = asList(a.aliases);
  const langs = asList(a.languages);
  const frameworks = asList(a.frameworks);
  const runtimes = asList(a.runtimes);
  const buildTools = asList(a.build_tools);
  const envs = asList(dep.environments);
  const cs = corpus.corpus_state?.corpus || corpus.corpus_state || {};
  const sources = asList(corpus.info_sources?.information_sources || corpus.info_sources?.sources);
  const sourceCoverageById = new Map(asList(corpus.source_coverage?.coverage).map((entry) => [entry.source_id, entry]));
  const heroMetrics = computeHeroMetrics();
  // Agent readiness — parse the actionable-readiness "Agent Task Readiness" table
  const agentReadiness = parseAgentReadiness();

  // Quick stats — pull from cross_cutting / logical_boundaries.
  // Skip any stat with no value (don't show "—" tiles that just clutter).
  const cc = corpus.cross_cutting || {};
  const exts0 = asList(a.external_systems);
  const stats = [
    { v: asList(corpus.logical_boundaries?.modules).length, l: 'Modules' },
    { v: cc.apis_count, l: 'APIs' },
    { v: cc.integrations_count, l: 'Integrations' },
    { v: cc.domain_entities_count, l: 'Entities' },
    { v: ds.length, l: 'Data stores' },
    { v: envs.length, l: 'Environments' },
    { v: exts0.length, l: 'External systems' },
  ].filter((s) => s.v && s.v !== 0);

  // ---- Vitrine hero — sells what a corpus IS, not just the app's data ----
  const vitrineHero = `
    <section class="vitrine-hero">
      <div class="vitrine-hero-inner">
        <div class="vitrine-kicker">CORPUS · LIVING KNOWLEDGE BASE</div>
        <h1 class="vitrine-h1">Corpus de <span class="vitrine-app-name">${esc(a.name || "l'application")}</span></h1>
        <p class="vitrine-tagline">
          Une base de connaissance <strong>machine-readable</strong>, construite et tenue à jour par
          des agents IA spécialisés, ancrée dans le code, la production, Jira et Confluence.
          ${cs.last_kickstart ? `Premier kickstart il y a <strong>${heroMetrics.daysSinceKick ?? '?'} jour${heroMetrics.daysSinceKick > 1 ? 's' : ''}</strong>.` : ''}
        </p>
      </div>
      <div class="vitrine-headline-metrics">
        ${[
          { v: heroMetrics.coverage, l: 'couverture', unit: '%', tone: heroMetrics.coverage == null ? 'empty' : heroMetrics.coverage >= 60 ? 'good' : heroMetrics.coverage >= 25 ? 'mid' : 'low', hint: 'des aires fonctionnelles' },
          { v: heroMetrics.anchoring, l: 'ancrage', unit: '%', tone: heroMetrics.anchoring == null ? 'empty' : heroMetrics.anchoring >= 70 ? 'good' : heroMetrics.anchoring >= 40 ? 'mid' : 'low', hint: 'des claims sourcés' },
          { v: heroMetrics.freshness, l: 'fraîcheur', unit: ' j', tone: heroMetrics.freshness == null ? 'empty' : heroMetrics.freshness < 30 ? 'good' : heroMetrics.freshness < 90 ? 'mid' : 'low', hint: 'âge médian de la donnée' },
          { v: heroMetrics.volume, l: 'volume utile', unit: '', tone: heroMetrics.volume > 0 ? 'good' : 'empty', hint: 'éléments indexés' },
        ].map((m) => `
          <div class="vh-metric vh-metric-${m.tone}">
            <div class="vh-metric-value">${m.v == null ? '—' : esc(m.v)}${m.unit && m.v != null ? `<span class="vh-metric-unit">${m.unit}</span>` : ''}</div>
            <div class="vh-metric-label">${esc(m.l)}</div>
            <div class="vh-metric-hint">${esc(m.hint)}</div>
          </div>`).join('')}
      </div>
    </section>`;

  // ---- Pitch — 4 pillars of what a corpus IS, why leadership cares ----
  const pitch = `
    <section class="vitrine-pillars">
      <article class="pillar pillar-machine">
        <div class="pillar-icon">◰</div>
        <h3 class="pillar-title">Machine-readable</h3>
        <p class="pillar-desc">Un format structuré (YAML + Markdown) que les agents IA lisent <strong>nativement</strong>, et que les humains lisent comme une doc.</p>
      </article>
      <article class="pillar pillar-anchored">
        <div class="pillar-icon">⚓</div>
        <h3 class="pillar-title">Anchored in evidence</h3>
        <p class="pillar-desc">Chaque affirmation trace à une source réelle : code source, ticket Jira, page Confluence, log Dynatrace. Anti-hallucination par construction.</p>
      </article>
      <article class="pillar pillar-agentic">
        <div class="pillar-icon">⌬</div>
        <h3 class="pillar-title">Agent-driven</h3>
        <p class="pillar-desc"><strong>5 rôles d'agents</strong> spécialisés (Functional Analyst, Developer, Reliability Analyst, Corpus, Champion) lisent et enrichissent le même corpus.</p>
      </article>
      <article class="pillar pillar-fresh">
        <div class="pillar-icon">⟳</div>
        <h3 class="pillar-title">Continuously fresh</h3>
        <p class="pillar-desc">Pipeline P1→P9 ré-exécuté à chaque cycle. Drift détecté run par run. Reconciliation explicite pour chaque contradiction.</p>
      </article>
    </section>`;

  // ---- Built-in standards — context discipline + agentic best practices ----
  // Detects shipped pack artefacts (e.g. agent-cache-discipline.md) and
  // surfaces the pack version. Hardcoded chips reflect what the pack
  // genuinely does — they are honest pitches, not marketing claims.
  const cacheDiscipline = readFileSafe('_meta/agent-cache-discipline.md');
  const packVersion = cs.pack_version || cs.code_analysis_pipeline_version;
  const lastUpgrade = cs.last_pack_upgrade;
  const standardsChips = [
    cacheDiscipline ? { icon: '⌗', label: 'Cache-friendly reads', sub: 'doc/_meta/agent-cache-discipline.md', tone: 'good' } : null,
    { icon: '✦', label: 'Progressive disclosure', sub: 'slim personas, on-demand procedures', tone: 'good' },
    { icon: '◰', label: 'Sub-agent delegation', sub: 'specialized roles, bounded scope', tone: 'good' },
    { icon: '⟿', label: 'MCP-first source discovery', sub: 'Jira / Confluence / Dynatrace / GitHub', tone: 'good' },
    { icon: '⌖', label: 'Evidence-anchored claims', sub: 'every fact traces to a source', tone: 'good' },
    { icon: '⟳', label: 'Drift detection per run', sub: 'reconciliation gate at P9', tone: 'good' },
  ].filter(Boolean);
  // Named industry references the pack explicitly aligns with
  // (from foundations/core-discipline + decisions/0002-align-with-2026-agent-standards).
  const corePresent = readFileSafe('.github/skills/foundations/core-discipline/SKILL.md') ||
                       readFileSafe('.github/skills/foundations/core-rules/SKILL.md');
  const namedRefs = [
    { name: "Karpathy's 4 rules", desc: 'Think before acting · Simplicity first · Surgical changes · Goal-driven execution', tag: 'CLAUDE.md · Jan 2026' },
    { name: "Anthropic 5 patterns", desc: 'Prompt chaining · Routing · Parallelization · Orchestrator-workers · Evaluator-optimizer', tag: 'Building Effective Agents' },
    { name: 'Agent Skills standard', desc: 'SKILL.md format · progressive disclosure · open spec', tag: 'Anthropic · open Mar 2026' },
    { name: 'Context engineering', desc: 'Selection · packaging · refreshing · cache discipline · token budget', tag: '2026 industry consensus' },
  ];
  const standards = `
    <section class="standards-strip">
      <div class="standards-head">
        <div class="standards-kicker">PACK STANDARDS</div>
        <div class="standards-title">Built on 2026 agentic best practices</div>
        ${packVersion ? `<div class="standards-version">
          <span class="standards-version-l">pack version</span>
          <code class="standards-version-v">v${esc(packVersion)}</code>
          ${lastUpgrade ? `<span class="muted">· upgraded ${esc(fmtDate(lastUpgrade))}</span>` : `<span class="muted">· latest</span>`}
        </div>` : ''}
      </div>
      <div class="standards-grid">
        ${standardsChips.map((c) => `<div class="standards-chip standards-chip-${c.tone}">
          <span class="standards-chip-icon">${c.icon}</span>
          <div>
            <div class="standards-chip-label">${esc(c.label)}</div>
            <div class="standards-chip-sub">${esc(c.sub)}</div>
          </div>
        </div>`).join('')}
      </div>
      <details class="standards-refs-fold">
        <summary><span class="standards-refs-label">Aligned with</span> <span class="standards-refs-summary-list">${namedRefs.map((r) => esc(r.name)).join(' · ')}</span></summary>
        <div class="standards-refs">
          ${namedRefs.map((r) => `<div class="standards-ref">
            <div class="standards-ref-name">${esc(r.name)}</div>
            <div class="standards-ref-desc">${esc(r.desc)}</div>
            <div class="standards-ref-tag muted">${esc(r.tag)}</div>
          </div>`).join('')}
        </div>
      </details>
    </section>`;

  // ---- Section divider helper ----
  function divider(num, kicker, title, sub) {
    return `<header class="vitrine-section-head">
      <span class="vsh-num">${num}</span>
      <div><span class="vsh-kicker">${esc(kicker)}</span><h2 class="vsh-title">${esc(title)}</h2></div>
      ${sub ? `<p class="vsh-sub">${esc(sub)}</p>` : ''}
    </header>`;
  }

  // App identity hero is now rendered inline below via the miniDivider — the
  // old `appHero` const was removed to avoid duplication.

  // ---- Repository card (Multi-repo merged in as a row) ---------
  function gitPlatform(url) {
    if (!url) return null;
    if (/github\.com/.test(url)) return 'github';
    if (/gitlab/.test(url)) return 'gitlab';
    if (/bitbucket/.test(url)) return 'bitbucket';
    if (/azure\.com/.test(url) || /dev\.azure/.test(url)) return 'azure-devops';
    return null;
  }
  const platform = gitPlatform(repo.url) || gitPlatform(repo.legacy_url);
  const mrChip = (mr.status && mr.status !== 'standalone') ? `<span class="pill pill-active">${esc(mr.status)}</span>`
               : mr.status === 'standalone' ? `<span class="pill pill-unknown">standalone</span>` : '';
  const repoCard = repo.url || repo.name ? `
    <article class="about-card about-card-repo">
      <header class="about-card-head">
        <span class="about-card-icon">↗</span>
        <span class="about-card-kicker">Repository</span>
        ${repo.role ? `<span class="pill pill-active">${esc(repo.role)}</span>` : ''}
        ${platform ? `<span class="about-platform-badge platform-${platform}">${esc(platform)}</span>` : ''}
        ${mrChip}
      </header>
      ${repo.url ? `<a href="${esc(repo.url)}" class="about-repo-url" target="_blank" rel="noopener">${esc(repo.url)}</a>` : `<div class="about-repo-name">${esc(repo.name || '—')}</div>`}
      <div class="about-card-rows">
        ${repo.version ? `<div class="about-row"><span class="k">version</span><code>${esc(repo.version)}</code></div>` : ''}
        ${repo.maven_artifact ? `<div class="about-row"><span class="k">artifact</span><code>${esc(repo.maven_artifact)}</code></div>` : ''}
        ${repo.legacy_url ? `<div class="about-row"><span class="k">legacy</span><a href="${esc(repo.legacy_url)}" class="muted" target="_blank" rel="noopener">${esc(shorten(repo.legacy_url, 60))}</a></div>` : ''}
        ${asList(mr.adjacent_repos).length ? `<div class="about-row"><span class="k">adjacent</span><div>${joinChips(mr.adjacent_repos)}</div></div>` : ''}
        ${asList(mr.consumed_by).length ? `<div class="about-row"><span class="k">consumed by</span><div>${joinChips(mr.consumed_by)}</div></div>` : ''}
        ${mr.workspace_root && mr.workspace_root !== 'unknown' ? `<div class="about-row"><span class="k">workspace</span><code class="muted">${esc(shorten(mr.workspace_root, 60))}</code></div>` : ''}
      </div>
      ${mr.notes ? `<p class="about-card-note">${esc(shorten(mr.notes, 200))}</p>` : ''}
    </article>` : '';

  // ---- Tech stack card -----------------------------------------
  const chipBlock = (label, arr, cls) => arr.length ? `<div class="about-chip-row"><span class="about-chip-row-l">${esc(label)}</span><div class="about-chip-row-v">${arr.map((x) => `<span class="about-tech-chip ${cls || ''}">${esc(x)}</span>`).join('')}</div></div>` : '';
  const techCard = (langs.length || frameworks.length || runtimes.length || buildTools.length) ? `
    <article class="about-card about-card-tech">
      <header class="about-card-head">
        <span class="about-card-icon">⚙</span>
        <span class="about-card-kicker">Tech stack</span>
        ${a.java_version ? `<span class="about-card-meta">${esc(a.java_version)}</span>` : ''}
      </header>
      <div class="about-chip-rows">
        ${chipBlock('languages', langs, 'tech-lang')}
        ${chipBlock('frameworks', frameworks, 'tech-fw')}
        ${chipBlock('runtimes', runtimes, 'tech-runtime')}
        ${chipBlock('build', buildTools, 'tech-build')}
      </div>
    </article>` : '';

  // ---- Deployment card -----------------------------------------
  // Filter "unknown" envs out of the pill flow — keep them as a note instead.
  const realEnvs = envs.filter((e) => !/^unknown/i.test(String(e)));
  const unknownEnvNotes = envs.filter((e) => /^unknown/i.test(String(e))).map((e) => stripMd(e));
  const depCard = (dep.type || envs.length || dep.container_registry) ? `
    <article class="about-card about-card-deploy">
      <header class="about-card-head">
        <span class="about-card-icon">▣</span>
        <span class="about-card-kicker">Deployment</span>
        ${dep.containerized === true ? '<span class="pill pill-confirmed">containerized</span>' : ''}
      </header>
      ${dep.type ? `<div class="about-deploy-type">${esc(dep.type)}</div>` : ''}
      ${realEnvs.length ? `<div class="about-envs">
        ${realEnvs.map((e) => `<span class="about-env-pill">${esc(e)}</span>`).join('<span class="about-env-sep">→</span>')}
      </div>` : ''}
      ${dep.container_registry ? `<div class="about-row"><span class="k">registry</span><code>${esc(dep.container_registry)}</code></div>` : ''}
      ${unknownEnvNotes.length ? `<p class="about-card-note">env naming: ${esc(unknownEnvNotes.join(' · '))}</p>` : ''}
      ${dep.notes ? `<p class="about-card-note">${esc(shorten(dep.notes, 200))}</p>` : ''}
    </article>` : '';

  // ---- Organization card ---------------------------------------
  const orgCard = (org.current || org.former) ? `
    <article class="about-card about-card-org">
      <header class="about-card-head">
        <span class="about-card-icon">●</span>
        <span class="about-card-kicker">Organization</span>
      </header>
      <div class="about-org-flow">
        ${org.former ? `<div class="about-org-cell about-org-former"><div class="about-org-label">former</div><div class="about-org-val">${esc(org.former)}</div></div>
        <span class="about-org-arrow">→</span>` : ''}
        ${org.current ? `<div class="about-org-cell about-org-current"><div class="about-org-label">current</div><div class="about-org-val">${esc(org.current)}</div></div>` : ''}
      </div>
      ${(org.package_prefix_old || org.package_prefix_new) ? `<div class="about-org-pkg">
        ${org.package_prefix_old ? `<code class="about-pkg-old">${esc(org.package_prefix_old)}</code>` : ''}
        ${org.package_prefix_old && org.package_prefix_new ? '<span class="muted">→</span>' : ''}
        ${org.package_prefix_new ? `<code class="about-pkg-new">${esc(org.package_prefix_new)}</code>` : ''}
      </div>` : ''}
      ${org.note ? `<p class="about-card-note">${esc(shorten(org.note, 240))}</p>` : ''}
    </article>` : '';

  // Multi-repo info is merged into Repository card above (kept here as no-op
  // for backward grid layout — the variable is empty)
  const mrCard = '';

  // Normalize data_stores: entries may be plain strings or objects
  function normalizeStore(d) {
    if (typeof d === 'string') {
      // "Oracle (ojdbc8, primary data store)" → name=Oracle, purpose=ojdbc8...
      const m = d.match(/^([^\(]+?)\s*\((.+)\)\s*$/);
      return m ? { name: m[1].trim(), purpose: m[2].trim() } : { name: d };
    }
    return { name: d.name || '—', purpose: d.purpose || d.usage || '', type: d.type || d.engine };
  }
  const storesN = ds.map(normalizeStore);
  const dsCard = storesN.length ? `
    <article class="about-card about-card-ds">
      <header class="about-card-head">
        <span class="about-card-icon">▤</span>
        <span class="about-card-kicker">Data stores</span>
        <span class="about-card-meta">${storesN.length}</span>
      </header>
      <div class="about-ds-grid">
        ${storesN.map((d) => `<div class="about-ds-tile">
          ${d.type ? `<div class="about-ds-type">${esc(d.type)}</div>` : ''}
          <div class="about-ds-name">${esc(d.name)}</div>
          ${d.purpose ? `<div class="about-ds-purpose muted">${esc(shorten(d.purpose, 90))}</div>` : ''}
        </div>`).join('')}
      </div>
    </article>` : '';

  // ---- External systems card (for corpora that list them in app-profile) -
  const exts = asList(a.external_systems);
  function normalizeExt(d) {
    if (typeof d === 'string') {
      const m = d.match(/^([^\(]+?)\s*\((.+)\)\s*$/);
      return m ? { name: m[1].trim(), purpose: m[2].trim() } : { name: d };
    }
    return { name: d.name || '—', purpose: d.purpose || d.usage || '' };
  }
  const extsN = exts.map(normalizeExt);
  // Detect protocol mention in the purpose string to add a colored badge
  function extProto(p) {
    if (!p) return null;
    if (/SOAP/i.test(p)) return 'soap';
    if (/REST/i.test(p)) return 'rest';
    if (/KAFKA/i.test(p)) return 'kafka';
    if (/JMS|MQ/i.test(p)) return 'jms';
    if (/GIT|FTP/i.test(p)) return null;
    return null;
  }
  const extCard = extsN.length ? `
    <article class="about-card about-card-ext">
      <header class="about-card-head">
        <span class="about-card-icon">⟿</span>
        <span class="about-card-kicker">External systems</span>
        <span class="about-card-meta">${extsN.length}</span>
      </header>
      <div class="about-ds-grid">
        ${extsN.map((d) => {
          const proto = extProto(d.purpose);
          return `<div class="about-ds-tile about-ext-tile">
            <div class="about-ds-name">${esc(d.name)}${proto ? ` <span class="api-proto api-proto-${proto}" style="font-size:9px;padding:1px 6px;">${esc(proto.toUpperCase())}</span>` : ''}</div>
            ${d.purpose ? `<div class="about-ds-purpose muted">${esc(shorten(d.purpose, 110))}</div>` : ''}
          </div>`;
        }).join('')}
      </div>
    </article>` : '';

  // ---- Agents section — who works on this corpus ----
  // 5 canonical agent roles from the pack. Match readiness from
  // actionable-readiness.md when available.
  const canonicalAgents = [
    { id: 'functional-analyst', icon: '▤', title: 'Functional Analyst', desc: "Reads the corpus to produce or improve a spec package. Translates a business need into a developer-ready change plan." },
    { id: 'developer', icon: '◧', title: 'Developer', desc: "Reads the corpus to make a safe code change in context: respects boundaries, surfaces impacts, never breaks blind." },
    { id: 'reliability-analyst', icon: '◉', title: 'Reliability Analyst', desc: "Reads the corpus to investigate an incident, recurring error, or production pain point. Anchors on Dynatrace + prod artefacts." },
    { id: 'corpus', icon: '◭', title: 'Corpus', desc: "Enriches the corpus from new evidence, reconciles contradictions, detects drift, keeps the artefact fresh. Never writes app code." },
    { id: 'ai-champion', icon: '★', title: 'AI Champion', desc: "Human owner. Triages questions, validates the corpus, leads the adoption inside the team." },
  ];
  const agentMap = Object.fromEntries(agentReadiness.map((a) => [a.agent.replace(/[-_ ]/g, '').toLowerCase(), a]));
  const agentCards = canonicalAgents.map((c) => {
    const key = c.id.replace(/-/g, '');
    const r = agentMap[key] || agentMap[c.id.replace('-', '_')] || null;
    let pillTone = 'unknown', pillText = 'not measured';
    if (r) {
      pillText = r.status.replace(/_/g, ' ');
      if (/actionable_for|actionable$|^actionable/.test(r.status)) pillTone = /scope|partial/.test(r.status) ? 'partial' : 'confirmed';
      else if (/partial/.test(r.status)) pillTone = 'partial';
      else pillTone = 'unknown';
    }
    return `<article class="agent-card">
      <div class="agent-icon">${c.icon}</div>
      <div class="agent-body">
        <header class="agent-card-head">
          <h4 class="agent-name">${esc(c.title)}</h4>
          <span class="pill pill-${pillTone}">${esc(pillText)}</span>
        </header>
        <p class="agent-desc">${esc(c.desc)}</p>
        ${r && r.gaps && r.gaps.trim() && r.gaps.trim() !== '—' ? `<p class="agent-gaps muted"><span class="k">gaps:</span> ${esc(shorten(r.gaps, 180))}</p>` : ''}
      </div>
    </article>`;
  }).join('');

  // ---- Sources strip — durable contracts plus historical coverage ----
  function sourceIcon(cat) {
    if (/code/i.test(cat)) return '⌨';
    if (/project|jira/i.test(cat)) return '◧';
    if (/doc|confluence/i.test(cat)) return '▤';
    if (/metric|dyna|apm|log/i.test(cat)) return '◊';
    if (/incident|service.?now/i.test(cat)) return '⚠';
    return '◌';
  }
  const sourceCards = sources.map((s) => {
    const lifecycle = String(s.lifecycle || 'unknown').toLowerCase();
    const coverage = sourceCoverageById.get(s.id) || {};
    const coverageStatus = String(coverage.status || 'not_started').toLowerCase();
    const tone = /^(?:covered|deep)$/.test(coverageStatus) ? 'confirmed'
      : /^(?:inventory_only|started|partial)$/.test(coverageStatus) ? 'partial'
      : 'unknown';
    return `<article class="src-card src-card-${tone}">
      <div class="src-icon">${sourceIcon(s.category || '')}</div>
      <div class="src-body">
        <div class="src-name">${esc(s.name || s.id || '—')}</div>
        <div class="src-cat muted">${esc(s.category || '')} · contract ${esc(lifecycle)} · ${esc(coverage.freshness || 'unknown')}</div>
      </div>
      <span class="pill pill-${tone}">history ${esc(coverageStatus)}</span>
    </article>`;
  }).join('');

  // ---- What it knows — proof numbers ----
  const featCount = corpus.features.length || asList(corpus.feature_candidates?.candidates).length || 0;
  const bugCount = (corpus.prod.bugs || []).length;
  const riskCount = (corpus.prod.risks || []).length;
  const watchCount = (corpus.prod.watchlist || []).length;
  const modCount = asList(corpus.logical_boundaries?.modules).length;
  const apiCount = corpus.cross_cutting?.apis_count || parseApiCatalog(corpus.project.apis).length || 0;
  const integCount = (() => {
    const i = parseIntegrationsFromReadme(corpus.project.integrations);
    return corpus.cross_cutting?.integrations_count || (i.inbound.length + i.outbound.length) || 0;
  })();
  const runLedgerCount = (() => {
    const t = parseMdTables(parseFrontmatter(readFileSafe('_runs/RUN_LEDGER.md') || '').body);
    return t.length ? t[0].rows.filter((r) => r[0] && r[0].trim()).length : 0;
  })();
  const recCount = asList(corpus.reconciliation?.contradictions).length;
  const knowsCells = [
    { v: featCount, l: 'features', s: 'documented', tab: 'features' },
    { v: bugCount, l: 'bugs', s: 'identified', tab: 'production' },
    { v: riskCount, l: 'risks', s: 'tracked', tab: 'production' },
    { v: watchCount, l: 'watch items', s: 'monitored', tab: 'production' },
    { v: modCount, l: 'modules', s: 'mapped', tab: 'architecture' },
    { v: apiCount, l: 'APIs', s: 'catalogued', tab: 'architecture' },
    { v: integCount, l: 'integrations', s: 'wired', tab: 'architecture' },
    { v: runLedgerCount, l: 'agent runs', s: 'logged', tab: 'trajectory' },
    { v: recCount, l: 'reconciliations', s: 'resolved', tab: 'corpus' },
  ].filter((c) => c.v && c.v > 0);

  // ---- Quick links / where to start ----
  const cta = `
    <section class="vitrine-cta">
      <a class="cta-card cta-sponsor" href="#corpus">
        <div class="cta-kicker">SPONSOR · 30 SEC SCAN</div>
        <div class="cta-title">Corpus state →</div>
        <div class="cta-desc">L'état du corpus en un coup d'œil : maturité, pipeline, couverture.</div>
      </a>
      <a class="cta-card cta-dev" href="#code">
        <div class="cta-kicker">DEV · CODE HEALTH</div>
        <div class="cta-title">Code &amp; structural issues →</div>
        <div class="cta-desc">Maturité par dimension, anti-patterns détectés, inventaire.</div>
      </a>
      <a class="cta-card cta-ops" href="#production">
        <div class="cta-kicker">OPS · PROD HEALTH</div>
        <div class="cta-title">Production →</div>
        <div class="cta-desc">Bugs actifs, risques structurels, baselines runtime.</div>
      </a>
      <a class="cta-card cta-manager" href="#trajectory">
        <div class="cta-kicker">MANAGER · ROADMAP</div>
        <div class="cta-title">Trajectory →</div>
        <div class="cta-desc">Update candidates, runs récents, plan d'adoption.</div>
      </a>
    </section>`;

  return `
    ${vitrineHero}
    ${pitch}
    ${standards}

    ${miniDivider('The application it covers', a.business_domain || 'business context')}
    <section class="about-hero about-hero-compact">
      <div class="about-hero-main">
        ${aliases.length ? `<div class="about-hero-aliases">${aliases.map((x) => `<span class="about-alias">${esc(x)}</span>`).join('')}</div>` : ''}
        ${a.business_domain ? `<p class="about-hero-domain">${esc(a.business_domain)}</p>` : ''}
        ${a.description && a.description !== a.business_domain ? `<p class="about-hero-desc">${esc(shorten(a.description, 360))}</p>` : ''}
      </div>
      ${stats.length ? `<div class="about-hero-stats">
        ${stats.map((s) => `<div class="about-stat"><div class="about-stat-v">${esc(s.v)}</div><div class="about-stat-l">${esc(s.l)}</div></div>`).join('')}
      </div>` : ''}
    </section>
    <div class="about-grid">
      ${repoCard}
      ${techCard}
      ${depCard}
      ${orgCard}
      ${mrCard}
    </div>
    ${dsCard}
    ${extCard}

    ${miniDivider('Workforce + Inputs', '5 agent roles · ' + sources.length + ' source connectors')}
    <div class="about-two-col">
      <div>${agentCards ? `<div class="about-subhead">Agents that work on this corpus</div><div class="agent-grid agent-grid-tight">${agentCards}</div>` : ''}</div>
      <div>${sources.length ? `<div class="about-subhead">Sources it draws from</div><div class="src-grid">${sourceCards}</div>` : ''}</div>
    </div>

    ${(knowsCells.length || true) ? `${miniDivider('Proof + Start here', 'what this corpus already knows · where to dig')}
    <div class="about-two-col">
      <div>${knowsCells.length ? `<div class="about-subhead">What this corpus already knows</div><div class="knows-grid knows-grid-tight">${knowsCells.map((c) => `<a class="knows-card" href="#${c.tab}">
        <div class="knows-v">${esc(c.v)}</div>
        <div class="knows-l">${esc(c.l)}</div>
        <div class="knows-s muted">${esc(c.s)}</div>
      </a>`).join('')}</div>` : ''}</div>
      <div><div class="about-subhead">Where to start</div>${cta}</div>
    </div>` : ''}
  `;
}

// Compact section divider (replaces the numbered "01 / 02 / ..." style for
// secondary sections so the page stays scannable).
function miniDivider(title, sub) {
  return `<div class="about-mini-divider">
    <div class="amd-bar"></div>
    <div class="amd-title">${esc(title)}</div>
    ${sub ? `<div class="amd-sub muted">${esc(sub)}</div>` : ''}
  </div>`;
}

// Parse the actionable-readiness "Agent Task Readiness" table for the About vitrine.
function parseAgentReadiness() {
  const md = corpus.actionable_readiness;
  if (!md) return [];
  const tables = parseMdTables(parseFrontmatter(md).body);
  const out = [];
  for (const t of tables) {
    const h = t.headers.map((x) => x.toLowerCase());
    if (!/agent/.test(h[0] || '')) continue;
    const idxTask = h.findIndex((x) => /task|normal task/.test(x));
    const idxStatus = h.findIndex((x) => /status/.test(x));
    const idxEvidence = h.findIndex((x) => /evidence/.test(x));
    const idxGaps = h.findIndex((x) => /gap/.test(x));
    for (const r of t.rows) {
      if (!r[0] || !r[0].trim()) continue;
      out.push({
        agent: stripMd(r[0]),
        task: idxTask >= 0 ? stripMd(r[idxTask] || '') : '',
        status: idxStatus >= 0 ? stripMd(r[idxStatus] || '') : 'unknown',
        evidence: idxEvidence >= 0 ? stripMd(r[idxEvidence] || '') : '',
        gaps: idxGaps >= 0 ? stripMd(r[idxGaps] || '') : '',
      });
    }
  }
  return out;
}

function renderDataStores(ds) {
  return `<table class="rows-table"><thead><tr>
    <th>Name</th><th>Type</th><th>Purpose</th><th>Confidence</th><th>Notes</th>
  </tr></thead><tbody>
  ${ds.map((d) => `<tr>
    <td><strong>${esc(d.name || '—')}</strong></td>
    <td>${esc(d.type || d.engine || '—')}</td>
    <td>${esc(shorten(d.purpose || d.usage || '', 160))}</td>
    <td>${esc(d.confidence || '—')}</td>
    <td class="muted">${esc(shorten(d.notes || '', 160))}</td>
  </tr>`).join('')}
  </tbody></table>`;
}

function kvTable(rows) {
  const cleaned = rows.filter(([, v]) => v != null && v !== '' && v !== '—' && v !== false);
  if (!cleaned.length) return '<div class="muted">No data.</div>';
  return `<dl class="kv-list">${cleaned.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${typeof v === 'string' && v.startsWith('<') ? v : esc(v)}</dd>`).join('')}</dl>`;
}

function panelEmpty(title, msg) {
  return `<div class="panel-head"><div><h1>${esc(title)}</h1><p class="lede">${esc(msg)}</p></div></div>`;
}

// ----- Architecture tab ----------------------------------------------
// =====================================================================
// Hero metrics — the 4 measured tiles + the sponsor sentence
// =====================================================================
function computeHeroMetrics() {
  const cs = corpus.corpus_state?.corpus || corpus.corpus_state || {};

  // 1) Coverage % — covered/total across work-area status fields
  let covered = 0, total = 0;
  const seen = new Set();
  for (const [k, v] of Object.entries(cs)) {
    if (typeof v !== 'string') continue;
    if (!/_status$/.test(k)) continue;
    if (/_initialized$/.test(k)) continue;
    // dedupe by stem
    const stem = k.replace(/_(coverage|discovery)?_status$/, '');
    if (seen.has(stem)) continue;
    seen.add(stem);
    total++;
    if (/^(covered|done|available)$/i.test(v)) covered++;
  }
  // also include boolean done flags
  for (const k of ['source_inventory_done', 'first_code_pass_done', 'first_prod_pass_done']) {
    if (typeof cs[k] === 'boolean') { total++; if (cs[k]) covered++; }
  }
  const coverage = total ? Math.round((covered / total) * 100) : null;

  // 2) Anchoring % — claims with explicit (confirmed|probable) source in their frontmatter.
  // Same denominator as the Sources tab so the two readings agree.
  let anchored = 0, claims = 0;
  const items = [
    ...(corpus.prod.bugs || []),
    ...(corpus.prod.risks || []),
    ...(corpus.prod.watchlist || []),
    ...(corpus.features || []),
  ];
  for (const it of items) {
    claims++;
    const conf = String(it.meta?.confidence || '').toLowerCase();
    if (/confirmed|probable/.test(conf)) anchored++;
  }
  const anchoring = claims ? Math.round((anchored / claims) * 100) : null;

  // 3) Freshness — median age in days of last_validated dates
  const now = new Date();
  const ages = [];
  function pushAge(d) {
    if (!d) return;
    const dt = new Date(String(d).slice(0, 10));
    if (isNaN(dt.getTime())) return;
    ages.push(Math.max(0, Math.round((now - dt) / 86400000)));
  }
  for (const it of items) pushAge(it.meta?.last_validated);
  for (const k of ['last_kickstart', 'last_quality_check', 'last_reconciliation', 'last_continuous_run', 'last_prod_discovery']) pushAge(cs[k]);
  pushAge(corpus.app?.application?.last_updated);
  ages.sort((a, b) => a - b);
  const freshness = ages.length ? ages[Math.floor(ages.length / 2)] : null;

  // 4) Volume utile — sum of rows across _indexes/*.md tables
  let volume = 0;
  for (const idx of Object.values(corpus.indexes || {})) {
    for (const t of idx.tables || []) volume += (t.rows || []).length;
  }
  // Sentence parts
  const app = corpus.app?.application || {};
  const sources = asList(corpus.info_sources?.information_sources || corpus.info_sources?.sources);
  const sourcesDeclared = sources.filter((s) => s.lifecycle === 'declared').length;
  let evidenceCount = 0;
  const gEvidence = corpus.graph?.evidence?.graph?.evidence || corpus.graph?.evidence?.evidence;
  if (gEvidence) evidenceCount = asList(gEvidence).length;
  const lastKickDate = cs.last_kickstart || cs.last_continuous_run;
  let daysSinceKick = null;
  if (lastKickDate) {
    const d = new Date(String(lastKickDate).slice(0, 10));
    if (!isNaN(d.getTime())) daysSinceKick = Math.max(0, Math.round((now - d) / 86400000));
  }
  return {
    coverage, anchoring, freshness, volume,
    coveredN: covered, coverageTotal: total,
    anchoredN: anchored, claimsTotal: claims,
    freshnessAges: ages,
    sourcesDeclared, sourcesTotal: sources.length,
    evidenceCount,
    daysSinceKick,
    appName: app.name || 'application',
    domain: app.business_domain || app.description || '',
    maturityLevel: cs.maturity_level,
    phase: cs.phase || cs.operating_mode || '',
  };
}

function renderGlobalHeroBar() {
  const m = computeHeroMetrics();
  const phrase = buildSponsorPhrase(m);
  function tile(label, value, hint, tone, unit) {
    const empty = value == null || value === '—';
    const cls = empty ? 'gh-tile gh-tile-empty' : `gh-tile gh-tile-${tone || 'neutral'}`;
    return `<a class="${cls}" href="#${label.toLowerCase().includes('couv') ? 'corpus' : label.toLowerCase().includes('ancr') ? 'sources' : label.toLowerCase().includes('fra') ? 'trajectory' : 'navigation'}">
      <div class="gh-tile-value">${empty ? 'not yet measured' : esc(value)}${!empty && unit ? `<span class="gh-tile-unit">${esc(unit)}</span>` : ''}</div>
      <div class="gh-tile-label">${esc(label)}</div>
      <div class="gh-tile-hint">${esc(hint)}</div>
    </a>`;
  }
  const tones = {
    coverage: m.coverage == null ? null : (m.coverage >= 60 ? 'good' : m.coverage >= 25 ? 'mid' : 'low'),
    anchoring: m.anchoring == null ? null : (m.anchoring >= 70 ? 'good' : m.anchoring >= 40 ? 'mid' : 'low'),
    freshness: m.freshness == null ? null : (m.freshness < 30 ? 'good' : m.freshness < 90 ? 'mid' : 'low'),
    volume: m.volume > 0 ? 'good' : null,
  };
  return `
    <section class="hero-bar">
      <div class="hero-bar-inner">
        <p class="hero-phrase">${phrase}</p>
        <div class="hero-tiles">
          ${tile('Couverture', m.coverage, `${m.coveredN}/${m.coverageTotal} areas`, tones.coverage, '%')}
          ${tile('Ancrage', m.anchoring, `${m.anchoredN}/${m.claimsTotal} claims sourced`, tones.anchoring, '%')}
          ${tile('Fraîcheur', m.freshness, m.freshnessAges.length ? `median across ${m.freshnessAges.length} items` : '', tones.freshness, ' days')}
          ${tile('Volume utile', m.volume || '—', 'indexed items across cross-cuts', tones.volume, '')}
        </div>
      </div>
    </section>`;
}

function buildSponsorPhrase(m) {
  if (!m.maturityLevel && !m.daysSinceKick) {
    return '<strong>Corpus initialisé</strong>, en attente de kickstart. Aucune evidence collectée.';
  }
  const parts = [];
  parts.push(`Corpus de <strong>${esc(m.appName)}</strong>`);
  if (m.domain) parts.push(`<span class="hero-phrase-domain">${esc(shorten(m.domain, 80))}</span>`);
  let stadium = '';
  if (m.maturityLevel != null) stadium = `stade <strong>L${m.maturityLevel}${m.phase ? ' ' + m.phase : ''}</strong>`;
  if (stadium) parts.push(stadium);
  if (m.daysSinceKick != null) parts.push(`dernier kickstart il y a <strong>${m.daysSinceKick}&nbsp;jour${m.daysSinceKick > 1 ? 's' : ''}</strong>`);
  if (m.sourcesDeclared) parts.push(`<strong>${m.sourcesDeclared}</strong> contrat${m.sourcesDeclared > 1 ? 's' : ''} de source déclaré${m.sourcesDeclared > 1 ? 's' : ''}`);
  if (m.evidenceCount) parts.push(`<strong>${m.evidenceCount}</strong> preuve${m.evidenceCount > 1 ? 's' : ''}`);
  return parts.join(' · ');
}

function renderApiSections(sections) {
  if (!sections.length) return '';
  function protoTone(p) {
    if (!p) return 'unknown';
    if (/SOAP/i.test(p)) return 'soap';
    if (/REST/i.test(p)) return 'rest';
    if (/KAFKA/i.test(p)) return 'kafka';
    if (/JMS|MQ/i.test(p)) return 'jms';
    if (/BATCH/i.test(p)) return 'batch';
    return 'unknown';
  }
  return `<div class="api-sections">${sections.map((s) => {
    const metaPairs = Object.entries(s.meta || {}).slice(0, 6);
    const ops = s.operations || [];
    return `
      <article class="api-card">
        <header class="api-card-head">
          <span class="api-proto api-proto-${protoTone(s.protocol)}">${esc(s.protocol || '—')}</span>
          <h3 class="api-card-title">${esc(s.name)}</h3>
          ${s.qualifier ? `<span class="api-qualifier">${esc(s.qualifier)}</span>` : ''}
        </header>
        ${metaPairs.length ? `<dl class="api-meta">${metaPairs.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(shorten(v, 180))}</dd>`).join('')}</dl>` : ''}
        ${ops.length ? `
          <div class="api-ops-head">${ops.length} operation${ops.length > 1 ? 's' : ''}</div>
          <table class="api-ops"><thead><tr><th>Operation</th><th>Description</th><th>Consumers</th>${ops.some((o) => o.status) ? '<th>Status</th>' : ''}</tr></thead>
          <tbody>${ops.map((o) => `<tr>
            <td><code>${esc(o.op)}</code></td>
            <td class="muted">${esc(shorten(o.desc, 140))}</td>
            <td>${o.consumers && o.consumers.length ? o.consumers.map((c) => `<span class="api-consumer">${esc(c)}</span>`).join('') : '<span class="muted">—</span>'}</td>
            ${ops.some((x) => x.status) ? `<td>${esc(o.status || '—')}</td>` : ''}
          </tr>`).join('')}</tbody></table>
        ` : ''}
      </article>`;
  }).join('')}</div>`;
}

// Parse project/apis/CATALOG.md → structured array of API sections.
// Each H2 heading "## N. PROTOCOL — Name [(qualifier)]" begins a section.
// Bold "**Field** : value" lines are metadata. The first markdown table = operations.
function parseApiCatalog(md) {
  if (!md) return [];
  const fm = parseFrontmatter(md);
  const body = fm.body;
  const sections = [];
  const lines = body.split(/\r?\n/);
  let current = null;
  let buffer = [];
  function flush() {
    if (!current) return;
    // Parse buffer for metadata + tables
    const text = buffer.join('\n');
    // Metadata: **Label** : value (possibly with list under)
    const meta = {};
    const metaRe = /\*\*([^*]+?)\*\*\s*:?\s*(.*)/g;
    let m;
    while ((m = metaRe.exec(text)) !== null) {
      const label = m[1].trim();
      let val = m[2].trim();
      // Strip backticks
      val = val.replace(/`([^`]+)`/g, '$1');
      if (val) meta[label] = val;
    }
    // Tables — keep all, we want operations and any other table found
    const tables = parseMdTables(text);
    const operations = [];
    for (const t of tables) {
      const hdr = t.headers.map((h) => h.toLowerCase());
      const isOps = hdr.some((h) => /op[ée]ration|endpoint|topic|queue|m[ée]thode/i.test(h));
      if (!isOps) continue;
      // Find the right columns
      const idxOp = hdr.findIndex((h) => /op[ée]ration|endpoint|topic|queue|command|m[ée]thode/.test(h));
      const idxDesc = hdr.findIndex((h) => /description|usage|but/.test(h));
      const idxCons = hdr.findIndex((h) => /consomm|consumer|producteur|producer|external/i.test(h));
      const idxStatus = hdr.findIndex((h) => /statut|status|direction/.test(h));
      for (const r of t.rows) {
        if (!r[idxOp]) continue;
        operations.push({
          op: stripMd(r[idxOp]),
          desc: idxDesc >= 0 ? stripMd(r[idxDesc]) : '',
          consumers: idxCons >= 0 ? stripMd(r[idxCons]).split(/[,;/]|\s+ou\s+/).map((x) => x.trim()).filter(Boolean) : [],
          status: idxStatus >= 0 ? stripMd(r[idxStatus]) : '',
        });
      }
    }
    // Pull a few well-known meta into top-level fields
    const protoLine = current.heading.match(/^([A-Z][A-Za-z0-9_+/]*)\s*[—–-]+\s*(.*)$/);
    const protocol = protoLine ? protoLine[1].toUpperCase() : '';
    const nameRest = protoLine ? protoLine[2] : current.heading;
    const qualMatch = nameRest.match(/^(.*?)\s*\((.+?)\)\s*$/);
    sections.push({
      idx: current.idx,
      idxLabel: current.idxLabel || String(current.idx),
      protocol,
      name: qualMatch ? qualMatch[1].trim() : nameRest.trim(),
      qualifier: qualMatch ? qualMatch[2].trim() : '',
      heading: current.heading,
      meta,
      operations,
    });
  }
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    // Accept numbered section indices like `1.`, `1a.`, `2b.`, `1.1.`, etc.
    // — must start with a digit. SOAP service catalogs often number variants
    // as `## 1a.` / `## 1b.` and we were silently dropping them.
    const h2 = ln.match(/^##\s+(\d[\d.a-z]*)\.\s+(.+?)\s*$/i);
    if (h2) {
      flush();
      const idxStr = h2[1];
      const idxNum = parseInt(idxStr, 10); // "1a" → 1, "2.3" → 2 (for grouping)
      current = { idx: Number.isFinite(idxNum) ? idxNum : 0, idxLabel: idxStr, heading: h2[2].trim() };
      buffer = [];
      continue;
    }
    if (/^##\s/.test(ln) && current) {
      // a different H2 (no numbered prefix) — end current section
      flush();
      current = null;
      buffer = [];
      continue;
    }
    if (current) buffer.push(ln);
  }
  flush();
  return sections;
}

// Extract every REST endpoint row from a CATALOG.md formatted like the canonical pack's:
// any table whose headers include a Method + Path pair. Returns a flat list
// of `{ method, path, op, controller }` so callers can join by CHECKKEY op.
function parseRestCatalogPaths(md) {
  if (!md) return [];
  const fm = parseFrontmatter(md);
  const body = fm.body;
  const rows = [];
  // Walk H2/H3 sections so we can label each endpoint with its controller
  const sections = body.split(/^(##+\s+.+)$/m);
  let currentCtrl = '';
  for (let i = 0; i < sections.length; i++) {
    const piece = sections[i];
    const isHead = /^##+\s+/.test(piece);
    if (isHead) {
      currentCtrl = piece.replace(/^##+\s+/, '').replace(/\s*—.*$/, '').trim();
      continue;
    }
    const tables = parseMdTables(piece);
    for (const t of tables) {
      const hdr = (t.headers || []).map((h) => h.toLowerCase());
      const idxMethod = hdr.findIndex((h) => /m[ée]thode|method|verb/.test(h));
      const idxPath = hdr.findIndex((h) => /^path$|endpoint/.test(h));
      if (idxMethod < 0 || idxPath < 0) continue;
      const idxOp = hdr.findIndex((h) => /op[\s-]*checkkey|op\b|operation/.test(h));
      for (const r of t.rows) {
        const method = stripMd(r[idxMethod] || '').toUpperCase();
        const path = stripMd(r[idxPath] || '');
        if (!method || !path) continue;
        const op = idxOp >= 0 ? stripMd(r[idxOp] || '') : '';
        rows.push({ method, path, op, controller: currentCtrl });
      }
    }
  }
  return rows;
}

function parseIntegrationsFromReadme(md) {
  if (!md) return { inbound: [], outbound: [] };
  // Find the "### Entrants" / "### Sortants" sections, parse first table after each
  const result = { inbound: [], outbound: [] };
  const segments = md.split(/^### /m);
  for (const seg of segments) {
    const head = seg.split('\n')[0].toLowerCase();
    const isIn = /entrants|inbound|producteurs/.test(head);
    const isOut = /sortants|outbound|consommateurs/.test(head);
    if (!isIn && !isOut) continue;
    const tables = parseMdTables(seg);
    if (!tables.length) continue;
    const t = tables[0];
    for (const r of t.rows) {
      const entry = {
        peer: stripMd(r[0] || ''),
        channel: stripMd(r[1] || ''),
        endpoint: stripMd(r[2] || ''),
        status: stripMd(r[3] || ''),
      };
      if (!entry.peer || entry.peer === '—') continue;
      (isIn ? result.inbound : result.outbound).push(entry);
    }
  }
  return result;
}

// Fallback parser for corpora that put the SI map in
// `project/architecture/INTEGRATION_MAP.md` instead of the integrations README.
//
// Inbound:  one row per consumer in the `## Systèmes consommateurs (inbound)`
//           table (cols: Peer | Hash | Canal | Operations | Confidence | Source).
// Outbound: one entry per `### <System>` subsection under `## Systèmes intégrés
//           (outbound)`. The protocol is inferred from the first table inside,
//           the endpoint label is the first service name.
function parseIntegrationsFromMap(md) {
  if (!md) return { inbound: [], outbound: [] };
  const result = { inbound: [], outbound: [] };

  // Split on H2 to isolate sections
  const h2Segments = md.split(/^## /m);
  for (const seg of h2Segments) {
    const head = seg.split('\n')[0].toLowerCase();
    const isIn = /consommateurs.*inbound|inbound.*consommateurs|entrants/.test(head);
    const isOut = /int[ée]gr[ée]s.*outbound|outbound|sortants/.test(head);
    if (!isIn && !isOut) continue;

    // Detect the dominant protocol from the section narrative (text before the
    // first table) so we don't conflate "Canal" (business channel) with the
    // technical protocol.
    function inferSectionProtocol(text) {
      const t = text.toLowerCase();
      if (/kafka/.test(t)) return 'Kafka';
      if (/jms|activemq/.test(t)) return 'JMS';
      if (/wsdl|soap/.test(t)) return 'SOAP';
      if (/\brest\b|endpoint/.test(t)) return 'REST';
      if (/jdbc|jpa/.test(t)) return 'JDBC';
      if (/nfs|file/.test(t)) return 'NFS';
      return '';
    }

    if (isIn) {
      const sectionProto = inferSectionProtocol(seg) || 'REST';
      // Capture intro paragraph (text before the first table) as shared context
      // for inbound entries — the section narrative usually explains the
      // protocol and constraints (hash-based routing, etc.).
      const introMatch = seg.match(/^([^|]+?)\n\|/s);
      const intro = introMatch ? introMatch[1].split('\n').slice(1).join('\n').trim() : '';
      // Also capture trailing prose (notes after the table)
      const trailingMatch = seg.match(/\|\s*\n([\s\S]*)$/);
      const trailing = trailingMatch ? trailingMatch[1].replace(/^(\s*\|.*\n)+/, '').trim() : '';
      // First H2-scoped table is the inbound caller list
      const tables = parseMdTables(seg);
      if (tables.length) {
        const headers = tables[0].headers || [];
        for (const r of tables[0].rows) {
          const peer = stripMd(r[0] || '');
          if (!peer || peer === '—') continue;
          const canal = stripMd(r[2] || '');
          const hash = stripMd(r[1] || '');
          const endpoint = canal && hash ? `${hash} · ${canal}` : (hash || canal);
          // Per-row body = field list rebuilt as a markdown table fragment +
          // shared intro/trailing for context.
          const rowFacts = headers
            .map((h, i) => [stripMd(h), stripMd(r[i] || '')])
            .filter(([k, v]) => k && v && v !== '—');
          const body = [
            intro,
            rowFacts.length ? rowFacts.map(([k, v]) => `- **${k}** — ${v}`).join('\n') : '',
            trailing,
          ].filter(Boolean).join('\n\n');
          // Parse the allowed operations cell — `*` means "all", otherwise a
          // comma-separated list like "ELIG, CAR, PRICE, SOUS, VENTES, KPI".
          const opsRaw = stripMd(r[3] || '');
          let allowedOps = [];
          let opsAll = false;
          if (/\*|toutes|all/i.test(opsRaw)) {
            opsAll = true;
          } else if (opsRaw) {
            allowedOps = opsRaw.split(/[,\s]+/).map((s) => s.replace(/[`()]/g, '').trim()).filter(Boolean);
          }
          result.inbound.push({
            peer,
            channel: sectionProto,
            endpoint,
            status: stripMd(r[4] || ''),
            body,
            source: stripMd(r[5] || '') || 'INTEGRATION_MAP.md',
            hash,
            canal,
            opsAll,
            allowedOps,
          });
        }
      }
    }

    if (isOut) {
      // Sub-sections — each ### <System> is one outbound peer
      const subSegs = seg.split(/^### /m).slice(1);
      for (const sub of subSegs) {
        const subHeadRaw = sub.split('\n')[0].trim();
        if (!subHeadRaw) continue;
        const peer = subHeadRaw.split(/\s*[—–-]\s+/)[0].trim();
        if (!peer) continue;
        const tables = parseMdTables(sub);
        let channel = '';
        let endpoint = '';
        if (tables.length) {
          const t = tables[0];
          const protos = new Set();
          const endpoints = [];
          for (const r of t.rows) {
            const svc = stripMd(r[0] || '');
            const proto = stripMd(r[1] || '');
            if (proto) protos.add(proto.split(/[\s(]/)[0]);
            if (svc) endpoints.push(svc);
          }
          channel = [...protos][0] || '';
          endpoint = endpoints.length > 1 ? `${endpoints[0]} (+${endpoints.length - 1})` : (endpoints[0] || '');
        }
        if (!channel) channel = inferSectionProtocol(sub) || '—';
        // Body = the full sub-section markdown (heading is excluded — caller already has the peer name)
        const body = sub.split('\n').slice(1).join('\n').trim();
        result.outbound.push({
          peer,
          channel,
          endpoint,
          status: '',
          body,
          source: 'INTEGRATION_MAP.md',
        });
      }
    }
  }
  return result;
}
function stripMd(s) {
  return String(s || '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();
}
function protocolColor(channel) {
  const c = String(channel || '').toLowerCase();
  if (/kafka/.test(c)) return '#ef6f6c';
  if (/jms|activemq|amq/.test(c)) return '#f5b860';
  if (/rest|http/.test(c)) return '#4ade80';
  if (/soap|cxf|wsdl|ws\b/.test(c)) return '#7dd3c0';
  if (/azure|blob|cloud/.test(c)) return '#5ee3d4';
  if (/jdbc|jpa|sql|postgres|oracle|mysql|database|db/.test(c)) return '#a899ff';
  if (/nfs|file|filesystem/.test(c)) return '#8c7bff';
  if (/grpc/.test(c)) return '#fbbf24';
  if (/sdk|api|applications/.test(c)) return '#9ca3af';
  return '#7c8392';
}
// Compute the coverage-by-area entries from corpus_state. Used by the Meta
// "Corpus state" tab AND promoted into Overview as the signature knowledge
// state visual.
function computeCoverageEntriesFor(cs) {
  if (!cs || typeof cs !== 'object') return [];
  const entries = [];
  for (const [k, v] of Object.entries(cs)) {
    if (typeof v !== 'string') continue;
    if (!/_status$/.test(k)) continue;
    if (/^(prod_discovery|jira|confluence|dynatrace|repository|custom_source|cicd_discovery|git_discovery|project_activity_discovery|indexes|information_source_registry|discovery_coverage|source_inventory|first_code_pass|first_prod_pass|brick_inventory|reconciliation|knowledge_graph|cross_cutting)/.test(k) === false && k !== 'overall_status') continue;
    const niceKey = k.replace(/_status$/, '').replace(/_coverage$/, '').replace(/_discovery$/, '').replace(/_/g, ' ');
    entries.push({ key: niceKey, raw: k, value: v });
  }
  for (const [k, v] of Object.entries(cs)) {
    if (typeof v !== 'boolean') continue;
    if (!/^(source_inventory_done|first_code_pass_done|first_prod_pass_done|indexes_initialized)$/.test(k)) continue;
    const niceKey = k.replace(/_done$/, '').replace(/_initialized$/, '').replace(/_/g, ' ');
    entries.push({ key: niceKey, raw: k, value: v ? 'done' : 'not_done' });
  }
  // dedupe by niceKey, prefer coverage_status > discovery_status > _done > else
  const rank = (raw) => /_coverage_status$/.test(raw) ? 0 : /_discovery_status$/.test(raw) ? 1 : /_done$|_initialized$/.test(raw) ? 2 : 3;
  const byKey = new Map();
  for (const c of entries) {
    const prev = byKey.get(c.key);
    if (!prev || rank(c.raw) < rank(prev.raw)) byKey.set(c.key, c);
  }
  const out = [...byKey.values()];
  const statusOrder = { covered: 0, done: 0, available: 0, partial: 1, started: 2, not_started: 3, not_done: 3, blocked: 4, unknown: 5 };
  out.sort((a, b) => (statusOrder[a.value] ?? 9) - (statusOrder[b.value] ?? 9) || a.key.localeCompare(b.key));
  return out;
}
function covTone(s) {
  s = String(s).toLowerCase();
  if (s === 'covered' || s === 'done') return 'good';
  if (s === 'partial' || s === 'started') return 'mid';
  if (s === 'not_started' || s === 'not_done') return 'low';
  if (s === 'blocked' || s === 'failed') return 'crit';
  return 'todo';
}
// Generate an inline SVG ER-style diagram for a domain section: a central
// database/store node + the entities laid out around it. Pure SVG, no deps.
function renderDomainErSvg(domainName, entities) {
  const ents = entities.filter((e) => e.name && e.name !== '—').slice(0, 24);
  if (!ents.length) return '';
  // Detect store kind to pick the accent colour
  const lname = String(domainName || '').toLowerCase();
  const accent = /postgres|postgresql/.test(lname) ? '#5fa8e8'
    : /oracle/.test(lname) ? '#f08055'
    : /mysql|mariadb/.test(lname) ? '#f5b860'
    : /mongo/.test(lname) ? '#4ade80'
    : /redis/.test(lname) ? '#ef6f6c'
    : '#8c7bff';
  // Layout: centre node + entities arranged in two columns (left/right of centre)
  // for up to ~12 each side. Compact grid below if more.
  const perCol = Math.ceil(ents.length / 2);
  const rowH = 38;
  const colW = 220;
  const padX = 24;
  const padY = 60;
  const W = colW * 2 + padX * 4 + 200; // centre node 200
  const H = Math.max(380, perCol * rowH + padY * 2);
  const cx = W / 2;
  const cy = H / 2;
  const hubW = 200, hubH = 80;

  function entCard(x, y, e) {
    const safeName = esc(e.name);
    const safeTable = e.table && e.table !== '—' ? esc(e.table) : '';
    return `
      <g class="der-ent">
        <rect x="${x}" y="${y}" width="${colW}" height="32" rx="6" ry="6"
              fill="rgba(16,19,26,0.95)" stroke="${accent}" stroke-opacity="0.4" stroke-width="1"/>
        <text x="${x + 12}" y="${y + 14}" font-size="12" font-weight="600" fill="#e6eaf2">${safeName}</text>
        ${safeTable ? `<text x="${x + 12}" y="${y + 26}" font-size="10" fill="#818897" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">${safeTable}</text>` : ''}
      </g>`;
  }
  function curve(x1, y1, x2, y2) {
    const mx = (x1 + x2) / 2;
    return `<path d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}"
              stroke="${accent}" stroke-opacity="0.35" stroke-width="1" fill="none"/>`;
  }

  let body = '';
  // hub
  body += `
    <defs>
      <linearGradient id="der-hub-${integSlug(domainName)}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${accent}" stop-opacity="0.28"/>
        <stop offset="100%" stop-color="${accent}" stop-opacity="0.08"/>
      </linearGradient>
    </defs>
    <g class="der-hub">
      <rect x="${cx - hubW/2}" y="${cy - hubH/2}" width="${hubW}" height="${hubH}" rx="12" ry="12"
            fill="url(#der-hub-${integSlug(domainName)})" stroke="${accent}" stroke-opacity="0.7" stroke-width="1.5"/>
      <text x="${cx}" y="${cy - 8}" text-anchor="middle" font-size="13" font-weight="700" fill="#fff" letter-spacing="-0.005em">${esc(shorten(domainName, 28))}</text>
      <text x="${cx}" y="${cy + 12}" text-anchor="middle" font-size="11" fill="#c1c7d3" letter-spacing="0.05em">${ents.length} entit${ents.length > 1 ? 'ies' : 'y'}</text>
    </g>`;

  const leftX = padX;
  const rightX = W - padX - colW;
  ents.forEach((e, i) => {
    const onLeft = i < perCol;
    const x = onLeft ? leftX : rightX;
    const idx = onLeft ? i : (i - perCol);
    const y = padY + idx * rowH;
    body += entCard(x, y, e);
    // Edge from card to hub
    const cardEdgeX = onLeft ? x + colW : x;
    const cardEdgeY = y + 16;
    const hubEdgeX = onLeft ? cx - hubW/2 : cx + hubW/2;
    body += curve(cardEdgeX, cardEdgeY, hubEdgeX, cy);
  });

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" class="der-diagram" preserveAspectRatio="xMidYMid meet">${body}</svg>`;
}

function integSlug(s) {
  return String(s || '').toLowerCase().replace(/[àáâãäå]/g, 'a').replace(/[èéêë]/g, 'e').replace(/[ìíîï]/g, 'i').replace(/[òóôõö]/g, 'o').replace(/[ùúûü]/g, 'u').replace(/[ç]/g, 'c').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function renderConfidenceChip(status) {
  const s = String(status || '').trim().toLowerCase();
  if (!s || s === '—') return '<span class="muted">—</span>';
  if (/confirmed|confirm[ée]/.test(s)) return `<span class="conf-chip conf-confirmed">confirmed</span>`;
  if (/probable/.test(s)) return `<span class="conf-chip conf-probable">probable</span>`;
  if (/unknown|inconnu/.test(s)) return `<span class="conf-chip conf-unknown">unknown</span>`;
  return `<span class="conf-chip">${esc(status)}</span>`;
}
function protocolLabel(channel) {
  const c = String(channel || '').toLowerCase();
  if (/kafka/.test(c)) return 'Kafka';
  if (/activemq|amq|jms/.test(c)) return 'JMS';
  if (/rest|http/.test(c)) return 'REST';
  if (/soap|cxf|wsdl|ws\b/.test(c)) return 'SOAP';
  if (/azure|blob/.test(c)) return 'Azure';
  if (/jdbc|jpa|postgres|oracle/.test(c)) return 'JDBC';
  if (/nfs|file/.test(c)) return 'NFS';
  if (/grpc/.test(c)) return 'gRPC';
  if (/applications/.test(c)) return 'Apps';
  return (channel || '?').split(/\s+/)[0];
}
function renderContextDiagram(appName, integ) {
  const inbound = integ.inbound.slice(0, 10);
  const outbound = integ.outbound.slice(0, 10);
  const W = 1100, H = Math.max(420, Math.max(inbound.length, outbound.length) * 56 + 80);
  const cx = W / 2, cy = H / 2;
  const appW = 220, appH = 90;
  const leftX = 60, rightX = W - 60 - 180;
  const rowH = 46;
  const offY = 40;

  function nodeRect(x, y, w, label, sublabel, color, detailId) {
    const idAttr = detailId ? ` data-detail-id="${esc(detailId)}" class="ctx-node ctx-node-clickable" tabindex="0" role="button" aria-label="${esc(label)} — open details"` : ' class="ctx-node"';
    return `
      <g${idAttr}>
        <rect x="${x}" y="${y}" width="${w}" height="36" rx="8" ry="8" fill="rgba(16,19,26,0.95)" stroke="${color}" stroke-width="1" />
        <text x="${x + 12}" y="${y + 16}" font-size="12" font-weight="600" fill="#e6eaf2">${esc(shorten(label, 28))}</text>
        <text x="${x + 12}" y="${y + 30}" font-size="10" fill="#818897">${esc(shorten(sublabel, 36))}</text>
      </g>`;
  }
  function line(x1, y1, x2, y2, color, label, side, dashed) {
    const mx = (x1 + x2) / 2;
    const dashAttr = dashed ? ' stroke-dasharray="5,4"' : '';
    // Edge labels are intentionally omitted — color carries the protocol
    // (see the legend above the diagram). Avoids label stacking when several
    // peers share the same protocol.
    return `
      <g class="ctx-link">
        <path d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}" stroke="${color}" stroke-width="1.6" fill="none" opacity="0.85"${dashAttr}/>
      </g>`;
  }

  let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" class="ctx-diagram" preserveAspectRatio="xMidYMid meet">`;
  // app
  svg += `
    <g>
      <rect x="${cx - appW/2}" y="${cy - appH/2}" width="${appW}" height="${appH}" rx="14" ry="14"
        fill="url(#ctxAppGrad)" stroke="rgba(140,123,255,0.55)" stroke-width="1.5"/>
      <text x="${cx}" y="${cy - 12}" text-anchor="middle" font-size="22" font-weight="700" fill="#fff" letter-spacing="-0.01em">${esc(appName)}</text>
      <text x="${cx}" y="${cy + 10}" text-anchor="middle" font-size="11" fill="#cabfff" letter-spacing="0.08em">PLACE IN THE SI</text>
      <text x="${cx}" y="${cy + 28}" text-anchor="middle" font-size="10" fill="#818897">${inbound.length} inbound · ${outbound.length} outbound</text>
    </g>
    <defs>
      <linearGradient id="ctxAppGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="rgba(140,123,255,0.25)"/>
        <stop offset="100%" stop-color="rgba(79,217,200,0.10)"/>
      </linearGradient>
    </defs>`;
  // section labels
  svg += `
    <text x="${leftX + 90}" y="22" text-anchor="middle" font-size="10.5" font-weight="700" fill="#818897" letter-spacing="0.18em">INBOUND</text>
    <text x="${rightX + 90}" y="22" text-anchor="middle" font-size="10.5" font-weight="700" fill="#818897" letter-spacing="0.18em">OUTBOUND</text>
  `;
  const isProbable = (it) => /probable/i.test(it.status || '');
  // inbound
  inbound.forEach((it, idx) => {
    const y = offY + idx * rowH;
    const color = protocolColor(it.channel);
    const did = `integ-in-${integSlug(it.peer)}`;
    svg += nodeRect(leftX, y, 200, it.peer, it.endpoint, color, did);
    svg += line(leftX + 200, y + 18, cx - appW/2, cy, color, protocolLabel(it.channel), 'left', isProbable(it));
  });
  // outbound
  outbound.forEach((it, idx) => {
    const y = offY + idx * rowH;
    const color = protocolColor(it.channel);
    const did = `integ-out-${integSlug(it.peer)}`;
    svg += nodeRect(rightX, y, 200, it.peer, it.endpoint, color, did);
    svg += line(cx + appW/2, cy, rightX, y + 18, color, protocolLabel(it.channel), 'right', isProbable(it));
  });
  svg += '</svg>';
  return svg;
}

function renderArchitecture() {
  const lb = corpus.logical_boundaries || {};
  const cc = corpus.cross_cutting || {};
  const mods = asList(lb.modules);
  const layers = asList(lb.layers);
  const apis = asList(cc.apis);
  const ints = asList(cc.integrations);

  const sec = (title, sub, body) => `
    <section class="card">
      <div class="card-head"><h3>${esc(title)}</h3>${sub ? `<span class="card-meta">${esc(sub)}</span>` : ''}</div>
      <div class="card-body">${body}</div>
    </section>`;

  // Compact Modules × Layers block — one row per module with its layers as
  // chips and a one-line description. Replaces the previous Modules card
  // grid + Layers table (which together took 400+ vertical px for sparse data).
  // Build a module → layers map from layers.modules[].
  const moduleToLayers = new Map();
  for (const l of layers) {
    for (const modId of asList(l.modules)) {
      const arr = moduleToLayers.get(modId) || [];
      arr.push(l.name || l.id || '');
      moduleToLayers.set(modId, arr);
    }
  }
  // Surface orphan layers (in `layers` but with no module). Rare but possible.
  const allModuleNames = new Set(mods.map((m) => m.name || m.id));
  const orphanLayers = layers.filter((l) => asList(l.modules).every((m) => !allModuleNames.has(m)));

  const modulesLayersBlock = (mods.length || layers.length) ? `
    <div class="ml-list">
      ${mods.map((m) => {
        const name = m.name || m.id || '—';
        const role = m.role || m.purpose || '';
        const description = m.description || '';
        const layerNames = moduleToLayers.get(name) || moduleToLayers.get(m.id) || [];
        const deps = asList(m.depends_on);
        return `<div class="ml-row">
          <div class="ml-row-name">
            <span class="ml-row-mod">${esc(name)}</span>
            ${role ? `<span class="ml-row-role">${esc(role)}</span>` : ''}
          </div>
          <div class="ml-row-layers">${
            layerNames.length
              ? layerNames.map((ln) => `<span class="ml-layer">${esc(ln)}</span>`).join('')
              : '<span class="muted ml-no-layers">no layers mapped</span>'
          }</div>
          <div class="ml-row-desc">${esc(shorten(description, 180))}</div>
          ${deps.length ? `<div class="ml-row-deps"><span class="ml-deps-k">depends on</span>${joinChips(deps)}</div>` : ''}
        </div>`;
      }).join('')}
      ${orphanLayers.length ? `<div class="ml-row ml-row-orphans">
        <div class="ml-row-name"><span class="ml-row-mod muted">(unmapped)</span></div>
        <div class="ml-row-layers">${orphanLayers.map((l) => `<span class="ml-layer">${esc(l.name || l.id)}</span>`).join('')}</div>
        <div class="ml-row-desc muted">Layers not assigned to any module above.</div>
      </div>` : ''}
    </div>` : '<div class="muted">No modules/layers data.</div>';

  // Rich API catalogue parsing from project/apis/CATALOG.md.
  // Three tiers, first that matches wins:
  //  1) The numbered `## N. Name` sections format (parseApiCatalog)
  //  2) Tables of {Method, Path, Op, …} rows across any H2/H3 (parseRestCatalogPaths)
  //     — this is the canonical shape with one section per controller
  //  3) The cross-cutting yaml `apis` list (last fallback)
  const apiSections = parseApiCatalog(corpus.project.apis);
  const restCatalogRows = parseRestCatalogPaths(corpus.project.apis);
  // Group rest catalog by controller for tier 2 rendering
  function renderRestCatalogByController(rows) {
    const groups = new Map();
    for (const r of rows) {
      const key = r.controller || '—';
      const arr = groups.get(key) || [];
      arr.push(r);
      groups.set(key, arr);
    }
    const groupList = [...groups.entries()];
    const totalN = rows.length;
    return `
      <div class="api-cat-summary muted">${totalN} endpoint${totalN > 1 ? 's' : ''} across ${groupList.length} controller${groupList.length > 1 ? 's' : ''}. Click a controller to expand.</div>
      ${groupList.map(([ctrl, eps], idx) => `<details class="api-ctrl" ${idx === 0 ? 'open' : ''}>
        <summary class="api-ctrl-sum">
          <span class="api-ctrl-name">${esc(ctrl)}</span>
          <span class="api-ctrl-count">${eps.length} endpoint${eps.length > 1 ? 's' : ''}</span>
        </summary>
        <div class="api-ctrl-body">
          <table class="rows-table api-ctrl-table"><thead><tr>
            <th>Method</th><th>Path</th><th>Op</th>
          </tr></thead><tbody>
            ${eps.map((r) => `<tr>
              <td><span class="ep-method ep-${r.method.toLowerCase()}">${esc(r.method)}</span></td>
              <td class="mono-cell"><code class="ep-path">${esc(r.path)}</code></td>
              <td>${r.op ? `<code>${esc(r.op)}</code>` : '<span class="muted">—</span>'}</td>
            </tr>`).join('')}
          </tbody></table>
        </div>
      </details>`).join('')}`;
  }
  const apisBlock = apiSections.length ? renderApiSections(apiSections)
    : restCatalogRows.length ? renderRestCatalogByController(restCatalogRows)
    : (apis.length ? `<table class="rows-table"><thead><tr><th>API</th><th>Kind</th><th>Direction</th><th>Consumers / providers</th><th>Status</th></tr></thead><tbody>
      ${apis.map((a) => `<tr><td><strong>${esc(a.name || a.id || '—')}</strong></td><td>${esc(a.kind || a.type || '—')}</td><td>${esc(a.direction || '—')}</td><td>${asList(a.consumers || a.providers).length ? joinChips(asList(a.consumers || a.providers)) : '<span class="muted">—</span>'}</td><td>${esc(a.status || '—')}</td></tr>`).join('')}
      </tbody></table>` : '<div class="muted">No API catalogue parsed.</div>');
  // Surface count = rest controllers OR api sections OR yaml entries
  const apisSurfaceN = apiSections.length || (() => {
    const groups = new Set(restCatalogRows.map((r) => r.controller || '—'));
    return groups.size;
  })() || apis.length;
  const apisEndpointN = restCatalogRows.length;

  const intsTable = ints.length ? `
    <table class="rows-table"><thead><tr>
      <th>Integration</th><th>Direction</th><th>Counterpart</th><th>Protocol</th><th>Status</th><th>Notes</th>
    </tr></thead><tbody>
    ${ints.map((i) => `<tr>
      <td><strong>${esc(i.name || i.id || '—')}</strong></td>
      <td>${esc(i.direction || '—')}</td>
      <td>${esc(i.counterpart || i.system || i.peer || '—')}</td>
      <td>${esc(i.protocol || i.transport || '—')}</td>
      <td>${esc(i.status || '—')}</td>
      <td class="muted">${esc(shorten(i.notes || '', 140))}</td>
    </tr>`).join('')}
    </tbody></table>` : '<div class="muted">No integrations data.</div>';

  // Parse rich integrations from the README markdown (the cross-cutting yaml only has counts).
  // Fallback to `project/architecture/INTEGRATION_MAP.md` when the README has
  // no structured inbound/outbound tables (common pattern in code-first corpora).
  let integ = parseIntegrationsFromReadme(corpus.project.integrations);
  if (integ.inbound.length + integ.outbound.length === 0) {
    integ = parseIntegrationsFromMap(corpus.project.integration_map);
  }
  const appName = corpus.app?.application?.name || 'application';
  const totalInteg = integ.inbound.length + integ.outbound.length;

  // Join inbound REST callers with the REST catalog so we can surface the
  // actual endpoint paths they're allowed to call.
  const restCatalog = parseRestCatalogPaths(corpus.project.apis);
  function matchedPaths(it) {
    if (!restCatalog.length) return [];
    if (it.opsAll) return restCatalog;
    if (!it.allowedOps || !it.allowedOps.length) return [];
    const allowSet = new Set(it.allowedOps.map((o) => o.toUpperCase()));
    return restCatalog.filter((row) => allowSet.has(String(row.op).toUpperCase()));
  }
  function endpointCellFor(i) {
    if (i.dir !== 'in' || !/rest/i.test(i.channel)) {
      return `<span class="mono-cell">${esc(shorten(i.endpoint, 80))}</span>`;
    }
    const matches = matchedPaths(i);
    if (!matches.length) {
      return `<span class="mono-cell">${esc(shorten(i.endpoint, 80))}</span>`;
    }
    // Only substitute the hash placeholder when the captured hash looks like
    // an actual token (uppercase hex / alphanumeric, no spaces). Otherwise
    // leave `{hash}` so the path stays valid as a template.
    const usableHash = i.hash && /^[A-Za-z0-9]+$/.test(i.hash) ? i.hash : '';
    const sample = matches.slice(0, 2).map((r) => {
      const pathWithHash = usableHash ? r.path.replace(/\{hash\}/g, usableHash) : r.path;
      return `<div class="ep-row"><span class="ep-method ep-${r.method.toLowerCase()}">${esc(r.method)}</span><code class="ep-path">${esc(pathWithHash)}</code></div>`;
    }).join('');
    const more = matches.length > 2 ? `<div class="ep-more">+${matches.length - 2} more endpoint${matches.length - 2 > 1 ? 's' : ''}${i.opsAll ? ' · ops <code>*</code>' : ` · ops <code>${esc(i.allowedOps.join(', '))}</code>`}</div>` : '';
    return `<div class="ep-stack">${sample}${more}</div>`;
  }

  const integTable = totalInteg ? `
    <table class="rows-table"><thead><tr>
      <th>Direction</th><th>Peer system</th><th>Channel</th><th>Endpoint / interface</th><th>Status</th>
    </tr></thead><tbody>
    ${[
      ...integ.inbound.map((i) => ({ ...i, dir: 'in' })),
      ...integ.outbound.map((i) => ({ ...i, dir: 'out' })),
    ].map((i) => {
      const proto = protocolLabel(i.channel);
      return `<tr>
        <td>${i.dir === 'in' ? '<span class="dir-pill dir-in">← inbound</span>' : '<span class="dir-pill dir-out">outbound →</span>'}</td>
        <td><strong>${esc(i.peer)}</strong></td>
        <td><span class="proto-chip" style="--p:${protocolColor(i.channel)}">${esc(proto)}</span> ${esc(shorten(i.channel.replace(new RegExp(proto, 'i'), '').trim(), 60))}</td>
        <td>${endpointCellFor(i)}</td>
        <td>${renderConfidenceChip(i.status)}</td>
      </tr>`;
    }).join('')}
    </tbody></table>
  ` : '<div class="muted">No integrations table parsed from <code>project/integrations/README.md</code>.</div>';

  // ─── BI summary: KPIs + protocol mix bar ──────────────────────────────────
  // Computed from the same integ data that feeds the SVG so labels stay aligned.
  const allLinks = [...integ.inbound, ...integ.outbound];
  const protoBuckets = new Map();
  for (const l of allLinks) {
    const label = protocolLabel(l.channel);
    protoBuckets.set(label, (protoBuckets.get(label) || 0) + 1);
  }
  const protoSorted = [...protoBuckets.entries()].sort((a, b) => b[1] - a[1]);
  const legacyProtos = ['SOAP', 'JMS', 'NFS', 'JDBC'];
  const legacyCount = protoSorted.filter(([p]) => legacyProtos.includes(p)).reduce((s, [, n]) => s + n, 0);
  const legacyPct = allLinks.length ? Math.round(100 * legacyCount / allLinks.length) : 0;
  const probableCount = allLinks.filter((l) => /probable/i.test(l.status || '')).length;
  // Async protocols decouple the app from peer outages; pure-sync is a
  // resilience risk worth flagging.
  const asyncProtos = ['Kafka', 'JMS'];
  const asyncCount = protoSorted.filter(([p]) => asyncProtos.includes(p)).reduce((s, [, n]) => s + n, 0);
  const asyncPct = allLinks.length ? Math.round(100 * asyncCount / allLinks.length) : 0;

  const kpiStrip = totalInteg ? `
    <div class="arch-kpis">
      <div class="arch-kpi"><div class="arch-kpi-v">${totalInteg}</div><div class="arch-kpi-l">Integrations</div><div class="arch-kpi-sub">${integ.inbound.length} in · ${integ.outbound.length} out</div></div>
      <div class="arch-kpi"><div class="arch-kpi-v ${legacyPct >= 40 ? 'kpi-warn' : ''}">${legacyPct}<span class="arch-kpi-unit">%</span></div><div class="arch-kpi-l">Legacy protocols</div><div class="arch-kpi-sub">${legacyCount}× SOAP/JMS/JDBC/NFS</div></div>
      <div class="arch-kpi"><div class="arch-kpi-v ${probableCount > 0 ? 'kpi-warn' : ''}">${probableCount}</div><div class="arch-kpi-l">Probable</div><div class="arch-kpi-sub">confidence not confirmed</div></div>
      <div class="arch-kpi"><div class="arch-kpi-v ${asyncCount === 0 ? 'kpi-warn' : ''}">${asyncPct}<span class="arch-kpi-unit">%</span></div><div class="arch-kpi-l">Async links</div><div class="arch-kpi-sub">${asyncCount === 0 ? 'fully synchronous · coupling risk' : `${asyncCount}× Kafka/JMS`}</div></div>
    </div>` : '';

  const protoBar = totalInteg ? `
    <div class="arch-proto">
      <div class="arch-proto-bar" role="img" aria-label="Protocol mix">
        ${protoSorted.map(([p, n]) => `<span class="arch-proto-seg" style="flex: ${n}; background: ${protocolColor(p)};" title="${esc(p)}: ${n}"></span>`).join('')}
      </div>
      <div class="arch-proto-legend">
        ${protoSorted.map(([p, n]) => `<span class="arch-proto-item"><span class="arch-proto-dot" style="background: ${protocolColor(p)};"></span>${esc(p)} <span class="arch-proto-n">${n}</span></span>`).join('')}
      </div>
    </div>` : '';

  return `
    <div class="panel-head"><div>
      <h1>Architecture</h1>
      <p class="lede">Logical boundaries, layers, APIs, integrations — the application's place in the SI.</p>
    </div></div>

    ${totalInteg ? `<section class="card"><div class="card-head"><h3>Place in the information system</h3><span class="card-meta">${integ.inbound.length} inbound · ${integ.outbound.length} outbound</span></div><div class="card-body ctx-wrap">${kpiStrip}${protoBar}${renderContextDiagram(appName, integ)}</div></section>` : ''}

    ${(mods.length || layers.length) ? sec('Modules & layers', `${mods.length} module${mods.length > 1 ? 's' : ''} · ${layers.length} layer${layers.length > 1 ? 's' : ''}`, modulesLayersBlock) : ''}
    ${totalInteg ? sec('Integrations', `${totalInteg} link${totalInteg > 1 ? 's' : ''}`, integTable) : ''}
  `;
}

function mdBlock(md, maxLines = 50) {
  // Render a small subset of markdown for narrative cards (headings + paragraphs + lists)
  if (!md) return '';
  const lines = md.split(/\r?\n/).slice(0, maxLines);
  let html = '';
  let inList = false;
  for (const ln of lines) {
    if (/^#{1,6}\s/.test(ln)) {
      if (inList) { html += '</ul>'; inList = false; }
      const m = ln.match(/^(#+)\s+(.*)$/);
      const lvl = Math.min(m[1].length + 2, 6);
      html += `<h${lvl}>${esc(m[2])}</h${lvl}>`;
    } else if (/^[-*]\s/.test(ln)) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${md_inline(ln.replace(/^[-*]\s/, ''))}</li>`;
    } else if (ln.trim() === '') {
      if (inList) { html += '</ul>'; inList = false; }
      html += '';
    } else {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<p>${md_inline(ln)}</p>`;
    }
  }
  if (inList) html += '</ul>';
  return html;
}
function md_inline(s) {
  if (!s) return '';
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

// ----- Features tab --------------------------------------------------
function renderFeatures() {
  const feats = corpus.features || [];
  if (!feats.length) {
    // fall back to feature-candidates
    const cands = asList(corpus.feature_candidates?.features || corpus.feature_candidates?.candidates);
    if (!cands.length) return panelEmpty('Features', 'No project/features/ folder and no feature-candidates.yaml.');
    return `
      <div class="panel-head"><div><h1>Features</h1>
      <p class="lede">${cands.length} candidate feature${cands.length > 1 ? 's' : ''} from <code>_meta/feature-candidates.yaml</code> — not yet documented.</p></div></div>
      <div class="card"><div class="card-body"><table class="rows-table">
        <thead><tr><th>Feature</th><th>Priority</th><th>Module(s)</th><th>Notes</th></tr></thead>
        <tbody>${cands.map((c) => `<tr>
          <td><strong>${esc(c.name || c.id || c.slug || '—')}</strong></td>
          <td>${esc(c.priority || '—')}</td>
          <td>${asList(c.modules || c.module).length ? joinChips(asList(c.modules || c.module)) : '<span class="muted">—</span>'}</td>
          <td class="muted">${esc(shorten(c.notes || c.summary || '', 200))}</td>
        </tr>`).join('')}</tbody></table></div></div>
    `;
  }

  // Sort features by signal density: active > documented > candidate > stub/rejected.
  // Then by criticality (critical > high > medium > low). Then by prod activity
  // (bugs + risks mentioning the slug). Stubs/rejected sink to the bottom.
  const statusRank = (s) => {
    s = String(s || '').toLowerCase();
    if (/^active$/.test(s)) return 0;
    if (/documented|validated|merged/.test(s)) return 1;
    if (/candidate|draft/.test(s)) return 2;
    if (/partial/.test(s)) return 3;
    if (/stub|rejected|deprecated|superseded|not_implemented/.test(s)) return 9;
    return 4;
  };
  const sevRank = (s) => {
    s = String(s || '').toLowerCase();
    if (/critical/.test(s)) return 0;
    if (/high/.test(s)) return 1;
    if (/medium/.test(s)) return 2;
    if (/low/.test(s)) return 3;
    return 4;
  };
  const featProdHits = (f) =>
    corpus.prod.bugs.filter((b) => bodyMentionsSlug(b.body, f.slug)).length +
    corpus.prod.risks.filter((r) => bodyMentionsSlug(r.body, f.slug)).length;
  const sortedFeats = [...feats].sort((a, b) => {
    const r = statusRank(a.meta?.status) - statusRank(b.meta?.status);
    if (r) return r;
    const s = sevRank(a.meta?.criticality || a.meta?.priority) - sevRank(b.meta?.criticality || b.meta?.priority);
    if (s) return s;
    const p = featProdHits(b) - featProdHits(a); // more prod hits first
    if (p) return p;
    return (a.slug || '').localeCompare(b.slug || '');
  });
  const activeN = sortedFeats.filter((f) => statusRank(f.meta?.status) <= 3).length;
  const stubN = sortedFeats.length - activeN;

  // Documented features — card grid, sorted by criticality / activity
  return `
    <div class="panel-head"><div>
      <h1>Features</h1>
      <p class="lede">${activeN} active / documented · ${stubN ? `${stubN} stub${stubN > 1 ? 's' : ''} at the bottom` : 'no stubs'}. Sorted by status → criticality → prod activity.</p>
    </div></div>
    <div class="feat-grid">
      ${sortedFeats.map(featureCard).join('')}
    </div>
  `;
}
function featureCard(f) {
  const m = f.meta || {};
  // Title: from H1, stripped of leading "feature-slug — "
  let title = f.title || f.slug;
  title = title.replace(/^[Ff]eature\s*[—:-]\s*/, '').replace(/^[A-Za-z0-9-]+\s*[—:-]\s*/, '');
  if (title === f.slug || title === '') title = f.slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  // `criticality` is canonical (SKILL.md actionable/brick-inventory); `priority`
  // is legacy support for corpora generated before the schema was tightened.
  const sev = String(m.criticality || m.priority || '').toLowerCase();
  const sevTone = /critical|high/.test(sev) ? 'low' : /medium/.test(sev) ? 'mid' : 'unknown';
  const status = String(m.status || '').toLowerCase();
  const isStub = /stub|rejected|deprecated|superseded|not_implemented/.test(status);
  const statusTone = /^active$/.test(status) ? 'active'
    : /documented|validated|merged/.test(status) ? 'documented'
    : /candidate|draft/.test(status) ? 'candidate'
    : isStub ? 'stub' : '';

  // Find related bugs/risks from indexes (production-signal index lists features impacted)
  const relBugs = corpus.prod.bugs.filter((b) => bodyMentionsSlug(b.body, f.slug)).length;
  const relRisks = corpus.prod.risks.filter((r) => bodyMentionsSlug(r.body, f.slug)).length;

  return `
    <article class="feat-card clickable-card${isStub ? ' feat-card-stub' : ''}" data-detail-id="feat-${esc(f.slug)}">
      <header class="feat-card-head">
        <span class="feat-card-slug">${esc(f.slug)}</span>
        ${statusTone ? `<span class="feat-status feat-status-${statusTone}">${esc(status)}</span>` : ''}
        ${sev ? `<span class="pill pill-${sevTone}">${esc(sev)}</span>` : ''}
      </header>
      <h3 class="feat-card-title">${esc(title)}</h3>
      ${f.summary ? `<p class="feat-card-sum">${esc(shorten(f.summary, 240))}</p>` : ''}
      <div class="feat-card-meta">
        ${m.modules ? `<span class="kv-inline"><span class="k">modules</span><span class="v">${esc(asList(m.modules).join(', '))}</span></span>` : ''}
        ${m.entry_points ? `<span class="kv-inline"><span class="k">entry</span><span class="v">${esc(shorten(asList(m.entry_points).join(', '), 80))}</span></span>` : ''}
        ${(relBugs || relRisks) ? `<span class="kv-inline"><span class="k">prod</span><span class="v">${relBugs ? `${relBugs} bug${relBugs > 1 ? 's' : ''}` : ''}${relBugs && relRisks ? ' · ' : ''}${relRisks ? `${relRisks} risk${relRisks > 1 ? 's' : ''}` : ''}</span></span>` : ''}
      </div>
    </article>
  `;
}
function bodyMentionsSlug(body, slug) {
  if (!body || !slug) return false;
  return body.includes(slug);
}

// ----- API catalog tab (sub-tab under Application) -------------------
function renderApiCatalog() {
  const apiSections = parseApiCatalog(corpus.project.apis);
  const restCatalogRows = parseRestCatalogPaths(corpus.project.apis);
  const apisYaml = asList(corpus.cross_cutting?.apis);
  const totalEndpoints = restCatalogRows.length;
  // Group by controller for the primary view
  const groups = new Map();
  for (const r of restCatalogRows) {
    const key = r.controller || '—';
    const arr = groups.get(key) || [];
    arr.push(r);
    groups.set(key, arr);
  }
  const groupList = [...groups.entries()];
  // Method mix (GET/POST/PUT/DELETE) — useful at-a-glance
  const methodCounts = new Map();
  for (const r of restCatalogRows) {
    methodCounts.set(r.method, (methodCounts.get(r.method) || 0) + 1);
  }
  const methodOrder = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
  const methodMix = [...methodCounts.entries()].sort((a, b) => {
    const ai = methodOrder.indexOf(a[0]), bi = methodOrder.indexOf(b[0]);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  });

  // Primary path: REST catalog rows grouped by controller
  if (restCatalogRows.length) {
    return `
      <div class="panel-head"><div>
        <h1>API catalog</h1>
        <div class="code-lede-stats">
          <span class="code-stat"><span class="code-stat-v">${totalEndpoints}</span><span class="code-stat-l">endpoints</span></span>
          <span class="code-stat-sep">·</span>
          <span class="code-stat"><span class="code-stat-v">${groupList.length}</span><span class="code-stat-l">controllers</span></span>
          ${methodMix.length ? `<span class="code-stat-sep">·</span>` : ''}
          ${methodMix.map(([m, n]) => `<span class="code-stat"><span class="ep-method ep-${m.toLowerCase()}">${esc(m)}</span><span class="code-stat-l" style="margin-left:4px;">${esc(n)}</span></span>`).join(' ')}
        </div>
      </div></div>

      <section class="card">
        <div class="card-head"><h3>Endpoints by controller</h3><span class="card-meta">click a controller to expand</span></div>
        <div class="card-body">
          ${groupList.map(([ctrl, eps], idx) => `<details class="api-ctrl" ${idx === 0 ? 'open' : ''}>
            <summary class="api-ctrl-sum">
              <span class="api-ctrl-name">${esc(ctrl)}</span>
              <span class="api-ctrl-count">${eps.length} endpoint${eps.length > 1 ? 's' : ''}</span>
            </summary>
            <div class="api-ctrl-body">
              <table class="rows-table api-ctrl-table"><thead><tr>
                <th>Method</th><th>Path</th><th>Op</th>
              </tr></thead><tbody>
                ${eps.map((r) => `<tr>
                  <td><span class="ep-method ep-${r.method.toLowerCase()}">${esc(r.method)}</span></td>
                  <td class="mono-cell"><code class="ep-path">${esc(r.path)}</code></td>
                  <td>${r.op ? `<code>${esc(r.op)}</code>` : '<span class="muted">—</span>'}</td>
                </tr>`).join('')}
              </tbody></table>
            </div>
          </details>`).join('')}
        </div>
      </section>
    `;
  }

  // Tier 2: numbered ## N. sections (legacy parser)
  if (apiSections.length) {
    return `
      <div class="panel-head"><div>
        <h1>API catalog</h1>
        <p class="lede">${apiSections.length} surface${apiSections.length > 1 ? 's' : ''} parsed from <code>project/apis/CATALOG.md</code>.</p>
      </div></div>
      <section class="card"><div class="card-body">${renderApiSections(apiSections)}</div></section>
    `;
  }

  // Tier 3: yaml apis list
  if (apisYaml.length) {
    return `
      <div class="panel-head"><div>
        <h1>API catalog</h1>
        <p class="lede">${apisYaml.length} surface${apisYaml.length > 1 ? 's' : ''} from <code>_meta/cross-cutting-state.yaml</code>.</p>
      </div></div>
      <section class="card"><div class="card-body">
        <table class="rows-table"><thead><tr><th>API</th><th>Kind</th><th>Direction</th><th>Consumers / providers</th><th>Status</th></tr></thead><tbody>
          ${apisYaml.map((a) => `<tr><td><strong>${esc(a.name || a.id || '—')}</strong></td><td>${esc(a.kind || a.type || '—')}</td><td>${esc(a.direction || '—')}</td><td>${asList(a.consumers || a.providers).length ? joinChips(asList(a.consumers || a.providers)) : '<span class="muted">—</span>'}</td><td>${esc(a.status || '—')}</td></tr>`).join('')}
        </tbody></table>
      </div></section>
    `;
  }

  return `
    <div class="panel-head"><div>
      <h1>API catalog</h1>
      <p class="lede">No API catalogue parsed from <code>project/apis/CATALOG.md</code>.</p>
    </div></div>
  `;
}

// ----- Code tab ------------------------------------------------------
function renderCode() {
  const cm = corpus.code_maturity || {};
  const si = asList(corpus.structural_issues?.issues);
  const cs = corpus.code_style || {};
  const act = corpus.code_activity || {};

  // dimensions is an object D1_x..D8_x: { score, label, rationale, inputs } — convert
  const dimsObj = (cm.dimensions && typeof cm.dimensions === 'object' && !Array.isArray(cm.dimensions)) ? cm.dimensions : {};
  const dims = Object.entries(dimsObj).map(([k, v]) => ({
    name: humanizeDim(k),
    score: v?.score,
    label: v?.label || '',
    note: v?.rationale || v?.note || v?.evidence || v?.justification || '',
  }));
  const maturityCards = dims.length ? dims.map((d) => `
    <div class="mat-cell ${scoreTone(d.score)}">
      <div class="mat-cell-label">${esc(d.name)}</div>
      <div class="mat-cell-value">${esc(d.score ?? '—')}<span class="mat-cell-max">/5</span></div>
      ${d.label ? `<div class="mat-cell-tag">${esc(d.label)}</div>` : ''}
      <div class="mat-cell-note">${esc(shorten(d.note, 180))}</div>
    </div>
  `).join('') : '<div class="muted">No maturity dimensions.</div>';

  const composite = cm.composite_score ?? cm.composite ?? '';
  const compositeBlock = composite !== '' ? `<div class="mat-composite"><div class="mat-composite-l">Composite</div><div class="mat-composite-v">${esc(composite)}<span class="mat-cell-max">/5</span></div></div>` : '';

  const issuesTable = si.length ? `
    <table class="rows-table"><thead><tr>
      <th>ID</th><th>Severity</th><th>Issue</th><th>Location</th><th>Status</th>
    </tr></thead><tbody>
    ${si.map((s) => `<tr class="clickable-row" data-detail-id="issue-${esc(String(s.id || '').toLowerCase())}">
      <td><code>${esc(s.id || '—')}</code></td>
      <td>${pill(s.severity || '?', severityTone(s.severity))}</td>
      <td><strong>${esc(s.title || s.name || '—')}</strong>${s.summary ? `<div class="muted">${esc(shorten(s.summary, 200))}</div>` : ''}</td>
      <td class="mono-cell">${esc(shorten(s.location || s.file || '', 100))}</td>
      <td>${esc(s.status || '—')}</td>
    </tr>`).join('')}
    </tbody></table>` : '<div class="muted">No structural issues recorded.</div>';

  const inv = corpus.code_inventory?.inventory || {};
  const unknownN = Array.isArray(inv.unknown_files) ? inv.unknown_files.length : inv.unknown_files;
  // Inventory stats are now inlined into the lede as a stat strip — no
  // separate Inventory card. Each entry is value + label.
  const ledeStats = [
    inv.total_files_inventoried != null ? [inv.total_files_inventoried, 'files'] : null,
    inv.total_directories_inventoried != null ? [inv.total_directories_inventoried, 'directories'] : null,
    asList(corpus.logical_boundaries?.modules).length ? [asList(corpus.logical_boundaries.modules).length, 'modules'] : null,
    unknownN != null && unknownN !== '' ? [unknownN, 'unknown files'] : null,
    act.total_commits != null ? [act.total_commits, 'commits (12m)'] : null,
    act.average_monthly_commits_last_12m != null ? [act.average_monthly_commits_last_12m, 'avg/month'] : null,
  ].filter(Boolean);

  return `
    <div class="panel-head"><div>
      <h1>Code & technique</h1>
      <div class="code-lede-stats">
        ${ledeStats.map(([v, l]) => `<span class="code-stat"><span class="code-stat-v">${esc(v)}</span><span class="code-stat-l">${esc(l)}</span></span>`).join('<span class="code-stat-sep">·</span>')}
      </div>
    </div></div>
    <section class="card"><div class="card-head"><h3>Maturity dimensions</h3>${composite !== '' ? `<span class="card-meta">composite ${composite}/5</span>` : ''}</div><div class="card-body"><div class="mat-grid">${maturityCards}</div></div></section>
    <section class="card"><div class="card-head"><h3>Structural issues</h3><span class="card-meta">${si.length} issue${si.length > 1 ? 's' : ''}</span></div><div class="card-body">${issuesTable}</div></section>
    ${asList(corpus.code_activity?.contributors).length ? `<section class="card"><div class="card-head"><h3>Top contributors</h3></div><div class="card-body">${renderTopContributors()}</div></section>` : ''}
    ${cs && Object.keys(cs).length ? `<section class="card"><div class="card-head"><h3>Code style</h3><span class="card-meta">naming · lint · injection · logging</span></div><div class="card-body"><details class="prose-fold"><summary>Show conventions</summary><div style="margin-top:12px;">${renderCodeStyle(cs)}</div></details></div></section>` : ''}
  `;
}
function humanizeDim(k) {
  // D1_architectural_clarity -> "Architectural clarity"
  return k.replace(/^D\d+_/, '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}
function scoreTone(s) {
  const n = Number(s);
  if (!Number.isFinite(n)) return '';
  if (n >= 4) return 'mat-cell-good';
  if (n >= 3) return 'mat-cell-mid';
  return 'mat-cell-low';
}
function renderTopContributors() {
  const c = asList(corpus.code_activity?.contributors).slice(0, 5);
  if (!c.length) return '';
  return `<h4 class="card-subtitle">Top contributors</h4><ul class="contrib-list">${
    c.map((x) => `<li><span class="contrib-mail mono">${esc((x.email || x.name || '?').replace(/^([^@]+@[^.]+).*/, '$1'))}</span><span class="contrib-count">${esc(x.commits || x.count || '?')}</span><span class="contrib-role muted">${esc(x.role || '')}</span></li>`).join('')
  }</ul>`;
}

function renderCodeStyle(cs) {
  // Whitelist + ordering. Skip noisy/internal fields.
  const skip = new Set(['generator', 'date', 'status', 'last_validated', 'source', 'confidence']);
  const blocks = [];
  for (const [k, v] of Object.entries(cs)) {
    if (skip.has(k) || v == null) continue;
    blocks.push(`<div class="cs-block"><h4 class="cs-block-title">${esc(humanizeKey(k))}</h4>${renderCodeStyleValue(v)}</div>`);
  }
  return blocks.join('') || '<div class="muted">No data.</div>';
}
function humanizeKey(k) {
  return String(k).replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}
function renderCodeStyleValue(v) {
  if (v == null) return '<span class="muted">—</span>';
  if (Array.isArray(v)) {
    if (!v.length) return '<span class="muted">—</span>';
    // Array of scalars → chips. Array of objects → small table.
    if (v.every((x) => typeof x !== 'object' || x == null)) {
      return joinChips(v.map((x) => String(x ?? '—')));
    }
    return `<ul class="cs-list">${v.map((x) => `<li>${renderCodeStyleValue(x)}</li>`).join('')}</ul>`;
  }
  if (typeof v === 'object') {
    // Nested kv
    const entries = Object.entries(v).filter(([, vv]) => vv != null && vv !== '');
    if (!entries.length) return '<span class="muted">—</span>';
    return `<dl class="cs-kv">${entries.map(([k, vv]) => `<dt>${esc(humanizeKey(k))}</dt><dd>${renderCodeStyleValue(vv)}</dd>`).join('')}</dl>`;
  }
  // Scalar: long text → muted prose, short → strong
  const s = String(v);
  if (s.length > 80) return `<span class="cs-text">${esc(s)}</span>`;
  return `<span class="cs-val">${esc(s)}</span>`;
}

// ----- Production tab -----------------------------------------------
// Reusable collapsible prose card — saves vertical space on long narrative blocks.
function proseCard(title, md, hint) {
  if (!md) return '';
  return `<section class="card">
    <div class="card-head"><h3>${esc(title)}</h3>${hint ? `<span class="card-meta">${esc(hint)}</span>` : ''}</div>
    <div class="card-body">
      <details class="prose-fold">
        <summary>Show details</summary>
        <div class="prose" style="margin-top:12px;">${mdBlock(md, 120)}</div>
      </details>
    </div>
  </section>`;
}

function renderProduction() {
  const bugs = corpus.prod.bugs || [];
  const risks = corpus.prod.risks || [];
  const watch = corpus.prod.watchlist || [];

  const bugRows = bugs.map(prodRow.bind(null, 'bug'));
  const riskRows = risks.map(prodRow.bind(null, 'risk'));
  const watchRows = watch.map(prodRow.bind(null, 'watch'));

  const totalsCells = [
    { v: bugs.length, l: 'Bugs', h: 'tracked' },
    { v: risks.length, l: 'Risks', h: 'structural' },
    { v: watch.length, l: 'Watchlist', h: 'monitoring' },
    { v: corpus.prod.snapshots?.length || 0, l: 'Snapshots', h: 'evidence' },
  ];

  return `
    <div class="panel-head"><div>
      <h1>Production</h1>
      <p class="lede">Active bugs, structural risks, watchlist, runtime baselines.</p>
    </div></div>

    <section class="exec-section exec-scale">
      <div class="exec-sig-grid">
        ${totalsCells.map((c) => `
          <div class="exec-sig-cell">
            <div class="exec-sig-value">${esc(c.v)}</div>
            <div class="exec-sig-label">${esc(c.l)}</div>
            <div class="exec-sig-hint">${esc(c.h)}</div>
          </div>`).join('')}
      </div>
    </section>

    ${prodSection('Known bugs', bugs.length, bugRows, 'bug')}
    ${prodSection('Structural risks', risks.length, riskRows, 'risk')}
    ${prodSection('Watchlist', watch.length, watchRows, 'watch')}
    ${proseCard('Baselines', corpus.prod.baselines, 'log volumes, error rates, baseline traffic')}
    ${proseCard('Runtime architecture', corpus.prod.runtime, 'hosts, processes, observability mapping')}
    ${proseCard('Infrastructure state', corpus.prod.infra, 'capacity, disks, memory, pressure')}
    ${proseCard('Batch health', corpus.prod.batch_health, 'batch jobs, schedules, outcomes')}
  `;
}

function prodRow(kind, item) {
  const m = item.meta || {};
  const sev = String(m.severity || m.impact || (m.status === 'resolved' ? 'resolved' : 'medium')).toLowerCase();
  // ID: prefer meta.id, else extract BUG-XXX / RISK-XXX prefix from slug
  let id = m.id;
  if (!id) {
    const sm = item.slug.match(/^([A-Z]+-\d+(?:-[A-Z]+-\d+)?)/);
    id = sm ? sm[1] : item.slug;
  }
  // Strip leading "ID — " from title
  let title = item.title || m.title || m.name || item.slug;
  title = title.replace(/^[A-Z]+-\d+(-[A-Za-z0-9]+)*\s*[—:-]\s*/, '');
  // Shorten verbose status snake_case
  const status = String(m.status || '—').replace(/_/g, ' ');
  const detailId = 'prod-' + String(id).toLowerCase();
  return `<tr class="clickable-row" data-detail-id="${esc(detailId)}">
    <td><code>${esc(id)}</code></td>
    <td>${pill(sev, severityTone(sev))}</td>
    <td><strong>${esc(title)}</strong></td>
    <td>${esc(status)}</td>
    <td title="${esc(m.source || '')}">${esc(shorten(m.source || '—', 28))}</td>
    <td class="muted">${esc(fmtDate(m.last_validated))}</td>
    ${kind === 'watch' && m.jira_ticket ? `<td><code>${esc(m.jira_ticket)}</code></td>` : ''}
  </tr>`;
}
function prodSection(title, count, rows, kind) {
  const extraCol = kind === 'watch' ? '<th>Jira</th>' : '';
  return `<section class="card"><div class="card-head"><h3>${esc(title)}</h3><span class="card-meta">${count} item${count > 1 ? 's' : ''}</span></div><div class="card-body">
    ${rows.length ? `<table class="rows-table"><thead><tr>
      <th>ID</th><th>Severity</th><th>Title</th><th>Status</th><th>Source</th><th>Validated</th>${extraCol}
    </tr></thead><tbody>${rows.join('')}</tbody></table>` : '<div class="muted">None.</div>'}
  </div></section>`;
}

// ----- Sources tab --------------------------------------------------
function renderSources() {
  const is = corpus.info_sources || {};
  const sources = asList(is.information_sources || is.sources);
  const coverageBySource = new Map(asList(corpus.source_coverage?.coverage).map((entry) => [entry.source_id, entry]));

  // Compute anchoring across all claim-like items
  const items = [
    ...(corpus.prod.bugs || []).map((b) => ({ ...b, kind: 'bug' })),
    ...(corpus.prod.risks || []).map((r) => ({ ...r, kind: 'risk' })),
    ...(corpus.prod.watchlist || []).map((w) => ({ ...w, kind: 'watch' })),
    ...(corpus.features || []).map((f) => ({ ...f, kind: 'feature' })),
  ];
  const anchored = [];
  const unanchored = [];
  for (const it of items) {
    const conf = String(it.meta?.confidence || '').toLowerCase();
    // `severity` is the prod-knowledge frontmatter canonical; `criticality` is
    // the brick-inventory canonical when a prod item is also tracked as a brick.
    // `priority` is legacy support for pre-tightening corpora.
    const sev = String(it.meta?.severity || it.meta?.priority || it.meta?.criticality || '').toLowerCase();
    const id = it.meta?.id || it.slug || it.title;
    const title = it.title || it.meta?.title || it.slug;
    const entry = {
      id, title,
      kind: it.kind,
      severity: sev,
      source: it.meta?.source || '',
      confidence: conf,
      domId: (it.kind === 'feature' ? 'feat-' : 'prod-') + String(id).toLowerCase(),
    };
    if (/confirmed|probable/.test(conf)) anchored.push(entry);
    else unanchored.push(entry);
  }
  const total = anchored.length + unanchored.length;
  const anchoringPct = total ? Math.round((anchored.length / total) * 100) : 0;
  const tone = anchoringPct >= 70 ? 'good' : anchoringPct >= 40 ? 'mid' : 'low';

  // Sources grouped by category
  const byCat = {};
  for (const s of sources) {
    const cat = s.category || 'uncategorized';
    (byCat[cat] = byCat[cat] || []).push(s);
  }

  // Top non-anchored — sort by severity rank then kind
  const sevRank = { critical: 0, high: 1, medium: 2, low: 3, '': 4 };
  const topUnanchored = [...unanchored].sort((a, b) => (sevRank[a.severity] ?? 9) - (sevRank[b.severity] ?? 9)).slice(0, 12);

  function severityBlobs() {
    // Distribution of anchored/unanchored as a stacked bar
    const a = anchored.length, u = unanchored.length;
    return `<div class="anc-bar" title="${a} anchored / ${u} unanchored">
      <div class="anc-seg anc-seg-anchored" style="flex:${a}"></div>
      <div class="anc-seg anc-seg-unanchored" style="flex:${u}"></div>
    </div>
    <div class="anc-legend">
      <span class="anc-chip anc-chip-anchored"><strong>${a}</strong> anchored</span>
      <span class="anc-chip anc-chip-unanchored"><strong>${u}</strong> unanchored</span>
    </div>`;
  }

  const heroAncrage = `
    <section class="card anc-hero">
      <div class="card-head"><h3>Anchoring score</h3><span class="card-meta">${total} claim-like items scanned</span></div>
      <div class="card-body">
        <div class="anc-hero-inner">
          <div class="anc-score anc-score-${tone}">
            <div class="anc-score-v">${anchoringPct}<span class="anc-score-unit">%</span></div>
            <div class="anc-score-l">claims with explicit source</div>
          </div>
          <div class="anc-bar-wrap">
            ${severityBlobs()}
            <p class="anc-explain muted">Each claim should trace back to a real source (code, Jira, Confluence, Dynatrace, custom). A claim with <code>confidence: confirmed</code> or <code>probable</code> in its frontmatter counts as anchored. Hallucinated claims have no source — exposing them is a quality signal.</p>
          </div>
        </div>
      </div>
    </section>`;

  const sourcesTable = `
    <section class="card">
      <div class="card-head"><h3>Durable source contracts</h3><span class="card-meta">${sources.length}</span></div>
      <div class="card-body">
        ${sources.length ? `<table class="rows-table"><thead><tr>
          <th>Name</th><th>Category</th><th>Transport(s)</th><th>Lifecycle</th><th>Requirement</th><th>Historical coverage</th><th>Freshness</th>
        </tr></thead><tbody>
          ${sources.map((s) => {
            const coverage = coverageBySource.get(s.id) || {};
            const methods = asList(s.transports).map((transport) => transport.method || transport.id).filter(Boolean).join(' · ');
            return `<tr>
            <td><strong>${esc(s.name || s.id || '—')}</strong></td>
            <td>${esc(s.category || '—')}</td>
            <td>${esc(methods || '—')}</td>
            <td>${pill(s.lifecycle || 'unknown', 'unknown')}</td>
            <td>${esc(s.requirement || '—')}</td>
            <td>${pill(coverage.status || 'not_started', /covered|deep/.test(coverage.status || '') ? 'confirmed' : /partial|started/.test(coverage.status || '') ? 'partial' : 'unknown')}</td>
            <td>${esc(coverage.freshness || 'unknown')}</td>
          </tr>`;
          }).join('')}
        </tbody></table>` : '<div class="muted">No sources registered.</div>'}
        <p class="muted">Runtime capability is intentionally absent: it is observed per run and never displayed as a durable property.</p>
      </div>
    </section>`;

  const unanchoredCard = topUnanchored.length ? `
    <section class="card">
      <div class="card-head"><h3>Top unanchored claims</h3><span class="card-meta">${unanchored.length} total — first ${topUnanchored.length} by severity</span></div>
      <div class="card-body">
        <p class="muted" style="margin-top:0;">These items have no <code>confidence: confirmed/probable</code> source declaration in their frontmatter. Click to read the item and decide how to anchor it.</p>
        <table class="rows-table"><thead><tr><th>ID</th><th>Kind</th><th>Severity</th><th>Title</th><th>Confidence</th></tr></thead><tbody>
        ${topUnanchored.map((u) => `<tr class="clickable-row" data-detail-id="${esc(u.domId)}">
          <td><code>${esc(u.id)}</code></td>
          <td>${esc(u.kind)}</td>
          <td>${u.severity ? pill(u.severity, severityTone(u.severity)) : '<span class="muted">—</span>'}</td>
          <td><strong>${esc(shorten(u.title, 100))}</strong></td>
          <td class="muted">${esc(u.confidence || '—')}</td>
        </tr>`).join('')}
        </tbody></table>
      </div>
    </section>` : '';

  return `
    <div class="panel-head"><div>
      <h1>Sources & anchoring</h1>
      <p class="lede">Each corpus affirmation should trace back to a real source. This tab tracks the connectors used, the anchoring score, and the claims still unsourced.</p>
    </div></div>
    ${heroAncrage}
    ${sourcesTable}
    ${unanchoredCard}
  `;
}

// ----- Corpus state tab ---------------------------------------------
function renderCorpusState() {
  const cs = corpus.corpus_state?.corpus || corpus.corpus_state || {};
  const passes = collectPipelinePasses();
  const recon = asList(corpus.reconciliation?.contradictions);
  const bi = corpus.brick_inventory?.brick_inventory || {};
  const bricks = asList(bi.bricks);
  const sum = bi.summary || {};

  // ---- Maturity hero -----------------------------------------------
  const mLevel = cs.maturity_level ?? 0;
  const mPhase = cs.phase || cs.operating_mode || '—';
  const mMax = 5;
  const phaseLabels = ['unknown', 'discovery', 'initial_coverage', 'continuous_enrichment', 'autonomous', 'mature'];
  const dots = Array.from({ length: mMax }, (_, i) => {
    const lvl = i + 1;
    const cls = lvl < mLevel ? 'mat-dot-done' : lvl === mLevel ? 'mat-dot-active' : 'mat-dot-todo';
    const lab = phaseLabels[lvl] || `L${lvl}`;
    return `<div class="mat-dot ${cls}"><div class="mat-dot-circle">${lvl}</div><div class="mat-dot-label">${esc(lab)}</div></div>`;
  });
  const heroDates = [
    cs.last_kickstart && ['Last kickstart', fmtDate(cs.last_kickstart)],
    cs.last_quality_check && ['Last QC', fmtDate(cs.last_quality_check)],
    cs.last_reconciliation && ['Last reconciliation', fmtDate(cs.last_reconciliation)],
    cs.last_continuous_run && ['Last run', fmtDate(cs.last_continuous_run)],
  ].filter(Boolean);

  const hero = `
    <section class="cs-hero">
      <div class="cs-hero-main">
        <div class="cs-hero-level">
          <div class="cs-hero-lnum">L${mLevel}</div>
          <div class="cs-hero-lmax">/${mMax}</div>
        </div>
        <div class="cs-hero-info">
          <div class="cs-hero-kicker">Corpus maturity</div>
          <div class="cs-hero-phase">${esc(mPhase)}</div>
          <div class="cs-hero-dates">${heroDates.map(([k, v]) => `<span class="cs-hero-date"><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span></span>`).join('')}</div>
        </div>
      </div>
      <div class="cs-hero-stepper">${dots.join('<span class="mat-dot-sep"></span>')}</div>
    </section>`;

  // ---- Pipeline timeline -------------------------------------------
  const pipelineNodes = passes.map((p) => {
    const st = String(p.status || 'unknown').toLowerCase();
    const tone = /covered|done/.test(st) ? 'good' : /partial|progress|started/.test(st) ? 'mid' : /blocked|not.applicable/.test(st) ? 'low' : 'todo';
    return `<div class="pl-node pl-node-${tone}" title="${esc(p.name + ' — ' + (p.status || '?'))}">
      <div class="pl-node-id">${esc(p.id || '?')}</div>
      <div class="pl-node-dot"></div>
      <div class="pl-node-name">${esc(p.name || '—')}</div>
      <div class="pl-node-date">${esc(fmtDate(p.last_run))}</div>
    </div>`;
  }).join('<div class="pl-line"></div>');

  const coveredCount = passes.filter((p) => /covered|done/i.test(p.status || '')).length;
  const pipelineCard = passes.length ? `
    <section class="card">
      <div class="card-head"><h3>Pipeline passes</h3><span class="card-meta">${coveredCount}/${passes.length} covered</span></div>
      <div class="card-body">
        <div class="pl-timeline">${pipelineNodes}</div>
        <div class="pl-legend">
          <span class="pl-leg pl-leg-good">covered</span>
          <span class="pl-leg pl-leg-mid">partial</span>
          <span class="pl-leg pl-leg-low">blocked</span>
          <span class="pl-leg pl-leg-todo">not started</span>
        </div>
      </div>
    </section>` : '';

  // ---- Bricks stacked bars -----------------------------------------
  function stackBar(label, segments, total) {
    if (!total) return '';
    const segs = segments.filter((s) => s.v > 0);
    return `
      <div class="cs-stack">
        <div class="cs-stack-head"><span class="cs-stack-label">${esc(label)}</span><span class="cs-stack-total">${total}</span></div>
        <div class="cs-stack-bar">
          ${segs.map((s) => `<div class="cs-stack-seg cs-seg-${s.tone}" style="flex:${s.v}" title="${esc(s.k)} — ${s.v}"></div>`).join('')}
        </div>
        <div class="cs-stack-legend">
          ${segs.map((s) => `<span class="cs-stack-chip cs-seg-${s.tone}"><span class="cs-stack-chip-v">${s.v}</span> ${esc(s.k)}</span>`).join('')}
        </div>
      </div>`;
  }
  const sevSegs = [
    { k: 'critical', v: sum.critical || 0, tone: 'crit' },
    { k: 'high', v: sum.high || 0, tone: 'high' },
    { k: 'medium', v: sum.medium || 0, tone: 'mid' },
    { k: 'low', v: sum.low || 0, tone: 'low' },
  ];
  const actSegs = [
    { k: 'actionable', v: sum.actionable || 0, tone: 'good' },
    { k: 'partial', v: sum.partial || 0, tone: 'mid' },
    { k: 'blocked', v: sum.blocked || 0, tone: 'crit' },
    { k: 'deferred', v: sum.deferred || 0, tone: 'todo' },
  ];
  const sevTotal = sevSegs.reduce((a, s) => a + s.v, 0);
  const actTotal = actSegs.reduce((a, s) => a + s.v, 0);
  const bricksCard = sum.total ? `
    <section class="card">
      <div class="card-head"><h3>Bricks</h3><span class="card-meta">${sum.total} total</span></div>
      <div class="card-body">
        ${stackBar('By severity', sevSegs, sevTotal)}
        ${stackBar('By actionability', actSegs, actTotal)}
      </div>
    </section>` : '';

  // ---- Coverage heatmap --------------------------------------------
  // Collect all `*_status`, `*_coverage_status`, `*_discovery_status` from cs
  const coverageEntries = [];
  for (const [k, v] of Object.entries(cs)) {
    if (typeof v !== 'string') continue;
    const isStatus = /_status$/.test(k);
    if (!isStatus) continue;
    // Skip already-shown ones
    if (/^(prod_discovery|jira|confluence|dynatrace|repository|custom_source|cicd_discovery|git_discovery|project_activity_discovery|indexes|information_source_registry|discovery_coverage|source_inventory|first_code_pass|first_prod_pass|brick_inventory|reconciliation|knowledge_graph|cross_cutting)/.test(k) === false && k !== 'overall_status') continue;
    const niceKey = k.replace(/_status$/, '').replace(/_coverage$/, '').replace(/_discovery$/, '').replace(/_/g, ' ');
    coverageEntries.push({ key: niceKey, raw: k, value: v });
  }
  // Also include some boolean flags converted
  for (const [k, v] of Object.entries(cs)) {
    if (typeof v !== 'boolean') continue;
    if (!/^(source_inventory_done|first_code_pass_done|first_prod_pass_done|indexes_initialized)$/.test(k)) continue;
    const niceKey = k.replace(/_done$/, '').replace(/_initialized$/, '').replace(/_/g, ' ');
    coverageEntries.push({ key: niceKey, raw: k, value: v ? 'done' : 'not_done' });
  }
  // Dedupe by niceKey — prefer coverage_status > discovery_status > _done > _initialized > else
  const sourceRank = (raw) => {
    if (/_coverage_status$/.test(raw)) return 0;
    if (/_discovery_status$/.test(raw)) return 1;
    if (/_done$/.test(raw)) return 2;
    if (/_initialized$/.test(raw)) return 2;
    return 3;
  };
  const byKey = new Map();
  for (const c of coverageEntries) {
    const prev = byKey.get(c.key);
    if (!prev || sourceRank(c.raw) < sourceRank(prev.raw)) byKey.set(c.key, c);
  }
  const workEntries = [...byKey.values()];
  coverageEntries.length = 0;
  coverageEntries.push(...workEntries);

  // Sort: covered > partial > started > not_started
  const statusOrder = { covered: 0, done: 0, available: 0, partial: 1, started: 2, not_started: 3, not_done: 3, blocked: 4, unknown: 5 };
  coverageEntries.sort((a, b) => (statusOrder[a.value] ?? 9) - (statusOrder[b.value] ?? 9) || a.key.localeCompare(b.key));

  function covTone(s) {
    s = String(s).toLowerCase();
    if (s === 'covered' || s === 'done') return 'good';
    if (s === 'partial' || s === 'started') return 'mid';
    if (s === 'not_started' || s === 'not_done') return 'low';
    if (s === 'blocked' || s === 'failed') return 'crit';
    return 'todo';
  }
  const covCells = coverageEntries.map((c) => `
    <div class="cov-cell cov-cell-${covTone(c.value)}" title="${esc(c.raw)}">
      <div class="cov-cell-status">${esc(String(c.value).replace(/_/g, ' '))}</div>
      <div class="cov-cell-label">${esc(c.key)}</div>
    </div>
  `).join('');
  const coveredN = coverageEntries.filter((c) => covTone(c.value) === 'good').length;
  const coverageCard = coverageEntries.length ? `
    <section class="card">
      <div class="card-head"><h3>Coverage by area</h3><span class="card-meta">${coveredN}/${coverageEntries.length} fully covered</span></div>
      <div class="card-body"><div class="cov-grid">${covCells}</div></div>
    </section>` : '';

  // ---- Reconciliation (compact) ------------------------------------
  const reconRows = recon.map((r) => {
    const title = r.title || r.topic || r.summary || '—';
    let resText = '';
    if (typeof r.resolution === 'string') resText = r.resolution;
    else if (r.resolution && typeof r.resolution === 'object') {
      // `result` is the canonical narrative field (SKILL.md p9-code-reconciliation-gate).
      // `winner` (free text) is legacy support for pre-tightening corpora; the
      // canonical replacement is `winner_rank` (int) + `result` (narrative).
      // `method` is the last-resort fallback when neither is present.
      resText = r.resolution.result || r.resolution.winner || r.resolution.method || '';
    }
    if (!resText && r.summary) resText = r.summary;
    return `<tr>
      <td><code>${esc(r.id || '—')}</code></td>
      <td><strong>${esc(shorten(title, 120))}</strong></td>
      <td>${pill(r.status || '?', /resolved/i.test(r.status || '') ? 'confirmed' : /accepted/i.test(r.status || '') ? 'partial' : 'unknown')}</td>
      <td class="muted">${esc(shorten(resText, 260))}</td>
    </tr>`;
  }).join('');
  const resolved = recon.filter((r) => /resolved/i.test(r.status || '')).length;
  const reconCard = recon.length ? `
    <section class="card">
      <div class="card-head"><h3>Reconciliation ledger</h3><span class="card-meta">${resolved}/${recon.length} resolved</span></div>
      <div class="card-body"><table class="rows-table"><thead><tr><th>ID</th><th>Topic</th><th>Status</th><th>Resolution</th></tr></thead><tbody>${reconRows}</tbody></table></div>
    </section>` : '';

  // ---- Quick counters ----------------------------------------------
  const oq = cs.open_questions_count ?? 0;
  const bq = cs.active_blocking_questions_count ?? 0;
  const quickCells = [
    { v: passes.length, l: 'Pipeline passes', h: `${coveredCount} covered` },
    { v: sum.total || bricks.length, l: 'Bricks', h: `${sum.actionable || 0} actionable` },
    { v: coverageEntries.length, l: 'Coverage areas', h: `${coveredN} covered` },
    { v: recon.length, l: 'Reconciliations', h: `${resolved} resolved` },
    { v: oq, l: 'Open questions', h: bq ? `${bq} blocking` : 'tracked' },
  ];

  return `
    <div class="panel-head"><div>
      <h1>Corpus state</h1>
      <p class="lede">Where the corpus stands: maturity, pipeline progression, brick inventory, coverage by area, contradictions resolved.</p>
    </div></div>

    ${hero}

    <section class="exec-section exec-scale">
      <div class="exec-sig-grid">
        ${quickCells.map((c) => `
          <div class="exec-sig-cell">
            <div class="exec-sig-value">${esc(c.v)}</div>
            <div class="exec-sig-label">${esc(c.l)}</div>
            <div class="exec-sig-hint">${esc(c.h)}</div>
          </div>`).join('')}
      </div>
    </section>

    ${pipelineCard}
    ${coverageCard}
    ${bricksCard}
    ${reconCard}
  `;
}

function renderBricksBreakdown(bi, byCrit, byStat) {
  const sum = bi.summary || {};
  const order = ['critical', 'high', 'medium', 'low'];
  const crit = order.filter((k) => sum[k] != null);
  const stat = ['actionable', 'partial', 'blocked', 'deferred'].filter((k) => sum[k] != null);
  let out = '<div class="brick-totals">';
  if (sum.total != null) out += `<div class="brick-total"><span class="brick-total-v">${sum.total}</span><span class="brick-total-l">total</span></div>`;
  for (const k of crit) {
    const tone = k === 'critical' || k === 'high' ? 'low' : k === 'medium' ? 'mid' : 'unknown';
    out += `<div class="brick-total brick-total-${tone}"><span class="brick-total-v">${sum[k]}</span><span class="brick-total-l">${k}</span></div>`;
  }
  out += '</div>';
  if (stat.length) {
    out += '<div class="brick-totals">';
    for (const k of stat) {
      out += `<div class="brick-total"><span class="brick-total-v">${sum[k]}</span><span class="brick-total-l">${k}</span></div>`;
    }
    out += '</div>';
  }
  return out;
}

// ----- Indexes tab --------------------------------------------------
function renderIndexes() {
  const entries = Object.entries(corpus.indexes);
  if (!entries.length) return panelEmpty('Indexes', 'No _indexes/*.md files found.');
  return `
    <div class="panel-head"><div>
      <h1>Indexes</h1>
      <p class="lede">Cross-cuts of the corpus by feature, API, brick, bug, risk, signal, source.</p>
    </div></div>
    <div class="idx-grid">
      ${entries.map(([k, v]) => {
        const counts = v.tables.reduce((a, t) => a + t.rows.length, 0);
        const file = k + '.md';
        const preview = (v.tables[0] && v.tables[0].rows.slice(0, 3)) || [];
        return `<article class="idx-card">
          <header><h3>${esc(k)}</h3><span class="card-meta">${counts} row${counts > 1 ? 's' : ''}</span></header>
          ${preview.length ? `<ul class="idx-preview">${preview.map((r) => `<li><code>${esc(r[0] || '—')}</code> · ${esc(shorten(r.slice(1).join(' · '), 160))}</li>`).join('')}</ul>` : '<p class="muted">Empty.</p>'}
          <footer class="muted mono">_indexes/${esc(file)}</footer>
        </article>`;
      }).join('')}
    </div>
  `;
}

// ----- Trajectory tab ------------------------------------------------
// Pulls from PROJECT_TRAJECTORY.md (release history, deadlines), actionable-readiness.md
// (gates and agent task readiness), and the questions data for "what blocks".
function renderTrajectory() {
  const traj = corpus.project.trajectory;
  const ar = corpus.actionable_readiness;
  const cs = corpus.corpus_state?.corpus || corpus.corpus_state || {};
  const runLedger = readFileSafe('_runs/RUN_LEDGER.md');
  const updateCand = readFileSafe('_meta/update-candidates.md');
  const next30 = corpus.handover?.next30;
  const changelog = readFileSafe('_meta/corpus-changelog.md');
  if (!traj && !ar && !runLedger && !updateCand && !next30) return panelEmpty('Trajectory', 'No project trajectory, runs, update candidates or adoption plan.');

  // Parse PROJECT_TRAJECTORY for: current production version, release history, urgent items
  let prodVersion = null, lastMep = null, devVersion = null, cadence = null;
  let releases = [];
  let urgentSections = []; // titles + their first table or first paragraph
  if (traj) {
    const fm = parseFrontmatter(traj);
    // Match top metadata tables
    const tables = parseMdTables(fm.body);
    for (const t of tables) {
      const hdr = (t.headers[0] || '').toLowerCase();
      if (/champ|field/.test(hdr) && /valeur|value/.test((t.headers[1] || '').toLowerCase())) {
        // Could be the "Version en production" table — pick fields
        for (const r of t.rows) {
          const k = stripMd(r[0] || '').toLowerCase();
          const v = stripMd(r[1] || '');
          if (/version actuelle prod/.test(k)) prodVersion = v;
          else if (/derni[èe]re mep/.test(k)) lastMep = v;
          else if (/version d[ée]velopp[ée]e/.test(k)) devVersion = v;
          else if (/cadence/.test(k)) cadence = v;
        }
      }
      if (/version|release/.test(hdr) && /(mep|prod|date)/.test((t.headers[1] || '').toLowerCase())) {
        for (const r of t.rows) {
          if (!r[0] || !r[0].trim()) continue;
          releases.push({ version: stripMd(r[0]), date: stripMd(r[1] || ''), change: stripMd(r[2] || ''), notes: stripMd(r[3] || '') });
        }
      }
    }
    // Urgent sections — ### 🔴 URGENT — ...
    const urgentRe = /^###\s+[🔴🟠⚠️]+\s+(.+?)$/gm;
    let m;
    while ((m = urgentRe.exec(fm.body)) !== null) {
      const start = m.index + m[0].length;
      const end = fm.body.indexOf('\n### ', start);
      const block = fm.body.slice(start, end === -1 ? start + 1500 : end);
      const tables2 = parseMdTables(block);
      const firstParaMatch = block.match(/^\s*([^\n#|].+)$/m);
      urgentSections.push({
        title: m[1].trim(),
        table: tables2[0] || null,
        intro: firstParaMatch ? stripMd(firstParaMatch[1]).slice(0, 220) : '',
      });
    }
  }

  // Parse actionable-readiness for conclusion + agent readiness
  let conclusion = null, scope = null, adoptionAllowed = null, lastReview = null;
  let agentReadiness = [];
  if (ar) {
    const fm = parseFrontmatter(ar);
    const tables = parseMdTables(fm.body);
    for (const t of tables) {
      const hdr0 = (t.headers[0] || '').toLowerCase();
      if (/field|champ/.test(hdr0) && /value|valeur/.test((t.headers[1] || '').toLowerCase())) {
        for (const r of t.rows) {
          const k = stripMd(r[0] || '').toLowerCase();
          const v = stripMd(r[1] || '');
          if (/conclusion/.test(k)) conclusion = v;
          else if (/scope/.test(k)) scope = v;
          else if (/adoption guide allowed/.test(k)) adoptionAllowed = v;
          else if (/last review/.test(k)) lastReview = v;
        }
      }
      if (/agent/.test(hdr0) && (t.headers.length >= 4)) {
        for (const r of t.rows) {
          if (!r[0]) continue;
          agentReadiness.push({
            agent: stripMd(r[0]),
            task: stripMd(r[1] || ''),
            status: stripMd(r[2] || ''),
            evidence: stripMd(r[3] || ''),
            gaps: stripMd(r[4] || ''),
          });
        }
      }
    }
  }

  // Quick metrics
  const oq = cs.open_questions_count ?? 0;
  const bq = cs.active_blocking_questions_count ?? 0;
  const sigCells = [
    prodVersion ? { v: prodVersion, l: 'Prod version', h: lastMep ? `MEP ${lastMep}` : '' } : null,
    devVersion ? { v: devVersion, l: 'In development', h: cadence ? cadence.slice(0, 40) : '' } : null,
    releases.length ? { v: releases.length, l: 'Releases tracked', h: 'last 12 months' } : null,
    urgentSections.length ? { v: urgentSections.length, l: 'Urgent items', h: 'active deadlines' } : null,
    { v: oq, l: 'Open questions', h: bq ? `${bq} blocking` : 'tracked' },
    conclusion ? { v: conclusion.replace(/_/g, ' '), l: 'Readiness', h: adoptionAllowed ? `adoption: ${adoptionAllowed.split('—')[0].trim()}` : '' } : null,
  ].filter(Boolean);

  const urgentBlock = urgentSections.length ? `
    <section class="card traj-urgent-card">
      <div class="card-head"><h3>⚠ Urgent items</h3><span class="card-meta">${urgentSections.length}</span></div>
      <div class="card-body">
        ${urgentSections.map((u) => `
          <article class="traj-urgent">
            <h4 class="traj-urgent-title">${esc(u.title)}</h4>
            ${u.intro ? `<p class="traj-urgent-intro">${esc(u.intro)}</p>` : ''}
            ${u.table ? `<table class="traj-mini-table"><tbody>${u.table.rows.map((r) => `<tr><th>${esc(stripMd(r[0] || ''))}</th><td>${esc(stripMd(r[1] || ''))}</td></tr>`).join('')}</tbody></table>` : ''}
          </article>
        `).join('')}
      </div>
    </section>` : '';

  const releaseBlock = releases.length ? `
    <section class="card">
      <div class="card-head"><h3>Release history</h3><span class="card-meta">${releases.length}</span></div>
      <div class="card-body">
        <table class="rows-table"><thead><tr><th>Version</th><th>MEP PROD</th><th>Change ticket</th><th>Notes</th></tr></thead><tbody>
        ${releases.map((r) => `<tr>
          <td><code>${esc(r.version)}</code></td>
          <td>${esc(r.date)}</td>
          <td class="mono-cell">${esc(r.change)}</td>
          <td class="muted">${esc(shorten(r.notes, 180))}</td>
        </tr>`).join('')}
        </tbody></table>
      </div>
    </section>` : '';

  const readinessBlock = agentReadiness.length ? `
    <section class="card">
      <div class="card-head"><h3>Agent task readiness</h3><span class="card-meta">${agentReadiness.length} agent${agentReadiness.length > 1 ? 's' : ''}</span></div>
      <div class="card-body">
        <table class="rows-table"><thead><tr><th>Agent</th><th>Task</th><th>Status</th><th>Evidence</th><th>Gaps</th></tr></thead><tbody>
        ${agentReadiness.map((a) => {
          const tone = /actionable/.test(a.status) && !/_for_/.test(a.status) ? 'confirmed' : /scope|partial/.test(a.status) ? 'partial' : 'unknown';
          return `<tr>
            <td><strong>${esc(a.agent)}</strong></td>
            <td>${esc(shorten(a.task, 80))}</td>
            <td>${pill(a.status.replace(/_/g, ' '), tone)}</td>
            <td class="muted">${esc(shorten(a.evidence, 200))}</td>
            <td class="muted">${esc(shorten(a.gaps, 180))}</td>
          </tr>`;
        }).join('')}
        </tbody></table>
      </div>
    </section>` : '';

  return `
    <div class="panel-head"><div>
      <h1>Trajectory</h1>
      <p class="lede">Where the application is going: release history, urgent deadlines, readiness of agents to operate on the current scope.</p>
    </div></div>

    ${sigCells.length >= 2 ? `<section class="exec-section exec-scale"><div class="exec-sig-grid">
      ${sigCells.map((c) => `<div class="exec-sig-cell">
        <div class="exec-sig-value">${esc(c.v)}</div>
        <div class="exec-sig-label">${esc(c.l)}</div>
        <div class="exec-sig-hint">${esc(c.h)}</div>
      </div>`).join('')}
    </div></section>` : ''}

    ${urgentBlock}
    ${renderUpdateCandidatesCard(updateCand)}
    ${renderRunLedgerCard(runLedger)}
    ${renderNext30Card(next30)}
    ${readinessBlock}
    ${releaseBlock}
    ${(!urgentBlock && !releaseBlock && !readinessBlock && !runLedger && !updateCand && !next30) ? renderEmptyState('Project trajectory not captured yet', '<code>doc/project/activity/PROJECT_TRAJECTORY.md</code> is still the template (status: draft, fields say "unknown"). Run <code>exploration/project-activity-discovery</code> to fill it from Jira + Confluence + git, or write the version table + release history manually.', 'project/activity/PROJECT_TRAJECTORY.md') : ''}
  `;
}

// Update candidates — `doc/_meta/update-candidates.md` table:
//   ID | Candidate knowledge | Source | Proposed target | Confidence | Status
// Show OPEN items by default, collapse the resolved ones.
function renderUpdateCandidatesCard(md) {
  if (!md) return '';
  const tables = parseMdTables(parseFrontmatter(md).body);
  if (!tables.length) return '';
  const rows = tables[0].rows.filter((r) => r[0] && r[0].trim() && !/^-+$/.test(r[0].trim()));
  if (!rows.length) return '';
  const items = rows.map((r) => {
    const status = stripMd(r[5] || '').toLowerCase();
    const closed = /closed|résolu|resolved|implémenté|fermé/.test(status);
    return {
      id: stripMd(r[0] || ''),
      desc: stripMd(r[1] || ''),
      source: stripMd(r[2] || ''),
      target: stripMd(r[3] || ''),
      confidence: stripMd(r[4] || ''),
      status,
      closed,
    };
  });
  const open = items.filter((i) => !i.closed);
  const closed = items.filter((i) => i.closed);
  if (!open.length && !closed.length) return '';
  function rowHtml(i) {
    const criticalHint = /critical|urgent|prioris/.test(i.status) ? 'low' : /open/.test(i.status) ? 'mid' : 'unknown';
    return `<article class="uc-row ${i.closed ? 'uc-closed' : ''}">
      <header class="uc-row-head">
        <code class="uc-id">${esc(i.id)}</code>
        <span class="pill pill-${i.closed ? 'confirmed' : criticalHint}">${esc(i.status)}</span>
        ${i.confidence ? `<span class="muted uc-conf">${esc(i.confidence)}</span>` : ''}
      </header>
      <p class="uc-desc">${esc(shorten(i.desc, 300))}</p>
      <footer class="uc-meta">
        ${i.target ? `<span><span class="k">target</span> <code>${esc(shorten(i.target, 80))}</code></span>` : ''}
        ${i.source ? `<span><span class="k">source</span> ${esc(shorten(i.source, 50))}</span>` : ''}
      </footer>
    </article>`;
  }
  return `<section class="card">
    <div class="card-head"><h3>Update candidates</h3><span class="card-meta">${open.length} open${closed.length ? ` · ${closed.length} closed` : ''}</span></div>
    <div class="card-body">
      ${open.length ? `<div class="uc-list">${open.map(rowHtml).join('')}</div>` : '<div class="muted">No open candidates.</div>'}
      ${closed.length ? `<details class="prose-fold" style="margin-top:14px;"><summary>Show ${closed.length} closed</summary><div class="uc-list" style="margin-top:14px;">${closed.map(rowHtml).join('')}</div></details>` : ''}
    </div>
  </section>`;
}

// Recent runs — `doc/_runs/RUN_LEDGER.md` table:
//   Date | Run id | Roadmap node | Intent | Sources consumed | Corpus updates | Next action
function renderRunLedgerCard(md) {
  if (!md) return '';
  const tables = parseMdTables(parseFrontmatter(md).body);
  if (!tables.length) return '';
  const allRows = tables[0].rows.filter((r) => r[0] && r[0].trim() && !/^-+$/.test(r[0].trim()));
  if (!allRows.length) return '';
  // Show last 8 runs (newest first — table is chronological so reverse the slice)
  const recent = allRows.slice(-8).reverse();
  const remaining = Math.max(0, allRows.length - 8);
  const itemHtml = (r) => `<article class="run-row">
    <div class="run-meta">
      <span class="run-date mono">${esc(stripMd(r[0] || ''))}</span>
      <code class="run-id">${esc(stripMd(r[1] || ''))}</code>
      ${r[2] ? `<span class="run-node muted">${esc(shorten(stripMd(r[2]), 40))}</span>` : ''}
    </div>
    <div class="run-intent">${esc(shorten(stripMd(r[3] || ''), 260))}</div>
    ${r[6] ? `<div class="run-next"><span class="k">next →</span> ${esc(shorten(stripMd(r[6]), 200))}</div>` : ''}
  </article>`;
  return `<section class="card">
    <div class="card-head"><h3>Recent runs</h3><span class="card-meta">${recent.length} of ${allRows.length}${remaining ? ` · ${remaining} older` : ''}</span></div>
    <div class="card-body">
      <ol class="run-timeline">${recent.map(itemHtml).join('')}</ol>
      ${remaining ? `<p class="muted" style="margin-top:10px;font-size:11.5px;">Older runs in <code>doc/_runs/RUN_LEDGER.md</code></p>` : ''}
    </div>
  </section>`;
}

// Adoption plan — extracts week-by-week bullet sections from NEXT_30_DAYS.md.
function renderNext30Card(md) {
  if (!md) return '';
  const fm = parseFrontmatter(md);
  // Split at H2 sections (Week 1 — ..., Week 2 — ..., etc.)
  const segs = splitMdAtHeading(fm.body, 2);
  if (!segs.sections.length) return '';
  const weeks = segs.sections.map((s, i) => {
    const bullets = [];
    for (const ln of s.body.split(/\r?\n/)) {
      const m = ln.match(/^\s*[-*]\s+(.+)$/);
      if (m) bullets.push(m[1]);
    }
    return { idx: i + 1, title: s.heading, bullets };
  }).filter((w) => w.bullets.length);
  if (!weeks.length) return '';
  return `<section class="card">
    <div class="card-head"><h3>Adoption plan</h3><span class="card-meta">next 30 days</span></div>
    <div class="card-body">
      <ol class="adopt-weeks">
        ${weeks.map((w) => `<li class="adopt-week">
          <div class="adopt-week-num">${w.idx}</div>
          <div class="adopt-week-body">
            <h4 class="adopt-week-title">${esc(w.title)}</h4>
            <ul class="adopt-week-bullets">${w.bullets.map((b) => `<li>${esc(shorten(stripMd(b), 200))}</li>`).join('')}</ul>
          </div>
        </li>`).join('')}
      </ol>
    </div>
  </section>`;
}

// Generic, friendly empty-state card — used wherever a tab depends on data
// that hasn't been captured yet for this corpus.
function renderEmptyState(title, hintHtml, fileHint) {
  return `
    <section class="card empty-state-card">
      <div class="card-body empty-state-body">
        <div class="empty-state-icon">○</div>
        <h3 class="empty-state-title">${esc(title)}</h3>
        <p class="empty-state-hint">${hintHtml}</p>
        ${fileHint ? `<p class="empty-state-file mono">doc/${esc(fileHint)}</p>` : ''}
      </div>
    </section>`;
}

// ----- Handover tab --------------------------------------------------
function renderHandover() {
  const h = corpus.handover || {};
  const items = [
    { id: 'rapport_etonnement', title: 'Rapport d\'étonnement', desc: 'Premières observations notables: code + prod + Confluence. Surprises, inquiétudes, ce qui est plus solide qu\'attendu.', kind: 'insight', md: h.rapport_etonnement },
    // next30 / adoption plan is rendered in the Trajectory tab as a week-by-week
    // structured card — don't duplicate here. (kept commented for context)
    // { id: 'next30', title: 'Next 30 days', kind: 'plan', md: h.next30 },
    { id: 'closeout', title: 'Kickstart closeout checklist', desc: 'Checklist à valider avant de présenter le matériel d\'adoption à l\'équipe.', kind: 'checklist', md: h.closeout },
    { id: 'team_guide', title: 'Team usage guide', desc: 'Comment l\'équipe doit utiliser le corpus au quotidien : lecture, contribution, conventions MCP.', kind: 'guide', md: h.team_guide },
    { id: 'ai_champion', title: 'AI champion guide', desc: 'Rôle de l\'AI champion : patterns d\'usage, workflows de mise à jour corpus.', kind: 'guide', md: h.ai_champion },
    { id: 'summary', title: 'Handover summary', desc: 'État synthétique de l\'application et du corpus au moment du handover.', kind: 'summary', md: h.summary },
  ].filter((x) => x.md);

  if (!items.length) return panelEmpty('Handover', 'No handover docs found under _handover/.');

  // Compute checklist progress if closeout exists
  let checklistProgress = null;
  if (h.closeout) {
    const checks = (h.closeout.match(/^\s*- \[[ x]\]/gm) || []).length;
    const done = (h.closeout.match(/^\s*- \[x\]/gm) || []).length;
    checklistProgress = { done, total: checks };
  }

  // Detect if HANDOVER_SUMMARY is still template (lots of "unknown")
  const summaryUnknowns = h.summary ? (h.summary.match(/\bunknown\b/g) || []).length : 0;
  const summaryIsTemplate = summaryUnknowns > 4;

  const cards = items.map((it) => {
    const m = parseFrontmatter(it.md).meta || {};
    const stat = m.status || '?';
    const statTone = /draft/.test(stat) ? 'partial' : 'confirmed';
    const wordCount = it.md.split(/\s+/).length;
    const isTemplate = it.id === 'summary' && summaryIsTemplate;
    return `
      <article class="ho-card clickable-card ${isTemplate ? 'ho-card-template' : ''}" data-detail-id="ho-${esc(it.id)}">
        <header class="ho-card-head">
          <span class="ho-card-kind">${esc(it.kind)}</span>
          ${isTemplate ? `<span class="pill pill-empty">template only</span>` : `<span class="pill pill-${statTone}">${esc(stat)}</span>`}
        </header>
        <h3 class="ho-card-title">${esc(it.title)}</h3>
        <p class="ho-card-desc">${esc(it.desc)}</p>
        ${it.id === 'closeout' && checklistProgress ? `
          <div class="ho-progress">
            <div class="ho-progress-bar"><div class="ho-progress-fill" style="width:${checklistProgress.total ? (checklistProgress.done / checklistProgress.total * 100).toFixed(0) : 0}%"></div></div>
            <span class="ho-progress-text">${checklistProgress.done}/${checklistProgress.total} items checked</span>
          </div>` : ''}
        <footer class="ho-card-foot muted">${wordCount} words${m.last_validated ? ` · validated ${esc(fmtDate(m.last_validated))}` : ''}</footer>
      </article>`;
  }).join('');

  // Note: open_decisions is rendered in the Questions tab — not duplicated here.

  return `
    <div class="panel-head"><div>
      <h1>Handover &amp; adoption</h1>
      <p class="lede">Onboarding material for the team taking over: insights, plan, conventions, checklists.</p>
    </div></div>
    <div class="ho-grid">${cards}</div>
  `;
}

// ----- Specs tab -----------------------------------------------------
function specShortSummary(spec) {
  // Try SUMMARY.md → first "Summary:" line, else README first descriptive line
  const summaryDoc = spec.docs.summary;
  if (summaryDoc?.body) {
    const m = summaryDoc.body.match(/Summary:\s*(.+?)$/m);
    if (m) return m[1].trim();
    const m2 = summaryDoc.body.match(/Title:\s*(.+?)$/m);
    if (m2) return m2[1].trim();
  }
  const readmeDoc = spec.docs.readme;
  if (readmeDoc?.body) {
    // first non-heading paragraph
    for (const para of readmeDoc.body.split(/\n\n/)) {
      const t = para.trim();
      if (!t || t.startsWith('#') || t.startsWith('|')) continue;
      if (/^Jira:|^Location:|^Owners:|^Purpose:/.test(t)) continue;
      const desc = t.match(/Short description:\s*(.+)/i);
      if (desc) return desc[1].trim();
      return shorten(t, 240);
    }
  }
  return '';
}

function renderSpecs() {
  const specs = corpus.specs || [];
  if (!specs.length) return panelEmpty('Specs', 'No specs in doc/spec/.');

  const cards = specs.map((s) => {
    const m = s.meta || {};
    const ticket = m.ticket || s.id;
    const jiraUrl = (s.docs.readme?.body || '').match(/Jira:\s*(https?:\S+)/)?.[1];
    const summary = specShortSummary(s);
    const components = m.components || (s.docs.summary?.body || '').match(/Components?:\s*(.+?)$/m)?.[1] || '';
    const estimate = (s.docs.summary?.body || '').match(/Estimate:\s*(.+?)$/m)?.[1] || m.triage_class || '';
    const status = m.status || 'unknown';
    const statusTone = /draft/.test(status) ? 'partial' : /done|merged|deployed/.test(status) ? 'confirmed' : 'unknown';
    const docCount = Object.keys(s.docs).length;
    return `
      <article class="spec-card clickable-card" data-detail-id="spec-${esc(s.id)}">
        <header class="spec-card-head">
          <span class="spec-card-ticket"><code>${esc(ticket)}</code></span>
          <span class="pill pill-${statusTone}">${esc(status)}</span>
        </header>
        <h3 class="spec-card-title">${esc(summary || s.id)}</h3>
        <div class="spec-card-meta">
          ${components ? `<span class="kv-inline"><span class="k">components</span><span class="v">${esc(components)}</span></span>` : ''}
          ${estimate ? `<span class="kv-inline"><span class="k">size</span><span class="v">${esc(estimate)}</span></span>` : ''}
          ${m.last_validated ? `<span class="kv-inline"><span class="k">validated</span><span class="v">${esc(fmtDate(m.last_validated))}</span></span>` : ''}
        </div>
        <footer class="spec-card-foot">
          <span class="muted">${docCount} doc${docCount > 1 ? 's' : ''}: ${esc(Object.keys(s.docs).join(', '))}</span>
          ${jiraUrl ? `<a href="${esc(jiraUrl)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">open in Jira →</a>` : ''}
        </footer>
      </article>`;
  }).join('');

  return `
    <div class="panel-head"><div>
      <h1>Specs &amp; changes</h1>
      <p class="lede">In-flight changes and proposed evolutions documented under <code>doc/spec/</code>. Click a card to see all spec files (summary, specification, impacts, tests, deployment, suggestions).</p>
    </div></div>
    <div class="spec-grid">${cards}</div>
  `;
}

// ----- Domain tab ----------------------------------------------------
function renderDomain() {
  const entMd = readFileSafe('project/domain/ENTITIES.md');
  const persistMd = corpus.project.architecture?.persistence;
  const cc = corpus.cross_cutting || {};

  // Extract entity-like headings. Some corpora use H3 (### Name), others use
  // H2 (## 1. Name). Try H3 first; fall back to H2 if H3 returns nothing.
  function extractHeadings(body, level) {
    const re = new RegExp(`^${'#'.repeat(level)}\\s+(.*?)\\s*$`, 'gm');
    const out = [];
    let m;
    while ((m = re.exec(body)) !== null) {
      let h = m[1].trim();
      // strip leading numbering like "1. " or "1) "
      h = h.replace(/^\d+[.)]\s*/, '');
      const tm = h.match(/^[`"]?([A-Za-z][A-Za-z0-9_-]*)[`"]?\s*\(`([^`]+)`\)/) ||
                 h.match(/^[`"]?([A-Za-z][A-Za-z0-9_-]*)[`"]?\s+`([^`]+)`/);
      if (tm) out.push({ name: tm[1], table: tm[2], raw: m[1].trim() });
      else out.push({ name: h.replace(/^[`"]|[`"]$/g, ''), table: null, raw: m[1].trim() });
    }
    return out;
  }
  let entities = [];
  let entityHeadingLevel = 3;
  if (entMd) {
    const fm = parseFrontmatter(entMd);
    entities = extractHeadings(fm.body, 3);
    if (!entities.length) {
      entities = extractHeadings(fm.body, 2);
      if (entities.length) entityHeadingLevel = 2;
    }
  }
  // Detect what the catalogue actually describes: business entities (JPA
  // classes, e.g. Document / Processing / Client) vs databases (PostgreSQL /
  // Oracle / MySQL …). The file path is the same but corpora use it for
  // different concepts — call it accurately so a sponsor doesn't think
  // "3 Entities JPA-mapped" when it's really "3 databases".
  const DBMS = /^(PostgreSQL|Oracle|MySQL|MariaDB|MongoDB|SQLServer|SQLite|Redis|Cassandra|DynamoDB|Elastic(search)?)$/i;
  const looksLikeDbs = entities.length && entities.every((e) => DBMS.test(e.name));
  const catalogueKind = looksLikeDbs ? 'database' : 'domain';
  const catalogueLabel = looksLikeDbs ? 'Databases' : 'Domain objects';
  const catalogueHint = looksLikeDbs ? 'persistence stores' : 'business model';

  const sigCells = [
    { v: cc.domain_entities_count || entities.length, l: catalogueLabel, h: catalogueHint },
    { v: cc.persistence_jpa_stacks, l: 'JPA stacks', h: 'parallel' },
    { v: asList(cc.persistence_engines).length, l: 'DB engines', h: (cc.persistence_engines || []).join(', ') },
    { v: cc.messaging_brokers, l: 'Messaging brokers', h: '' },
    { v: cc.messaging_queues, l: 'Queues', h: '' },
    { v: cc.messaging_topics, l: 'Topics', h: '' },
  ].filter((c) => c.v && c.v !== 0);

  const hasAnyContent = entities.length || persistMd || sigCells.length;
  if (!hasAnyContent) {
    return `
      <div class="panel-head"><div>
        <h1>Domain</h1>
        <p class="lede">Business entities, persistence stacks, JPA mappings.</p>
      </div></div>
      ${renderEmptyState('No domain catalogue yet', 'Either <code>project/domain/ENTITIES.md</code> hasn\'t been populated (header without entities), or <code>_meta/cross-cutting-state.yaml</code> uses a different shape than expected (no <code>domain_entities_count</code> / <code>persistence_jpa_stacks</code> / etc.). Run <code>pipeline/p5-cross-cutting-extraction</code> to fill the YAML, then catalog entities with H3 sections in ENTITIES.md.', 'project/domain/ENTITIES.md')}
    `;
  }

  // Build a per-source structured payload: name, table slug, entity table
  // (parsed from the section body), and detail HTML (SVG + section markdown).
  let segments = { intro: '', sections: [] };
  if (entMd) {
    const fm = parseFrontmatter(entMd);
    segments = splitMdAtHeading(fm.body, entityHeadingLevel);
  }
  function detectAccent(name) {
    const l = String(name || '').toLowerCase();
    if (/postgres|postgresql/.test(l)) return { color: '#5fa8e8', label: 'POSTGRESQL' };
    if (/oracle/.test(l)) return { color: '#f08055', label: 'ORACLE' };
    if (/mysql|mariadb/.test(l)) return { color: '#f5b860', label: 'MYSQL' };
    if (/mongo/.test(l)) return { color: '#4ade80', label: 'MONGODB' };
    if (/redis/.test(l)) return { color: '#ef6f6c', label: 'REDIS' };
    if (/sqlserver|mssql/.test(l)) return { color: '#a899ff', label: 'SQLSERVER' };
    return { color: '#8c7bff', label: 'STORE' };
  }
  // For each entity heading produce one card + detail panel.
  const sourceItems = entities.map((e, i) => {
    const slugSource = (e.raw || e.name || '').replace(/^\d+[.)]\s*/, '');
    const slug = integSlug(slugSource) || `idx-${i}`;
    // Locate the matching segment by heading text
    const seg = segments.sections.find((s) => s.heading === e.raw) ||
                segments.sections.find((s) => s.heading.replace(/^\d+[.)]\s*/, '') === slugSource) ||
                segments.sections[i] || { heading: e.raw, body: '' };
    // Parse the first table for entity rows (for the SVG)
    const tables = parseMdTables(seg.body);
    const entRows = [];
    if (tables.length) {
      for (const r of tables[0].rows) {
        const name = stripMd(r[0] || '').replace(/^[`"]|[`"]$/g, '');
        const table = stripMd(r[1] || '').replace(/^[`"]|[`"]$/g, '');
        if (!name || name === '—') continue;
        entRows.push({ name, table });
      }
    }
    const accent = detectAccent(e.name);
    const svg = renderDomainErSvg(slugSource, entRows);
    return { slug, name: e.name, table: e.table, raw: e.raw, segBody: seg.body, accent, entCount: entRows.length, svg };
  });
  // Total entity count across all sources (more accurate than entities.length
  // which counts H2 headings, not actual entity rows)
  const totalEntityCount = sourceItems.reduce((s, it) => s + it.entCount, 0);

  return `
    <div class="panel-head"><div>
      <h1>${looksLikeDbs ? 'Data sources' : 'Domain'}</h1>
      <p class="lede">${entities.length} ${esc(catalogueLabel.toLowerCase())} catalogued${totalEntityCount ? ` · ${totalEntityCount} entit${totalEntityCount > 1 ? 'ies' : 'y'} mapped` : ''}. Click a source to expand its model.</p>
    </div></div>

    ${entities.length ? `<div class="ds-grid">
      ${sourceItems.map((it) => `<button type="button" class="ds-card" data-ds-source="${esc(it.slug)}" style="--ds-accent: ${it.accent.color}">
        <span class="ds-card-kind">${esc(it.accent.label)}</span>
        <span class="ds-card-name">${esc(it.name)}</span>
        ${it.table ? `<span class="ds-card-tbl mono">${esc(it.table)}</span>` : ''}
        <span class="ds-card-foot"><span class="ds-card-count">${it.entCount}</span> ${it.entCount === 1 ? 'entity' : 'entities'}</span>
      </button>`).join('')}
    </div>` : '<div class="muted">No entities catalogued.</div>'}

    ${sourceItems.map((it) => `<section class="ds-detail" data-ds-detail="${esc(it.slug)}" hidden>
      <header class="ds-detail-head" style="--ds-accent: ${it.accent.color}">
        <h3>${esc(it.name)}${it.table ? ` <code class="mono">${esc(it.table)}</code>` : ''}</h3>
        <button type="button" class="ds-detail-close" data-ds-close>close ×</button>
      </header>
      ${it.svg ? `<div class="ds-detail-svg">${it.svg}</div>` : ''}
      ${it.segBody ? `<div class="ds-detail-body prose dom-prose">${mdBlockRich(it.segBody, 200)}</div>` : ''}
    </section>`).join('')}
  `;
}

// Split a markdown body at heading level `level` (3 = H3). Returns { intro, sections: [{heading, body}] }.
function splitMdAtHeading(md, level) {
  if (!md) return { intro: '', sections: [] };
  const re = new RegExp(`^${'#'.repeat(level)}\\s+(.*?)\\s*$`, 'gm');
  const matches = [...md.matchAll(re)];
  if (!matches.length) return { intro: md, sections: [] };
  const intro = md.slice(0, matches[0].index).trim();
  const sections = matches.map((m, i) => ({
    heading: m[1].trim(),
    body: md.slice(m.index + m[0].length, i + 1 < matches.length ? matches[i + 1].index : md.length).trim(),
  }));
  return { intro, sections };
}

// Richer markdown block renderer — supports tables (used by Domain prose)
function mdBlockRich(md, maxLines = 500) {
  if (!md) return '';
  const lines = md.split(/\r?\n/).slice(0, maxLines);
  let html = '';
  let inList = false, inTable = false, tableHeader = false, tableCols = 0;
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (/^\s*$/.test(ln)) {
      if (inList) { html += '</ul>'; inList = false; }
      if (inTable) { html += '</tbody></table>'; inTable = false; }
      continue;
    }
    if (/^#{1,6}\s/.test(ln)) {
      if (inList) { html += '</ul>'; inList = false; }
      if (inTable) { html += '</tbody></table>'; inTable = false; }
      const m = ln.match(/^(#+)\s+(.*)$/);
      const lvl = Math.min(m[1].length + 1, 6);
      html += `<h${lvl}>${md_inline(m[2])}</h${lvl}>`;
      continue;
    }
    // Table
    if (/^\s*\|/.test(ln)) {
      // header separator
      if (i + 1 < lines.length && /^\s*\|[\s|:-]+\|\s*$/.test(lines[i + 1])) {
        if (inList) { html += '</ul>'; inList = false; }
        if (inTable) html += '</tbody></table>';
        const cells = splitMdRow(ln);
        tableCols = cells.length;
        html += `<table class="dom-table"><thead><tr>${cells.map((c) => `<th>${md_inline(c)}</th>`).join('')}</tr></thead><tbody>`;
        inTable = true;
        tableHeader = true;
        i++; // skip separator
        continue;
      }
      if (inTable && /^\s*\|[\s|:-]+\|\s*$/.test(ln)) continue;
      if (inTable) {
        const cells = splitMdRow(ln);
        // pad/trim to header col count
        while (cells.length < tableCols) cells.push('');
        html += `<tr>${cells.slice(0, tableCols).map((c) => `<td>${md_inline(c)}</td>`).join('')}</tr>`;
        continue;
      }
      // fallthrough — orphan pipe, render as paragraph
    }
    if (inTable) { html += '</tbody></table>'; inTable = false; }
    if (/^[-*]\s/.test(ln)) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${md_inline(ln.replace(/^[-*]\s/, ''))}</li>`;
      continue;
    }
    if (/^>\s?/.test(ln)) {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<blockquote>${md_inline(ln.replace(/^>\s?/, ''))}</blockquote>`;
      continue;
    }
    if (inList) { html += '</ul>'; inList = false; }
    html += `<p>${md_inline(ln)}</p>`;
  }
  if (inList) html += '</ul>';
  if (inTable) html += '</tbody></table>';
  return html;
}

// ----- Activity tab --------------------------------------------------
function renderActivity() {
  const act = corpus.code_activity || {};
  const monthly = act.monthly_activity || {};
  const months = Object.entries(monthly).sort(([a], [b]) => a.localeCompare(b));
  const hasAnyData = act.total_commits || months.length || asList(act.contributors).length || asList(act.hot_files_last_year).length || asList(act.hot_java_6m).length;
  if (!hasAnyData) {
    return `
      <div class="panel-head"><div>
        <h1>Activity</h1>
        <p class="lede">Repo signals: commits over time, contributors, hot files, dead code candidates.</p>
      </div></div>
      ${renderEmptyState('No git activity signals collected yet', 'Run <code>pipeline/code-activity-signals</code> to populate <code>doc/_meta/code-activity-signals.yaml</code> with the last 12 months of commits, top contributors and hot files.', 'meta/code-activity-signals.yaml')}
    `;
  }
  const max = Math.max(1, ...months.map(([, v]) => Number(v) || 0));
  const peakMonth = act.peak_month;
  const total = act.total_commits;
  const avg = act.average_monthly_commits_last_12m;
  const humans = act.human_contributors_last_year;
  const bots = act.bot_contributors_last_year;

  // SVG bar chart
  const chartW = 720, chartH = 200, padL = 50, padR = 18, padT = 14, padB = 32;
  const innerW = chartW - padL - padR, innerH = chartH - padT - padB;
  const barGap = 6;
  const barW = months.length ? (innerW - barGap * (months.length - 1)) / months.length : 0;
  const yScale = (v) => innerH - (v / max) * innerH;
  const chart = months.length ? `
    <svg viewBox="0 0 ${chartW} ${chartH}" class="act-chart" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="actBarGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#a899ff"/>
          <stop offset="100%" stop-color="#6b58e6"/>
        </linearGradient>
        <linearGradient id="actPeakGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#ff7eb6"/>
          <stop offset="100%" stop-color="#c45a93"/>
        </linearGradient>
      </defs>
      <!-- axis dashed -->
      ${[0.25, 0.5, 0.75, 1].map((f) => `<line x1="${padL}" y1="${padT + innerH * (1 - f)}" x2="${padL + innerW}" y2="${padT + innerH * (1 - f)}" stroke="rgba(255,255,255,0.045)" stroke-dasharray="2,4"/>`).join('')}
      <!-- y axis labels -->
      ${[0.5, 1].map((f) => `<text x="${padL - 8}" y="${padT + innerH * (1 - f) + 3}" text-anchor="end" font-size="9.5" fill="#565d6c">${Math.round(max * f)}</text>`).join('')}
      <!-- bars -->
      ${months.map(([m, v], i) => {
        const x = padL + i * (barW + barGap);
        const y = padT + yScale(v);
        const h = innerH - yScale(v);
        const isPeak = m === peakMonth;
        return `
          <g class="act-bar">
            <rect x="${x}" y="${y}" width="${barW}" height="${h}" fill="url(#${isPeak ? 'actPeakGrad' : 'actBarGrad'})" rx="2"/>
            <text x="${x + barW / 2}" y="${y - 4}" text-anchor="middle" font-size="10" font-weight="600" fill="${isPeak ? '#ff9ec6' : '#c1c7d3'}">${v}</text>
            <text x="${x + barW / 2}" y="${chartH - 10}" text-anchor="middle" font-size="9.5" fill="#818897">${m.slice(2)}</text>
          </g>`;
      }).join('')}
    </svg>` : '<div class="muted">No monthly data.</div>';

  // Contributors with horizontal bars
  const contribs = asList(act.contributors).sort((a, b) => (b.commits || 0) - (a.commits || 0));
  const maxContrib = Math.max(1, ...contribs.map((c) => c.commits || 0));
  const contribTable = contribs.length ? `
    <table class="rows-table"><thead><tr>
      <th>Contributor</th><th>Role</th><th style="width: 40%">Commits</th>
    </tr></thead><tbody>
    ${contribs.map((c) => {
      const email = c.email || c.name || '?';
      const short = email.replace(/@.+$/, '').replace(/\d+\+/, '').replace(/\[bot\]$/i, ' (bot)');
      const pct = ((c.commits || 0) / maxContrib) * 100;
      const isBot = /bot/i.test(c.role || '') || /\[bot\]/.test(email);
      return `<tr>
        <td><strong>${esc(short)}</strong><div class="muted mono">${esc(shorten(email, 50))}</div></td>
        <td><span class="pill ${isBot ? 'pill-unknown' : 'pill-confirmed'}">${esc(c.role || '?')}</span></td>
        <td><div class="contrib-bar"><div class="contrib-bar-fill" style="width:${pct.toFixed(1)}%"></div><span class="contrib-bar-v">${c.commits || 0}</span></div></td>
      </tr>`;
    }).join('')}
    </tbody></table>` : '<div class="muted">No contributors data.</div>';

  // Hot files
  const hotFiles = asList(act.hot_files_last_year);
  const hotFilesTable = hotFiles.length ? `
    <table class="rows-table"><thead><tr>
      <th>File</th><th>Type</th><th>Signal</th><th>Feature</th><th>Changes</th>
    </tr></thead><tbody>
    ${hotFiles.slice(0, 20).map((f) => `<tr>
      <td class="mono-cell">${esc(shorten(f.file || '', 80))}</td>
      <td>${esc(f.type || '—')}</td>
      <td class="muted">${esc(shorten(f.signal || '', 80))}</td>
      <td>${f.feature_slug ? `<code>${esc(f.feature_slug)}</code>` : '<span class="muted">—</span>'}</td>
      <td><strong>${esc(f.changes)}</strong></td>
    </tr>`).join('')}
    </tbody></table>` : '';

  const hotJava = asList(act.hot_java_6m || act.hot_java_files_last_6m || act.hot_java_files);
  const hotJavaTable = hotJava.length ? `
    <table class="rows-table"><thead><tr>
      <th>Class</th><th>Signal</th><th>Feature</th><th>Changes (6m)</th>
    </tr></thead><tbody>
    ${hotJava.slice(0, 12).map((f) => `<tr>
      <td class="mono-cell">${esc(shorten(f.file || '', 80))}</td>
      <td class="muted">${esc(shorten(f.signal || '', 100))}</td>
      <td>${f.feature_slug ? `<code>${esc(f.feature_slug)}</code>` : '<span class="muted">—</span>'}</td>
      <td><strong>${esc(f.changes)}</strong></td>
    </tr>`).join('')}
    </tbody></table>` : '';

  const deadCode = asList(act.dead_code_files);
  const deadCodeBlock = deadCode.length ? `
    <ul class="dead-list">
    ${deadCode.map((d) => `<li>
      <code>${esc(d.file)}</code>
      ${d.last_year_commits === 0 ? `<span class="pill pill-low">0 commits 12m</span>` : ''}
      <div class="muted">${esc(d.signal || d.note || '')}</div>
      ${d.action ? `<div class="muted"><strong>Action:</strong> ${esc(d.action)}</div>` : ''}
    </li>`).join('')}
    </ul>` : '<div class="muted">No dead code findings.</div>';

  const hotFeats = asList(act.hot_features);
  const activeJira = asList(act.active_jira_features);
  const enrichPrio = asList(act.enrichment_priority_from_signals);

  const sigCells = [
    { v: total ?? '—', l: 'Commits', h: 'last 12 months' },
    { v: avg ?? '—', l: 'Avg / month', h: `peak ${peakMonth || '?'}` },
    { v: months.length || '—', l: 'Months tracked', h: 'rolling window' },
    { v: humans ?? '—', l: 'Humans', h: 'unique contributors' },
    { v: bots ?? '—', l: 'Bots', h: 'CI / automation' },
    { v: hotFiles.length || '—', l: 'Hot files', h: 'most-modified' },
    { v: hotJava.length || '—', l: 'Hot Java', h: 'last 6m' },
    { v: deadCode.length || '—', l: 'Dead code', h: 'candidates' },
  ];

  return `
    <div class="panel-head"><div>
      <h1>Activity</h1>
      <p class="lede">Repo signals: commits over time, contributors, hot files, dead code candidates.</p>
    </div></div>

    <section class="exec-section exec-scale">
      <div class="exec-sig-grid">
        ${sigCells.map((c) => `
          <div class="exec-sig-cell">
            <div class="exec-sig-value">${esc(c.v)}</div>
            <div class="exec-sig-label">${esc(c.l)}</div>
            <div class="exec-sig-hint">${esc(c.h)}</div>
          </div>`).join('')}
      </div>
    </section>

    <section class="card">
      <div class="card-head"><h3>Commits per month — last 12 months</h3>${peakMonth ? `<span class="card-meta">peak ${peakMonth} · ${act.peak_commits} commits</span>` : ''}</div>
      <div class="card-body">${chart}</div>
    </section>

    <div class="grid-2">
      <section class="card"><div class="card-head"><h3>Top contributors</h3><span class="card-meta">${contribs.length}</span></div><div class="card-body">${contribTable}</div></section>
      <section class="card"><div class="card-head"><h3>Dead code candidates</h3><span class="card-meta">${deadCode.length}</span></div><div class="card-body">${deadCodeBlock}</div></section>
    </div>

    ${hotJavaTable ? `<section class="card"><div class="card-head"><h3>Hot Java classes — last 6 months</h3><span class="card-meta">${hotJava.length}</span></div><div class="card-body">${hotJavaTable}</div></section>` : ''}
    ${hotFilesTable ? `<section class="card"><div class="card-head"><h3>Hot files — last 12 months</h3><span class="card-meta">${hotFiles.length}</span></div><div class="card-body">${hotFilesTable}</div></section>` : ''}

    ${(hotFeats.length || activeJira.length) ? `<section class="card"><div class="card-head"><h3>Activity signals → corpus</h3></div><div class="card-body">
      ${hotFeats.length ? `<div class="kv-list" style="margin-bottom:14px"><dt>Hot features</dt><dd>${hotFeats.map((f) => `<code>${esc(f)}</code>`).join(' ')}</dd></div>` : ''}
      ${activeJira.length ? `<div class="kv-list" style="margin-bottom:14px"><dt>Active Jira</dt><dd>${activeJira.map((j) => `<code>${esc(j)}</code>`).join(' ')}</dd></div>` : ''}
      ${enrichPrio.length ? `<div class="kv-list"><dt>Priorities</dt><dd><ul class="exec-list">${enrichPrio.map((p) => `<li>${esc(typeof p === 'string' ? p : (p.note || JSON.stringify(p).slice(0, 100)))}</li>`).join('')}</ul></dd></div>` : ''}
    </div></section>` : ''}
  `;
}

// ----- Questions tab -------------------------------------------------
// "**closed** — Résolu le ..." → { status: 'closed', resolution: 'Résolu le ...' }
function splitStatusAndResolution(raw) {
  if (!raw) return { status: '', resolution: '' };
  let m = raw.match(/^\s*\*\*([^*]+)\*\*\s*(?:[—:-]\s*)?(.*)$/s);
  if (m) return { status: m[1].trim(), resolution: stripMd(m[2].trim()) };
  m = raw.match(/^\s*([A-Za-z_-]+)\s*[—:-]\s*(.*)$/s);
  if (m && m[2].trim()) return { status: m[1].trim(), resolution: stripMd(m[2].trim()) };
  return { status: stripMd(raw), resolution: '' };
}

function loadQuestions() {
  const out = { active: [], resolved: [], decisions: [] };

  // open-questions.md: ID | Question | Area | Why | Owner | Status (with embedded resolution)
  const oq = parseFrontmatter(corpus.questions.open || '');
  const oqTables = parseMdTables(oq.body);
  for (const t of oqTables) {
    for (const r of t.rows) {
      if (!r[0]) continue;
      const rawStatus = (r[5] || '').trim();
      const split = splitStatusAndResolution(rawStatus);
      const item = {
        kind: 'open',
        id: stripMd(r[0]),
        question: stripMd(r[1]),
        area: stripMd(r[2]),
        why: stripMd(r[3]),
        owner: stripMd(r[4]),
        status: split.status.toLowerCase(),
        resolution: split.resolution,
      };
      if (/closed|resolved/.test(item.status)) out.resolved.push(item);
      else out.active.push(item);
    }
  }

  // blocking-questions.md has 3 tables: Active / Asked and Answered / Deferred
  const bq = parseFrontmatter(corpus.questions.blocking || '');
  const bqSections = (bq.body || '').split(/^## /m);
  for (const sec of bqSections) {
    const head = sec.split('\n', 1)[0].toLowerCase();
    const tables = parseMdTables(sec);
    if (!tables.length) continue;
    const tableHeaders = tables[0].headers.map((h) => h.toLowerCase());
    const idxQ = tableHeaders.findIndex((h) => /need|question|decision/.test(h));
    const idxArea = tableHeaders.findIndex((h) => /area/.test(h));
    const idxWhy = tableHeaders.findIndex((h) => /why|matter/.test(h));
    const idxStatus = tableHeaders.findIndex((h) => /status/.test(h));
    const idxRes = tableHeaders.findIndex((h) => /resolution/.test(h));
    const idxOwner = tableHeaders.findIndex((h) => /owner|format/.test(h));
    for (const r of tables[0].rows) {
      if (!r[0] || !r[0].trim()) continue;
      const status = stripMd((idxStatus >= 0 ? r[idxStatus] : '') || '').toLowerCase();
      const item = {
        kind: 'blocking',
        id: stripMd(r[0]),
        question: idxQ >= 0 ? stripMd(r[idxQ]) : '',
        area: idxArea >= 0 ? stripMd(r[idxArea]) : '',
        why: idxWhy >= 0 ? stripMd(r[idxWhy]) : '',
        owner: idxOwner >= 0 ? stripMd(r[idxOwner]) : '',
        status,
        resolution: idxRes >= 0 ? stripMd(r[idxRes]) : '',
      };
      if (/answered|resolved|closed/.test(status) || /answered/.test(head) || item.resolution) {
        out.resolved.push(item);
      } else if (/deferred|blocked/.test(head)) {
        item.status = item.status || 'deferred';
        out.active.push(item);
      } else {
        out.active.push(item);
      }
    }
  }

  // decisions.md
  const dq = parseFrontmatter(corpus.questions.decisions || '');
  const dqTables = parseMdTables(dq.body);
  for (const t of dqTables) {
    const h = t.headers.map((x) => x.toLowerCase());
    if (!h.some((x) => /decision/.test(x))) continue;
    const idxQ = h.findIndex((x) => /decision/.test(x));
    const idxCtx = h.findIndex((x) => /context/.test(x));
    const idxOpt = h.findIndex((x) => /option/.test(x));
    const idxOwner = h.findIndex((x) => /owner/.test(x));
    const idxStatus = h.findIndex((x) => /status/.test(x));
    const idxDate = h.findIndex((x) => /target|date/.test(x));
    for (const r of t.rows) {
      if (!r[0] || !r[0].trim()) continue;
      const id = stripMd(r[0]);
      const question = idxQ >= 0 ? stripMd(r[idxQ]) : '';
      if (!question || question === 'unknown' || question === '—') continue;
      out.decisions.push({
        kind: 'decision',
        id,
        question,
        context: idxCtx >= 0 ? stripMd(r[idxCtx]) : '',
        options: idxOpt >= 0 ? stripMd(r[idxOpt]) : '',
        owner: idxOwner >= 0 ? stripMd(r[idxOwner]) : '',
        targetDate: idxDate >= 0 ? stripMd(r[idxDate]) : '',
        status: idxStatus >= 0 ? stripMd(r[idxStatus]).toLowerCase() : 'open',
      });
    }
  }

  return out;
}

function renderQuestions() {
  const q = loadQuestions();
  const activeCount = q.active.length;
  const resolvedCount = q.resolved.length;
  const decisionCount = q.decisions.length;

  if (!activeCount && !resolvedCount && !decisionCount) {
    return panelEmpty('Questions', 'No questions or decisions registered yet (open-questions.md / blocking-questions.md / OPEN_DECISIONS.md).');
  }

  function qCard(item) {
    const statusTone =
      /^open|to_ask|to-ask|asked|deferred/.test(item.status) ? (item.kind === 'blocking' ? 'low' : 'mid') :
      /^closed|resolved|answered|validated/.test(item.status) ? 'confirmed' :
      'unknown';
    const kindBadge =
      item.kind === 'blocking' ? '<span class="q-kind q-kind-blocking">blocking</span>' :
      item.kind === 'decision' ? '<span class="q-kind q-kind-decision">decision</span>' :
      '<span class="q-kind q-kind-open">open question</span>';
    return `
      <article class="q-card ${item.kind === 'blocking' && /^open|to_ask|asked/.test(item.status) ? 'q-card-active' : ''}">
        <header class="q-card-head">
          <span class="q-id">${esc(item.id)}</span>
          ${kindBadge}
          ${item.area ? `<span class="q-area">${esc(item.area)}</span>` : ''}
          <span class="pill pill-${statusTone}">${esc(item.status || 'open')}</span>
        </header>
        <h3 class="q-question">${esc(item.question)}</h3>
        ${item.why ? `<div class="q-row"><span class="q-row-k">Why</span><span class="q-row-v">${esc(item.why)}</span></div>` : ''}
        ${item.context ? `<div class="q-row"><span class="q-row-k">Context</span><span class="q-row-v">${esc(item.context)}</span></div>` : ''}
        ${item.options && item.options !== 'unknown' ? `<div class="q-row"><span class="q-row-k">Options</span><span class="q-row-v">${esc(item.options)}</span></div>` : ''}
        ${item.resolution ? `<div class="q-row q-row-res"><span class="q-row-k">Resolution</span><span class="q-row-v">${esc(item.resolution)}</span></div>` : ''}
        <footer class="q-foot">
          ${item.owner && item.owner !== 'unknown' ? `<span class="q-meta"><span class="q-meta-k">owner</span> ${esc(item.owner)}</span>` : ''}
          ${item.targetDate && item.targetDate !== 'unknown' ? `<span class="q-meta"><span class="q-meta-k">target</span> ${esc(item.targetDate)}</span>` : ''}
        </footer>
      </article>`;
  }

  // Sort: blocking first, then open
  q.active.sort((a, b) => (a.kind === 'blocking' ? 0 : 1) - (b.kind === 'blocking' ? 0 : 1));

  return `
    <div class="panel-head">
      <div>
        <h1>Questions &amp; decisions</h1>
        <p class="lede">Open questions awaiting answers, blocking items that gate corpus coverage, and team decisions not yet validated.</p>
      </div>
      <div class="panel-head-meta">
        <span class="kv-inline"><span class="k">Active</span><span class="v">${activeCount}</span></span>
        <span class="kv-inline"><span class="k">Decisions</span><span class="v">${decisionCount}</span></span>
        <span class="kv-inline"><span class="k">Resolved</span><span class="v">${resolvedCount}</span></span>
      </div>
    </div>

    ${activeCount ? `<section class="card"><div class="card-head"><h3>Active</h3><span class="card-meta">${activeCount} need answers</span></div><div class="card-body q-grid">${q.active.map(qCard).join('')}</div></section>` : ''}
    ${decisionCount ? `<section class="card"><div class="card-head"><h3>Open decisions</h3><span class="card-meta">${decisionCount} awaiting confirmation</span></div><div class="card-body q-grid">${q.decisions.map(qCard).join('')}</div></section>` : ''}
    ${resolvedCount ? `<section class="card q-resolved-card"><div class="card-head"><h3>Resolved</h3><span class="card-meta">${resolvedCount} closed · history</span></div><div class="card-body"><details class="prose-fold"><summary>Show resolved (${resolvedCount})</summary><div class="q-grid" style="margin-top:14px;">${q.resolved.map(qCard).join('')}</div></details></div></section>` : ''}
  `;
}

// ----- Impact map tab -----------------------------------------------
// Builds: prod issues  ──>  features  ──>  modules
function buildImpactData() {
  // sources
  const bugs = corpus.prod.bugs || [];
  const risks = corpus.prod.risks || [];
  const watch = corpus.prod.watchlist || [];
  const features = corpus.features || [];
  const modules = asList(corpus.logical_boundaries?.modules);
  const candidates = asList(corpus.feature_candidates?.candidates);
  const gEdges = asList(corpus.graph.edges?.graph?.edges || corpus.graph.edges?.edges);

  // Normalize prod items — drop resolved (they don't belong in the active impact view)
  const prodItems = [];
  for (const b of bugs) {
    if (/resolved|fixed|closed/i.test(b.meta?.status || '')) continue;
    prodItems.push(makeProdItem(b, 'bug'));
  }
  for (const r of risks) {
    if (/resolved|fixed|closed|accepted/i.test(r.meta?.status || '')) continue;
    prodItems.push(makeProdItem(r, 'risk'));
  }
  for (const w of watch) prodItems.push(makeProdItem(w, 'watch'));
  function makeProdItem(it, kind) {
    const m = it.meta || {};
    let id = m.id;
    if (!id) {
      const sm = it.slug.match(/^([A-Z]+-\d+(?:-[A-Z]+-\d+)?)/);
      id = sm ? sm[1] : it.slug.toUpperCase();
    }
    let title = it.title || m.title || it.slug;
    title = title.replace(/^[A-Z]+-\d+(-[A-Za-z0-9]+)*\s*[—:-]\s*/, '');
    const sev = String(m.severity || m.impact || (m.status === 'resolved' ? 'resolved' : 'medium')).toLowerCase();
    return {
      domId: 'prod-' + id.toLowerCase(),
      id, kind, title,
      severity: sev,
      status: m.status,
      source: m.source,
      lastValidated: m.last_validated,
      meta: m,
      bodyRaw: it.body || '',
      bodyText: (it.body || '').toLowerCase(),
      relatedFeatures: asList(m.related_features),
      slug: it.slug,
    };
  }

  // Sort prod items: severity DESC then kind
  const sevRank = { critical: 0, high: 1, medium: 2, low: 3, unknown: 4, resolved: 5 };
  prodItems.sort((a, b) => (sevRank[a.severity] ?? 9) - (sevRank[b.severity] ?? 9));


  // Normalize features (use either documented features or candidates as canonical list)
  const featBySlug = {};
  for (const f of features) {
    featBySlug[f.slug] = {
      domId: 'feat-' + f.slug,
      slug: f.slug,
      title: f.title?.replace(/^[A-Za-z0-9-]+\s*[—:-]\s*/, '') || f.slug,
      // `criticality` is canonical (SKILL.md actionable/brick-inventory);
      // `priority` kept as legacy support for pre-tightening corpora.
      priority: String(f.meta?.criticality || f.meta?.priority || '').toLowerCase(),
      module: null, // resolved from candidates below
      meta: f.meta || {},
      bodyRaw: f.body || '',
      summary: f.summary || '',
    };
  }
  // enrich from candidates (module)
  for (const c of candidates) {
    if (!c.slug || !featBySlug[c.slug]) continue;
    if (c.module) featBySlug[c.slug].module = c.module;
    if (!featBySlug[c.slug].priority && c.priority) featBySlug[c.slug].priority = String(c.priority).toLowerCase();
  }
  const featureList = Object.values(featBySlug);

  // Normalize modules
  const moduleList = modules.map((m) => ({
    domId: 'mod-' + (m.id || m.name).toLowerCase().replace(/[^a-z0-9]/g, '-'),
    id: m.id || m.name,
    role: m.role,
    description: m.description,
    tech: asList(m.tech),
    dependsOn: asList(m.depends_on),
    layer: m.layer,
  }));
  const modById = Object.fromEntries(moduleList.map((m) => [m.id, m]));

  // Build prod → feature edges
  const edges_pf = new Set(); // "prodDomId|featureDomId"
  // From explicit graph edges
  for (const e of gEdges) {
    const from = String(e.from || '').toLowerCase();
    const to = String(e.to || '').toLowerCase();
    if (from.startsWith('prod:') && to.startsWith('feature:')) {
      const pid = from.replace('prod:', '').replace(/-(kafka|archive|cloud)$/, '').toUpperCase().replace(/^(BUG|RISK|WATCH)/, (m) => m.toUpperCase());
      // Try to find matching prod item by id
      const pi = prodItems.find((p) => p.id.toLowerCase().includes(from.replace('prod:', '').split('-').slice(0, 2).join('-')));
      const fslug = to.replace('feature:', '');
      const ff = featBySlug[fslug];
      if (pi && ff) edges_pf.add(pi.domId + '|' + ff.domId);
    }
  }
  // From related_features in watch frontmatter
  for (const p of prodItems) {
    for (const slug of p.relatedFeatures) {
      const ff = featBySlug[slug];
      if (ff) edges_pf.add(p.domId + '|' + ff.domId);
    }
  }
  // Fallback: body slug mention — but only in the first 1500 chars and only with word boundaries
  // (avoids false positives where a long slug substring appears incidentally)
  for (const p of prodItems) {
    const head = p.bodyText.slice(0, 1500);
    for (const f of featureList) {
      // bound by non-letter chars to count as a real mention
      const re = new RegExp('(^|[^a-z0-9-])' + f.slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^a-z0-9-])', 'i');
      if (re.test(head)) edges_pf.add(p.domId + '|' + f.domId);
    }
  }

  // Build feature → module edges
  const edges_fm = new Set();
  for (const f of featureList) {
    if (f.module && modById[f.module]) {
      edges_fm.add(f.domId + '|' + modById[f.module].domId);
    }
  }

  // Compute counts for each side
  for (const p of prodItems) {
    p.affectsCount = [...edges_pf].filter((k) => k.startsWith(p.domId + '|')).length;
  }
  for (const f of featureList) {
    f.bugsCount = [...edges_pf].filter((k) => k.endsWith('|' + f.domId)).length;
  }
  for (const m of moduleList) {
    m.featuresCount = [...edges_fm].filter((k) => k.endsWith('|' + m.domId)).length;
    // module load = sum of bugsCount of its features
    const featsInMod = featureList.filter((f) => f.module === m.id);
    m.bugsCount = featsInMod.reduce((a, f) => a + (f.bugsCount || 0), 0);
  }

  return {
    prodItems,
    features: featureList,
    modules: moduleList,
    edges_pf: [...edges_pf],
    edges_fm: [...edges_fm],
  };
}

function renderImpactMap() {
  const d = buildImpactData();
  const prodCount = d.prodItems.length;
  const featCount = d.features.length;
  const modCount = d.modules.length;

  // Split linked vs orphan prod items; linked first
  const linkedProd = d.prodItems.filter((p) => p.affectsCount > 0);
  const orphanProd = d.prodItems.filter((p) => p.affectsCount === 0);
  const prodCard = (p, orphan = false) => {
    const tone = severityTone(p.severity);
    return `
      <article class="im-card im-prod ${orphan ? 'im-orphan' : ''}" data-id="${p.domId}" data-sev="${p.severity}" title="${esc(p.title)}">
        <div class="im-card-row">
          <span class="im-card-id">${esc(p.id)}</span>
          <span class="pill pill-${tone}">${esc(p.severity)}</span>
        </div>
        <div class="im-card-title">${esc(shorten(p.title, 70))}</div>
        <div class="im-card-foot muted">${esc(p.kind)}${orphan ? ' · <span class="im-orphan-tag">no mapped feature</span>' : ` · <strong>${p.affectsCount}</strong> feature${p.affectsCount > 1 ? 's' : ''}`}</div>
      </article>`;
  };
  const prodCards = linkedProd.map((p) => prodCard(p, false)).join('') +
    (orphanProd.length ? `<div class="im-divider">${orphanProd.length} unmapped · platform-wide or infra</div>` + orphanProd.map((p) => prodCard(p, true)).join('') : '');

  // Sort features by load DESC, then priority rank, then slug
  const prRank = { critical: 0, high: 1, medium: 2, low: 3, '': 4, unknown: 4 };
  const featsSorted = [...d.features].sort((a, b) =>
    (b.bugsCount || 0) - (a.bugsCount || 0)
    || (prRank[a.priority] ?? 9) - (prRank[b.priority] ?? 9)
    || a.slug.localeCompare(b.slug)
  );
  const featCards = featsSorted.map((f) => {
    const tone = /critical|high/.test(f.priority) ? 'low' : /medium/.test(f.priority) ? 'mid' : 'unknown';
    const loadCls = f.bugsCount >= 3 ? 'im-card-hot' : f.bugsCount >= 1 ? 'im-card-warm' : 'im-quiet';
    const noMod = !f.module;
    return `
      <article class="im-card im-feat ${loadCls}" data-id="${f.domId}" data-sev="${f.priority}" title="${esc(f.title)}">
        <div class="im-card-row">
          <span class="im-card-id">${esc(f.slug)}</span>
          ${f.priority ? `<span class="pill pill-${tone}">${esc(f.priority)}</span>` : ''}
        </div>
        <div class="im-card-title">${esc(shorten(f.title, 60))}</div>
        <div class="im-card-foot muted">${f.bugsCount ? `<strong class="im-load">${f.bugsCount} prod hit${f.bugsCount > 1 ? 's' : ''}</strong>` : '<span class="muted">no prod hit</span>'}${f.module ? ` · ${esc(f.module)}` : (noMod ? ` · <span class="im-orphan-tag">no module</span>` : '')}</div>
      </article>`;
  }).join('');

  // Sort modules by accumulated bug count DESC, then by id
  const modsSorted = [...d.modules].sort((a, b) =>
    (b.bugsCount || 0) - (a.bugsCount || 0)
    || (b.featuresCount || 0) - (a.featuresCount || 0)
    || a.id.localeCompare(b.id)
  );
  const modCards = modsSorted.map((m) => {
    const loadCls = m.bugsCount >= 5 ? 'im-card-hot' : m.bugsCount >= 1 ? 'im-card-warm' : 'im-quiet';
    return `
      <article class="im-card im-mod ${loadCls}" data-id="${m.domId}" title="${esc(m.id)}">
        <div class="im-card-row">
          <span class="im-card-id">${esc(m.id)}</span>
          ${m.bugsCount ? `<span class="pill pill-low">${m.bugsCount}</span>` : '<span class="pill pill-empty">0</span>'}
        </div>
        <div class="im-card-title">${esc(m.role || '—')}</div>
        <div class="im-card-foot muted">${m.featuresCount} feature${m.featuresCount > 1 ? 's' : ''} · ${m.bugsCount} accumulated hit${m.bugsCount > 1 ? 's' : ''}</div>
      </article>`;
  }).join('');

  // Hot summary (manager-friendly headline)
  const topMod = modsSorted[0];
  const topFeat = featsSorted[0];
  const headlineParts = [];
  if (topMod && topMod.bugsCount > 0) headlineParts.push(`<code>${esc(topMod.id)}</code> cumulates <strong>${topMod.bugsCount}</strong> hit${topMod.bugsCount > 1 ? 's' : ''}`);
  if (topFeat && topFeat.bugsCount > 0) headlineParts.push(`<code>${esc(topFeat.slug)}</code> takes <strong>${topFeat.bugsCount}</strong> of them`);
  if (orphanProd.length) headlineParts.push(`<strong>${orphanProd.length}</strong> platform-wide or unmapped`);
  const headline = headlineParts.length ? headlineParts.join(' · ') : 'No active production hits mapped to features.';

  return `
    <div class="panel-head">
      <div>
        <h1>Hotspots</h1>
        <p class="lede">How active production issues propagate through features into code modules. Click any card to isolate its chain.</p>
        <p class="im-headline">${headline}</p>
      </div>
      <div class="panel-head-meta">
        <span class="kv-inline"><span class="k">Active</span><span class="v">${prodCount}</span></span>
        <span class="kv-inline"><span class="k">Features</span><span class="v">${featCount}</span></span>
        <span class="kv-inline"><span class="k">Modules</span><span class="v">${modCount}</span></span>
        <span class="kv-inline"><span class="k">Links</span><span class="v">${d.edges_pf.length + d.edges_fm.length}</span></span>
      </div>
    </div>
    <div class="im-legend">
      <span class="im-legend-kicker">SEVERITY</span>
      <span class="im-legend-item"><span class="im-legend-dot" style="background:#ef6a67"></span>critical</span>
      <span class="im-legend-item"><span class="im-legend-dot" style="background:#ff8e4d"></span>high</span>
      <span class="im-legend-item"><span class="im-legend-dot" style="background:#f3b35a"></span>medium</span>
      <span class="im-legend-item"><span class="im-legend-dot" style="background:#8c7bff"></span>low / unknown</span>
      <span class="im-legend-sep">·</span>
      <span class="im-legend-kicker">LOAD</span>
      <span class="im-legend-item"><span class="im-legend-bar im-card-hot"></span>≥3 prod hits</span>
      <span class="im-legend-item"><span class="im-legend-bar im-card-warm"></span>1-2 hits</span>
    </div>
    <div class="im-wrap" id="impact-wrap">
      <svg class="im-svg" id="impact-svg" aria-hidden="true"></svg>
      <div class="im-col">
        <header class="im-col-head"><span class="im-col-kicker">PRODUCTION ISSUES</span><span class="im-col-count">${prodCount}</span></header>
        <div class="im-col-body">${prodCards || '<div class="muted">No prod issues.</div>'}</div>
      </div>
      <div class="im-col">
        <header class="im-col-head"><span class="im-col-kicker">FEATURES</span><span class="im-col-count">${featCount}</span></header>
        <div class="im-col-body">${featCards || '<div class="muted">No features.</div>'}</div>
      </div>
      <div class="im-col">
        <header class="im-col-head"><span class="im-col-kicker">MODULES</span><span class="im-col-count">${modCount}</span></header>
        <div class="im-col-body">${modCards || '<div class="muted">No modules.</div>'}</div>
      </div>
      <button class="im-clear" id="impact-clear" hidden>Clear selection ×</button>
    </div>
    <aside class="im-popin" id="impact-popin" hidden aria-live="polite"></aside>
    <p class="muted im-hint">Lines are colored by source severity. Modules accumulate every prod hit from features that live in them. <code>_graph/edges.yaml</code> + slug cross-references.</p>
  `;
}

// =====================================================================
// Assemble HTML
// =====================================================================
function buildHtml() {
  // CSS is inlined at build time — no sidecar dependency.
  const css = INLINED_CSS;
  const sourceCoverageById = new Map(asList(corpus.source_coverage?.coverage).map((entry) => [entry.source_id, entry]));
  const customCss = `
/* ---- additions for new tabs (server-rendered) ---- */
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin: 18px 0; }
@media (max-width: 1100px) { .grid-2 { grid-template-columns: 1fr; } }
.card-body { padding: 16px 18px; }
.card-body.prose h3, .card-body.prose h4 { margin: 18px 0 8px; }
.card-body.prose p { margin: 6px 0; color: var(--fg-2); }
.card-body.prose ul { margin: 6px 0 6px 18px; color: var(--fg-2); }
.card-body.prose li { margin: 3px 0; }
.kv-list { display: grid; grid-template-columns: 180px 1fr; gap: 8px 18px; margin: 0; }
.kv-list dt { color: var(--fg-4); font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em; font-weight: 600; padding-top: 2px; }
.kv-list dd { margin: 0; color: var(--fg); font-size: 13px; }
.rows-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.rows-table th { text-align: left; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--fg-4); border-bottom: 1px solid var(--line); padding: 8px 10px 6px; font-weight: 600; }
.rows-table td { padding: 9px 10px; border-bottom: 1px solid var(--line-soft); color: var(--fg-2); vertical-align: top; }
.rows-table tbody tr:hover { background: rgba(255,255,255,0.018); }
.rows-table td strong { color: var(--fg); font-weight: 600; }
.rows-table td .muted { font-size: 11.5px; margin-top: 3px; }
.pill { display: inline-flex; align-items: center; gap: 5px; height: 18px; padding: 0 8px; border-radius: 999px; font-size: 10.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; border: 1px solid transparent; }
.pill-confirmed { background: rgba(65,214,128,0.12); color: var(--good); border-color: rgba(65,214,128,0.3); }
.pill-active { background: rgba(110,209,188,0.12); color: var(--active); border-color: rgba(110,209,188,0.3); }
.pill-partial { background: rgba(243,179,90,0.12); color: var(--partial); border-color: rgba(243,179,90,0.3); }
.pill-empty { background: rgba(72,81,101,0.18); color: var(--fg-3); border-color: var(--line-2); }
.pill-unknown { background: rgba(140,123,255,0.12); color: var(--accent-hi); border-color: rgba(140,123,255,0.3); }
.pill-low { background: rgba(239,106,103,0.12); color: var(--low); border-color: rgba(239,106,103,0.3); }
.pill-mid { background: rgba(243,179,90,0.12); color: var(--mid); border-color: rgba(243,179,90,0.3); }
.feat-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
.feat-card { background: var(--bg-1); border: 1px solid var(--line); border-radius: var(--radius); padding: 16px; display: flex; flex-direction: column; gap: 10px; transition: border-color 0.15s var(--ease), transform 0.15s var(--ease); }
.feat-card:hover { border-color: var(--line-2); transform: translateY(-1px); }
.feat-card-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.feat-card-slug { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10.5px; color: var(--fg-4); letter-spacing: 0.05em; }
.feat-card-title { margin: 0; font-size: 14.5px; font-weight: 600; color: var(--fg); letter-spacing: -0.01em; line-height: 1.3; text-transform: none; }
.feat-card-sum { margin: 0; font-size: 12.5px; color: var(--fg-3); line-height: 1.55; }
.feat-card-meta { display: flex; flex-direction: column; gap: 4px; margin-top: auto; padding-top: 10px; border-top: 1px solid var(--line-soft); }
.feat-card-meta .kv-inline { font-size: 11px; }
.feat-card-stub { opacity: 0.55; }
.feat-card-stub:hover { opacity: 0.85; }
.feat-card-stub .feat-card-title { color: var(--fg-3); font-weight: 500; }
.feat-status { display: inline-block; font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; padding: 2px 7px; border-radius: 999px; }
.feat-status-active { background: rgba(65,214,128,0.12); color: var(--good); border: 1px solid rgba(65,214,128,0.3); }
.feat-status-documented { background: rgba(110,209,188,0.12); color: var(--active); border: 1px solid rgba(110,209,188,0.3); }
.feat-status-candidate { background: rgba(140,123,255,0.12); color: var(--accent-hi); border: 1px solid rgba(140,123,255,0.3); }
.feat-status-stub { background: rgba(72,81,101,0.18); color: var(--fg-4); border: 1px solid var(--line-2); }
/* Code tab — inline stat strip in place of the panel lede */
.code-lede-stats { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px 14px; margin-top: 8px; }
.code-stat { display: inline-flex; align-items: baseline; gap: 6px; }
.code-stat-v { font-size: 18px; font-weight: 700; color: var(--fg); font-variant-numeric: tabular-nums; letter-spacing: -0.015em; }
.code-stat-l { font-size: 11.5px; color: var(--fg-3); text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; }
.code-stat-sep { color: var(--fg-5); font-size: 14px; line-height: 1; }
/* Domain ER diagram inside the drawer */
.dd-svg { background: radial-gradient(700px 280px at 50% 50%, rgba(140,123,255,0.05), transparent 70%); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 8px; margin-bottom: 16px; overflow-x: auto; }
.dd-svg svg { width: 100%; height: auto; display: block; }
.der-diagram { font-family: ui-sans-serif, system-ui, sans-serif; }
.der-ent rect { transition: fill 0.15s var(--ease); }
.der-ent:hover rect { fill: rgba(140,123,255,0.08); }
.mat-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }
.mat-cell { background: var(--bg-2); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 10px; }
.mat-cell-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--fg-4); font-weight: 600; }
.mat-cell-value { font-size: 22px; font-weight: 600; color: var(--accent-hi); margin: 4px 0 6px; font-variant-numeric: tabular-nums; }
.mat-cell-note { font-size: 11px; color: var(--fg-3); }
.idx-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; }
.idx-card { background: var(--bg-1); border: 1px solid var(--line); border-radius: var(--radius); padding: 14px; display: flex; flex-direction: column; gap: 8px; }
.idx-card header { display: flex; justify-content: space-between; align-items: center; }
.idx-preview { margin: 0; padding: 0; list-style: none; font-size: 11.5px; color: var(--fg-3); display: flex; flex-direction: column; gap: 4px; }
.idx-preview li { line-height: 1.5; }
.idx-card footer { font-size: 10.5px; margin-top: auto; padding-top: 8px; border-top: 1px solid var(--line-soft); }
.exec-section .card { box-shadow: none; }
.card-subtitle { margin: 16px 0 6px; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--fg-3); font-weight: 600; }
.contrib-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
.contrib-list li { display: grid; grid-template-columns: 1fr auto auto; gap: 12px; align-items: center; padding: 4px 0; border-bottom: 1px solid var(--line-soft); }
.contrib-mail { color: var(--fg-2); font-size: 11px; }
.contrib-count { font-variant-numeric: tabular-nums; color: var(--accent-hi); font-weight: 600; }
.contrib-role { font-size: 10.5px; }
.brick-totals { display: grid; grid-template-columns: repeat(auto-fit, minmax(70px, 1fr)); gap: 8px; margin-bottom: 10px; }
.brick-total { background: var(--bg-2); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 10px 8px; display: flex; flex-direction: column; align-items: center; gap: 2px; }
.brick-total-v { font-size: 20px; font-weight: 600; color: var(--fg); font-variant-numeric: tabular-nums; line-height: 1; }
.brick-total-l { font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--fg-4); font-weight: 600; }
.brick-total.brick-total-low .brick-total-v { color: var(--low); }
.brick-total.brick-total-mid .brick-total-v { color: var(--mid); }
.brick-total.brick-total-unknown .brick-total-v { color: var(--fg-3); }
.mat-cell-good .mat-cell-value { color: var(--good); }
.mat-cell-mid .mat-cell-value { color: var(--mid); }
.mat-cell-low .mat-cell-value { color: var(--low); }
.mat-cell-max { font-size: 11px; font-weight: 500; color: var(--fg-4); margin-left: 2px; }
.mat-cell-tag { display: inline-block; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--fg-3); background: var(--bg-3); border: 1px solid var(--line); padding: 2px 6px; border-radius: 4px; margin: 2px 0 6px; font-weight: 600; }
.mat-grid { grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); }
.mat-composite { display: inline-flex; flex-direction: column; }
.mat-composite-v { font-size: 22px; font-weight: 600; color: var(--accent-hi); }
.ctx-wrap { padding: 0; background: radial-gradient(900px 380px at 50% 50%, rgba(140,123,255,0.06), transparent 70%); }
.ctx-diagram { width: 100%; height: auto; display: block; }
.ctx-node-clickable { cursor: pointer; transition: filter 0.15s var(--ease); outline: none; }
.ctx-node-clickable:hover rect { stroke-width: 2; filter: brightness(1.15); }
.ctx-node-clickable:hover { filter: drop-shadow(0 0 6px rgba(140,123,255,0.45)); }
.ctx-node-clickable:focus-visible rect { stroke-width: 2; }
.ctx-node-clickable:focus-visible { filter: drop-shadow(0 0 4px var(--accent)); }
/* Architecture KPI strip — sits above the SI map */
.arch-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: var(--line); border: 1px solid var(--line); border-radius: var(--radius-sm); margin: 14px 14px 0; overflow: hidden; }
@media (max-width: 800px) { .arch-kpis { grid-template-columns: repeat(2, 1fr); } }
.arch-kpi { background: var(--bg-1); padding: 14px 18px; display: flex; flex-direction: column; gap: 2px; }
.arch-kpi-v { font-size: 28px; font-weight: 700; color: var(--fg); line-height: 1.05; font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
.arch-kpi-v.kpi-warn { color: var(--accent-3); }
.arch-kpi-unit { font-size: 16px; font-weight: 500; color: var(--fg-4); margin-left: 2px; }
.arch-kpi-l { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--fg-3); font-weight: 600; margin-top: 4px; }
.arch-kpi-sub { font-size: 11.5px; color: var(--fg-4); margin-top: 1px; }
/* Protocol mix bar + legend */
.arch-proto { margin: 14px 14px 0; }
.arch-proto-bar { display: flex; height: 10px; border-radius: 999px; overflow: hidden; background: var(--bg-3); border: 1px solid var(--line); box-shadow: inset 0 1px 2px rgba(0,0,0,0.3); }
.arch-proto-seg { display: block; transition: filter 0.15s; }
.arch-proto-seg:hover { filter: brightness(1.4); cursor: help; }
.arch-proto-legend { display: flex; flex-wrap: wrap; gap: 4px 16px; margin-top: 10px; font-size: 11.5px; color: var(--fg-3); }
.arch-proto-item { display: inline-flex; align-items: center; gap: 6px; }
.arch-proto-dot { width: 8px; height: 8px; border-radius: 2px; display: inline-block; }
.arch-proto-n { color: var(--fg-2); font-weight: 600; font-variant-numeric: tabular-nums; }
/* Confidence chip — used in Integrations table; matches dashed-arrow semantic in SVG */
.conf-chip { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 10.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; border: 1px solid var(--line-2); background: var(--bg-2); color: var(--fg-2); }
.conf-chip.conf-confirmed { color: #4fd9c8; border-color: rgba(79,217,200,0.35); background: rgba(79,217,200,0.07); }
.conf-chip.conf-probable { color: #f5b860; border-color: rgba(245,184,96,0.35); background: rgba(245,184,96,0.07); }
.conf-chip.conf-unknown { color: var(--fg-4); border-color: var(--line-2); }
/* Modules — card grid (replaces the old rows table) */
.mod-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; }
.mod-card { background: var(--bg-1); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 14px 16px; display: flex; flex-direction: column; gap: 8px; transition: border-color 0.15s var(--ease), transform 0.15s var(--ease); }
.mod-card:hover { border-color: var(--line-3); transform: translateY(-1px); }
.mod-card-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.mod-card-name { margin: 0; font-size: 14px; font-weight: 600; color: var(--fg); letter-spacing: -0.005em; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.mod-card-role { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--accent-hi); font-weight: 600; padding: 2px 8px; background: rgba(140,123,255,0.1); border-radius: 999px; }
.mod-card-desc { margin: 0; font-size: 12.5px; line-height: 1.55; color: var(--fg-3); }
.mod-card-foot { display: flex; flex-direction: column; gap: 6px; margin-top: auto; padding-top: 10px; border-top: 1px solid var(--line-soft); }
.mod-card-row { display: flex; align-items: baseline; gap: 10px; font-size: 11.5px; }
.mod-card-k { font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--fg-4); font-weight: 600; min-width: 70px; flex-shrink: 0; }
.mod-card-v { display: flex; flex-wrap: wrap; gap: 4px; }
/* Modules × Layers compact block */
.ml-list { display: flex; flex-direction: column; gap: 1px; background: var(--line); border: 1px solid var(--line); border-radius: var(--radius-sm); overflow: hidden; }
.ml-row { display: grid; grid-template-columns: 200px 1fr 1fr; gap: 14px; padding: 10px 14px; background: var(--bg-1); align-items: baseline; }
@media (max-width: 980px) { .ml-row { grid-template-columns: 1fr; gap: 6px; } }
.ml-row-name { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.ml-row-mod { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; font-weight: 600; color: var(--fg); }
.ml-row-role { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--accent-hi); font-weight: 600; }
.ml-row-layers { display: flex; flex-wrap: wrap; gap: 4px; }
.ml-layer { display: inline-block; padding: 2px 7px; font-size: 10.5px; font-weight: 600; color: var(--fg-2); background: var(--bg-2); border: 1px solid var(--line-2); border-radius: 4px; letter-spacing: 0.02em; }
.ml-no-layers { font-size: 11px; }
.ml-row-desc { font-size: 11.5px; color: var(--fg-3); line-height: 1.45; }
.ml-row-deps { grid-column: 2 / -1; display: inline-flex; align-items: baseline; flex-wrap: wrap; gap: 6px; font-size: 10.5px; padding-top: 2px; }
.ml-deps-k { font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--fg-4); font-weight: 600; }
.ml-row-orphans { opacity: 0.7; }
/* REST endpoint cell — method pill + monospace path */
.ep-stack { display: flex; flex-direction: column; gap: 4px; }
.ep-row { display: flex; align-items: center; gap: 8px; font-size: 11.5px; }
.ep-method { display: inline-block; font-size: 9.5px; font-weight: 700; letter-spacing: 0.05em; padding: 2px 6px; border-radius: 3px; min-width: 38px; text-align: center; font-family: ui-sans-serif, system-ui; }
.ep-method.ep-get { background: rgba(74,222,128,0.12); color: #4ade80; border: 1px solid rgba(74,222,128,0.3); }
.ep-method.ep-post { background: rgba(245,184,96,0.12); color: #f5b860; border: 1px solid rgba(245,184,96,0.3); }
.ep-method.ep-put { background: rgba(140,123,255,0.12); color: var(--accent-hi); border: 1px solid rgba(140,123,255,0.3); }
.ep-method.ep-delete { background: rgba(239,111,108,0.12); color: #ef6f6c; border: 1px solid rgba(239,111,108,0.3); }
.ep-path { background: var(--bg-3); border: 1px solid var(--line); padding: 1px 6px; border-radius: 3px; font-size: 11px; color: var(--fg-2); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; word-break: break-all; }
.ep-more { font-size: 10.5px; color: var(--fg-4); padding-left: 46px; margin-top: 2px; }
.ep-more code { background: var(--bg-2); border: 1px solid var(--line); padding: 1px 5px; border-radius: 3px; font-size: 10px; color: var(--fg-2); }
/* API catalog card — collapsible controller sections */
.api-cat-summary { font-size: 11.5px; margin: 0 0 12px; }
.api-ctrl { border: 1px solid var(--line); border-radius: var(--radius-sm); margin-bottom: 8px; background: var(--bg-1); overflow: hidden; }
.api-ctrl-sum { cursor: pointer; padding: 10px 14px; display: flex; align-items: center; justify-content: space-between; gap: 12px; list-style: none; font-size: 12.5px; }
.api-ctrl-sum::-webkit-details-marker { display: none; }
.api-ctrl-sum::before { content: '▸'; color: var(--fg-4); font-size: 10px; transition: transform 0.15s var(--ease); display: inline-block; margin-right: 6px; }
.api-ctrl[open] .api-ctrl-sum::before { transform: rotate(90deg); }
.api-ctrl-name { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 600; color: var(--fg); flex: 1; }
.api-ctrl-count { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--fg-4); font-weight: 600; }
.api-ctrl-body { padding: 4px 14px 12px; border-top: 1px solid var(--line-soft); }
.api-ctrl-table { font-size: 11.5px; }
.api-ctrl-table th { padding: 8px 8px 6px; }
.api-ctrl-table td { padding: 6px 8px; }
.api-ctrl-table .mono-cell { padding: 5px 8px; }
.api-ctrl-table code.ep-path { padding: 2px 6px; }
/* Data sources — big cards + inline expand */
.ds-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; margin-top: 18px; }
.ds-card { all: unset; box-sizing: border-box; cursor: pointer; padding: 22px 22px 20px; background: var(--bg-1); border: 1px solid var(--line); border-radius: var(--radius); display: flex; flex-direction: column; gap: 6px; transition: border-color 0.15s var(--ease), transform 0.15s var(--ease), box-shadow 0.15s var(--ease); position: relative; overflow: hidden; }
.ds-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: var(--ds-accent, var(--accent)); opacity: 0.7; }
.ds-card:hover { border-color: var(--ds-accent, var(--line-3)); transform: translateY(-2px); box-shadow: 0 4px 12px -4px rgba(0,0,0,0.4); }
.ds-card:focus-visible { outline: 2px solid var(--ds-accent, var(--accent)); outline-offset: 2px; }
.ds-card.active { border-color: var(--ds-accent, var(--accent)); box-shadow: 0 0 0 2px color-mix(in srgb, var(--ds-accent, var(--accent)) 25%, transparent); }
.ds-card-kind { font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--ds-accent, var(--accent-hi)); font-weight: 700; }
.ds-card-name { font-size: 20px; font-weight: 600; color: var(--fg); letter-spacing: -0.018em; line-height: 1.2; }
.ds-card-tbl { font-size: 12.5px; color: var(--fg-3); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.ds-card-foot { margin-top: 10px; padding-top: 12px; border-top: 1px solid var(--line-soft); font-size: 11px; color: var(--fg-4); text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; }
.ds-card-count { color: var(--fg-2); font-size: 13px; font-variant-numeric: tabular-nums; }
.ds-detail { margin-top: 18px; padding: 18px 20px; background: var(--bg-1); border: 1px solid var(--line); border-radius: var(--radius-sm); border-left: 3px solid var(--ds-accent, var(--accent)); animation: panelIn 0.22s var(--ease-out); }
.ds-detail-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 14px; padding-bottom: 12px; border-bottom: 1px solid var(--line-soft); }
.ds-detail-head h3 { margin: 0; font-size: 15px; font-weight: 600; color: var(--fg); letter-spacing: -0.012em; text-transform: none; }
.ds-detail-head h3 code { font-size: 12.5px; color: var(--fg-3); margin-left: 6px; }
.ds-detail-close { all: unset; cursor: pointer; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--fg-4); font-weight: 600; padding: 4px 8px; border-radius: 4px; transition: color 0.15s var(--ease), background 0.15s var(--ease); }
.ds-detail-close:hover { color: var(--fg-2); background: var(--bg-2); }
.ds-detail-svg { background: radial-gradient(700px 280px at 50% 50%, color-mix(in srgb, var(--ds-accent, var(--accent)) 8%, transparent), transparent 70%); border: 1px solid var(--line); border-radius: var(--radius-xs); padding: 8px; margin-bottom: 16px; overflow-x: auto; }
.ds-detail-svg svg { width: 100%; height: auto; display: block; }
.ds-detail-body { margin-top: 14px; }
.ctx-node:hover rect { filter: brightness(1.2); }
.proto-chip { display: inline-flex; align-items: center; height: 18px; padding: 0 8px; border-radius: 999px; font-size: 10px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--p); border: 1px solid var(--p); background: rgba(255,255,255,0.02); margin-right: 6px; }
.dir-pill { font-size: 10.5px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; padding: 2px 8px; border-radius: 999px; }
.dir-in { color: var(--accent-2); background: rgba(79,217,200,0.08); border: 1px solid rgba(79,217,200,0.3); }
.dir-out { color: var(--accent-hi); background: rgba(140,123,255,0.08); border: 1px solid rgba(140,123,255,0.3); }
/* ---- Impact map ---- */
.im-wrap { position: relative; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0; background: var(--bg-1); border: 1px solid var(--line); border-radius: var(--radius); padding: 0; overflow: hidden; }
.im-svg { position: absolute; inset: 0; pointer-events: none; z-index: 1; }
.im-col { position: relative; z-index: 2; padding: 18px 20px; border-right: 1px solid var(--line); display: flex; flex-direction: column; gap: 10px; min-height: 320px; transition: min-height 0.25s var(--ease); }
.im-wrap.is-focused .im-col { min-height: 220px; }
.im-col:last-of-type { border-right: none; }
.im-col-head { display: flex; justify-content: space-between; align-items: baseline; padding-bottom: 10px; border-bottom: 1px solid var(--line); }
.im-col-kicker { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.15em; color: var(--fg-3); font-weight: 700; }
.im-col-count { font-size: 11px; color: var(--fg-4); font-variant-numeric: tabular-nums; }
.im-col-body { display: flex; flex-direction: column; gap: 8px; max-height: 720px; overflow-y: auto; padding-right: 4px; }
.im-card { position: relative; background: var(--bg-2); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 10px 12px; cursor: pointer; transition: border-color 0.15s var(--ease), background 0.15s var(--ease), opacity 0.2s var(--ease), transform 0.15s var(--ease); display: flex; flex-direction: column; gap: 4px; }
.im-card:hover { border-color: var(--line-3); background: var(--bg-3); }
.im-card.im-selected { border-color: var(--accent); box-shadow: 0 0 0 2px rgba(140,123,255,0.25), 0 6px 18px rgba(140,123,255,0.18); background: var(--bg-3); transform: translateY(-1px); }
.im-card.im-faded { opacity: 0.22; }
.im-card-row { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.im-card-id { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10.5px; color: var(--fg-3); letter-spacing: 0.04em; }
.im-card-title { font-size: 13px; font-weight: 500; color: var(--fg); line-height: 1.35; text-transform: none; }
.im-card-foot { font-size: 10.5px; color: var(--fg-4); display: flex; gap: 6px; align-items: center; }
.im-card-foot strong { color: var(--fg-2); font-weight: 600; }
.im-card.im-card-warm { border-left: 3px solid var(--mid); }
.im-card.im-card-hot { border-left: 3px solid var(--low); }
.im-load { color: var(--low); }
.im-clear { position: absolute; top: 18px; right: 18px; z-index: 3; background: var(--bg-3); color: var(--fg-2); border: 1px solid var(--line-2); border-radius: 999px; padding: 5px 12px; font-size: 11px; font-weight: 600; cursor: pointer; font-family: inherit; }
.im-clear:hover { color: var(--fg); border-color: var(--accent); }
.im-hint { font-size: 11.5px; margin-top: 14px; }
.im-quiet { opacity: 0.62; }
.im-orphan { opacity: 0.7; background: var(--bg-1); border-style: dashed; }
.im-orphan-tag { display: inline-block; padding: 1px 6px; border-radius: 999px; font-size: 9.5px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--fg-4); background: var(--bg-3); border: 1px dashed var(--line-2); }
.im-divider { font-size: 10px; text-transform: uppercase; letter-spacing: 0.15em; color: var(--fg-4); padding: 18px 0 6px; border-bottom: 1px solid var(--line); margin-bottom: 4px; font-weight: 700; }
.im-headline { color: var(--fg-2); font-size: 13px; margin: 8px 0 0; max-width: 84ch; }
.im-headline code { background: rgba(140,123,255,0.10); color: var(--accent-hi); border-color: rgba(140,123,255,0.25); padding: 1px 6px; font-size: 11.5px; }
.im-headline strong { color: var(--fg); font-weight: 700; }
.im-legend { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 16px; padding: 10px 14px; background: var(--bg-1); border: 1px solid var(--line); border-radius: var(--radius-sm); margin-bottom: 14px; font-size: 11.5px; color: var(--fg-2); }
.im-legend-kicker { font-size: 10px; text-transform: uppercase; letter-spacing: 0.15em; color: var(--fg-4); font-weight: 700; }
.im-legend-item { display: inline-flex; align-items: center; gap: 6px; }
.im-legend-dot { width: 9px; height: 9px; border-radius: 999px; }
.im-legend-bar { width: 4px; height: 16px; border-radius: 2px; display: inline-block; }
.im-legend-bar.im-card-hot { background: var(--low); border-left: none; }
.im-legend-bar.im-card-warm { background: var(--mid); border-left: none; }
.im-legend-sep { color: var(--fg-5); }
.im-card.im-hidden { display: none; }
.im-col-body { min-height: 60px; }
/* Popin */
.im-popin { margin-top: 18px; background: var(--bg-1); border: 1px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow-2); animation: panelIn 0.28s var(--ease-out); position: relative; overflow: hidden; }
.pop-head { display: flex; flex-direction: column; gap: 8px; padding: 14px 22px 12px; border-bottom: 1px solid var(--line); position: relative; background: linear-gradient(180deg, rgba(255,255,255,0.025) 0%, transparent 80%); }
.pop-head-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.pop-tags { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.pop-kind { font-size: 10px; text-transform: uppercase; letter-spacing: 0.15em; color: var(--accent-hi); background: rgba(140,123,255,0.10); border: 1px solid rgba(140,123,255,0.32); padding: 3px 8px; border-radius: 999px; font-weight: 700; }
.pop-id { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; color: var(--fg-3); letter-spacing: 0.04em; }
.pop-title { margin: 0; font-size: 18px; font-weight: 600; color: var(--fg); letter-spacing: -0.015em; line-height: 1.3; text-transform: none; }
.pop-close { flex-shrink: 0; width: 28px; height: 28px; border-radius: 999px; border: 1px solid var(--line-2); background: var(--bg-3); color: var(--fg-2); font-size: 18px; line-height: 1; cursor: pointer; transition: all 0.15s var(--ease); font-family: inherit; padding: 0; }
.pop-close:hover { color: var(--fg); border-color: var(--accent); background: rgba(140,123,255,0.10); }
.pop-facts { display: flex; flex-wrap: wrap; gap: 4px 8px; align-items: center; margin-top: 2px; }
.pop-fact { display: inline-flex; align-items: baseline; gap: 4px; font-size: 11.5px; line-height: 1.4; padding: 1px 0; }
.pop-fact:not(:last-child)::after { content: '·'; color: var(--fg-5); margin-left: 8px; }
.pop-fact-k { color: var(--fg-4); font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 600; }
.pop-fact-v { color: var(--fg-2); font-variant-numeric: tabular-nums; }
.pop-body { display: grid; grid-template-columns: 1fr 260px; gap: 0; }
@media (max-width: 1100px) { .pop-body { grid-template-columns: 1fr; } }
.pop-main { padding: 16px 22px 22px; min-height: 320px; }
.pop-side { padding: 16px 18px; border-left: 1px solid var(--line); background: var(--bg-2); max-height: 640px; overflow-y: auto; }
@media (max-width: 1100px) { .pop-side { border-left: none; border-top: 1px solid var(--line); } }
.pop-empty { padding: 24px 0; font-style: italic; }
.pop-prose { color: var(--fg-2); font-size: 13.5px; line-height: 1.6; max-height: 640px; overflow-y: auto; padding-right: 8px; }
.pop-prose h3, .pop-prose h4, .pop-prose h5 { margin: 18px 0 8px; color: var(--fg); text-transform: none; font-size: 13.5px; font-weight: 600; letter-spacing: -0.005em; }
.pop-prose h3 { font-size: 15px; }
.pop-prose p { margin: 6px 0; }
.pop-prose ul { margin: 6px 0 6px 18px; padding: 0; }
.pop-prose li { margin: 3px 0; }
.pop-prose code { background: var(--bg-3); border: 1px solid var(--line); padding: 0 4px; border-radius: 4px; font-size: 11.5px; }
.pop-prose blockquote { border-left: 3px solid var(--line-2); padding: 4px 12px; margin: 8px 0; color: var(--fg-3); }
.pop-side-title { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--fg-3); font-weight: 700; margin: 0 0 8px; }
.pop-side > .pop-side-title:not(:first-child) { margin-top: 18px; }
.pop-linked { list-style: none; padding: 0; margin: 0 0 4px; display: flex; flex-direction: column; gap: 6px; }
.pop-linked li { display: grid; grid-template-columns: auto auto 1fr; gap: 6px; align-items: center; padding: 6px 8px; border-radius: var(--radius-xs); background: var(--bg-1); border: 1px solid var(--line); cursor: pointer; transition: border-color 0.15s var(--ease), background 0.15s var(--ease); }
.pop-linked li:hover { border-color: var(--accent); background: var(--bg-3); }
.pop-linked code { background: transparent; border: none; color: var(--fg-2); padding: 0; font-size: 10.5px; }
.pop-linked-title { font-size: 11.5px; color: var(--fg-3); line-height: 1.35; }
/* Questions tab */
.q-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); gap: 14px; padding: 18px; }
.q-card { background: var(--bg-1); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 14px 16px; display: flex; flex-direction: column; gap: 9px; transition: border-color 0.15s var(--ease); }
.q-card:hover { border-color: var(--line-2); }
.q-card.q-card-active { border-left: 3px solid var(--low); }
.q-card-head { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; }
.q-id { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; color: var(--fg-3); letter-spacing: 0.04em; font-weight: 600; }
.q-kind { font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.12em; font-weight: 700; padding: 2px 8px; border-radius: 999px; border: 1px solid transparent; }
.q-kind-blocking { color: var(--low); background: rgba(239,106,103,0.10); border-color: rgba(239,106,103,0.3); }
.q-kind-open { color: var(--accent-hi); background: rgba(140,123,255,0.10); border-color: rgba(140,123,255,0.32); }
.q-kind-decision { color: var(--accent-2); background: rgba(79,217,200,0.10); border-color: rgba(79,217,200,0.3); }
.q-area { font-size: 10.5px; color: var(--fg-4); font-style: italic; }
.q-question { margin: 0; font-size: 13.5px; font-weight: 600; color: var(--fg); letter-spacing: -0.005em; line-height: 1.45; text-transform: none; }
.q-row { display: grid; grid-template-columns: 80px 1fr; gap: 8px; font-size: 12px; line-height: 1.5; }
.q-row-k { color: var(--fg-4); font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em; font-weight: 600; padding-top: 1px; }
.q-row-v { color: var(--fg-2); }
.q-row.q-row-res { background: rgba(65,214,128,0.05); border-left: 2px solid var(--good); padding: 6px 8px; border-radius: var(--radius-xs); margin-top: 4px; }
.q-row.q-row-res .q-row-k { color: var(--good); }
.q-row.q-row-res .q-row-v { color: var(--fg-2); }
.q-foot { display: flex; gap: 14px; flex-wrap: wrap; padding-top: 8px; border-top: 1px solid var(--line-soft); margin-top: 4px; font-size: 11px; color: var(--fg-3); }
.q-foot:empty { display: none; padding: 0; border: none; margin: 0; }
.q-meta { display: inline-flex; gap: 5px; align-items: baseline; }
.q-meta-k { color: var(--fg-4); font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 600; }
.q-resolved-card { opacity: 0.78; }
.q-resolved-card:hover { opacity: 1; }
/* Code style nested rendering */
.cs-block { padding: 10px 0; border-bottom: 1px solid var(--line-soft); }
.cs-block:last-child { border-bottom: none; }
.cs-block-title { margin: 0 0 8px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--fg-3); font-weight: 700; }
.cs-kv { display: grid; grid-template-columns: 160px 1fr; gap: 6px 16px; margin: 0; }
.cs-kv dt { color: var(--fg-4); font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 600; padding-top: 1px; }
.cs-kv dd { margin: 0; color: var(--fg-2); font-size: 12.5px; line-height: 1.5; }
.cs-kv dl.cs-kv { grid-template-columns: 140px 1fr; }
.cs-list { margin: 4px 0 4px 18px; padding: 0; }
.cs-list li { margin: 3px 0; color: var(--fg-2); font-size: 12.5px; }
.cs-val { color: var(--fg); font-weight: 500; }
.cs-text { color: var(--fg-3); font-style: italic; }
/* Clickable affordance for drawer triggers */
.clickable-row { cursor: pointer; transition: background 0.12s var(--ease); }
.clickable-row:hover { background: rgba(140,123,255,0.06) !important; }
.clickable-row td:first-child { position: relative; }
.clickable-row td:first-child::before { content: ''; position: absolute; left: 0; top: 6px; bottom: 6px; width: 2px; background: transparent; transition: background 0.12s var(--ease); border-radius: 2px; }
.clickable-row:hover td:first-child::before { background: var(--accent); }
.clickable-card { cursor: pointer; }
.clickable-card:hover { border-color: var(--accent) !important; }
/* Drawer body styles */
.dd-facts { display: flex; flex-wrap: wrap; gap: 4px 10px; margin-bottom: 16px; padding-bottom: 14px; border-bottom: 1px solid var(--line-soft); }
.dd-fact { display: inline-flex; align-items: baseline; gap: 4px; font-size: 11.5px; line-height: 1.5; }
.dd-fact:not(:last-child)::after { content: '·'; color: var(--fg-5); margin-left: 8px; }
.dd-fact-k { color: var(--fg-4); font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 600; }
.dd-fact-v { color: var(--fg-2); font-variant-numeric: tabular-nums; word-break: break-word; }
.dd-body { color: var(--fg-2); font-size: 13px; line-height: 1.65; }
.dd-body h2, .dd-body h3, .dd-body h4, .dd-body h5 { color: var(--fg); margin: 16px 0 8px; text-transform: none; font-weight: 600; letter-spacing: -0.005em; }
.dd-body h3 { font-size: 14px; }
.dd-body h4 { font-size: 13px; }
.dd-body p { margin: 6px 0; }
.dd-body ul { margin: 6px 0 6px 16px; padding: 0; }
.dd-body li { margin: 3px 0; }
.dd-body code { background: var(--bg-3); border: 1px solid var(--line); padding: 0 4px; border-radius: 4px; font-size: 11.5px; word-break: break-word; }
.dd-body blockquote { border-left: 3px solid var(--line-2); padding: 4px 12px; margin: 8px 0; color: var(--fg-3); }
.dd-table-wrap { margin: 10px 0; border: 1px solid var(--line); border-radius: var(--radius-xs); overflow: hidden; background: var(--bg-1); }
.dd-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.dd-table th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--fg-4); font-weight: 600; padding: 8px 10px; background: var(--bg-2); border-bottom: 1px solid var(--line); }
.dd-table td { padding: 7px 10px; border-bottom: 1px solid var(--line-soft); color: var(--fg-2); vertical-align: top; }
.dd-table tr:last-child td { border-bottom: none; }
.dd-table code { font-size: 11px; }
.dd-body a { color: var(--accent-hi); }
.dd-empty { padding: 24px 0; font-style: italic; text-align: center; }
.dd-link { margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--line-soft); }
/* Activity tab */
.act-chart { width: 100%; height: auto; display: block; }
.contrib-bar { position: relative; height: 22px; background: var(--bg-3); border-radius: var(--radius-xs); overflow: hidden; display: flex; align-items: center; }
.contrib-bar-fill { position: absolute; left: 0; top: 0; bottom: 0; background: linear-gradient(90deg, var(--accent-lo), var(--accent)); border-radius: var(--radius-xs); transition: width 0.4s var(--ease); }
.contrib-bar-v { position: relative; z-index: 1; padding: 0 8px; font-size: 11.5px; font-weight: 600; color: var(--fg); font-variant-numeric: tabular-nums; margin-left: auto; }
.dead-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 12px; }
.dead-list li { background: var(--bg-2); border: 1px solid var(--line); border-left: 3px solid var(--low); border-radius: var(--radius-sm); padding: 10px 12px; display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; }
.dead-list code { background: transparent; border: none; padding: 0; color: var(--fg); font-weight: 500; }
/* Domain tab */
.dom-chip-grid { display: flex; flex-wrap: wrap; gap: 6px; }
.dom-chip { display: inline-flex; flex-direction: column; gap: 2px; align-items: center; padding: 8px 12px; background: var(--bg-2); border: 1px solid var(--line); border-radius: var(--radius-sm); text-decoration: none; transition: border-color 0.12s var(--ease), background 0.12s var(--ease); min-width: 110px; }
.dom-chip:hover { border-color: var(--accent); background: var(--bg-3); }
.dom-chip strong { color: var(--fg); font-size: 12.5px; font-weight: 600; }
.dom-chip-tbl { font-size: 10px; color: var(--fg-4); text-transform: uppercase; letter-spacing: 0.04em; }
.dom-prose h3 { background: var(--bg-2); padding: 10px 14px; border-radius: var(--radius-sm); border-left: 3px solid var(--accent); margin: 24px 0 12px; }
.dom-prose table.dom-table { width: 100%; border-collapse: collapse; font-size: 12px; margin: 8px 0 16px; }
.dom-prose .dom-table th { text-align: left; background: var(--bg-2); padding: 6px 10px; font-size: 10.5px; color: var(--fg-3); text-transform: uppercase; letter-spacing: 0.08em; border-bottom: 1px solid var(--line); }
.dom-prose .dom-table td { padding: 6px 10px; border-bottom: 1px solid var(--line-soft); color: var(--fg-2); vertical-align: top; }
.dom-prose .dom-table td:first-child { font-weight: 500; color: var(--fg); }
.dom-prose .dom-table code { font-size: 11px; }
.dom-intro { padding: 0 4px; }
.dom-entities-list { display: flex; flex-direction: column; gap: 6px; margin-top: 14px; }
.dom-entity { background: var(--bg-2); border: 1px solid var(--line); border-radius: var(--radius-sm); transition: border-color 0.12s var(--ease); }
.dom-entity[open] { border-color: var(--line-2); background: var(--bg-1); }
.dom-entity:hover { border-color: var(--line-3); }
.dom-entity-summary { padding: 10px 14px; cursor: pointer; display: flex; align-items: center; gap: 10px; font-size: 13px; list-style: none; user-select: none; }
.dom-entity-summary::-webkit-details-marker { display: none; }
.dom-entity-summary::before { content: '▸'; color: var(--fg-4); transition: transform 0.15s var(--ease); display: inline-block; width: 12px; font-size: 9px; }
.dom-entity[open] .dom-entity-summary::before { transform: rotate(90deg); }
.dom-entity-name { color: var(--fg); font-weight: 600; }
.dom-entity-tbl { color: var(--fg-4); font-size: 10.5px; padding: 1px 6px; background: var(--bg-3); border: 1px solid var(--line); border-radius: 4px; }
.dom-entity-hint { margin-left: auto; color: var(--fg-5); font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 600; }
.dom-entity[open] .dom-entity-hint { display: none; }
.dom-entity-body { padding: 0 16px 16px; border-top: 1px solid var(--line); }
.dom-entity-body h3 { background: transparent; border-left: none; padding: 0; margin: 14px 0 8px; }
/* Reusable collapsible prose card */
.prose-fold summary { cursor: pointer; font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--fg-3); font-weight: 700; padding: 6px 10px; background: var(--bg-2); border: 1px solid var(--line); border-radius: var(--radius-sm); display: inline-block; list-style: none; transition: all 0.12s var(--ease); }
.prose-fold summary::-webkit-details-marker { display: none; }
.prose-fold summary::before { content: '▸  '; display: inline; font-size: 9px; }
.prose-fold[open] summary::before { content: '▾  '; }
.prose-fold summary:hover { color: var(--fg); border-color: var(--accent); background: var(--bg-3); }
.prose-fold[open] summary { background: var(--bg-3); border-color: var(--accent); color: var(--fg-2); }
/* Empty state — used when a tab depends on data not yet captured */
.empty-state-card { border-style: dashed; background: radial-gradient(700px 280px at 50% 100%, rgba(140,123,255,0.04), transparent 60%), var(--bg-1); }
.empty-state-body { padding: 36px 22px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 10px; }
.empty-state-icon { font-size: 32px; color: var(--fg-5); margin-bottom: 4px; }
.empty-state-title { margin: 0; font-size: 15px; font-weight: 600; color: var(--fg-2); text-transform: none; letter-spacing: -0.005em; }
.empty-state-hint { margin: 0; max-width: 70ch; font-size: 12.5px; color: var(--fg-3); line-height: 1.6; }
.empty-state-hint code { background: var(--bg-3); border: 1px solid var(--line); padding: 1px 6px; border-radius: 4px; font-size: 11.5px; color: var(--accent-hi); }
.empty-state-file { font-size: 11px; color: var(--fg-4); padding: 4px 10px; background: var(--bg-2); border: 1px dashed var(--line-2); border-radius: 4px; margin-top: 4px; }
/* About — landing page */
.about-hero { background: linear-gradient(135deg, rgba(140,123,255,0.10) 0%, rgba(79,217,200,0.05) 50%, transparent 100%), var(--bg-1); border: 1px solid var(--line); border-radius: var(--radius); padding: 26px 28px; margin-bottom: 20px; position: relative; overflow: hidden; display: grid; grid-template-columns: 1fr auto; gap: 28px; }
.about-hero::before { content: ''; position: absolute; right: -120px; top: -120px; width: 360px; height: 360px; background: radial-gradient(circle, rgba(140,123,255,0.16) 0%, transparent 60%); pointer-events: none; }
.about-hero-main { min-width: 0; position: relative; z-index: 1; }
.about-hero-name-row { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; margin-bottom: 8px; }
.about-hero-name { margin: 0; font-size: 36px; font-weight: 700; letter-spacing: -0.035em; color: var(--fg); line-height: 1.05; text-transform: none; }
.about-hero-version { font-size: 13px; padding: 4px 10px; background: rgba(140,123,255,0.12); color: var(--accent-hi); border: 1px solid rgba(140,123,255,0.32); border-radius: 999px; font-weight: 600; }
.about-hero-aliases { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 10px; }
.about-alias { font-size: 10.5px; color: var(--fg-4); padding: 1px 7px; background: var(--bg-2); border: 1px solid var(--line); border-radius: 999px; }
.about-alias::before { content: 'aka '; color: var(--fg-5); }
.about-hero-domain { margin: 0; font-size: 15px; color: var(--fg-2); line-height: 1.55; max-width: 80ch; font-weight: 500; }
.about-hero-desc { margin: 10px 0 0; font-size: 13px; color: var(--fg-3); line-height: 1.55; max-width: 80ch; }
.about-hero-stats { display: grid; grid-template-columns: repeat(2, minmax(80px, 1fr)); gap: 8px; position: relative; z-index: 1; align-self: center; }
.about-stat { background: rgba(11,13,18,0.7); backdrop-filter: blur(8px); border: 1px solid var(--line-2); border-radius: var(--radius-sm); padding: 10px 14px; min-width: 90px; }
.about-stat-v { font-size: 22px; font-weight: 700; color: var(--fg); font-variant-numeric: tabular-nums; letter-spacing: -0.02em; line-height: 1; }
.about-stat-l { font-size: 10px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--fg-4); font-weight: 700; margin-top: 5px; }
@media (max-width: 1000px) {
  .about-hero { grid-template-columns: 1fr; }
  .about-hero-stats { grid-template-columns: repeat(3, 1fr); }
}
/* Two-column grid with Tech stack anchored in column 2 (it's the tallest card).
   Repository / Deployment / Organization stack in column 1 — together they
   roughly match Tech stack's height. Cards collapse to single column on narrow
   viewports. */
.about-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-areas:
    "repo tech"
    "deploy tech"
    "org tech";
  gap: 16px;
  margin-bottom: 18px;
  align-items: start;
}
.about-grid .about-card-repo { grid-area: repo; }
.about-grid .about-card-deploy { grid-area: deploy; }
.about-grid .about-card-org { grid-area: org; }
.about-grid .about-card-tech { grid-area: tech; }
@media (max-width: 980px) {
  .about-grid { grid-template-columns: 1fr; grid-template-areas: "repo" "tech" "deploy" "org"; }
}
.about-platform-badge { font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.12em; font-weight: 700; padding: 2px 7px; border-radius: 4px; }
.platform-github { color: #e8eaed; background: #24292f; border: 1px solid #444; }
.platform-gitlab { color: #fc6d26; background: rgba(252,109,38,0.10); border: 1px solid rgba(252,109,38,0.32); }
.platform-bitbucket { color: #2684ff; background: rgba(38,132,255,0.10); border: 1px solid rgba(38,132,255,0.32); }
.platform-azure-devops { color: #0078d4; background: rgba(0,120,212,0.10); border: 1px solid rgba(0,120,212,0.32); }
.about-card { background: var(--bg-1); border: 1px solid var(--line); border-radius: var(--radius); padding: 16px 18px; display: flex; flex-direction: column; gap: 10px; transition: border-color 0.15s var(--ease); }
.about-card:hover { border-color: var(--line-2); }
.about-card-head { display: flex; align-items: center; gap: 8px; padding-bottom: 8px; border-bottom: 1px solid var(--line-soft); }
.about-card-icon { width: 26px; height: 26px; border-radius: var(--radius-sm); display: grid; place-items: center; background: rgba(140,123,255,0.12); color: var(--accent-hi); font-size: 14px; border: 1px solid rgba(140,123,255,0.3); flex-shrink: 0; }
.about-card-kicker { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.15em; color: var(--fg-3); font-weight: 700; flex: 1; }
.about-card-meta { font-size: 11px; color: var(--fg-4); font-variant-numeric: tabular-nums; }
.about-card-rows { display: flex; flex-direction: column; gap: 5px; font-size: 12.5px; }
.about-row { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.about-row .k { font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--fg-4); font-weight: 600; min-width: 80px; }
.about-row code { font-size: 11px; }
.about-card-note { margin: 6px 0 0; padding-top: 8px; border-top: 1px solid var(--line-soft); font-size: 11.5px; color: var(--fg-3); line-height: 1.5; font-style: italic; }
/* Repo card */
.about-repo-url { display: block; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; color: var(--accent-hi); padding: 8px 10px; background: rgba(140,123,255,0.06); border: 1px solid rgba(140,123,255,0.2); border-radius: var(--radius-sm); word-break: break-all; text-decoration: none; transition: all 0.12s var(--ease); }
.about-repo-url:hover { color: var(--fg); border-color: var(--accent); background: rgba(140,123,255,0.10); }
.about-repo-name { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 14px; color: var(--fg); font-weight: 600; }
/* Tech stack */
.about-chip-rows { display: flex; flex-direction: column; gap: 8px; }
.about-chip-row { display: flex; align-items: flex-start; gap: 10px; }
.about-chip-row-l { font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--fg-4); font-weight: 600; min-width: 80px; padding-top: 4px; }
.about-chip-row-v { display: flex; flex-wrap: wrap; gap: 4px; flex: 1; }
.about-tech-chip { font-size: 11px; padding: 3px 9px; border-radius: 999px; background: var(--bg-2); border: 1px solid var(--line); color: var(--fg-2); transition: border-color 0.12s var(--ease); }
.about-tech-chip:hover { border-color: var(--line-3); }
.about-tech-chip.tech-lang { background: rgba(140,123,255,0.10); color: var(--accent-hi); border-color: rgba(140,123,255,0.32); font-weight: 600; }
.about-tech-chip.tech-fw { background: rgba(79,217,200,0.06); color: var(--accent-2); border-color: rgba(79,217,200,0.25); }
.about-tech-chip.tech-runtime { background: rgba(255,126,182,0.06); color: var(--accent-3); border-color: rgba(255,126,182,0.25); }
.about-tech-chip.tech-build { background: var(--bg-3); color: var(--fg-3); }
/* Deployment */
.about-deploy-type { font-size: 15px; font-weight: 600; color: var(--fg); padding: 8px 10px; background: var(--bg-2); border-radius: var(--radius-sm); border: 1px solid var(--line); }
.about-envs { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.about-env-pill { font-size: 11px; padding: 4px 10px; background: rgba(79,217,200,0.08); color: var(--accent-2); border: 1px solid rgba(79,217,200,0.32); border-radius: 6px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
.about-env-sep { color: var(--fg-4); font-size: 12px; }
/* Organization */
.about-org-flow { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.about-org-cell { padding: 8px 12px; background: var(--bg-2); border: 1px solid var(--line); border-radius: var(--radius-sm); flex: 1; min-width: 0; }
.about-org-current { background: rgba(140,123,255,0.06); border-color: rgba(140,123,255,0.25); }
.about-org-former { opacity: 0.7; }
.about-org-label { font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--fg-4); font-weight: 700; margin-bottom: 3px; }
.about-org-val { font-size: 13px; color: var(--fg); font-weight: 500; line-height: 1.3; }
.about-org-arrow { color: var(--fg-4); font-size: 14px; flex-shrink: 0; }
.about-org-pkg { display: flex; align-items: center; gap: 8px; font-size: 11.5px; padding-top: 4px; }
.about-pkg-old { opacity: 0.7; text-decoration: line-through; }
.about-pkg-new { color: var(--accent-hi); border-color: rgba(140,123,255,0.32); }
/* Data stores */
.about-card-ds { grid-column: 1 / -1; }
.about-ds-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px; }
.about-ds-tile { padding: 12px 14px; background: var(--bg-2); border: 1px solid var(--line); border-radius: var(--radius-sm); border-left: 3px solid var(--accent-2); }
.about-ds-type { font-size: 10px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--accent-2); font-weight: 700; }
.about-ds-name { font-size: 13px; color: var(--fg); font-weight: 600; margin-top: 3px; }
.about-ds-purpose { font-size: 11.5px; margin-top: 4px; line-height: 1.4; }
/* ============================================================== */
/* About — Vitrine sections (sponsor-grade landing)                 */
/* ============================================================== */
.vitrine-hero { background: linear-gradient(135deg, rgba(140,123,255,0.18) 0%, rgba(79,217,200,0.10) 40%, rgba(255,126,182,0.06) 100%), var(--bg-1); border: 1px solid var(--line-2); border-radius: var(--radius); padding: 22px 28px 18px; margin-bottom: 14px; position: relative; overflow: hidden; }
.vitrine-hero::before { content: ''; position: absolute; right: -200px; top: -200px; width: 540px; height: 540px; background: radial-gradient(circle, rgba(140,123,255,0.25) 0%, transparent 60%); pointer-events: none; filter: blur(8px); }
.vitrine-hero::after { content: ''; position: absolute; left: -120px; bottom: -120px; width: 360px; height: 360px; background: radial-gradient(circle, rgba(79,217,200,0.10) 0%, transparent 70%); pointer-events: none; filter: blur(10px); }
.vitrine-hero-inner { position: relative; z-index: 1; max-width: 80%; }
.vitrine-kicker { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.28em; color: var(--accent-hi); font-weight: 700; margin-bottom: 10px; display: inline-flex; align-items: center; gap: 8px; }
.vitrine-kicker::before { content: ''; width: 24px; height: 1px; background: var(--accent); }
.vitrine-h1 { margin: 0 0 8px; font-size: 36px; font-weight: 700; letter-spacing: -0.035em; color: var(--fg); line-height: 1.05; text-transform: none; }
.vitrine-app-name { background: linear-gradient(135deg, var(--accent-hi), var(--accent-2)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
.vitrine-tagline { margin: 0; max-width: 78ch; font-size: 14px; line-height: 1.55; color: var(--fg-2); }
.vitrine-tagline strong { color: var(--fg); font-weight: 600; }
.vitrine-headline-metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 16px; position: relative; z-index: 1; }
@media (max-width: 900px) { .vitrine-headline-metrics { grid-template-columns: repeat(2, 1fr); } }
.vh-metric { background: rgba(11,13,18,0.65); backdrop-filter: blur(10px); border: 1px solid var(--line-2); border-radius: var(--radius-sm); padding: 10px 14px; border-left-width: 3px; }
.vh-metric-good { border-left-color: var(--good); }
.vh-metric-mid { border-left-color: var(--mid); }
.vh-metric-low { border-left-color: var(--low); }
.vh-metric-empty { border-left-color: var(--line-3); opacity: 0.78; }
.vh-metric-value { font-size: 26px; font-weight: 700; line-height: 1; font-variant-numeric: tabular-nums; letter-spacing: -0.03em; color: var(--fg); display: flex; align-items: baseline; }
.vh-metric-good .vh-metric-value { color: var(--good); }
.vh-metric-mid .vh-metric-value { color: var(--mid); }
.vh-metric-low .vh-metric-value { color: var(--low); }
.vh-metric-empty .vh-metric-value { font-size: 15px; font-weight: 500; color: var(--fg-4); }
.vh-metric-unit { font-size: 16px; font-weight: 500; color: var(--fg-4); margin-left: 3px; }
.vh-metric-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.16em; color: var(--fg-3); font-weight: 700; margin-top: 8px; }
.vh-metric-hint { font-size: 11px; color: var(--fg-4); margin-top: 3px; }
/* Pillars (what a corpus is) */
.vitrine-pillars { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 28px; }
@media (max-width: 1100px) { .vitrine-pillars { grid-template-columns: repeat(2, 1fr); } }
.pillar { background: var(--bg-1); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 12px 14px; transition: border-color 0.15s var(--ease), transform 0.15s var(--ease); }
.pillar:hover { border-color: var(--line-3); transform: translateY(-2px); }
.pillar-icon { width: 30px; height: 30px; border-radius: 8px; display: grid; place-items: center; font-size: 16px; font-weight: 700; margin-bottom: 8px; }
.pillar-machine .pillar-icon { color: var(--accent-hi); background: rgba(140,123,255,0.12); border: 1px solid rgba(140,123,255,0.32); }
.pillar-anchored .pillar-icon { color: var(--accent-2); background: rgba(79,217,200,0.10); border: 1px solid rgba(79,217,200,0.32); }
.pillar-agentic .pillar-icon { color: var(--accent-3); background: rgba(255,126,182,0.10); border: 1px solid rgba(255,126,182,0.32); }
.pillar-fresh .pillar-icon { color: var(--good); background: rgba(65,214,128,0.10); border: 1px solid rgba(65,214,128,0.32); }
.pillar-title { margin: 0 0 6px; font-size: 14px; font-weight: 600; color: var(--fg); text-transform: none; letter-spacing: -0.01em; }
.pillar-desc { margin: 0; font-size: 11.5px; color: var(--fg-3); line-height: 1.5; }
.pillar-desc strong { color: var(--fg-2); font-weight: 600; }
/* Section dividers */
.vitrine-section-head { display: grid; grid-template-columns: 56px 1fr; gap: 16px; align-items: center; margin: 36px 0 16px; padding-bottom: 14px; border-bottom: 1px solid var(--line); position: relative; }
.vitrine-section-head::after { content: ''; position: absolute; left: 0; bottom: -1px; width: 80px; height: 1px; background: linear-gradient(90deg, var(--accent), transparent); }
.vsh-num { width: 46px; height: 46px; border-radius: 999px; display: grid; place-items: center; background: rgba(140,123,255,0.10); color: var(--accent-hi); border: 1px solid rgba(140,123,255,0.32); font-size: 16px; font-weight: 700; font-variant-numeric: tabular-nums; }
.vsh-kicker { font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.18em; color: var(--fg-4); font-weight: 700; }
.vsh-title { margin: 2px 0 0; font-size: 22px; font-weight: 700; color: var(--fg); letter-spacing: -0.025em; text-transform: none; line-height: 1.2; }
.vsh-sub { margin: 0; padding-left: 16px; font-size: 12px; color: var(--fg-3); border-left: 1px solid var(--line-2); grid-column: 2; }
/* Agents grid */
.agent-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px; margin-bottom: 28px; }
.agent-card { background: var(--bg-1); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 14px 16px; display: grid; grid-template-columns: 40px 1fr; gap: 12px; transition: border-color 0.15s var(--ease); }
.agent-card:hover { border-color: var(--line-3); }
.agent-icon { width: 36px; height: 36px; border-radius: var(--radius-sm); display: grid; place-items: center; background: var(--bg-3); color: var(--accent-hi); font-size: 18px; border: 1px solid var(--line-2); }
.agent-card-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px; }
.agent-name { margin: 0; font-size: 13px; font-weight: 600; color: var(--fg); text-transform: none; letter-spacing: -0.005em; }
.agent-desc { margin: 0; font-size: 11.5px; color: var(--fg-3); line-height: 1.5; }
.agent-gaps { margin: 6px 0 0; font-size: 10.5px; line-height: 1.4; }
.agent-gaps .k { color: var(--low); font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; font-size: 10px; }
/* Sources strip */
.src-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 10px; margin-bottom: 28px; }
.src-card { background: var(--bg-1); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 10px 14px; display: grid; grid-template-columns: 36px 1fr auto; gap: 10px; align-items: center; }
.src-card-confirmed { border-left: 3px solid var(--good); }
.src-card-partial { border-left: 3px solid var(--mid); }
.src-card-unknown { border-left: 3px solid var(--line-3); opacity: 0.78; }
.src-icon { width: 30px; height: 30px; border-radius: var(--radius-xs); display: grid; place-items: center; background: var(--bg-3); color: var(--accent-hi); font-size: 14px; }
.src-name { font-size: 13px; font-weight: 600; color: var(--fg); line-height: 1.2; }
.src-cat { font-size: 10.5px; }
/* Knows grid — proof numbers */
.knows-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-bottom: 28px; }
.knows-card { background: var(--bg-1); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 14px 16px; display: flex; flex-direction: column; gap: 2px; text-decoration: none; color: inherit; transition: border-color 0.15s var(--ease), transform 0.15s var(--ease); }
.knows-card:hover { border-color: var(--accent); transform: translateY(-2px); color: inherit; }
.knows-v { font-size: 28px; font-weight: 700; line-height: 1; color: var(--accent-hi); font-variant-numeric: tabular-nums; letter-spacing: -0.025em; }
.knows-l { font-size: 11.5px; color: var(--fg-2); margin-top: 6px; font-weight: 600; }
.knows-s { font-size: 10.5px; margin-top: 2px; }
/* CTA cards */
.vitrine-cta { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; margin-bottom: 28px; }
.cta-card { background: var(--bg-1); border: 1px solid var(--line); border-radius: var(--radius); padding: 18px 20px; display: flex; flex-direction: column; gap: 6px; text-decoration: none; color: inherit; transition: all 0.18s var(--ease); position: relative; overflow: hidden; }
.cta-card::before { content: ''; position: absolute; right: -50px; top: -50px; width: 140px; height: 140px; border-radius: 999px; opacity: 0.06; transition: opacity 0.18s var(--ease); }
.cta-card:hover { transform: translateY(-3px); border-color: var(--accent); color: inherit; }
.cta-card:hover::before { opacity: 0.14; }
.cta-sponsor::before { background: var(--accent); }
.cta-dev::before { background: var(--accent-2); }
.cta-ops::before { background: var(--low); }
.cta-manager::before { background: var(--accent-3); }
.cta-kicker { font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.18em; font-weight: 700; }
.cta-sponsor .cta-kicker { color: var(--accent-hi); }
.cta-dev .cta-kicker { color: var(--accent-2); }
.cta-ops .cta-kicker { color: var(--low); }
.cta-manager .cta-kicker { color: var(--accent-3); }
.cta-title { font-size: 17px; font-weight: 700; color: var(--fg); letter-spacing: -0.015em; }
.cta-desc { font-size: 12.5px; color: var(--fg-3); line-height: 1.5; }
/* Pack standards strip — proves the corpus is built on modern agentic best practices */
.standards-strip { background: linear-gradient(135deg, rgba(65,214,128,0.06) 0%, rgba(140,123,255,0.04) 100%), var(--bg-1); border: 1px solid var(--line-2); border-radius: var(--radius); padding: 18px 22px; margin: 24px 0 28px; position: relative; overflow: hidden; }
.standards-strip::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: linear-gradient(180deg, var(--good), var(--accent), var(--accent-2)); }
.standards-head { display: flex; align-items: baseline; gap: 16px; flex-wrap: wrap; padding-bottom: 14px; border-bottom: 1px solid var(--line); margin-bottom: 14px; }
.standards-kicker { font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.18em; color: var(--good); font-weight: 700; }
.standards-title { font-size: 14.5px; font-weight: 700; color: var(--fg); letter-spacing: -0.005em; }
.standards-version { display: inline-flex; align-items: center; gap: 6px; margin-left: auto; font-size: 11px; }
.standards-version-l { font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--fg-4); font-weight: 600; }
.standards-version-v { background: rgba(65,214,128,0.10); color: var(--good); border: 1px solid rgba(65,214,128,0.32); padding: 2px 8px; border-radius: 999px; font-weight: 600; font-size: 11px; }
.standards-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 10px; }
.standards-chip { display: grid; grid-template-columns: 32px 1fr; gap: 10px; align-items: center; background: var(--bg-2); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 10px 12px; border-left: 3px solid var(--good); transition: border-color 0.12s var(--ease); }
.standards-chip:hover { border-color: var(--line-3); }
.standards-chip-icon { width: 28px; height: 28px; border-radius: 6px; display: grid; place-items: center; font-size: 14px; color: var(--good); background: rgba(65,214,128,0.10); border: 1px solid rgba(65,214,128,0.28); }
.standards-chip-label { font-size: 12px; font-weight: 600; color: var(--fg); line-height: 1.3; }
.standards-chip-sub { font-size: 10.5px; color: var(--fg-4); margin-top: 1px; }
.standards-refs-head { display: flex; align-items: center; gap: 14px; margin: 18px 0 10px; padding-top: 14px; border-top: 1px dashed var(--line-soft); }
.standards-refs-head::before { content: ''; flex: 0 0 24px; height: 1px; background: var(--accent); }
.standards-refs-label { font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.18em; color: var(--fg-3); font-weight: 700; }
.standards-refs { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 12px; }
.standards-ref { background: rgba(11,13,18,0.65); border: 1px solid var(--line); border-left: 3px solid var(--accent); border-radius: var(--radius-sm); padding: 10px 14px; }
.standards-ref-name { font-size: 12.5px; font-weight: 700; color: var(--accent-hi); letter-spacing: -0.005em; line-height: 1.3; }
.standards-ref-desc { font-size: 11px; color: var(--fg-2); margin-top: 4px; line-height: 1.45; }
.standards-ref-tag { font-size: 10px; margin-top: 5px; font-style: italic; }
/* Collapsible refs */
.standards-refs-fold { margin-top: 14px; padding-top: 12px; border-top: 1px dashed var(--line-soft); }
.standards-refs-fold summary { cursor: pointer; list-style: none; display: flex; align-items: baseline; gap: 10px; padding: 2px 0; }
.standards-refs-fold summary::-webkit-details-marker { display: none; }
.standards-refs-fold summary::before { content: '▸'; color: var(--fg-4); font-size: 9px; }
.standards-refs-fold[open] summary::before { content: '▾'; }
.standards-refs-summary-list { font-size: 11px; color: var(--fg-3); font-weight: 500; }
.standards-refs-fold[open] .standards-refs { margin-top: 10px; }
/* Mini section dividers — replace the big numbered "01/02/03" headers */
.about-mini-divider { display: flex; align-items: baseline; gap: 12px; margin: 22px 0 10px; padding-bottom: 6px; border-bottom: 1px solid var(--line-soft); }
.amd-bar { width: 28px; height: 2px; background: linear-gradient(90deg, var(--accent), var(--accent-2)); border-radius: 2px; align-self: center; }
.amd-title { font-size: 14px; font-weight: 700; color: var(--fg); letter-spacing: -0.01em; }
.amd-sub { font-size: 11.5px; }
/* Subheads inside two-col sections */
.about-subhead { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.15em; color: var(--fg-3); font-weight: 700; margin-bottom: 8px; padding: 4px 6px; border-left: 3px solid var(--accent); }
/* Two-column layout for compact bottom sections */
.about-two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-bottom: 18px; }
@media (max-width: 1100px) { .about-two-col { grid-template-columns: 1fr; } }
/* Compact variants */
.about-hero-compact { padding: 16px 22px; }
.about-hero-compact .about-hero-domain { font-size: 13.5px; }
.about-hero-compact .about-hero-desc { font-size: 12.5px; }
.about-hero-compact .about-stat-v { font-size: 18px; }
.agent-grid-tight { grid-template-columns: 1fr; gap: 8px; }
.agent-grid-tight .agent-card { padding: 10px 12px; grid-template-columns: 30px 1fr; gap: 10px; }
.agent-grid-tight .agent-icon { width: 28px; height: 28px; font-size: 14px; }
.agent-grid-tight .agent-desc { font-size: 11px; }
.knows-grid-tight { grid-template-columns: repeat(3, 1fr); gap: 8px; }
.knows-grid-tight .knows-card { padding: 10px 12px; }
.knows-grid-tight .knows-v { font-size: 22px; }
@media (max-width: 700px) { .knows-grid-tight { grid-template-columns: repeat(2, 1fr); } }
/* Specs tab */
.spec-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 16px; }
.spec-card { background: var(--bg-1); border: 1px solid var(--line); border-radius: var(--radius); padding: 16px; display: flex; flex-direction: column; gap: 10px; transition: border-color 0.15s var(--ease); }
.spec-card:hover { border-color: var(--accent); }
.spec-card-head { display: flex; justify-content: space-between; align-items: center; }
.spec-card-ticket code { background: rgba(140,123,255,0.10); color: var(--accent-hi); border-color: rgba(140,123,255,0.32); padding: 3px 8px; }
.spec-card-title { margin: 0; font-size: 14px; font-weight: 600; color: var(--fg); line-height: 1.4; text-transform: none; }
.spec-card-meta { display: flex; flex-direction: column; gap: 4px; padding-top: 4px; }
.spec-card-foot { display: flex; justify-content: space-between; align-items: center; padding-top: 10px; border-top: 1px solid var(--line-soft); margin-top: auto; font-size: 11px; }
.spec-card-foot a { color: var(--accent-hi); font-weight: 600; }
/* Handover tab */
.ho-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 16px; }
.ho-card { background: var(--bg-1); border: 1px solid var(--line); border-radius: var(--radius); padding: 16px; display: flex; flex-direction: column; gap: 10px; transition: border-color 0.15s var(--ease); }
.ho-card:hover { border-color: var(--accent); }
.ho-card.ho-card-template { opacity: 0.6; }
.ho-card-head { display: flex; justify-content: space-between; align-items: center; }
.ho-card-kind { font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.15em; color: var(--accent-hi); font-weight: 700; padding: 3px 8px; background: rgba(140,123,255,0.10); border: 1px solid rgba(140,123,255,0.32); border-radius: 999px; }
.ho-card-title { margin: 0; font-size: 14.5px; font-weight: 600; color: var(--fg); line-height: 1.3; text-transform: none; }
.ho-card-desc { margin: 0; font-size: 12.5px; color: var(--fg-3); line-height: 1.55; }
.ho-card-foot { font-size: 11px; padding-top: 10px; border-top: 1px solid var(--line-soft); margin-top: auto; }
.ho-progress { display: flex; align-items: center; gap: 10px; margin: 4px 0; }
.ho-progress-bar { flex: 1; height: 6px; background: var(--bg-3); border-radius: 999px; overflow: hidden; }
.ho-progress-fill { height: 100%; background: linear-gradient(90deg, var(--accent-lo), var(--accent-2)); border-radius: 999px; transition: width 0.4s var(--ease); }
.ho-progress-text { font-size: 11px; color: var(--fg-3); font-variant-numeric: tabular-nums; font-weight: 600; }
/* Corpus state — maturity hero */
.cs-hero { background: linear-gradient(120deg, rgba(140,123,255,0.10) 0%, rgba(79,217,200,0.06) 50%, transparent 100%), var(--bg-1); border: 1px solid var(--line); border-radius: var(--radius); padding: 22px 26px; display: grid; grid-template-columns: 1fr auto; gap: 24px; align-items: center; margin-bottom: 16px; overflow: hidden; position: relative; }
.cs-hero::after { content: ''; position: absolute; right: -60px; top: -60px; width: 240px; height: 240px; background: radial-gradient(circle, rgba(140,123,255,0.18) 0%, transparent 60%); pointer-events: none; }
.cs-hero-main { display: flex; align-items: center; gap: 22px; }
.cs-hero-level { display: flex; align-items: baseline; gap: 2px; line-height: 1; }
.cs-hero-lnum { font-size: 64px; font-weight: 700; color: var(--accent-hi); letter-spacing: -0.04em; font-variant-numeric: tabular-nums; text-shadow: 0 0 24px rgba(140,123,255,0.4); }
.cs-hero-lmax { font-size: 30px; font-weight: 600; color: var(--fg-4); letter-spacing: -0.02em; }
.cs-hero-kicker { font-size: 10px; text-transform: uppercase; letter-spacing: 0.18em; color: var(--fg-3); font-weight: 700; margin-bottom: 4px; }
.cs-hero-phase { font-size: 18px; font-weight: 600; color: var(--fg); margin-bottom: 8px; text-transform: capitalize; letter-spacing: -0.005em; }
.cs-hero-dates { display: flex; flex-wrap: wrap; gap: 10px 14px; }
.cs-hero-date { display: inline-flex; flex-direction: column; gap: 1px; font-size: 11px; }
.cs-hero-date .k { color: var(--fg-4); text-transform: uppercase; font-size: 9.5px; letter-spacing: 0.1em; font-weight: 600; }
.cs-hero-date .v { color: var(--fg-2); font-variant-numeric: tabular-nums; font-weight: 500; }
.cs-hero-stepper { display: flex; align-items: flex-start; gap: 6px; position: relative; z-index: 1; }
.mat-dot { display: flex; flex-direction: column; align-items: center; gap: 6px; min-width: 56px; }
.mat-dot-circle { width: 34px; height: 34px; border-radius: 999px; display: grid; place-items: center; font-size: 13px; font-weight: 700; border: 1px solid var(--line-2); background: var(--bg-2); color: var(--fg-4); transition: all 0.2s var(--ease); }
.mat-dot-label { font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--fg-4); font-weight: 600; text-align: center; max-width: 60px; line-height: 1.2; }
.mat-dot-done .mat-dot-circle { background: rgba(65,214,128,0.18); color: var(--good); border-color: rgba(65,214,128,0.4); }
.mat-dot-done .mat-dot-label { color: var(--fg-3); }
.mat-dot-active .mat-dot-circle { background: linear-gradient(180deg, rgba(140,123,255,0.32), rgba(140,123,255,0.16)); color: var(--fg); border-color: var(--accent); box-shadow: 0 0 0 3px rgba(140,123,255,0.18), 0 4px 12px rgba(140,123,255,0.35); transform: scale(1.1); }
.mat-dot-active .mat-dot-label { color: var(--accent-hi); font-weight: 700; }
.mat-dot-sep { width: 18px; height: 2px; background: var(--line-2); align-self: center; margin-top: 5px; border-radius: 2px; }
/* Pipeline timeline */
.pl-timeline { display: flex; align-items: stretch; gap: 0; padding: 6px 4px 14px; overflow-x: auto; }
.pl-node { display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 88px; padding: 4px 6px; text-align: center; }
.pl-node-id { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; color: var(--fg-4); letter-spacing: 0.05em; font-weight: 700; }
.pl-node-dot { width: 14px; height: 14px; border-radius: 999px; border: 2px solid var(--line-2); background: var(--bg-2); position: relative; }
.pl-node-name { font-size: 10.5px; color: var(--fg-2); text-transform: capitalize; line-height: 1.3; max-width: 88px; }
.pl-node-date { font-size: 9.5px; color: var(--fg-4); font-variant-numeric: tabular-nums; }
.pl-node-good .pl-node-dot { background: var(--good); border-color: rgba(65,214,128,0.45); box-shadow: 0 0 0 3px rgba(65,214,128,0.15); }
.pl-node-good .pl-node-id { color: var(--good); }
.pl-node-mid .pl-node-dot { background: var(--mid); border-color: rgba(243,179,90,0.45); box-shadow: 0 0 0 3px rgba(243,179,90,0.12); }
.pl-node-mid .pl-node-id { color: var(--mid); }
.pl-node-low .pl-node-dot { background: var(--low); border-color: rgba(239,106,103,0.45); box-shadow: 0 0 0 3px rgba(239,106,103,0.12); }
.pl-node-todo .pl-node-dot { background: var(--bg-3); border-color: var(--line-3); }
.pl-line { flex: 1; min-width: 24px; align-self: flex-start; margin-top: 22px; height: 2px; background: linear-gradient(90deg, var(--line-2), var(--line-3), var(--line-2)); border-radius: 2px; }
.pl-legend { display: flex; gap: 10px; padding-top: 8px; border-top: 1px solid var(--line-soft); margin-top: 6px; font-size: 10.5px; }
.pl-leg { display: inline-flex; align-items: center; gap: 5px; color: var(--fg-3); }
.pl-leg::before { content: ''; width: 8px; height: 8px; border-radius: 999px; }
.pl-leg-good::before { background: var(--good); }
.pl-leg-mid::before { background: var(--mid); }
.pl-leg-low::before { background: var(--low); }
.pl-leg-todo::before { background: var(--bg-3); border: 1px solid var(--line-3); }
/* Bricks stacked bars */
.cs-stack { margin: 14px 0; }
.cs-stack:first-child { margin-top: 0; }
.cs-stack-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; }
.cs-stack-label { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--fg-3); font-weight: 700; }
.cs-stack-total { font-size: 12px; color: var(--fg-4); font-variant-numeric: tabular-nums; font-weight: 600; }
.cs-stack-bar { display: flex; height: 14px; gap: 2px; border-radius: 4px; overflow: hidden; background: var(--bg-3); }
.cs-stack-seg { transition: opacity 0.15s var(--ease); }
.cs-stack-seg:hover { opacity: 0.85; }
.cs-stack-legend { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.cs-stack-chip { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--line); color: var(--fg-2); background: var(--bg-2); }
.cs-stack-chip::before { content: ''; width: 8px; height: 8px; border-radius: 999px; }
.cs-stack-chip-v { font-variant-numeric: tabular-nums; font-weight: 700; color: var(--fg); }
/* Severity / actionability colors */
.cs-seg-crit { background: var(--low); color: var(--low); }
.cs-seg-crit::before { background: var(--low); }
.cs-seg-high { background: #ff8e4d; color: #ff8e4d; }
.cs-seg-high::before { background: #ff8e4d; }
.cs-seg-mid { background: var(--mid); color: var(--mid); }
.cs-seg-mid::before { background: var(--mid); }
.cs-seg-low { background: var(--accent); color: var(--accent-hi); }
.cs-seg-low::before { background: var(--accent); }
.cs-seg-good { background: var(--good); color: var(--good); }
.cs-seg-good::before { background: var(--good); }
.cs-seg-todo { background: var(--fg-4); color: var(--fg-4); }
.cs-seg-todo::before { background: var(--fg-4); }
/* Coverage heatmap */
.cov-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 8px; }
.cov-cell { padding: 10px 12px; border-radius: var(--radius-sm); border: 1px solid var(--line); display: flex; flex-direction: column; gap: 4px; transition: border-color 0.12s var(--ease), transform 0.12s var(--ease); }
.cov-cell:hover { border-color: var(--line-3); transform: translateY(-1px); }
.cov-cell-label { font-size: 11px; color: var(--fg-3); text-transform: capitalize; line-height: 1.3; }
.cov-cell-status { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; line-height: 1; padding: 3px 7px; border-radius: 4px; align-self: flex-start; }
.cov-cell-good { border-left: 3px solid var(--good); }
.cov-cell-good .cov-cell-status { color: var(--good); background: rgba(65,214,128,0.14); }
.cov-cell-mid { border-left: 3px solid var(--mid); }
.cov-cell-mid .cov-cell-status { color: var(--mid); background: rgba(243,179,90,0.14); }
.cov-cell-low { border-left: 3px solid var(--low); }
.cov-cell-low .cov-cell-status { color: var(--low); background: rgba(239,106,103,0.14); }
.cov-cell-crit { border-left: 3px solid var(--low); background: rgba(239,106,103,0.04); }
.cov-cell-crit .cov-cell-status { color: var(--low); background: rgba(239,106,103,0.18); }
.cov-cell-todo { border-left: 3px solid var(--fg-5); opacity: 0.78; }
.cov-cell-todo .cov-cell-status { color: var(--fg-3); background: var(--bg-3); }
/* API catalogue */
.api-sections { display: grid; grid-template-columns: 1fr; gap: 16px; }
.api-card { background: var(--bg-1); border: 1px solid var(--line); border-radius: var(--radius); padding: 16px 18px; }
.api-card-head { display: flex; align-items: baseline; gap: 12px; padding-bottom: 12px; border-bottom: 1px solid var(--line); margin-bottom: 12px; flex-wrap: wrap; }
.api-card-title { margin: 0; font-size: 15px; font-weight: 600; color: var(--fg); letter-spacing: -0.005em; text-transform: none; }
.api-proto { font-size: 10.5px; font-weight: 800; letter-spacing: 0.12em; padding: 3px 9px; border-radius: 999px; border: 1px solid transparent; }
.api-proto-soap { color: #7dd3c0; background: rgba(125,211,192,0.12); border-color: rgba(125,211,192,0.4); }
.api-proto-rest { color: #4ade80; background: rgba(74,222,128,0.12); border-color: rgba(74,222,128,0.4); }
.api-proto-kafka { color: #ef6f6c; background: rgba(239,111,108,0.12); border-color: rgba(239,111,108,0.4); }
.api-proto-jms { color: #f5b860; background: rgba(245,184,96,0.12); border-color: rgba(245,184,96,0.4); }
.api-proto-batch { color: #a899ff; background: rgba(168,153,255,0.12); border-color: rgba(168,153,255,0.4); }
.api-proto-unknown { color: var(--fg-3); background: var(--bg-3); border-color: var(--line-2); }
.api-qualifier { font-size: 10.5px; color: var(--fg-4); font-style: italic; padding: 2px 7px; border: 1px dashed var(--line-2); border-radius: 4px; }
.api-meta { display: grid; grid-template-columns: 130px 1fr; gap: 4px 14px; margin: 0 0 12px; font-size: 12px; }
.api-meta dt { color: var(--fg-4); text-transform: uppercase; font-size: 10px; letter-spacing: 0.1em; font-weight: 600; padding-top: 1px; }
.api-meta dd { margin: 0; color: var(--fg-2); word-break: break-word; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; }
.api-ops-head { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--fg-3); font-weight: 700; margin: 12px 0 6px; }
.api-ops { width: 100%; border-collapse: collapse; font-size: 12px; }
.api-ops th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--fg-4); border-bottom: 1px solid var(--line); padding: 6px 8px; font-weight: 600; }
.api-ops td { padding: 7px 8px; border-bottom: 1px solid var(--line-soft); color: var(--fg-2); vertical-align: top; }
.api-ops td code { background: rgba(140,123,255,0.10); color: var(--accent-hi); border-color: rgba(140,123,255,0.25); padding: 1px 5px; font-weight: 600; }
.api-consumer { display: inline-block; padding: 1px 8px; margin: 0 4px 3px 0; background: var(--bg-3); border: 1px solid var(--line); border-radius: 999px; font-size: 11px; color: var(--fg-2); }
/* Global hero — sponsor phrase + 4 tiles, sits between site-header and tabs nav */
.hero-bar { background: linear-gradient(180deg, rgba(140,123,255,0.06), transparent), var(--bg-1); border-bottom: 1px solid var(--line); position: relative; z-index: 5; }
.hero-bar::after { content: ''; position: absolute; left: 0; right: 0; bottom: -1px; height: 1px; background: linear-gradient(90deg, transparent, rgba(140,123,255,0.32) 50%, transparent); }
.hero-bar-inner { max-width: 1520px; margin: 0 auto; padding: 18px 28px 20px; display: flex; align-items: center; justify-content: space-between; gap: 26px; flex-wrap: wrap; }
.hero-phrase { margin: 0; color: var(--fg-2); font-size: 14px; line-height: 1.55; max-width: 70ch; }
.hero-phrase strong { color: var(--fg); font-weight: 600; }
.hero-phrase-domain { color: var(--fg-3); font-style: italic; }
.hero-tiles { display: grid; grid-template-columns: repeat(4, minmax(120px, 1fr)); gap: 10px; min-width: 540px; }
@media (max-width: 900px) { .hero-tiles { min-width: 0; grid-template-columns: repeat(2, 1fr); } }
.gh-tile { display: flex; flex-direction: column; gap: 2px; padding: 10px 14px; background: var(--bg-2); border: 1px solid var(--line); border-radius: var(--radius-sm); text-decoration: none; transition: border-color 0.15s var(--ease), transform 0.15s var(--ease); border-left-width: 3px; }
.gh-tile:hover { border-color: var(--line-3); transform: translateY(-1px); color: inherit; }
.gh-tile-value { font-size: 22px; font-weight: 700; line-height: 1.05; color: var(--fg); font-variant-numeric: tabular-nums; letter-spacing: -0.02em; display: flex; align-items: baseline; gap: 2px; }
.gh-tile-unit { font-size: 12px; font-weight: 500; color: var(--fg-4); margin-left: 1px; }
.gh-tile-label { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--fg-3); font-weight: 700; margin-top: 4px; }
.gh-tile-hint { font-size: 10.5px; color: var(--fg-4); margin-top: 1px; }
.gh-tile-good { border-left-color: var(--good); }
.gh-tile-good .gh-tile-value { color: var(--good); }
.gh-tile-mid { border-left-color: var(--mid); }
.gh-tile-mid .gh-tile-value { color: var(--mid); }
.gh-tile-low { border-left-color: var(--low); }
.gh-tile-low .gh-tile-value { color: var(--low); }
.gh-tile-empty { border-left-color: var(--line-3); opacity: 0.78; }
.gh-tile-empty .gh-tile-value { font-size: 13px; font-weight: 500; color: var(--fg-4); letter-spacing: 0; }
/* Trajectory tab */
.traj-urgent-card { border-left: 3px solid var(--low); }
.traj-urgent { padding: 12px 0; border-bottom: 1px dashed var(--line-soft); }
.traj-urgent:last-child { border-bottom: none; }
.traj-urgent-title { margin: 0 0 6px; font-size: 13.5px; color: var(--fg); text-transform: none; font-weight: 700; letter-spacing: -0.005em; }
.traj-urgent-intro { margin: 0 0 8px; color: var(--fg-2); font-size: 12.5px; line-height: 1.55; }
.traj-mini-table { width: 100%; font-size: 12px; border-collapse: collapse; }
.traj-mini-table th { text-align: left; color: var(--fg-4); font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; padding: 4px 8px; width: 200px; vertical-align: top; }
.traj-mini-table td { padding: 4px 8px; color: var(--fg-2); vertical-align: top; }
.traj-mini-table tr:not(:last-child) th, .traj-mini-table tr:not(:last-child) td { border-bottom: 1px solid var(--line-soft); }
/* Update candidates */
.uc-list { display: flex; flex-direction: column; gap: 10px; }
.uc-row { background: var(--bg-2); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 12px 14px; border-left: 3px solid var(--mid); }
.uc-row.uc-closed { border-left-color: var(--good); opacity: 0.75; }
.uc-row-head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; flex-wrap: wrap; }
.uc-id { font-size: 11px; color: var(--fg-3); font-weight: 600; }
.uc-conf { font-size: 10.5px; margin-left: auto; }
.uc-desc { margin: 0 0 6px; font-size: 12.5px; color: var(--fg-2); line-height: 1.5; }
.uc-meta { display: flex; gap: 14px; flex-wrap: wrap; font-size: 11px; color: var(--fg-3); padding-top: 6px; border-top: 1px solid var(--line-soft); }
.uc-meta .k { font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--fg-4); font-weight: 600; }
.uc-meta code { font-size: 10.5px; }
/* Run timeline */
.run-timeline { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 12px; }
.run-row { background: var(--bg-2); border: 1px solid var(--line); border-left: 3px solid var(--accent); border-radius: var(--radius-sm); padding: 10px 14px; }
.run-meta { display: flex; align-items: center; gap: 10px; margin-bottom: 5px; flex-wrap: wrap; }
.run-date { font-size: 11px; color: var(--accent-hi); font-weight: 600; font-variant-numeric: tabular-nums; }
.run-id { font-size: 10.5px; color: var(--fg-3); background: var(--bg-3); padding: 1px 7px; border-radius: 4px; }
.run-node { font-size: 11px; font-style: italic; }
.run-intent { font-size: 12.5px; color: var(--fg-2); line-height: 1.5; margin-bottom: 5px; }
.run-next { font-size: 11.5px; color: var(--fg-3); padding-top: 5px; border-top: 1px dashed var(--line-soft); }
.run-next .k { color: var(--accent-2); font-weight: 700; font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; margin-right: 4px; }
/* Adoption weeks */
.adopt-weeks { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 12px; }
.adopt-week { display: grid; grid-template-columns: 44px 1fr; gap: 14px; background: var(--bg-2); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 12px 14px 14px; }
.adopt-week-num { width: 36px; height: 36px; border-radius: 999px; background: rgba(140,123,255,0.12); color: var(--accent-hi); border: 1px solid rgba(140,123,255,0.32); display: grid; place-items: center; font-size: 14px; font-weight: 700; }
.adopt-week-title { margin: 0 0 8px; font-size: 13px; color: var(--fg); font-weight: 600; text-transform: none; letter-spacing: -0.005em; }
.adopt-week-bullets { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 3px; }
.adopt-week-bullets li { font-size: 12px; color: var(--fg-3); line-height: 1.5; }
/* Sources — anchoring score */
.anc-hero { background: linear-gradient(140deg, rgba(140,123,255,0.05) 0%, transparent 60%), var(--bg-1); }
.anc-hero-inner { display: grid; grid-template-columns: 220px 1fr; gap: 26px; align-items: center; }
@media (max-width: 800px) { .anc-hero-inner { grid-template-columns: 1fr; } }
.anc-score { padding: 16px 20px; border-radius: var(--radius); border-left: 4px solid var(--line-3); background: var(--bg-2); display: flex; flex-direction: column; gap: 4px; }
.anc-score-v { font-size: 50px; font-weight: 700; line-height: 1; font-variant-numeric: tabular-nums; letter-spacing: -0.03em; color: var(--fg); }
.anc-score-unit { font-size: 22px; font-weight: 500; color: var(--fg-4); margin-left: 4px; }
.anc-score-l { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--fg-3); font-weight: 700; margin-top: 4px; }
.anc-score-good { border-left-color: var(--good); }
.anc-score-good .anc-score-v { color: var(--good); }
.anc-score-mid { border-left-color: var(--mid); }
.anc-score-mid .anc-score-v { color: var(--mid); }
.anc-score-low { border-left-color: var(--low); }
.anc-score-low .anc-score-v { color: var(--low); }
.anc-bar { display: flex; height: 12px; border-radius: 6px; overflow: hidden; background: var(--bg-3); }
.anc-seg-anchored { background: linear-gradient(90deg, var(--good), #6de89b); }
.anc-seg-unanchored { background: linear-gradient(90deg, var(--low), #f59f8a); }
.anc-legend { display: flex; gap: 10px; margin-top: 10px; font-size: 11.5px; }
.anc-chip { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 999px; border: 1px solid var(--line); }
.anc-chip-anchored { color: var(--good); border-color: rgba(65,214,128,0.3); background: rgba(65,214,128,0.06); }
.anc-chip-unanchored { color: var(--low); border-color: rgba(239,106,103,0.3); background: rgba(239,106,103,0.06); }
.anc-chip strong { font-variant-numeric: tabular-nums; }
.anc-explain { font-size: 12px; line-height: 1.5; max-width: 64ch; margin: 10px 0 0; }
.anc-explain code { background: var(--bg-3); border: 1px solid var(--line); padding: 1px 5px; border-radius: 4px; font-size: 11px; }
/* Architecture — sub-nav for diagrams */
.dia-subnav { display: flex; flex-wrap: wrap; gap: 4px; padding: 0; margin: 0 0 12px; border-bottom: 1px solid var(--line); }
.dia-tab { background: none; border: none; color: var(--fg-3); padding: 8px 14px; font-size: 12px; font-weight: 500; font-family: inherit; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; transition: color 0.12s var(--ease), border-color 0.12s var(--ease); letter-spacing: 0.005em; }
.dia-tab:hover { color: var(--fg-2); }
.dia-tab.active { color: var(--fg); border-bottom-color: var(--accent); }
/* All panes stay in DOM with measurable width so Mermaid can compute layout
   even before the user clicks. Inactive panes are visually clipped to zero
   height; active becomes the visible content. */
.dia-pane { max-height: 0; overflow: hidden; opacity: 0; transition: max-height 0s linear; }
.dia-pane.active { max-height: none; opacity: 1; animation: panelIn 0.22s var(--ease-out); }
.dia-pane-sub { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.12em; margin: 0 0 12px; padding-left: 4px; }
/* Mermaid loading state — when JS hasn't rendered yet, show a placeholder */
body:not(.mermaid-loaded) .mermaid { color: var(--fg-4); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; white-space: pre; padding: 14px; background: var(--bg-2); border: 1px dashed var(--line-2); border-radius: var(--radius-sm); display: block; }
body:not(.mermaid-loaded) .mermaid::before { content: '⏳ Mermaid loading…  (source visible if CDN blocked)'; display: block; color: var(--accent-hi); font-family: ui-sans-serif, system-ui; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px; }
/* 4-tab taxonomy — sub-nav within top tabs */
.tab-group { display: block; }
.tab-group-nav { margin-bottom: 20px; }
.tg-badge { background: var(--bg-3); color: var(--fg-3); font-size: 9.5px; font-weight: 600; padding: 1px 6px; border-radius: 999px; margin-left: 6px; }
.dia-tab.active .tg-badge { background: rgba(140,123,255,0.18); color: var(--accent-hi); }
.nba-preview { background: var(--bg-2); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 14px 16px; font-size: 12.5px; color: var(--fg-2); line-height: 1.55; white-space: pre-wrap; font-family: inherit; margin: 0; max-height: 360px; overflow-y: auto; }
/* ============================================================== */
/* Overview — top hotspots + open questions split + NBA ranked     */
/* ============================================================== */
.ov-split { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 18px; margin-top: 18px; }
@media (max-width: 1100px) { .ov-split { grid-template-columns: 1fr; } }
.ov-hot-list { padding: 0; }
.ov-hot { display: grid; grid-template-columns: 4px 1fr; gap: 14px; padding: 14px 18px; border-bottom: 1px solid var(--line-soft); position: relative; cursor: pointer; transition: background 0.15s var(--ease); }
.ov-hot:last-child { border-bottom: 0; }
.ov-hot:hover { background: rgba(255,255,255,0.018); }
.ov-hot-bar { border-radius: 2px; align-self: stretch; background: var(--low); }
.ov-hot-bar-critical { background: linear-gradient(180deg, #ef6a67, #b03b39); box-shadow: 0 0 12px -2px rgba(239,106,103,0.55); }
.ov-hot-bar-high     { background: linear-gradient(180deg, #ff8e4d, #c45a1f); box-shadow: 0 0 10px -2px rgba(255,142,77,0.45); }
.ov-hot-main { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.ov-hot-row { display: inline-flex; align-items: center; gap: 8px; font-size: 11px; flex-wrap: wrap; }
.ov-hot-id { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10.5px; font-weight: 600; color: var(--fg-3); letter-spacing: 0.03em; }
.ov-hot-kind { color: var(--fg-4); font-size: 11px; letter-spacing: 0.01em; }
.ov-hot-title { color: var(--fg); font-size: 13px; font-weight: 500; line-height: 1.4; letter-spacing: -0.005em; }
.ov-hot-title code { font-size: 11.5px; background: var(--bg-2); border-color: var(--line-2); }
.ov-hot-foot { font-size: 11px; letter-spacing: 0.005em; }
.ov-q-list { padding: 0; }
.ov-q { padding: 14px 18px; border-bottom: 1px solid var(--line-soft); display: flex; flex-direction: column; gap: 6px; }
.ov-q:last-child { border-bottom: 0; }
.ov-q-head { display: inline-flex; align-items: center; gap: 8px; font-size: 10.5px; flex-wrap: wrap; }
.ov-q-id { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10.5px; font-weight: 600; color: var(--accent-hi); letter-spacing: 0.03em; }
.ov-q-area { color: var(--fg-4); font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.1em; padding: 1px 7px; border: 1px solid var(--line); border-radius: 999px; }
.ov-q-text { margin: 0; color: var(--fg-2); font-size: 12.5px; line-height: 1.5; letter-spacing: -0.003em; }
.ov-q-text code { font-size: 11px; }
.ov-q-foot { font-size: 10.5px; letter-spacing: 0.01em; }
.ov-nba { margin-top: 18px; }
.ov-nba-banner { display: flex; align-items: center; gap: 12px; margin: 0 0 16px; padding: 11px 14px; background: linear-gradient(90deg, rgba(140,123,255,0.10), rgba(140,123,255,0.02) 70%, transparent); border: 1px solid rgba(140,123,255,0.20); border-radius: var(--radius-sm); font-size: 12.5px; color: var(--fg-2); line-height: 1.5; }
.ov-nba-banner-tag { display: inline-flex; align-items: center; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10.5px; font-weight: 600; color: var(--accent-hi); background: rgba(140,123,255,0.18); border: 1px solid rgba(140,123,255,0.32); padding: 2px 8px; border-radius: 999px; letter-spacing: 0.03em; flex-shrink: 0; }
.ov-nba-banner strong { color: var(--fg); font-weight: 600; }
.ov-nba-list { list-style: none; margin: 0; padding: 0; }
.ov-nba-row { display: grid; grid-template-columns: 36px 1fr; gap: 16px; padding: 14px 0; border-top: 1px solid var(--line-soft); }
.ov-nba-row:first-child { border-top: 0; padding-top: 4px; }
.ov-nba-rank { width: 36px; height: 36px; display: grid; place-items: center; background: linear-gradient(180deg, var(--bg-2), var(--bg-1)); border: 1px solid var(--line-2); border-radius: 10px; font-size: 16px; font-weight: 700; color: var(--accent-hi); font-variant-numeric: tabular-nums; letter-spacing: -0.02em; box-shadow: inset 0 1px 0 rgba(255,255,255,0.04); }
.ov-nba-body { min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.ov-nba-row-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.ov-nba-row-head h4 { margin: 0; font-size: 14px; font-weight: 600; color: var(--fg); letter-spacing: -0.012em; line-height: 1.3; }
.ov-nba-interest { flex-shrink: 0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; font-weight: 600; color: var(--mid); letter-spacing: 0.04em; }
.ov-nba-why { margin: 0; color: var(--fg-2); font-size: 12.5px; line-height: 1.55; letter-spacing: -0.003em; max-width: 88ch; }
.ov-nba-why code, .ov-nba-out code { font-size: 11px; }
.ov-nba-out { font-size: 11.5px; letter-spacing: 0.005em; padding-top: 2px; }
/* Knowledge-state hero verdict — sits at the top of Overview */
.ov-verdict { margin-bottom: 18px; border-left: 3px solid var(--line-3); }
.ov-verdict-good { border-left-color: var(--good); background: linear-gradient(90deg, rgba(65,214,128,0.04), transparent 60%); }
.ov-verdict-mid { border-left-color: var(--mid); background: linear-gradient(90deg, rgba(243,179,90,0.04), transparent 60%); }
.ov-verdict-low { border-left-color: var(--low); background: linear-gradient(90deg, rgba(239,106,103,0.04), transparent 60%); }
.ov-verdict-unknown { border-left-color: var(--fg-4); }
.ov-verdict .card-body { padding: 16px 18px; }
.ov-verdict-row { display: flex; align-items: flex-start; gap: 14px; }
.ov-verdict-mark { width: 10px; height: 10px; border-radius: 999px; margin-top: 6px; flex-shrink: 0; background: var(--fg-4); }
.ov-verdict-mark-good { background: var(--good); box-shadow: 0 0 0 4px rgba(65,214,128,0.16); }
.ov-verdict-mark-mid { background: var(--mid); box-shadow: 0 0 0 4px rgba(243,179,90,0.16); }
.ov-verdict-mark-low { background: var(--low); box-shadow: 0 0 0 4px rgba(239,106,103,0.16); }
.ov-verdict-mark-unknown { background: var(--fg-4); }
.ov-verdict-main { min-width: 0; flex: 1; }
.ov-verdict-headline { font-size: 15px; color: var(--fg-2); line-height: 1.5; letter-spacing: -0.003em; }
.ov-verdict-label { color: var(--fg); font-weight: 600; letter-spacing: -0.005em; }
.ov-verdict-warn { font-size: 12px; color: var(--mid); margin-top: 6px; line-height: 1.4; }
/* Coverage card — promoted from Meta */
.ov-coverage { margin-top: 18px; }
.ov-cov-intro { font-size: 12px; margin: 0 0 14px; }
/* Information sources card */
.ov-sources { margin-top: 18px; }
.ov-src-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 8px; }
.ov-src { display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: var(--bg-1); border: 1px solid var(--line); border-radius: var(--radius-sm); }
.ov-src-good { border-color: rgba(65,214,128,0.25); }
.ov-src-mid { border-color: rgba(243,179,90,0.25); }
.ov-src-low { border-color: rgba(239,106,103,0.25); }
.ov-src-rank { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10.5px; font-weight: 700; color: var(--accent-hi); background: rgba(140,123,255,0.08); border: 1px solid rgba(140,123,255,0.22); padding: 2px 6px; border-radius: 4px; flex-shrink: 0; letter-spacing: 0.02em; }
.ov-src-main { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 2px; }
.ov-src-name { font-size: 12.5px; font-weight: 500; color: var(--fg); line-height: 1.3; }
.ov-src-meta { display: inline-flex; gap: 6px; font-size: 10.5px; align-items: center; }
.ov-src-cat { color: var(--fg-4); text-transform: uppercase; letter-spacing: 0.08em; }
.ov-src-status { padding: 1px 6px; border-radius: 3px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; font-size: 10px; }
.ov-src-status-good { color: var(--good); background: rgba(65,214,128,0.1); }
.ov-src-status-mid { color: var(--mid); background: rgba(243,179,90,0.1); }
.ov-src-status-low { color: var(--low); background: rgba(239,106,103,0.1); }
.ov-src-status-todo { color: var(--fg-4); background: var(--bg-2); }
.ov-discoveries-intro { font-size: 12px; margin: 0 0 14px; padding-left: 4px; }
/* Atoms strip — smaller, secondary; corpus content inventory */
.ov-atoms-strip { margin-top: 18px; padding: 14px 18px; background: var(--bg-1); border: 1px solid var(--line); border-radius: var(--radius-sm); }
.ov-atoms-head { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--fg-3); font-weight: 600; margin-bottom: 10px; }
.ov-atoms-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; }
@media (max-width: 800px) { .ov-atoms-grid { grid-template-columns: repeat(2, 1fr); } }
.ov-atom { display: flex; flex-direction: column; gap: 1px; padding-left: 12px; border-left: 1px solid var(--line-2); }
.ov-atom:first-child { padding-left: 0; border-left: 0; }
.ov-atom-v { font-size: 22px; font-weight: 700; color: var(--fg); letter-spacing: -0.018em; line-height: 1.05; font-variant-numeric: tabular-nums; }
.ov-atom-l { font-size: 11px; color: var(--fg-3); text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; margin-top: 2px; }
.ov-atom-h { font-size: 11px; margin-top: 1px; }
`;

  // ==========================================================================
  // 4-tab taxonomy (rationalized 2026-05-25 — was 13 flat tabs). One top-level tab
  // per mental model: Overview (what's hot now), Application (the thing),
  // Production & risk (where it hurts), Corpus meta (how we know what we
  // know). Each top tab nests sub-panes using the existing .dia-subnav
  // pattern. Empty sub-tabs are hidden.
  // ==========================================================================

  function renderTabGroup(panes) {
    const visible = panes.filter((p) => !p.hidden);
    if (visible.length === 0) return '<div class="muted">Nothing to show in this tab yet.</div>';
    if (visible.length === 1) return visible[0].render();
    const nav = visible.map((p, i) =>
      `<button class="dia-tab ${i === 0 ? 'active' : ''}" data-dia="sub-${esc(p.id)}" type="button">${esc(p.label)}${p.badge ? `<span class="tg-badge">${esc(p.badge)}</span>` : ''}</button>`
    ).join('');
    const body = visible.map((p, i) =>
      `<div class="dia-pane ${i === 0 ? 'active' : ''}" id="sub-${esc(p.id)}">${p.render()}</div>`
    ).join('');
    return `<div class="tab-group">
      <nav class="dia-subnav tab-group-nav" role="tablist">${nav}</nav>
      ${body}
    </div>`;
  }

  function renderOverviewPanel() {
    const a = corpus.app?.application || {};
    const bugs = (corpus.prod.bugs || []).length;
    const risks = (corpus.prod.risks || []).length;
    const watch = (corpus.prod.watchlist || []).length;
    const featCount = (corpus.features || []).length || asList(corpus.feature_candidates?.features || corpus.feature_candidates?.candidates).length;
    let questionsCount = 0;
    try { questionsCount = loadQuestions().active.length; } catch {}
    const inProdCount = bugs + risks + watch;
    // Lede = short summary of the application this corpus describes. The
    // corpus quality narrative comes through the KPIs, hero verdict, and
    // section cards — the lede just gives the reader context for "what app
    // is this corpus about".
    const rawDesc = a.description || a.business_domain || '';
    // Take the first sentence (or first 200 chars) — keep it scannable.
    const firstSentence = rawDesc.split(/(?<=[.!?])\s+/)[0] || rawDesc;
    const lede = firstSentence ? shorten(firstSentence, 220) : 'Application corpus.';

    // ─── Knowledge-state hero verdict ───────────────────────────────────────
    // The dashboard evaluates the CORPUS, not prod health. The hero answers:
    // "How much of the app does this base cover, with what trust, and where
    // are the gaps?"
    const cs = corpus.corpus_state?.corpus || corpus.corpus_state || {};
    const heroMetrics = computeHeroMetrics();
    const coverageEntries = computeCoverageEntriesFor(cs);
    const coveredFull = coverageEntries.filter((c) => /covered|done/.test(String(c.value).toLowerCase())).length;
    const coveragePct = heroMetrics.coverage != null ? heroMetrics.coverage : (coverageEntries.length ? Math.round(100 * coveredFull / coverageEntries.length) : null);
    const anchoringPct = heroMetrics.anchoring;
    const probableItems = (corpus.prod.bugs || []).concat(corpus.prod.risks || [], corpus.prod.watchlist || []).filter((it) => /probable/i.test(it.meta?.confidence || ''));
    function verdictPhrase() {
      const bits = [];
      if (coveragePct != null) bits.push(`${coveragePct}% des areas couvertes`);
      if (anchoringPct != null) bits.push(`${anchoringPct}% des claims ancrées code`);
      if (cs.maturity_level != null) bits.push(`stade L${cs.maturity_level}/5`);
      if (heroMetrics.freshness != null) bits.push(`fraîcheur ${heroMetrics.freshness}j`);
      return bits.join(' · ');
    }
    const verdictTone = coveragePct == null ? 'unknown'
      : coveragePct >= 70 && (anchoringPct == null || anchoringPct >= 80) ? 'good'
      : coveragePct >= 40 ? 'mid' : 'low';
    const verdictLabel = verdictTone === 'good' ? 'Base solide'
      : verdictTone === 'mid' ? 'Base opérationnelle'
      : verdictTone === 'low' ? 'Base en construction'
      : 'État inconnu';
    const verdictWarnings = [];
    if (probableItems.length) verdictWarnings.push(`${probableItems.length} fait${probableItems.length > 1 ? 's' : ''} à confidence: probable`);
    if (questionsCount) verdictWarnings.push(`${questionsCount} incertitude${questionsCount > 1 ? 's' : ''} ouverte${questionsCount > 1 ? 's' : ''}`);
    if (heroMetrics.freshness != null && heroMetrics.freshness > 30) verdictWarnings.push(`fraîcheur dégradée (${heroMetrics.freshness}j)`);
    const heroVerdictHtml = `
      <section class="card ov-verdict ov-verdict-${verdictTone}">
        <div class="card-body">
          <div class="ov-verdict-row">
            <span class="ov-verdict-mark ov-verdict-mark-${verdictTone}"></span>
            <div class="ov-verdict-main">
              <div class="ov-verdict-headline"><span class="ov-verdict-label">${esc(verdictLabel)}</span> — ${esc(verdictPhrase())}</div>
              ${verdictWarnings.length ? `<div class="ov-verdict-warn">⚠ ${verdictWarnings.map(esc).join(' · ')}</div>` : ''}
            </div>
          </div>
        </div>
      </section>`;

    // Overview KPI tiles describe the CORPUS lifecycle, not the app's prod
    // state. Bugs/risks/features still exist further down as a content
    // inventory — but they're not the headline.
    const bricksSum = corpus.brick_inventory?.brick_inventory?.summary || {};
    const totalsCells = [
      { v: passesDoneN ? `${passesDoneN}/${passesTotalN}` : '—', l: 'pipeline passes', h: passesDoneN === passesTotalN ? 'complete' : 'in progress' },
      { v: bricksN || '—', l: 'bricks captured', h: bricksActionable ? `${bricksActionable} actionable` : 'knowledge bricks' },
      { v: reconTotalN ? `${reconResolvedN}/${reconTotalN}` : '—', l: 'reconciliations', h: reconResolvedN === reconTotalN && reconTotalN > 0 ? 'all resolved' : 'pending' },
      { v: coverageEntries.length ? `${coveredFull}/${coverageEntries.length}` : '—', l: 'coverage areas', h: 'fully covered' },
    ];
    // Smaller content-inventory strip, shown later — these are atoms inside
    // the corpus, framed as inventory rather than prod-state.
    const atomCells = [
      { v: featCount, l: 'feature atoms', h: 'documented' },
      { v: bugs, l: 'bug atoms', h: 'captured' },
      { v: risks, l: 'risk atoms', h: 'captured' },
      { v: asList(corpus.structural_issues?.issues).length, l: 'structural findings', h: 'identified' },
    ];

    // ─── Top hotspots — top 4 prod items by severity (critical→high→medium) ──
    const hotspots = (impactData.prodItems || [])
      .filter((p) => p.severity !== 'resolved' && p.severity !== 'low')
      .slice(0, 4);

    function hotKindLabel(p) {
      const sub = p.kind || p.sub || '';
      const ml = p.meta?.layer || p.meta?.module || p.meta?.area || '';
      return ml ? `${sub} · ${ml}` : sub;
    }
    function hotFoot(p) {
      // Pull a one-liner from the body — first sentence under H1, or meta hints.
      const m = p.meta || {};
      const file = m.file ? `<code>${esc(m.file)}${m.line ? ':' + m.line : ''}</code>` : '';
      const ticket = m.jira_ticket ? `${m.jira_ticket}` : '';
      const owner = m.owner ? `owner ${m.owner}` : '';
      const noTicket = !ticket && p.kind === 'bug' ? 'no Jira ticket' : '';
      // First sentence of body (until period or newline)
      const bodyRaw = (p.bodyRaw || '').replace(/^#[^\n]*\n+/, '').replace(/^---\n[\s\S]*?\n---\n/, '');
      const firstSentence = bodyRaw.split(/\n\n|\. /)[0]?.replace(/[*`]/g, '').trim() || '';
      const short = shorten(firstSentence, 140);
      const parts = [short, file, ticket || owner || noTicket].filter(Boolean);
      return parts.join(' · ');
    }

    const hotspotsHtml = hotspots.length ? `
      <section class="card ov-hotspots">
        <div class="card-head">
          <h3>Captured atoms — sample</h3>
          ${inProdCount ? `<span class="card-meta">${inProdCount} catalogued · <a href="#" data-tab-goto="production">full inventory →</a></span>` : ''}
        </div>
        <div class="card-body">
          <p class="ov-discoveries-intro muted">Atoms with the highest severity in the corpus. Each one is evidence-anchored (file:line, ticket, source) so an agent or human can act on it in seconds. The corpus captures them — it does <em>not</em> resolve them.</p>
          <div class="ov-hot-list">
          ${hotspots.map((p) => {
            const sev = p.severity || 'medium';
            const sevPillTone = /critical|high/.test(sev) ? 'low' : /medium/.test(sev) ? 'mid' : 'unknown';
            const barClass = sev === 'critical' ? 'ov-hot-bar-critical' : (sev === 'high' ? 'ov-hot-bar-high' : '');
            return `<article class="ov-hot" data-detail-id="${esc(p.domId)}">
              <div class="ov-hot-bar ${barClass}"></div>
              <div class="ov-hot-main">
                <div class="ov-hot-row">
                  <span class="ov-hot-id">${esc(p.id || p.slug || '')}</span>
                  <span class="pill pill-${sevPillTone}">${esc(sev)}</span>
                  <span class="ov-hot-kind">${esc(hotKindLabel(p))}</span>
                </div>
                <div class="ov-hot-title">${esc(shorten(p.title || '', 160))}</div>
                <div class="ov-hot-foot muted">${hotFoot(p)}</div>
              </div>
            </article>`;
          }).join('')}
          </div>
        </div>
      </section>` : '';

    // ─── Open questions — parse meta/open-questions.md table ────────────────
    function parseOpenQuestions(md) {
      if (!md) return [];
      const fm = parseFrontmatter(md);
      const tables = parseMdTables(fm.body);
      if (!tables.length) return [];
      const t = tables[0];
      const hdr = (t.headers || []).map((h) => h.toLowerCase());
      const idxId = hdr.findIndex((h) => /^id$/.test(h));
      const idxQ = hdr.findIndex((h) => /question/.test(h));
      const idxArea = hdr.findIndex((h) => /area|domain/.test(h));
      const idxOwner = hdr.findIndex((h) => /owner/.test(h));
      const idxStatus = hdr.findIndex((h) => /status/.test(h));
      const rows = [];
      for (const r of t.rows) {
        const status = idxStatus >= 0 ? stripMd(r[idxStatus] || '') : '';
        if (status && !/^open$/i.test(status)) continue;
        rows.push({
          id: stripMd(r[idxId] || ''),
          question: stripMd(r[idxQ] || ''),
          area: stripMd(r[idxArea] || ''),
          owner: stripMd(r[idxOwner] || ''),
          status: status || 'open',
        });
      }
      return rows;
    }
    const allQuestions = parseOpenQuestions(corpus.questions?.open);
    const topQ = allQuestions.slice(0, 3);

    const questionsHtml = topQ.length ? `
      <section class="card ov-questions">
        <div class="card-head">
          <h3>Open questions</h3>
          <span class="card-meta">${allQuestions.length} open${questionsCount ? ` · ${questionsCount} blocking` : ''} · <a href="#" data-tab-goto="meta" data-sub-goto="sub-questions">triage →</a></span>
        </div>
        <div class="card-body ov-q-list">
          ${topQ.map((q) => `<article class="ov-q">
            <header class="ov-q-head">
              <span class="ov-q-id">${esc(q.id)}</span>
              ${q.area ? `<span class="ov-q-area">${esc(q.area)}</span>` : ''}
              <span class="pill pill-mid">open</span>
            </header>
            <p class="ov-q-text">${esc(shorten(q.question, 280))}</p>
            ${q.owner ? `<footer class="ov-q-foot muted">owner · ${esc(q.owner)}</footer>` : ''}
          </article>`).join('')}
        </div>
      </section>` : '';

    // ─── Next best actions — parse the markdown table into structured rows ──
    function parseNba(md) {
      if (!md) return { banner: '', rows: [] };
      const fm = parseFrontmatter(md);
      const body = fm.body;
      // Banner = first blockquote line
      const bqMatch = body.match(/^>\s*(.+?)(?:\n(?!>)|$)/ms);
      const banner = bqMatch ? bqMatch[1].replace(/\n>\s*/g, ' ').trim() : '';
      // Take the first table under "Recommended Next Runs"
      const recSection = body.split(/^##\s+Recommended Next Runs\s*$/m)[1] || body;
      const cutAtNext = recSection.split(/^##\s/m)[0] || recSection;
      const tables = parseMdTables(cutAtNext);
      if (!tables.length) return { banner, rows: [] };
      const t = tables[0];
      const hdr = (t.headers || []).map((h) => h.toLowerCase());
      const idxRank = hdr.findIndex((h) => /rank/.test(h));
      const idxRun = hdr.findIndex((h) => /^run$/.test(h));
      const idxInterest = hdr.findIndex((h) => /interest/.test(h));
      const idxWhy = hdr.findIndex((h) => /why/.test(h));
      const idxOut = hdr.findIndex((h) => /expected|output|updates/.test(h));
      const rows = t.rows.map((r) => ({
        rank: stripMd(r[idxRank] || ''),
        title: stripMd(r[idxRun] || ''),
        interest: stripMd(r[idxInterest] || ''),
        why: stripMd(r[idxWhy] || ''),
        output: stripMd(r[idxOut] || ''),
      })).filter((r) => r.title);
      return { banner, rows };
    }
    const nbaRawForOv = readFileSafe('_roadmap/NEXT_BEST_ACTIONS.md');
    const nba = parseNba(nbaRawForOv);
    // Try to extract a leading date from the banner ("(2026-05-25)") to use as a tag
    let nbaTag = '';
    const dateMatch = nba.banner.match(/(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) nbaTag = dateMatch[1];
    const bannerText = nba.banner.replace(/^\*\*[^:]+:\*\*\s*/i, '').replace(/^Priorité opérateur[^:]*:\s*/i, '').trim();

    const nbaHtml = nba.rows.length ? `
      <section class="card ov-nba">
        <div class="card-head">
          <h3>Next best corpus actions</h3>
          <span class="card-meta">priorité opérateur · <code>doc/_roadmap/NEXT_BEST_ACTIONS.md</code></span>
        </div>
        <div class="card-body">
          ${nba.banner ? `<p class="ov-nba-banner">${nbaTag ? `<span class="ov-nba-banner-tag">${esc(nbaTag)}</span>` : ''}${nbaInline(bannerText)}</p>` : ''}
          <ol class="ov-nba-list">
            ${nba.rows.slice(0, 5).map((row) => `<li class="ov-nba-row">
              <div class="ov-nba-rank">${esc(row.rank || '·')}</div>
              <div class="ov-nba-body">
                <div class="ov-nba-row-head">
                  <h4>${nbaInline(row.title)}</h4>
                  ${row.interest ? `<span class="ov-nba-interest" title="Interest score">★ ${esc(row.interest)}</span>` : ''}
                </div>
                ${row.why ? `<p class="ov-nba-why">${nbaInline(shorten(row.why, 360))}</p>` : ''}
                ${row.output ? `<div class="ov-nba-out muted">→ ${nbaInline(shorten(row.output, 220))}</div>` : ''}
              </div>
            </li>`).join('')}
          </ol>
        </div>
      </section>` : '';

    // ─── Coverage by area — promoted from Meta to Overview ──────────────────
    const coverageCardHtml = coverageEntries.length ? `
      <section class="card ov-coverage">
        <div class="card-head">
          <h3>Coverage by area</h3>
          <span class="card-meta">${coveredFull}/${coverageEntries.length} fully covered · <a href="#" data-tab-goto="meta">drill down →</a></span>
        </div>
        <div class="card-body">
          <p class="ov-cov-intro muted">What this knowledge base covers. Each cell is an enrichment area — green is captured, amber is in progress, dim is a known gap.</p>
          <div class="cov-grid">
            ${coverageEntries.map((c) => `
              <div class="cov-cell cov-cell-${covTone(c.value)}" title="${esc(c.raw)}">
                <div class="cov-cell-status">${esc(String(c.value).replace(/_/g, ' '))}</div>
                <div class="cov-cell-label">${esc(c.key)}</div>
              </div>`).join('')}
          </div>
        </div>
      </section>` : '';

    // ─── Information sources — contracts and historical evidence ───────────
    const sourcesArr = asList(corpus.info_sources?.information_sources || corpus.info_sources?.sources);
    const sourceRankLabel = { code: 1, prod: 2, observability: 2, metrics: 2, 'production-logs': 2, 'project-activity': 3, ticketing: 3, jira: 3, documentation: 4, wiki: 4, confluence: 4, dashboard: 4, human: 5, other: 6 };
    function srcTone(s) {
      const historical = String(sourceCoverageById.get(s.id)?.status || 'not_started').toLowerCase();
      if (/^(?:covered|deep)$/.test(historical)) return 'good';
      if (/^(?:inventory_only|started|partial)$/.test(historical)) return 'mid';
      if (historical === 'blocked') return 'low';
      return 'todo';
    }
    const sourcesCardHtml = sourcesArr.length ? `
      <section class="card ov-sources">
        <div class="card-head">
          <h3>Information sources</h3>
          <span class="card-meta">${sourcesArr.filter((s) => srcTone(s) === 'good').length}/${sourcesArr.length} historically covered · <a href="#" data-tab-goto="meta" data-sub-goto="sub-sources">anchoring →</a></span>
        </div>
        <div class="card-body">
          <p class="ov-cov-intro muted">Registered source contracts and historical evidence. Authority depends on claim scope, revision and environment. Current runtime usability is intentionally absent.</p>
          <div class="ov-src-grid">
            ${sourcesArr.slice(0, 12).map((s) => {
              const tone = srcTone(s);
              const rank = sourceRankLabel[String(s.category || '').toLowerCase()] ?? sourceRankLabel[String(s.id || '').toLowerCase()] ?? 6;
              return `<div class="ov-src ov-src-${tone}">
                <div class="ov-src-rank" title="Source category marker for navigation; not an authority rank">S${rank}</div>
                <div class="ov-src-main">
                  <div class="ov-src-name">${esc(s.name || s.id || '—')}</div>
                  <div class="ov-src-meta"><span class="ov-src-cat">${esc(s.category || '—')} · contract ${esc(s.lifecycle || 'unknown')}</span><span class="ov-src-status ov-src-status-${tone}">history ${esc(sourceCoverageById.get(s.id)?.status || 'not_started')}</span></div>
                </div>
              </div>`;
            }).join('')}
          </div>
        </div>
      </section>` : '';

    return `
      <div class="panel-head"><div>
        <h1>Overview</h1>
        <p class="lede">${esc(lede)}</p>
      </div></div>

      ${heroVerdictHtml}

      <section class="exec-section exec-scale">
        <div class="exec-sig-grid">
          ${totalsCells.map((c) => `
            <div class="exec-sig-cell">
              <div class="exec-sig-value">${esc(c.v)}</div>
              <div class="exec-sig-label">${esc(c.l)}</div>
              <div class="exec-sig-hint">${esc(c.h)}</div>
            </div>`).join('')}
        </div>
      </section>

      ${coverageCardHtml}

      ${sourcesCardHtml}

      <section class="ov-atoms-strip">
        <div class="ov-atoms-head">Atoms catalogued</div>
        <div class="ov-atoms-grid">
          ${atomCells.map((c) => `
            <div class="ov-atom">
              <div class="ov-atom-v">${esc(c.v)}</div>
              <div class="ov-atom-l">${esc(c.l)}</div>
              <div class="ov-atom-h muted">${esc(c.h)}</div>
            </div>`).join('')}
        </div>
      </section>

      ${hotspotsHtml || questionsHtml ? `<div class="ov-split">${hotspotsHtml}${questionsHtml}</div>` : ''}

      ${nbaHtml}
    `;
  }
  // Lightweight inline-markdown renderer for NBA cells (bold + code only;
  // these come from markdown table cells where structure is mostly inline).
  function nbaInline(s) {
    if (!s) return '';
    return esc(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  }

  function renderApplicationGroup() {
    // API catalog badge counts the REST endpoints when CATALOG.md has tables;
    // otherwise the API surfaces from the numbered-sections format or yaml.
    const restRows = parseRestCatalogPaths(corpus.project.apis);
    const numberedSections = parseApiCatalog(corpus.project.apis);
    const apisYaml = asList(corpus.cross_cutting?.apis);
    const apiBadgeN = restRows.length || numberedSections.length || apisYaml.length;
    const apiCatalogTab = apiBadgeN ? [{
      id: 'api-catalog',
      label: 'API catalog',
      badge: apiBadgeN,
      render: renderApiCatalog,
    }] : [];
    return renderTabGroup([
      { id: 'place-in-si', label: 'Place in SI', render: renderArchitecture },
      { id: 'features', label: 'Features', badge: corpus.features.length || asList(corpus.feature_candidates?.features || corpus.feature_candidates?.candidates).length || '', render: renderFeatures },
      ...apiCatalogTab,
      { id: 'code-maturity', label: 'Code & maturity', badge: asList(corpus.structural_issues?.issues).length || '', render: renderCode },
      { id: 'data', label: 'Data', badge: corpus.cross_cutting?.domain_entities_count || '', render: renderDomain },
    ]);
  }

  function renderProductionRiskGroup() {
    return renderTabGroup([
      { id: 'hotspots', label: 'Hotspots', badge: (corpus.prod.bugs.length + corpus.prod.risks.length + corpus.prod.watchlist.length) || '', render: renderImpactMap },
      { id: 'production-detail', label: 'Bugs · Risks · Watchlist', badge: (corpus.prod.bugs.length + corpus.prod.risks.length) || '', render: renderProduction },
    ]);
  }

  function renderMetaGroup() {
    const sourcesCount = asList(corpus.info_sources?.information_sources || corpus.info_sources?.sources).length;
    const activityCount = corpus.code_activity?.total_commits || 0;
    let questionsCount = 0;
    try { const q = loadQuestions(); questionsCount = q.active.length + q.decisions.length; } catch {}
    const handoverHasContent = !!(corpus.handover?.summary || corpus.handover?.ai_champion_guide || corpus.handover?.team_usage_guide);

    return renderTabGroup([
      { id: 'state', label: 'State', render: renderCorpusState },
      { id: 'trajectory', label: 'Trajectory', render: renderTrajectory },
      { id: 'sources', label: 'Sources', badge: sourcesCount || '', render: renderSources, hidden: sourcesCount === 0 },
      { id: 'activity', label: 'Activity', badge: activityCount || '', render: renderActivity, hidden: activityCount === 0 },
      { id: 'questions', label: 'Questions', badge: questionsCount || '', render: renderQuestions, hidden: questionsCount === 0 },
      { id: 'adoption', label: 'Adoption', render: renderHandover, hidden: !handoverHasContent },
    ]);
  }

  // Build impact data EARLY so renderOverviewPanel (which reads
  // impactData.prodItems for the Top hotspots card) can access it via closure.
  const impactData = buildImpactData();

  const totalProdItems = corpus.prod.bugs.length + corpus.prod.risks.length + corpus.prod.watchlist.length;
  const tabs = [
    { id: 'overview', label: 'Overview', renderer: renderOverviewPanel, badge: '' },
    { id: 'application', label: 'Application', renderer: renderApplicationGroup, badge: '' },
    { id: 'production', label: 'Production & risk', renderer: renderProductionRiskGroup, badge: totalProdItems || '' },
    { id: 'meta', label: 'Corpus meta', renderer: renderMetaGroup, badge: '' },
  ];

  const navHtml = tabs.map((t, idx) =>
    `<button class="tab ${idx === 0 ? 'active' : ''}" data-tab="${t.id}" role="tab"><span class="tab-label">${esc(t.label)}</span>${t.badge ? `<span class="tab-meta">${esc(t.badge)}</span>` : ''}</button>`
  ).join('');

  const app = corpus.app?.application || {};
  // ─── Header data derivation (drives the new dedup'd header) ──────────────
  // Hoisted BEFORE panelsHtml so renderOverviewPanel can read these via closure.
  const cs_ = corpus.corpus_state?.corpus || corpus.corpus_state?.maturity || corpus.corpus_state || {};
  const phaseStr = cs_.phase || cs_.operating_mode || 'corpus';
  const matLevel = cs_.maturity_level != null ? `L${cs_.maturity_level}` : '';
  const phaseBadge = [matLevel, phaseStr].filter(Boolean).join(' · ');
  const headerDomain = app.business_domain || '';
  // Header counts describe the CORPUS itself (artefact), not the app.
  // The app's modules/integrations live in `project/*` — they belong inside,
  // not as labels for the base.
  const bricksN = (corpus.brick_inventory?.brick_inventory?.summary?.total) ?? asList(corpus.brick_inventory?.bricks).length;
  const bricksActionable = (corpus.brick_inventory?.brick_inventory?.summary?.actionable) ?? 0;
  // Pipeline state lives under .pipeline.{pN_name}, with each pass an object
  // carrying a `status`. We count passes prefixed `p<digit>_`.
  const pipelineNode = corpus.code_pipeline_state?.pipeline || corpus.code_pipeline_state || {};
  const passEntries = Object.entries(pipelineNode).filter(([k, v]) => /^p\d+_/.test(k) && v && typeof v === 'object');
  const passesDoneN = passEntries.filter(([, v]) => /covered|done|complete|deep/i.test(String(v.status || ''))).length;
  const passesTotalN = passEntries.length || 9;
  // Reconciliation file may carry either `reconciliations:` or `contradictions:`
  // (the latter is the actual YAML key used by pipeline/p9-code-reconciliation-gate)
  const reconRaw = corpus.reconciliation?.reconciliations
                 ?? corpus.reconciliation?.contradictions
                 ?? [];
  const reconList = asList(reconRaw);
  const reconResolvedN = reconList.filter((r) => /resolved/i.test(r.status || '') || (r.resolution && (r.resolution.winner || r.resolution.method))).length;
  const reconTotalN = reconList.length;
  // Atoms catalogued — i.e. how many distinct knowledge atoms the corpus carries.
  const atomsN = (corpus.prod.bugs.length + corpus.prod.risks.length + corpus.prod.watchlist.length + corpus.features.length + asList(corpus.structural_issues?.issues).length);

  const panelsHtml = tabs.map((t, idx) =>
    `<section id="tab-${t.id}" class="panel ${idx === 0 ? 'active' : ''}">${t.renderer()}</section>`
  ).join('\n');
  // Freshness: last kickstart + last QC (in days)
  function ageDays(s) {
    if (!s) return null;
    const d = new Date(String(s).slice(0, 10));
    if (isNaN(d.getTime())) return null;
    return Math.max(0, Math.round((Date.now() - d) / 86400000));
  }
  const kickAge = ageDays(corpus.corpus_state?.last_kickstart || cs_.last_kickstart || cs_.last_continuous_run);
  const qcAge = ageDays(corpus.corpus_state?.last_quality_check || cs_.last_quality_check);
  function freshLabel(days) {
    if (days == null) return '—';
    if (days === 0) return 'today';
    if (days === 1) return '1d';
    return `${days}d`;
  }
  const kickOk = kickAge != null && kickAge < 7;
  const qcOk = qcAge != null && qcAge < 7;
  const runDate = corpus.generated_at ? String(corpus.generated_at).slice(0, 10) : '';

  const headerHtml = `
  <header class="site-header">
    <div class="site-header-inner">
      <div class="brand">
        <div class="mark"></div>
        <div class="brand-text">
          <span class="brand-kicker">corpus dashboard${runDate ? ` · run ${esc(runDate)}` : ''}</span>
          <div class="brand-line1">
            <span class="app-name">${esc(app.name || 'application')}</span>
            ${headerDomain ? `<span class="brand-domain">${esc(headerDomain)}</span>` : ''}
            ${app.repository?.version ? `<span class="badge badge-outline mono">${esc(app.repository.version)}</span>` : ''}
          </div>
          <div class="brand-line2">
            <span class="badge"><span class="badge-dot"></span>${esc(phaseBadge)}</span>
            ${bricksN ? `<span class="badge badge-outline" title="Knowledge bricks captured in the corpus">${bricksN} bricks</span>` : ''}
            ${passesTotalN ? `<span class="badge badge-outline" title="Pipeline passes completed">${passesDoneN}/${passesTotalN} passes</span>` : ''}
            ${reconTotalN ? `<span class="badge badge-outline" title="Cross-source contradictions resolved">${reconResolvedN}/${reconTotalN} reconciled</span>` : ''}
            ${atomsN ? `<span class="badge badge-outline" title="Distinct knowledge atoms catalogued (features + bugs + risks + watch + structural issues)">${atomsN} atoms</span>` : ''}
          </div>
        </div>
      </div>
      ${(kickAge != null || qcAge != null) ? `
      <div class="brand-actions">
        ${kickAge != null ? `<span class="freshness"><span class="freshness-dot${kickOk ? ' freshness-dot-ok' : ''}"></span>last kickstart <strong>${esc(freshLabel(kickAge))}</strong></span>` : ''}
        ${qcAge != null ? `<span class="freshness"><span class="freshness-dot${qcOk ? ' freshness-dot-ok' : ''}"></span>last QC <strong>${esc(freshLabel(qcAge))}</strong></span>` : ''}
      </div>` : ''}
    </div>
  </header>`;

  // Global hero — sponsor-friendly verdict + 4 measured tiles
  const heroBarHtml = renderGlobalHeroBar();

  // impactData already built above (needed by Overview panel during panelsHtml render).
  const details = {};
  for (const p of impactData.prodItems) {
    details[p.domId] = {
      kind: 'prod',
      sub: p.kind, // bug | risk | watch
      id: p.id,
      title: p.title,
      severity: p.severity,
      status: p.status,
      source: p.source,
      lastValidated: p.lastValidated,
      slug: p.slug,
      body: truncateBody(p.bodyRaw, 4000),
      jiraTicket: p.meta?.jira_ticket,
      dynatraceEntity: p.meta?.dynatrace_entity,
      relatedFeatures: p.relatedFeatures,
    };
  }
  for (const f of impactData.features) {
    details[f.domId] = {
      kind: 'feature',
      slug: f.slug,
      title: f.title,
      priority: f.priority,
      module: f.module,
      status: f.meta?.status,
      source: f.meta?.source,
      lastValidated: f.meta?.last_validated,
      summary: f.summary,
      body: truncateBody(f.bodyRaw, 4000),
    };
  }
  for (const m of impactData.modules) {
    details[m.domId] = {
      kind: 'module',
      id: m.id,
      role: m.role,
      layer: m.layer,
      description: m.description,
      tech: m.tech,
      dependsOn: m.dependsOn,
    };
  }
  // Global details registry — keyed by stable detail-id
  // Reused by side-drawer across tabs (Production rows, Feature cards, Code issues, etc.)
  const globalDetails = {};
  // From prod items
  for (const p of impactData.prodItems) {
    globalDetails[p.domId] = details[p.domId];
  }
  // Also add resolved prod items (dropped from impact but still need detail)
  for (const list of [corpus.prod.bugs, corpus.prod.risks, corpus.prod.watchlist]) {
    for (const it of list) {
      const id = it.meta?.id || it.slug;
      const detailId = 'prod-' + String(id).toLowerCase();
      if (globalDetails[detailId]) continue;
      const m = it.meta || {};
      const kind = /bug|known-bug/i.test(m.type) ? 'bug' : /risk/i.test(m.type) ? 'risk' : /watch/i.test(m.type) ? 'watch' : 'prod';
      let title = it.title || m.title || it.slug;
      title = title.replace(/^[A-Z]+-\d+(-[A-Za-z0-9]+)*\s*[—:-]\s*/, '');
      globalDetails[detailId] = {
        kind: 'prod',
        sub: kind,
        id, title,
        severity: String(m.severity || (m.status === 'resolved' ? 'resolved' : 'medium')).toLowerCase(),
        status: m.status,
        source: m.source,
        lastValidated: m.last_validated,
        slug: it.slug,
        body: truncateBody(it.body || '', 6000),
        jiraTicket: m.jira_ticket,
        dynatraceEntity: m.dynatrace_entity,
      };
    }
  }
  // From features
  for (const f of impactData.features) {
    globalDetails[f.domId] = details[f.domId];
  }
  // From handover
  const handoverItems = [
    ['rapport_etonnement', 'Rapport d\'étonnement', 'insight'],
    // 'next30' detail handled by Trajectory tab — not registered as a Handover drawer item
    // ['next30', 'Next 30 days', 'plan'],
    ['closeout', 'Kickstart closeout checklist', 'checklist'],
    ['team_guide', 'Team usage guide', 'guide'],
    ['ai_champion', 'AI champion guide', 'guide'],
    ['summary', 'Handover summary', 'summary'],
  ];
  for (const [key, title, kind] of handoverItems) {
    const md = corpus.handover?.[key];
    if (!md) continue;
    const fm = parseFrontmatter(md);
    globalDetails['ho-' + key] = {
      kind: 'handover',
      sub: kind,
      id: key,
      title,
      status: fm.meta?.status,
      source: fm.meta?.source,
      lastValidated: fm.meta?.last_validated,
      body: truncateBody(fm.body, 10000),
    };
  }

  // From specs
  for (const s of corpus.specs || []) {
    const m = s.meta || {};
    const summary = specShortSummary(s);
    // Compose a full body: concatenate summary + specification + impacts
    const sections = ['summary', 'specification', 'impacts', 'tests', 'deployment', 'suggestions', 'changelog'];
    const compose = [];
    if (s.docs.summary?.body) compose.push(s.docs.summary.body);
    for (const sec of sections) {
      if (sec === 'summary') continue;
      if (s.docs[sec]?.body) compose.push(`\n\n## ${sec.toUpperCase()}\n\n` + s.docs[sec].body);
    }
    const body = compose.join('\n\n');
    globalDetails['spec-' + s.id] = {
      kind: 'spec',
      id: m.ticket || s.id,
      title: summary || s.id,
      status: m.status,
      source: m.source,
      lastValidated: m.last_validated,
      body: truncateBody(body, 12000),
    };
  }

  // From structural issues
  for (const si of asList(corpus.structural_issues?.issues)) {
    if (!si.id) continue;
    globalDetails['issue-' + String(si.id).toLowerCase()] = {
      kind: 'issue',
      id: si.id,
      title: si.title || si.name || si.id,
      severity: String(si.severity || 'medium').toLowerCase(),
      status: si.status,
      file: si.file,
      line: si.line,
      lines: si.lines,
      category: si.category,
      riskFile: si.risk_file,
      confidence: si.confidence,
      body: '', // structural-issues.yaml is structured-only, no narrative
    };
  }

  // Integrations — surface as drawer items so clicking a node in the SI map
  // shows the rich per-peer context (table row, protocol, source section,
  // and matching REST endpoints for inbound REST peers).
  {
    let integForDrawer = parseIntegrationsFromReadme(corpus.project.integrations);
    if (integForDrawer.inbound.length + integForDrawer.outbound.length === 0) {
      integForDrawer = parseIntegrationsFromMap(corpus.project.integration_map);
    }
    const drawerCatalog = parseRestCatalogPaths(corpus.project.apis);
    const matchedForInbound = (it) => {
      if (!drawerCatalog.length || !/rest/i.test(it.channel)) return [];
      if (it.opsAll) return drawerCatalog;
      if (!it.allowedOps || !it.allowedOps.length) return [];
      const allowSet = new Set(it.allowedOps.map((o) => o.toUpperCase()));
      return drawerCatalog.filter((row) => allowSet.has(String(row.op).toUpperCase()));
    };
    const registerInteg = (it, dir) => {
      const did = `integ-${dir === 'in' ? 'in' : 'out'}-${integSlug(it.peer)}`;
      const proto = protocolLabel(it.channel);
      const headerBits = [
        `**Direction** — ${dir === 'in' ? 'Inbound (peer calls this app)' : 'Outbound (this app calls peer)'}`,
        `**Protocol** — ${proto}${it.channel && it.channel !== proto ? ` (${it.channel})` : ''}`,
        it.endpoint ? `**Endpoint / interface** — ${it.endpoint}` : '',
      ].filter(Boolean).join('  \n');
      // For inbound REST, render the matching catalog endpoints as a table
      let endpointsBlock = '';
      if (dir === 'in') {
        const matches = matchedForInbound(it);
        if (matches.length) {
          const header = `\n\n### REST endpoints reachable by ${it.peer}\n_${it.opsAll ? 'All operations (`*`)' : `Ops: \`${(it.allowedOps || []).join(', ')}\``} → ${matches.length} endpoint${matches.length > 1 ? 's' : ''}_\n\n`;
          const usableHash = it.hash && /^[A-Za-z0-9]+$/.test(it.hash) ? it.hash : '';
          const table = '| Method | Path | Op | Controller |\n|---|---|---|---|\n' +
            matches.map((r) => {
              const pathFilled = usableHash ? r.path.replace(/\{hash\}/g, usableHash) : r.path;
              return `| \`${r.method}\` | \`${pathFilled}\` | \`${r.op || '—'}\` | ${r.controller || '—'} |`;
            }).join('\n');
          endpointsBlock = header + table;
        }
      }
      const body = [headerBits, it.body || '', endpointsBlock].filter(Boolean).join('\n\n');
      globalDetails[did] = {
        kind: 'integration',
        sub: dir === 'in' ? 'inbound' : 'outbound',
        id: it.peer,
        title: it.peer,
        status: it.status || '',
        confidence: it.status || '',
        source: it.source || 'INTEGRATION_MAP.md',
        body: truncateBody(body, 12000),
      };
    };
    integForDrawer.inbound.forEach((it) => registerInteg(it, 'in'));
    integForDrawer.outbound.forEach((it) => registerInteg(it, 'out'));
  }

  // ─── Domain entities — register one drawer per top-level section of
  // project/domain/ENTITIES.md, including a generated ER SVG (central
  // database hub + entities radiating around it).
  // Domain entities are now expanded INLINE in the Data sub-tab — no drawer
  // registration needed. (See renderDomain → ds-card / ds-detail.)

  const clientData = {
    generated_at: corpus.generated_at,
    app: { name: app.name || '' },
    impact: {
      edges_pf: impactData.edges_pf,
      edges_fm: impactData.edges_fm,
      severities: Object.fromEntries(impactData.prodItems.map((p) => [p.domId, p.severity])),
      details,
    },
    details: globalDetails,
  };

  const drawerJs = `
(function () {
  const drawer = document.getElementById('detail-drawer');
  const titleEl = document.getElementById('detail-title');
  const kickerEl = document.getElementById('detail-kicker');
  const bodyEl = document.getElementById('detail-body');
  const closeBtn = document.getElementById('detail-close');
  function escHtml(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  function close() {
    drawer.hidden = true;
    drawer.setAttribute('aria-hidden', 'true');
  }
  function open(id) {
    const D = window.__CORPUS__.details && window.__CORPUS__.details[id];
    if (!D) return;
    kickerEl.textContent = D.kind === 'prod' ? (D.sub || 'production') : (D.kind || 'detail');
    titleEl.textContent = D.title || D.id || '—';
    bodyEl.innerHTML = renderDrawerBody(D);
    drawer.hidden = false;
    drawer.setAttribute('aria-hidden', 'false');
  }

  function renderDrawerBody(D) {
    let html = '';
    // Facts strip
    const facts = [];
    if (D.id) facts.push(['id', D.id]);
    if (D.severity) facts.push(['severity', D.severity]);
    if (D.priority) facts.push(['priority', D.priority]);
    if (D.status) facts.push(['status', String(D.status).replace(/_/g,' ')]);
    if (D.source) facts.push(['source', D.source]);
    if (D.lastValidated) facts.push(['validated', D.lastValidated]);
    if (D.jiraTicket) facts.push(['jira', D.jiraTicket]);
    if (D.dynatraceEntity) facts.push(['dynatrace', D.dynatraceEntity]);
    if (D.module) facts.push(['module', D.module]);
    if (D.file) facts.push(['file', D.file]);
    if (D.line) facts.push(['line', D.line]);
    if (D.lines) facts.push(['lines', D.lines]);
    if (D.category) facts.push(['category', D.category]);
    if (D.confidence) facts.push(['confidence', D.confidence]);
    if (facts.length) {
      html += '<div class="dd-facts">' + facts.map(([k,v]) =>
        '<span class="dd-fact"><span class="dd-fact-k">' + escHtml(k) + '</span><span class="dd-fact-v">' + escHtml(v) + '</span></span>'
      ).join('') + '</div>';
    }
    // Optional inline SVG diagram (e.g. domain ER) — rendered raw, before
    // the markdown body. Set on detail records as D.svg.
    if (D.svg) {
      html += '<div class="dd-svg">' + D.svg + '</div>';
    }
    // Body MD
    if (D.body) {
      html += '<div class="dd-body">' + popinRenderMd(D.body) + '</div>';
    } else if (!D.svg) {
      html += '<div class="muted dd-empty">No long-form content for this item.</div>';
    }
    // Risk file link
    if (D.riskFile) {
      html += '<div class="dd-link"><span class="key">Risk file</span><span class="val mono">' + escHtml(D.riskFile) + '</span></div>';
    }
    return html;
  }

  // Bind global click handlers — any element with data-detail-id opens drawer
  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-detail-id]');
    if (trigger) {
      // Skip if it's an impact-map card (impact has its own popin)
      if (trigger.classList.contains('im-card')) return;
      e.preventDefault();
      open(trigger.getAttribute('data-detail-id'));
      return;
    }
    if (e.target.closest('#detail-close')) {
      close();
      return;
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !drawer.hidden) close();
  });
  // Click outside the drawer (on the dimmed backdrop or page) closes it.
  // Skipped when the click landed on a detail trigger (which would re-open
  // immediately) — that branch handles itself.
  document.addEventListener('click', (e) => {
    if (drawer.hidden) return;
    if (e.target.closest('#detail-drawer')) return;
    if (e.target.closest('[data-detail-id]')) return;
    close();
  });
})();
`;

  const tabsJs = `
(function () {
  // Map legacy tab ids (pre-2026-05-25 13-tab taxonomy) to the new 4-tab one,
  // so cross-tab links written for the old layout still land on the right top
  // tab. The activate() helper resolves aliases transparently.
  // Legacy id → new top-tab id. NOTE: 'application' is no longer aliased here
  // because the new taxonomy reuses that id as a real top-tab. The old
  // 'application' tab (vitrine/About) is renamed 'overview', and its
  // legacy alias is 'about'.
  const TAB_ALIAS = {
    about: 'overview',
    architecture: 'application', features: 'application', code: 'application', domain: 'application',
    impact: 'production', hotspots: 'production',
    trajectory: 'meta', sources: 'meta', activity: 'meta', corpus: 'meta',
    'corpus-state': 'meta', questions: 'meta', handover: 'meta',
  };
  const tabs = document.querySelectorAll('.tab');
  const panels = document.querySelectorAll('.panel');
  function activate(rawId) {
    const id = TAB_ALIAS[rawId] || rawId;
    tabs.forEach((t) => t.classList.toggle('active', t.dataset.tab === id));
    panels.forEach((p) => p.classList.toggle('active', p.id === 'tab-' + id));
    // Trigger lane-specific lazy initializers when the relevant tab becomes visible
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (typeof drawImpactLinesAndBind === 'function' && document.getElementById('tab-production')?.classList.contains('active')) drawImpactLinesAndBind();
    }));
    if (window.__renderPendingMermaid) window.__renderPendingMermaid();
    if (history.replaceState) history.replaceState(null, '', '#' + id);
  }
  tabs.forEach((t) => t.addEventListener('click', () => activate(t.dataset.tab)));
  if (location.hash) {
    const id = location.hash.replace('#', '');
    activate(id);
  }
  window.addEventListener('hashchange', () => {
    const id = location.hash.replace('#', '');
    if (id) {
      activate(id);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });
  // Sub-nav inside any top tab (Architecture diagrams + the new tab-group panes)
  document.addEventListener('click', (e) => {
    const t = e.target.closest('.dia-tab');
    if (t) {
      const targetId = t.getAttribute('data-dia');
      // Scope to the nearest sub-nav container — .tab-group (new top-tab grouping)
      // OR .card (legacy Architecture-diagram sub-nav inside a card).
      const container = t.closest('.tab-group') || t.closest('.card');
      if (!container) return;
      container.querySelectorAll('.dia-tab').forEach((x) => x.classList.toggle('active', x === t));
      container.querySelectorAll('.dia-pane').forEach((p) => p.classList.toggle('active', p.id === targetId));
      window.__renderPendingMermaid?.();
      return;
    }
    // Domain entity chip: open the matching <details> and scroll to it
    const chip = e.target.closest('[data-open-ent]');
    if (chip) {
      e.preventDefault();
      const entId = chip.getAttribute('data-open-ent');
      const det = document.getElementById(entId);
      if (det) {
        det.open = true;
        det.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
    // Data sources tab: click a source card → toggle its inline detail panel.
    // Accordion behaviour — opening one closes the others.
    const dsClose = e.target.closest('[data-ds-close]');
    if (dsClose) {
      e.preventDefault();
      document.querySelectorAll('[data-ds-source]').forEach((c) => c.classList.remove('active'));
      document.querySelectorAll('[data-ds-detail]').forEach((d) => (d.hidden = true));
      return;
    }
    const dsCard = e.target.closest('[data-ds-source]');
    if (dsCard) {
      e.preventDefault();
      const id = dsCard.getAttribute('data-ds-source');
      const wasActive = dsCard.classList.contains('active');
      // close all
      document.querySelectorAll('[data-ds-source]').forEach((c) => c.classList.remove('active'));
      document.querySelectorAll('[data-ds-detail]').forEach((d) => (d.hidden = true));
      if (!wasActive) {
        dsCard.classList.add('active');
        const detail = document.querySelector('[data-ds-detail="' + id + '"]');
        if (detail) {
          detail.hidden = false;
          detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }
      return;
    }
    // Overview cross-links: data-tab-goto[+optional data-sub-goto] activates
    // a top tab and optionally clicks a sub-tab inside it.
    const gotoEl = e.target.closest('[data-tab-goto]');
    if (gotoEl) {
      e.preventDefault();
      const top = gotoEl.getAttribute('data-tab-goto');
      const sub = gotoEl.getAttribute('data-sub-goto');
      activate(top);
      if (sub) {
        requestAnimationFrame(() => {
          const subBtn = document.querySelector('#tab-' + top + ' .dia-tab[data-dia="' + sub + '"]');
          if (subBtn) subBtn.click();
        });
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });
})();
`;

  const impactJs = `
const SEV_COLORS = { critical: '#ef6a67', high: '#ff8e4d', medium: '#f3b35a', low: '#8c7bff', resolved: '#41d680', unknown: '#7c8392' };
function sevColor(s) { return SEV_COLORS[s] || '#7c8392'; }
function escHtml(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

let impactSelectedId = null;
let impactBoundOnce = false;

function getChainIds(selected) {
  const D = window.__CORPUS__.impact;
  const ids = new Set([selected]);
  if (selected.startsWith('prod-')) {
    // features directly affected
    for (const e of D.edges_pf) {
      const [s, d] = e.split('|');
      if (s === selected) ids.add(d);
    }
    // modules of those features
    for (const fid of [...ids]) {
      if (!fid.startsWith('feat-')) continue;
      for (const e of D.edges_fm) {
        const [s, d] = e.split('|');
        if (s === fid) ids.add(d);
      }
    }
  } else if (selected.startsWith('feat-')) {
    // prod that affect this feature
    for (const e of D.edges_pf) {
      const [s, d] = e.split('|');
      if (d === selected) ids.add(s);
    }
    // module that owns this feature
    for (const e of D.edges_fm) {
      const [s, d] = e.split('|');
      if (s === selected) ids.add(d);
    }
  } else if (selected.startsWith('mod-')) {
    // features in this module
    for (const e of D.edges_fm) {
      const [s, d] = e.split('|');
      if (d === selected) ids.add(s);
    }
    // prod issues affecting those features
    for (const fid of [...ids]) {
      if (!fid.startsWith('feat-')) continue;
      for (const e of D.edges_pf) {
        const [s, d] = e.split('|');
        if (d === fid) ids.add(s);
      }
    }
  }
  return ids;
}

function drawImpactLines() {
  const wrap = document.getElementById('impact-wrap');
  const svg = document.getElementById('impact-svg');
  if (!wrap || !svg) return;
  const D = window.__CORPUS__.impact;
  const wrect = wrap.getBoundingClientRect();
  svg.setAttribute('viewBox', '0 0 ' + wrect.width + ' ' + wrect.height);
  svg.setAttribute('width', wrect.width);
  svg.setAttribute('height', wrect.height);
  svg.innerHTML = '';

  const chain = impactSelectedId ? getChainIds(impactSelectedId) : null;

  function getCenter(domId, side) {
    const el = document.querySelector('[data-id="' + domId + '"]');
    if (!el || el.offsetParent === null) return null; // hidden
    const r = el.getBoundingClientRect();
    const cx = side === 'right' ? r.right - wrect.left : r.left - wrect.left;
    const cy = r.top + r.height/2 - wrect.top;
    return { x: cx, y: cy };
  }
  function path(a, b, color, opacity, width) {
    const dx = (b.x - a.x) * 0.45;
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', 'M' + a.x + ',' + a.y + ' C' + (a.x + dx) + ',' + a.y + ' ' + (b.x - dx) + ',' + b.y + ' ' + b.x + ',' + b.y);
    p.setAttribute('stroke', color);
    p.setAttribute('stroke-width', width);
    p.setAttribute('fill', 'none');
    p.setAttribute('opacity', opacity);
    p.setAttribute('stroke-linecap', 'round');
    return p;
  }

  // Draw only edges between currently visible cards
  for (const e of D.edges_pf) {
    const [src, dst] = e.split('|');
    if (chain && !(chain.has(src) && chain.has(dst))) continue;
    const a = getCenter(src, 'right');
    const b = getCenter(dst, 'left');
    if (!a || !b) continue;
    const sev = D.severities[src] || 'unknown';
    svg.appendChild(path(a, b, sevColor(sev), chain ? 0.95 : 0.45, chain ? 2.2 : 1.0));
  }
  for (const e of D.edges_fm) {
    const [src, dst] = e.split('|');
    if (chain && !(chain.has(src) && chain.has(dst))) continue;
    const a = getCenter(src, 'right');
    const b = getCenter(dst, 'left');
    if (!a || !b) continue;
    const fEl = document.querySelector('[data-id="' + src + '"]');
    const sev = fEl?.getAttribute('data-sev') || 'unknown';
    svg.appendChild(path(a, b, sevColor(sev), chain ? 0.75 : 0.3, chain ? 2.0 : 0.9));
  }
}

function focusOnImpactItem(id) {
  impactSelectedId = id;
  const chain = id ? getChainIds(id) : null;
  const wrap = document.getElementById('impact-wrap');
  if (wrap) wrap.classList.toggle('is-focused', !!id);

  document.querySelectorAll('.im-card').forEach((c) => {
    const cid = c.getAttribute('data-id');
    if (!chain) {
      c.classList.remove('im-hidden');
      c.classList.remove('im-selected');
    } else if (chain.has(cid)) {
      c.classList.remove('im-hidden');
      c.classList.toggle('im-selected', cid === id);
    } else {
      c.classList.add('im-hidden');
      c.classList.remove('im-selected');
    }
  });
  // Hide section dividers if no orphan is in chain
  document.querySelectorAll('.im-divider').forEach((d) => {
    if (!chain) { d.style.display = ''; return; }
    // hide divider entirely in focus mode (chain rarely includes orphans)
    d.style.display = 'none';
  });

  // Toggle clear button + popin
  const clearBtn = document.getElementById('impact-clear');
  if (clearBtn) clearBtn.hidden = !id;
  const popin = document.getElementById('impact-popin');
  if (popin) {
    if (id) {
      popin.innerHTML = renderImpactPopin(id);
      popin.hidden = false;
      // Wait one frame so layout adjusts, then redraw lines + scroll the popin into view
      requestAnimationFrame(() => requestAnimationFrame(() => {
        drawImpactLines();
        // smooth scroll the impact wrap top into view so user sees both chain + popin
        const head = document.querySelector('#tab-impact .panel-head');
        if (head) head.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }));
    } else {
      popin.hidden = true;
      popin.innerHTML = '';
      drawImpactLines();
    }
  } else {
    drawImpactLines();
  }
}

function renderImpactPopin(id) {
  const D = window.__CORPUS__.impact;
  const d = D.details && D.details[id];
  if (!d) return '<div class="im-popin-empty">No detail available.</div>';
  const chain = getChainIds(id);

  // collect linked items for the sidebar
  const linkedProd = [...chain].filter((c) => c.startsWith('prod-') && c !== id).map((c) => D.details[c]).filter(Boolean);
  const linkedFeat = [...chain].filter((c) => c.startsWith('feat-') && c !== id).map((c) => D.details[c]).filter(Boolean);
  const linkedMod = [...chain].filter((c) => c.startsWith('mod-') && c !== id).map((c) => D.details[c]).filter(Boolean);

  let header = '';
  let facts = [];
  if (d.kind === 'prod') {
    const sevTone = (d.severity === 'critical' || d.severity === 'high') ? 'low' : (d.severity === 'medium' ? 'mid' : 'unknown');
    header = '<span class="pop-kind">' + escHtml(d.sub) + '</span><span class="pop-id">' + escHtml(d.id) + '</span>';
    header += '<span class="pill pill-' + sevTone + '">' + escHtml(d.severity) + '</span>';
    facts = [
      ['status', (d.status || '').replace(/_/g, ' ')],
      ['source', d.source],
      ['validated', d.lastValidated],
      ['jira', d.jiraTicket],
      ['dynatrace', d.dynatraceEntity],
    ];
  } else if (d.kind === 'feature') {
    const tone = (/critical|high/.test(d.priority)) ? 'low' : (/medium/.test(d.priority) ? 'mid' : 'unknown');
    header = '<span class="pop-kind">feature</span><span class="pop-id">' + escHtml(d.slug) + '</span>';
    if (d.priority) header += '<span class="pill pill-' + tone + '">' + escHtml(d.priority) + '</span>';
    facts = [
      ['status', d.status],
      ['module', d.module],
      ['source', d.source],
      ['validated', d.lastValidated],
    ];
  } else if (d.kind === 'module') {
    header = '<span class="pop-kind">module</span><span class="pop-id">' + escHtml(d.id) + '</span>';
    facts = [
      ['role', d.role],
      ['layer', d.layer],
      ['tech', (d.tech || []).join(', ')],
      ['depends on', (d.dependsOn || []).join(', ')],
    ];
  }

  const titleText = d.title || d.id || d.slug || '—';
  const bodyHtml = popinRenderMd(d.body || d.description || d.summary || '');
  const factsStrip = popinFacts(facts);

  return '' +
    '<div class="pop-head">' +
    '  <div class="pop-head-top">' +
    '    <div class="pop-tags">' + header + '</div>' +
    '    <button class="pop-close" id="impact-popin-close" aria-label="Close detail">×</button>' +
    '  </div>' +
    '  <h2 class="pop-title">' + escHtml(titleText) + '</h2>' +
    (factsStrip ? '<div class="pop-facts">' + factsStrip + '</div>' : '') +
    '</div>' +
    '<div class="pop-body">' +
    '  <div class="pop-main">' +
    (bodyHtml ? '<section class="pop-prose">' + bodyHtml + '</section>' : '<div class="muted pop-empty">No long-form content for this item.</div>') +
    '  </div>' +
    '  <aside class="pop-side">' +
    (linkedProd.length ? popinLinkedList('Prod issues', linkedProd, 'prod') : '') +
    (linkedFeat.length ? popinLinkedList('Features', linkedFeat, 'feat') : '') +
    (linkedMod.length ? popinLinkedList('Modules', linkedMod, 'mod') : '') +
    '  </aside>' +
    '</div>';
}

function popinFacts(pairs) {
  const filtered = pairs.filter(([, v]) => v != null && v !== '' && v !== '—');
  if (!filtered.length) return '';
  return filtered.map(([k, v]) =>
    '<span class="pop-fact"><span class="pop-fact-k">' + escHtml(k) + '</span><span class="pop-fact-v">' + escHtml(v) + '</span></span>'
  ).join('');
}

function popinKv(pairs) {
  const filtered = pairs.filter(([, v]) => v != null && v !== '' && v !== '—');
  if (!filtered.length) return '<div class="muted">No metadata.</div>';
  return '<dl class="pop-kv">' + filtered.map(([k, v]) => '<dt>' + escHtml(k) + '</dt><dd>' + escHtml(v) + '</dd>').join('') + '</dl>';
}
function popinLinkedList(title, items, kind) {
  return '<h4 class="pop-side-title">' + escHtml(title) + ' <span class="muted">(' + items.length + ')</span></h4>' +
    '<ul class="pop-linked">' + items.map((i) => {
      const sev = (kind === 'prod' ? i.severity : (kind === 'feat' ? i.priority : ''));
      const tone = (sev === 'critical' || sev === 'high') ? 'low' : (sev === 'medium' ? 'mid' : 'unknown');
      const idText = i.id || i.slug;
      const tt = i.title || i.role || '';
      return '<li data-link-id="' + escHtml(domIdFor(i, kind)) + '"><code>' + escHtml(idText) + '</code>' +
        (sev ? '<span class="pill pill-' + tone + '">' + escHtml(sev) + '</span>' : '') +
        '<span class="pop-linked-title">' + escHtml(tt) + '</span></li>';
    }).join('') + '</ul>';
}
function domIdFor(item, kind) {
  if (kind === 'prod') return 'prod-' + (item.id || item.slug || '').toLowerCase();
  if (kind === 'feat') return 'feat-' + item.slug;
  if (kind === 'mod') return 'mod-' + (item.id || '').toLowerCase().replace(/[^a-z0-9]/g, '-');
  return '';
}

// minimal markdown renderer: headings, paragraphs, lists, inline code, bold, italic, links, tables stripped
function popinRenderMd(s) {
  if (!s) return '';
  const lines = s.split(/\\r?\\n/);
  let out = '';
  let inList = false;
  let inTable = false;
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (/^\\s*$/.test(ln)) {
      if (inList) { out += '</ul>'; inList = false; }
      continue;
    }
    if (/^#{1,6}\\s/.test(ln)) {
      if (inList) { out += '</ul>'; inList = false; }
      const m = ln.match(/^(#+)\\s+(.*)$/);
      const lvl = Math.min(m[1].length + 2, 6);
      out += '<h' + lvl + '>' + popinInline(m[2]) + '</h' + lvl + '>';
      continue;
    }
    if (/^\\s*\\|/.test(ln)) {
      // Render a markdown table block. Collect contiguous pipe-prefixed lines,
      // detect the alignment row, emit a real <table>.
      if (inList) { out += '</ul>'; inList = false; }
      const rows = [];
      while (i < lines.length && /^\\s*\\|/.test(lines[i])) {
        rows.push(lines[i].trim().replace(/^\\||\\|$/g, ''));
        i++;
      }
      i--;
      if (rows.length < 2) continue;
      const isAlign = (r) => /^[-:\\s|]+$/.test(r);
      const headerCells = rows[0].split('|').map((c) => c.trim());
      const bodyStart = isAlign(rows[1]) ? 2 : 1;
      let tbl = '<div class="dd-table-wrap"><table class="dd-table"><thead><tr>';
      tbl += headerCells.map((c) => '<th>' + popinInline(c) + '</th>').join('');
      tbl += '</tr></thead><tbody>';
      for (let j = bodyStart; j < rows.length; j++) {
        if (isAlign(rows[j])) continue;
        const cells = rows[j].split('|').map((c) => c.trim());
        tbl += '<tr>' + cells.map((c) => '<td>' + popinInline(c) + '</td>').join('') + '</tr>';
      }
      tbl += '</tbody></table></div>';
      out += tbl;
      continue;
    }
    if (/^[-*]\\s/.test(ln)) {
      if (!inList) { out += '<ul>'; inList = true; }
      out += '<li>' + popinInline(ln.replace(/^[-*]\\s/, '')) + '</li>';
      continue;
    }
    if (/^>\\s?/.test(ln)) {
      if (inList) { out += '</ul>'; inList = false; }
      out += '<blockquote>' + popinInline(ln.replace(/^>\\s?/, '')) + '</blockquote>';
      continue;
    }
    if (inList) { out += '</ul>'; inList = false; }
    out += '<p>' + popinInline(ln) + '</p>';
  }
  if (inList) out += '</ul>';
  return out;
}
function popinInline(s) {
  return escHtml(s)
    .replace(/\`([^\`]+)\`/g, '<code>$1</code>')
    .replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>')
    .replace(/\\*([^*]+)\\*/g, '<em>$1</em>')
    .replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g, '<a href="$2">$1</a>');
}

function bindImpactOnce() {
  if (impactBoundOnce) return;
  impactBoundOnce = true;
  document.addEventListener('click', (e) => {
    const card = e.target.closest('.im-card');
    if (card) {
      const id = card.getAttribute('data-id');
      focusOnImpactItem(id === impactSelectedId ? null : id);
      return;
    }
    if (e.target.closest('#impact-popin-close') || e.target.closest('#impact-clear')) {
      focusOnImpactItem(null);
      return;
    }
    const link = e.target.closest('.pop-linked li');
    if (link) {
      const newId = link.getAttribute('data-link-id');
      if (newId) focusOnImpactItem(newId);
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && impactSelectedId) focusOnImpactItem(null);
  });
  window.addEventListener('resize', () => requestAnimationFrame(drawImpactLines));
}

function drawImpactLinesAndBind() {
  bindImpactOnce();
  drawImpactLines();
}
`;

  const graphJs = `
let graphRendered = false;
const D = window.__CORPUS__;
const svgNS = 'http://www.w3.org/2000/svg';
const TYPE_COLORS = {
  roadmap_node: '#8b7cff',
  feature: '#4ade80',
  brick: '#f5b860',
  component: '#7dd3c0',
  api: '#ef6f6c',
  production_discovery: '#ff7eb6',
  known_bug: '#ef6f6c',
  watchlist: '#f5b860',
  structural_risk: '#ef6a67',
  infrastructure_risk: '#ef6a67',
  jira_exploration: '#5ee3d4',
  unknown: '#7c8392',
};
function colorFor(t) { return TYPE_COLORS[t] || '#7c8392'; }

function renderGraph() {
  const svg = document.getElementById('graph');
  if (!svg || graphRendered) return;
  const nodes = (D.graph.nodes || []).map((n) => ({ ...n }));
  const edges = D.graph.edges || [];
  if (!nodes.length) { graphRendered = true; return; }
  const rect = svg.getBoundingClientRect();
  const W = rect.width || 800;
  const H = rect.height || 600;
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  for (const n of nodes) {
    n.x = W / 2 + (Math.random() - 0.5) * Math.min(W, H) * 0.6;
    n.y = H / 2 + (Math.random() - 0.5) * Math.min(W, H) * 0.6;
    n.vx = 0; n.vy = 0;
  }
  const nodeById = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const links = edges.map((e) => ({ source: nodeById[e.from], target: nodeById[e.to], type: e.type, confidence: e.confidence })).filter((l) => l.source && l.target);
  const REPEL = 4500, SPRING = 0.022, SPRING_LEN = 120, CENTER = 0.006, DAMP = 0.82, STEPS = 380;
  for (let s = 0; s < STEPS; s++) {
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const dist2 = dx*dx + dy*dy + 0.01;
        const f = REPEL / dist2;
        const dist = Math.sqrt(dist2);
        const fx = (dx/dist)*f, fy = (dy/dist)*f;
        a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
      }
    }
    for (const l of links) {
      const dx = l.target.x - l.source.x, dy = l.target.y - l.source.y;
      const dist = Math.sqrt(dx*dx + dy*dy) + 0.01;
      const f = (dist - SPRING_LEN) * SPRING;
      l.source.vx += (dx/dist)*f; l.source.vy += (dy/dist)*f;
      l.target.vx -= (dx/dist)*f; l.target.vy -= (dy/dist)*f;
    }
    for (const n of nodes) {
      n.vx += (W/2 - n.x) * CENTER; n.vy += (H/2 - n.y) * CENTER;
      n.vx *= DAMP; n.vy *= DAMP;
      n.x += n.vx; n.y += n.vy;
      n.x = Math.max(28, Math.min(W - 28, n.x));
      n.y = Math.max(28, Math.min(H - 28, n.y));
    }
  }
  svg.innerHTML = '';
  const gLinks = document.createElementNS(svgNS, 'g');
  for (const l of links) {
    const path = document.createElementNS(svgNS, 'path');
    const dx = l.target.x - l.source.x, dy = l.target.y - l.source.y;
    const mx = (l.source.x + l.target.x) / 2, my = (l.source.y + l.target.y) / 2;
    const len = Math.sqrt(dx*dx + dy*dy) || 1;
    const cx = mx + (-dy/len) * Math.min(40, len*0.15);
    const cy = my + (dx/len) * Math.min(40, len*0.15);
    path.setAttribute('d', 'M' + l.source.x + ',' + l.source.y + ' Q' + cx + ',' + cy + ' ' + l.target.x + ',' + l.target.y);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', l.confidence === 'confirmed' ? 'rgba(139,124,255,0.55)' : 'rgba(125,131,146,0.35)');
    path.setAttribute('stroke-width', l.confidence === 'confirmed' ? 1.4 : 0.9);
    gLinks.appendChild(path);
  }
  svg.appendChild(gLinks);
  const gNodes = document.createElementNS(svgNS, 'g');
  for (const n of nodes) {
    const g = document.createElementNS(svgNS, 'g');
    g.setAttribute('transform', 'translate(' + n.x + ',' + n.y + ')');
    const c = document.createElementNS(svgNS, 'circle');
    c.setAttribute('r', 7.5);
    c.setAttribute('fill', colorFor(n.type));
    c.setAttribute('stroke', 'rgba(7,8,11,0.9)');
    c.setAttribute('stroke-width', 1.5);
    g.appendChild(c);
    const label = (n.title || n.id || '').slice(0, 40);
    if (label) {
      const sh = document.createElementNS(svgNS, 'text');
      sh.setAttribute('x', 12); sh.setAttribute('y', 4);
      sh.setAttribute('fill', 'rgba(0,0,0,0.85)');
      sh.setAttribute('font-size', '11.5');
      sh.setAttribute('font-family', 'ui-sans-serif, -apple-system, system-ui, sans-serif');
      sh.setAttribute('font-weight', '500');
      sh.setAttribute('stroke', 'rgba(7,8,11,0.85)');
      sh.setAttribute('stroke-width', '3');
      sh.setAttribute('paint-order', 'stroke');
      sh.textContent = label; g.appendChild(sh);
      const t = document.createElementNS(svgNS, 'text');
      t.setAttribute('x', 12); t.setAttribute('y', 4);
      t.setAttribute('fill', '#d4d7df');
      t.setAttribute('font-size', '11.5');
      t.setAttribute('font-family', 'ui-sans-serif, -apple-system, system-ui, sans-serif');
      t.setAttribute('font-weight', '500');
      t.textContent = label; g.appendChild(t);
    }
    gNodes.appendChild(g);
  }
  svg.appendChild(gNodes);
  const legend = document.querySelector('.graph-legend');
  if (legend) {
    const types = Array.from(new Set(nodes.map((n) => n.type)));
    legend.innerHTML = types.map((t) => '<span class="legend-item"><span class="legend-dot" style="background:' + colorFor(t) + '"></span>' + t + '</span>').join('');
  }
  graphRendered = true;
}
`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(app.name || 'corpus')} — dashboard</title>
<style>
${css}
${customCss}
</style>
</head>
<body>
<div class="bg-grid"></div>
${headerHtml}
${heroBarHtml}
<nav class="tabs" role="tablist">
  <div class="tabs-inner">${navHtml}</div>
</nav>
<main>
${panelsHtml}
</main>
<aside id="detail-drawer" class="side" hidden aria-hidden="true">
  <header>
    <div>
      <div class="side-kicker" id="detail-kicker">Detail</div>
      <h2 id="detail-title">—</h2>
    </div>
    <button class="close" id="detail-close" aria-label="Close">×</button>
  </header>
  <div id="detail-body"></div>
</aside>
<footer class="site-footer">
  <div class="site-footer-inner">
    <span class="muted">Generated <time>${esc(corpus.generated_at)}</time></span>
    <span class="muted">·</span><span class="muted">doc root: <code>${esc(path.relative(process.cwd(), docRoot) || docRoot)}</code></span>
    <span class="muted">·</span><span class="muted">self-contained html</span>
  </div>
</footer>
<script>window.__CORPUS__ = ${JSON.stringify(clientData)};</script>
<script>${tabsJs}</script>
<script>${impactJs}</script>
<script>${drawerJs}</script>
</body>
</html>`;
}

// =====================================================================
// Run
// =====================================================================
const html = buildHtml();
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, html, 'utf8');
console.log(`Dashboard written: ${outPath}`);
console.log(`  ${corpus.features.length} features · ${corpus.prod.bugs.length} bugs · ${corpus.prod.risks.length} risks · ${Object.keys(corpus.indexes).length} indexes`);

// Manifest-driven surface report. schemas/corpus-paths.yaml is the single source
// of truth for canonical paths; this surfaces which `surfaced` sections will render
// empty because their canonical file is absent (drift / not-yet-produced).
(function reportCanonicalSurface() {
  const manifestAbs = path.join(docRoot, '..', 'schemas', 'corpus-paths.yaml');
  if (!fs.existsSync(manifestAbs)) return;
  const lines = fs.readFileSync(manifestAbs, 'utf8').split(/\r?\n/);
  let cur = null, inPaths = false; const paths = [];
  for (const raw of lines) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    if (/^paths:\s*$/.test(raw)) { inPaths = true; continue; }
    if (/^[A-Za-z0-9_]+:/.test(raw)) { inPaths = false; continue; }
    if (!inPaths) continue;
    const item = raw.match(/^\s*-\s*path:\s*(.*)$/);
    if (item) { cur = { path: item[1].trim() }; paths.push(cur); continue; }
    const kv = raw.match(/^\s+([A-Za-z0-9_]+):\s*(.*)$/);
    if (kv && cur) cur[kv[1]] = kv[2].replace(/\s+#.*$/, '').trim();
  }
  const missing = paths
    .filter((p) => p.surfaced === 'true' && p.requirement !== 'conditional')
    .map((p) => p.path)
    .filter((rel) => !fs.existsSync(path.join(docRoot, '..', rel)));
  if (missing.length) {
    console.log(`  ⚠ ${missing.length} canonical surfaced file(s) absent (sections will be empty): ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? ' …' : ''}`);
  }
})();

// =====================================================================
// Derived-view generator: regenerate doc/architecture/BOUNDARY.md from the
// sanctuarized boundary.yaml on every build, so the human view never drifts
// from the source of truth (governance/boundary-contract). Single-app view;
// the cross-app ECOSYSTEM.md is produced by scripts/recompose-ecosystem.mjs.
// Best-effort: never breaks the dashboard build.
// =====================================================================
(function regenerateBoundaryView() {
  try {
    const text = readFileSafe('architecture/boundary.yaml');
    if (!text) return;
    const b = parseBoundary(text); // shared parser (scripts/lib/boundary.mjs)
    const appId = b.appId;
    const inbound = Array.isArray(b.inbound) ? b.inbound : [];
    const outbound = Array.isArray(b.outbound) ? b.outbound : [];
    const populated = appId && appId !== 'unknown';
    if (!populated && inbound.length + outbound.length === 0) return; // leave the shipped stub

    const list = (v) => Array.isArray(v) ? v.join(', ') : (v == null ? '' : String(v));
    const mid = (s) => String(s || '').replace(/[^A-Za-z0-9_]/g, '_');
    const selfNode = appId || 'app';
    const L = [];
    L.push('---');
    L.push('type: architecture-boundary-view');
    L.push('status: active');
    L.push('confidence: probable');
    L.push('source: code');
    L.push('last_validated:');
    L.push('---');
    L.push('');
    L.push('# Boundary — Inbound / Outbound');
    L.push('');
    L.push('> **Derived view.** Regenerated from [`boundary.yaml`](./boundary.yaml) by');
    L.push('> `scripts/build-corpus-site.mjs` — do not hand-edit. Conventions:');
    L.push('> [`governance/boundary-contract`](../../.github/skills/governance/boundary-contract/SKILL.md).');
    L.push('');
    L.push(`**App:** ${b.appName || appId || 'unknown'} (\`${appId || 'unknown'}\`) · repo \`${b.appRepo || 'unknown'}\``);
    L.push('');
    L.push('## Inbound');
    L.push('');
    L.push('| id | kind | protocol | channel | from | entities | criticality | confidence |');
    L.push('|---|---|---|---|---|---|---|---|');
    for (const e of inbound) L.push(`| ${e.id || ''} | ${e.kind || ''} | ${e.protocol || ''} | ${e.channel || ''} | ${list(e.from)} | ${list(e.entities)} | ${e.criticality || ''} | ${e.confidence || ''} |`);
    if (inbound.length === 0) L.push('| | | | | | | | |');
    L.push('');
    L.push('## Outbound');
    L.push('');
    L.push('| id | kind | protocol | channel | to | entities | criticality | confidence |');
    L.push('|---|---|---|---|---|---|---|---|');
    for (const e of outbound) L.push(`| ${e.id || ''} | ${e.kind || ''} | ${e.protocol || ''} | ${e.channel || ''} | ${list(e.to)} | ${list(e.entities)} | ${e.criticality || ''} | ${e.confidence || ''} |`);
    if (outbound.length === 0) L.push('| | | | | | | | |');
    L.push('');
    L.push('## Boundary diagram');
    L.push('');
    L.push('```mermaid');
    L.push('flowchart LR');
    L.push(`  ${mid(selfNode)}(["${selfNode}"])`);
    let n = 0;
    for (const e of inbound) for (const f of (Array.isArray(e.from) ? e.from : [])) { const id = `in${n++}`; L.push(`  ${id}["${f}"] -->|${e.channel || ''}| ${mid(selfNode)}`); }
    for (const e of outbound) for (const tt of (Array.isArray(e.to) ? e.to : [])) { const id = `out${n++}`; L.push(`  ${mid(selfNode)} -->|${e.channel || ''}| ${id}["${tt}"]`); }
    L.push('```');
    L.push('');
    const md = L.join('\n');
    const outRel = path.join(docRoot, 'architecture/BOUNDARY.md');
    const prev = fs.existsSync(outRel) ? fs.readFileSync(outRel, 'utf8') : null;
    if (prev !== md) { fs.writeFileSync(outRel, md, 'utf8'); console.log('  ↻ regenerated doc/architecture/BOUNDARY.md from boundary.yaml'); }
  } catch (e) {
    console.warn(`  (boundary view regeneration skipped: ${e.message})`);
  }
})();
