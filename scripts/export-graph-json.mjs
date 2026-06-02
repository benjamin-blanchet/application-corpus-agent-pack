#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const graphDir = path.join(root, 'doc/_graph');
const outPath = process.argv[2] || path.join(root, 'doc/_graph/graph-export.json');

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf8');
}

function parseScalar(value) {
  const raw = value.trim();
  if (raw === 'null') return null;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (/^-?\d+$/.test(raw)) return Number(raw);
  if (raw.startsWith('[') && raw.endsWith(']')) {
    const inner = raw.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(',').map((part) => parseScalar(part));
  }
  return raw.replace(/^['"]|['"]$/g, '');
}

function parseSimpleListYaml(text, listKey) {
  const lines = text.split(/\r?\n/);
  const result = [];
  let inList = false;
  let current = null;
  let currentNestedKey = null;

  for (const rawLine of lines) {
    if (!rawLine.trim() || rawLine.trim().startsWith('#')) continue;
    const line = rawLine.replace(/\t/g, '  ');
    const trimmed = line.trim();

    if (trimmed === `${listKey}:`) {
      inList = true;
      continue;
    }
    if (!inList) continue;
    if (/^[A-Za-z0-9_-]+:\s*$/.test(trimmed) && !line.startsWith(' ')) break;

    const nestedItem = line.match(/^\s{8,}-\s+(.*)$/);
    if (nestedItem && currentNestedKey && current) {
      current[currentNestedKey].push(parseScalar(nestedItem[1]));
      continue;
    }

    const itemMatch = line.match(/^\s{4}-\s+([A-Za-z0-9_-]+):\s*(.*)$/);
    if (itemMatch) {
      current = {};
      result.push(current);
      currentNestedKey = null;
      current[itemMatch[1]] = parseScalar(itemMatch[2]);
      continue;
    }

    if (!current) continue;

    const keyValue = line.match(/^\s{6,}([A-Za-z0-9_-]+):\s*(.*)$/);
    if (keyValue) {
      const [, key, value] = keyValue;
      if (value === '') {
        current[key] = [];
        currentNestedKey = key;
      } else {
        current[key] = parseScalar(value);
        currentNestedKey = null;
      }
      continue;
    }

  }
  return result;
}

function loadGraph() {
  const files = {
    nodes: 'doc/_graph/nodes.yaml',
    edges: 'doc/_graph/edges.yaml',
    evidence: 'doc/_graph/evidence.yaml',
  };
  for (const file of Object.values(files)) {
    if (!fs.existsSync(path.join(root, file))) {
      throw new Error(`Missing graph file: ${file}`);
    }
  }
  return {
    exported_at: new Date().toISOString(),
    source: 'doc/_graph',
    nodes: parseSimpleListYaml(read(files.nodes), 'nodes'),
    edges: parseSimpleListYaml(read(files.edges), 'edges'),
    evidence: parseSimpleListYaml(read(files.evidence), 'evidence'),
  };
}

if (!fs.existsSync(graphDir)) {
  throw new Error('Missing doc/_graph directory');
}

const graph = loadGraph();
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(graph, null, 2)}\n`);

console.log(`Graph exported to ${path.relative(root, outPath)}`);
console.log(`Nodes: ${graph.nodes.length}  Edges: ${graph.edges.length}  Evidence: ${graph.evidence.length}`);
