#!/usr/bin/env node

// Performance guard for the shared BOM/CRLF normalizer.
// Run with: node --expose-gc scripts/benchmark-text-normalization.mjs

import { performance } from 'node:perf_hooks';
import { normalizeText } from './lib/text.mjs';

const MIB = 1024 * 1024;
const TARGET_BYTES = 10 * MIB;
const MAX_MEDIAN_MS = 250;
const MAX_SINGLE_MS = 500;
const MAX_HEAP_BYTES = 32 * MIB;
const WARMUPS = 3;
const SAMPLES = 5;

if (typeof global.gc !== 'function') {
  console.error('This benchmark requires --expose-gc so heap measurements are comparable.');
  process.exit(2);
}

const bom = '\uFEFF';
const header = '---\r\ntype: normalization-benchmark\r\n---\r\n';
const line = 'portable frontmatter benchmark payload\r\n';
const asciiBytes = TARGET_BYTES - Buffer.byteLength(bom, 'utf8');
const ascii = (header + line.repeat(Math.ceil((asciiBytes - header.length) / line.length))).slice(0, asciiBytes);
// Round-trip through a Buffer once, outside the measured region, so the input
// is a flat UTF-8 string rather than a lazy concatenation tree.
const input = Buffer.from(bom + ascii, 'utf8').toString('utf8');

if (Buffer.byteLength(input, 'utf8') !== TARGET_BYTES) {
  throw new Error(`Benchmark fixture is not exactly 10 MiB: ${Buffer.byteLength(input, 'utf8')} bytes`);
}

for (let i = 0; i < WARMUPS; i += 1) normalizeText(input);

const durationsMs = [];
const heapDeltasBytes = [];
let output;

for (let i = 0; i < SAMPLES; i += 1) {
  output = undefined;
  global.gc();
  const heapBefore = process.memoryUsage().heapUsed;
  const started = performance.now();
  output = normalizeText(input);
  const durationMs = performance.now() - started;
  const heapDeltaBytes = Math.max(0, process.memoryUsage().heapUsed - heapBefore);

  if (!output.startsWith('---\n') || output.charCodeAt(0) === 0xfeff || output.includes('\r\n')) {
    throw new Error('Normalizer returned an invalid benchmark result');
  }
  durationsMs.push(durationMs);
  heapDeltasBytes.push(heapDeltaBytes);
}

const sortedDurations = [...durationsMs].sort((a, b) => a - b);
const medianMs = sortedDurations[Math.floor(sortedDurations.length / 2)];
const maxDurationMs = Math.max(...durationsMs);
const maxHeapBytes = Math.max(...heapDeltasBytes);
const passed = medianMs <= MAX_MEDIAN_MS
  && maxDurationMs <= MAX_SINGLE_MS
  && maxHeapBytes <= MAX_HEAP_BYTES;

const report = {
  node: process.version,
  input_bytes: TARGET_BYTES,
  warmups: WARMUPS,
  samples: SAMPLES,
  durations_ms: durationsMs.map((value) => Number(value.toFixed(3))),
  median_ms: Number(medianMs.toFixed(3)),
  max_duration_ms: Number(maxDurationMs.toFixed(3)),
  heap_deltas_bytes: heapDeltasBytes,
  max_heap_mib: Number((maxHeapBytes / MIB).toFixed(3)),
  limits: {
    median_ms: MAX_MEDIAN_MS,
    single_ms: MAX_SINGLE_MS,
    heap_mib: MAX_HEAP_BYTES / MIB,
  },
  passed,
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`Text normalization benchmark (${process.version})`);
  console.log(`  median:   ${report.median_ms} ms (limit ${MAX_MEDIAN_MS} ms)`);
  console.log(`  maximum:  ${report.max_duration_ms} ms (limit ${MAX_SINGLE_MS} ms)`);
  console.log(`  max heap: ${report.max_heap_mib} MiB (limit ${MAX_HEAP_BYTES / MIB} MiB)`);
  console.log(`  result:   ${passed ? 'PASS' : 'FAIL'}`);
}

process.exitCode = passed ? 0 : 1;
