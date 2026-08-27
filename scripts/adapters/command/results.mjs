const FACTORY_RECORD_PREFIX = 'FACTORY_TEST_RESULT ';

function normalizeStatus(value) {
  if (value === 'pass' || value === 'passed') return 'passed';
  if (value === 'fail' || value === 'failed') return 'failed';
  if (value === 'skip' || value === 'skipped' || value === 'todo' || value === 'cancelled') return 'skipped';
  return 'blocked';
}

function record(map, id, status) {
  if (typeof id !== 'string' || !id.trim()) return;
  const normalized = normalizeStatus(status);
  const previous = map.get(id);
  map.set(id, !previous || previous === normalized ? normalized : 'blocked');
}

export function parseStructuredTestResults(output) {
  const records = new Map();
  for (const rawLine of String(output || '').replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith(FACTORY_RECORD_PREFIX)) {
      try {
        const parsed = JSON.parse(line.slice(FACTORY_RECORD_PREFIX.length));
        if (Object.keys(parsed).sort().join(',') !== 'id,status') continue;
        record(records, parsed.id, parsed.status);
      } catch {
        // Malformed records never become passing observations.
      }
      continue;
    }
    const tap = line.match(/^(not ok|ok)(?:\s+\d+)?(?:\s+-)?\s+(.+?)(?:\s+#\s*(SKIP|TODO|CANCELLED)\b.*)?$/i);
    if (!tap) continue;
    const directive = tap[3]?.toLowerCase();
    record(records, tap[2].trim(), directive || (tap[1].toLowerCase() === 'ok' ? 'passed' : 'failed'));
  }
  return records;
}
