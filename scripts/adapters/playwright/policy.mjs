const RULES = Object.freeze([
  {
    code: 'playwright-fixed-wait',
    pattern: /\bwaitForTimeout\s*\(/,
    message: 'fixed Playwright sleeps are not replay-safe; wait for an observable condition',
  },
  {
    code: 'playwright-persistent-human-profile',
    pattern: /\blaunchPersistentContext\s*\(|--user-data-dir\b|\buserDataDir\b/,
    message: 'persistent human browser profiles are forbidden in canonical acceptance tests',
  },
  {
    code: 'playwright-direct-oracle-annotation',
    pattern: /annotations\.push\s*\(\s*\{[^}]*type\s*:\s*['"]oracle['"]/s,
    message: 'record oracles through recordOracle so identifiers and outcomes are validated',
  },
  {
    code: 'playwright-unevidenced-cleanup-recorder',
    pattern: /\brecordMutation\s*\(/,
    message: 'recordMutation cannot bind cleanup evidence; use recordMutationResult with cleanupEvidence',
  },
]);

export function validatePlaywrightSource(source, { file = '<inline>' } = {}) {
  const text = String(source || '');
  return RULES
    .filter((rule) => rule.pattern.test(text))
    .map((rule) => ({ severity: 'P0', code: rule.code, message: rule.message, file }));
}
