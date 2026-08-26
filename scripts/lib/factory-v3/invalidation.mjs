import { GATE_NAMES } from './contract.mjs';

export const ARTIFACT_CLASSES = new Set([
  'spec_contract', 'plan_contract', 'implementation', 'corpus',
  'acceptance_script', 'review', 'campaign', 'evidence', 'control', 'unknown',
]);

const INVALIDATION_START = {
  spec_contract: 'specification',
  plan_contract: 'technical_plan',
  implementation: 'lot_reviews',
  corpus: 'corpus_closeout',
  acceptance_script: 'candidate',
  review: 'consolidated_review',
  campaign: 'acceptance',
  evidence: 'evidence',
  control: null,
  unknown: 'specification',
};

export function classifyArtifactPath(input) {
  const candidate = String(input || '').replace(/\\/g, '/').replace(/^\.\//, '');
  if (/\/(SPECIFICATION|IMPACTS|TESTS)\.md$/.test(candidate)) return 'spec_contract';
  if (/\/factory\/plan\.v3\.json$/.test(candidate)) return 'plan_contract';
  if (/\/factory\/(events\.v3\.jsonl|state\.v3\.json)$/.test(candidate)) return 'control';
  if (/\/(recette|evidence|screenshots)\//.test(candidate) || /evidence-manifest\.v3\.json$/.test(candidate)) return 'evidence';
  if (/(^|\/)tests\/.*\.(spec|test)\.[cm]?[jt]sx?$/.test(candidate)) return 'acceptance_script';
  if (candidate.startsWith('doc/project/') || candidate.startsWith('doc/_')) return 'corpus';
  if (!candidate || candidate.startsWith('doc/spec/')) return 'unknown';
  return 'implementation';
}

export function invalidatedGates(classes) {
  const invalid = new Set();
  for (const artifactClass of classes || []) {
    const start = INVALIDATION_START[ARTIFACT_CLASSES.has(artifactClass) ? artifactClass : 'unknown'];
    if (!start) continue;
    for (let index = GATE_NAMES.indexOf(start); index < GATE_NAMES.length; index += 1) invalid.add(GATE_NAMES[index]);
  }
  return GATE_NAMES.filter((gate) => invalid.has(gate));
}

export function invalidateState(state, classes, reason, affectedLots = [], plan = null) {
  const normalized = (classes || []).map((item) => ARTIFACT_CLASSES.has(item) ? item : 'unknown');
  const gates = invalidatedGates(normalized);
  for (const gateName of gates) {
    const gate = state.gates[gateName];
    if (gate.status !== 'pending') {
      gate.status = 'stale';
      gate.stale_reason = reason;
    }
  }
  if (gates.includes('release') && state.delivery) {
    state.delivery.status = 'stale';
    state.delivery.stale_reason = reason;
  }

  const invalidatesAllLots = normalized.includes('spec_contract') || normalized.includes('plan_contract');
  const invalidatesImplementation = invalidatesAllLots || normalized.includes('implementation');
  if (invalidatesImplementation) {
    const target = affectedLots.length ? transitiveDependents(affectedLots, plan) : null;
    const runningLots = new Set();
    for (const [lotId, lot] of Object.entries(state.lots)) {
      if (!target || target.has(lotId) || invalidatesAllLots) {
        // A running worker remains the sole owner of its reservation until it
        // reports a typed terminal result or the controller records recovery.
        // Reclassifying it as stale here would make the same paths schedulable
        // in parallel while the original worker can still write to them.
        if (lot.status === 'running') runningLots.add(lotId);
        else if (lot.status !== 'pending') lot.status = 'stale';
        if (lot.review) lot.review.status = 'stale';
      }
    }
    for (const reservation of Object.values(state.reservations)) {
      if (
        reservation.status === 'active'
        && !runningLots.has(reservation.lot_id)
        && (!target || target.has(reservation.lot_id) || invalidatesAllLots)
      ) reservation.status = 'stale';
    }
  }
  return gates;
}

function transitiveDependents(affectedLots, plan) {
  const target = new Set(affectedLots);
  let changed = true;
  while (changed) {
    changed = false;
    for (const lot of plan?.lots || []) {
      if (target.has(lot.id)) continue;
      if ((lot.dependencies || []).some((dependency) => target.has(dependency))) {
        target.add(lot.id);
        changed = true;
      }
    }
  }
  return target;
}
