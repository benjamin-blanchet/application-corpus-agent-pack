import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readYaml } from '../factory-delivery/yaml.mjs';

const DECISION_DOMAINS = new Set(['business', 'architecture', 'security', 'migration']);
export const CAPABILITIES = new Set(['read', 'write', 'execute', 'network', 'git_commit', 'git_push', 'open_pr', 'data_mutation']);
export const ROLE_CAPABILITY_POLICY_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../.github/templates/software-factory/roles/role-capabilities.yaml',
);

const EXACT_EVENT_PROFILES = Object.freeze({
  controller: ['read', 'write', 'execute'],
  reviewer: ['read', 'execute'],
  acceptance: ['read', 'execute'],
  delivery: ['read', 'execute', 'network', 'open_pr'],
});
const PLAN_BOUND_EVENT_ROLES = new Set(['implementer', 'migration']);
const NON_EVENT_ROLES = ['planner', 'corpus', 'functional-analyst'];
const EXACT_DOCUMENTED_CAPABILITIES = Object.freeze({
  'factory-controller': { read: ['factory-plan', 'factory-events', 'factory-state', 'work-results', 'gate-evidence'], write: ['factory-events', 'derived-factory-state', 'controller-lock'], execute: ['factory-control', 'deterministic-validation'], network: 'deny', git_commit: 'deny', git_push: 'deny', open_pr: 'deny', data_mutation: 'deny' },
  planner: { read: ['approved-specification', 'corpus', 'repository'], write: ['technical-plan'], execute: ['read-only-discovery', 'plan-validation'], network: 'declared-sources-read-only', git_commit: 'deny', git_push: 'deny', open_pr: 'deny', data_mutation: 'deny' },
  'functional-analyst': { read: ['approved-request', 'corpus', 'repository'], write: ['specification-package'], execute: ['impact-analysis', 'specification-validation'], network: 'declared-sources-read-only', git_commit: 'deny', git_push: 'deny', open_pr: 'deny', data_mutation: 'deny' },
  implementer: { read: ['work-package-read-paths'], write: ['work-package-write-claims'], execute: ['work-package-verification'], network: 'deny-unless-declared', git_commit: 'deny', git_push: 'deny', open_pr: 'deny', data_mutation: 'deny' },
  reviewer: { read: ['approved-contract', 'exact-diff', 'verification-evidence'], write: ['review-result-only'], execute: ['read-only-review-checks'], network: 'deny', git_commit: 'deny', git_push: 'deny', open_pr: 'deny', data_mutation: 'deny' },
  corpus: { read: ['repository', 'corpus', 'verified-change-results'], write: ['corpus-owned-paths'], execute: ['corpus-validation'], network: 'declared-sources-read-only', git_commit: 'deny', git_push: 'deny', open_pr: 'deny', data_mutation: 'deny' },
  acceptance: { read: ['candidate', 'acceptance-plan', 'environment-contract'], write: ['acceptance-results', 'evidence-root'], execute: ['declared-acceptance-operations'], network: 'external-attested-executor-required', git_commit: 'deny', git_push: 'deny', open_pr: 'deny', data_mutation: 'external-attested-executor-required' },
  delivery: { read: ['release-package', 'existing-remote-branch'], write: ['draft-pr-metadata', 'delivery-result'], execute: ['factory-pr'], network: 'source-control-provider-only', git_commit: 'deny', git_push: 'deny', open_pr: 'draft-only', data_mutation: 'deny' },
});
const EXACT_FORBIDDEN_ACTIONS = ['approve_pr', 'mark_pr_ready', 'merge_pr', 'force_push', 'deploy', 'change_branch_protection', 'write_secrets'];
let rolePolicy = null;
let rolePolicyFindings = [];
try {
  rolePolicy = readYaml(ROLE_CAPABILITY_POLICY_PATH);
  rolePolicyFindings = validateRoleCapabilityPolicy(rolePolicy);
} catch (error) {
  rolePolicyFindings = [finding('factory-role-policy-unreadable', `cannot read role capability policy: ${error.message}`)];
}

export function validateRoleCapability(lot) {
  const findings = [];
  const role = lot.model_role;
  const agentRole = lot.agent_role;
  const domains = Array.isArray(lot.decision_domains) ? lot.decision_domains : [];
  const capabilities = Array.isArray(lot.capabilities) ? lot.capabilities : [];

  if (!['implementer', 'migration'].includes(agentRole)) {
    findings.push(finding('factory-unknown-agent-role', `${lot.id}: unknown agent role ${String(agentRole)}`));
  }
  if (!Array.isArray(lot.capabilities) || lot.capabilities.length === 0) {
    findings.push(finding('factory-capabilities-missing', `${lot.id}: at least one capability must be declared`));
  }
  for (const capability of capabilities) {
    if (!CAPABILITIES.has(capability)) findings.push(finding('factory-capability-unknown', `${lot.id}: unknown capability ${String(capability)}`));
  }
  if (new Set(capabilities).size !== capabilities.length) findings.push(finding('factory-capability-duplicate', `${lot.id}: capabilities must be unique`));
  if ((lot.write_claims || []).length && !capabilities.includes('write')) {
    findings.push(finding('factory-write-capability-missing', `${lot.id}: path claims require write capability`));
  }
  if (capabilities.includes('git_commit')) findings.push(finding('factory-git-commit-forbidden', `${lot.id}: no factory role may receive git_commit`));
  if (capabilities.includes('git_push')) findings.push(finding('factory-git-push-forbidden', `${lot.id}: no factory role may receive git_push`));
  if (agentRole !== 'delivery' && capabilities.includes('open_pr')) {
    findings.push(finding('factory-delivery-capability-exclusive', `${lot.id}: only delivery may receive open_pr`));
  }
  if (['reviewer', 'acceptance'].includes(agentRole) && capabilities.some((item) => ['write', 'git_commit'].includes(item))) {
    findings.push(finding('factory-readonly-role-mutation', `${lot.id}: ${agentRole} cannot receive repository mutation capabilities`));
  }

  for (const domain of domains) {
    if (!DECISION_DOMAINS.has(domain)) findings.push(finding('factory-unknown-decision-domain', `${lot.id}: unknown decision domain ${domain}`));
  }

  if (role === 'economy') {
    if (agentRole === 'migration') findings.push(finding('factory-economy-role-migration', `${lot.id}: economy cannot own migration work`));
    if (capabilities.includes('data_mutation')) findings.push(finding('factory-economy-role-data-mutation', `${lot.id}: economy cannot receive data_mutation`));
    if (lot.risk === 'high') findings.push(finding('factory-economy-role-high-risk', `${lot.id}: economy cannot own a high-risk lot`));
    if (lot.control_plane_critical === true) findings.push(finding('factory-economy-role-control-plane', `${lot.id}: control-plane enforcement cannot use economy`));
    if (lot.complexity !== 'bounded') findings.push(finding('factory-economy-role-reasoning', `${lot.id}: economy cannot own a reasoning lot`));
    if (domains.length) findings.push(finding('factory-economy-role-decision', `${lot.id}: economy cannot make ${domains.join(', ')} decisions`));
    const sensitivePaths = sensitiveFactoryPaths([
      ...(lot.write_claims || []).map((claim) => claim?.path),
      ...(lot.handoff?.outputs || []).map((entry) => entry?.path),
    ]);
    if (sensitivePaths.length) findings.push(finding(
      'factory-economy-sensitive-path',
      `${lot.id}: economy cannot own security, migration, data or factory control paths: ${sensitivePaths.join(', ')}`,
    ));
  }

  if (role === 'reviewer') {
    findings.push(finding('factory-reviewer-owning-implementation', `${lot.id}: reviewer role is read-only and cannot own an implementation lot`));
  }

  if (!['economy', 'standard', 'expert', 'reviewer'].includes(role)) {
    findings.push(finding('factory-unknown-model-role', `${lot.id}: unknown model role ${String(role)}`));
  }
  return findings;
}

export function sensitiveFactoryPaths(paths) {
  return [...new Set((paths || []).filter((item) => typeof item === 'string').map(normalizedForClassification).filter((candidate) => {
    const lowered = candidate.toLowerCase();
    const segments = lowered.split('/');
    return segments.some((segment) => /^(factory-v3|factory-control|control|control-plane|security|migrations?|data|database|db)(?:[._-]|$)/.test(segment))
      || lowered === 'scripts/factory-control.mjs'
      || lowered === 'scripts/migrate-factory-v1-to-v3.mjs'
      || /(^|\/)schemas\/factory\/v3(\/|$)/.test(lowered)
      || /(^|\/)scripts\/lib\/factory-v3(\/|$)/.test(lowered)
      || /\.sql$/.test(lowered);
  }))].sort();
}

function normalizedForClassification(value) {
  return String(value).replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
}

export function validateEffectiveCapabilities(lot, actor) {
  const findings = [];
  const planned = new Set(lot.capabilities || []);
  const effective = new Set(actor?.capabilities || []);
  for (const capability of effective) {
    if (!planned.has(capability)) findings.push(finding('factory-capability-not-authorized', `${lot.id}: effective capability ${capability} is not in the plan`));
  }
  for (const capability of planned) {
    if (!effective.has(capability)) findings.push(finding('factory-capability-not-effective', `${lot.id}: planned capability ${capability} is unavailable`));
  }
  return findings;
}

export function validateActorCapabilities(actor) {
  const findings = [...rolePolicyFindings];
  if (!Array.isArray(actor?.capabilities)) return [finding('factory-actor-capabilities-missing', 'actor capabilities must be declared')];
  const seen = new Set();
  for (const capability of actor.capabilities) {
    if (!CAPABILITIES.has(capability)) findings.push(finding('factory-capability-unknown', `actor has unknown capability ${String(capability)}`));
    if (seen.has(capability)) findings.push(finding('factory-capability-duplicate', `actor repeats capability ${String(capability)}`));
    seen.add(capability);
  }
  if (actor.capabilities.includes('git_commit')) findings.push(finding('factory-git-commit-forbidden', `actor ${actor.role} cannot receive git_commit`));
  if (actor.capabilities.includes('git_push')) findings.push(finding('factory-git-push-forbidden', `actor ${actor.role} cannot receive git_push`));
  if (actor.role !== 'delivery' && actor.capabilities.includes('open_pr')) {
    findings.push(finding('factory-delivery-capability-exclusive', `actor ${actor.role} cannot receive open_pr`));
  }
  if (['reviewer', 'acceptance'].includes(actor.role) && actor.capabilities.some((item) => ['write', 'git_commit'].includes(item))) {
    findings.push(finding('factory-readonly-role-mutation', `actor ${actor.role} cannot mutate the repository`));
  }
  const profile = rolePolicy?.event_actor_capabilities?.[actor.role];
  if (Array.isArray(profile)) {
    const allowed = new Set(profile);
    for (const capability of actor.capabilities) {
      if (!allowed.has(capability)) {
        const conditional = rolePolicy?.conditional_event_capabilities?.[actor.role]?.[capability];
        findings.push(finding(
          conditional?.control_plane === 'deny'
            ? 'factory-conditional-capability-unavailable'
            : 'factory-role-capability-not-authorized',
          conditional?.control_plane === 'deny'
            ? `actor ${actor.role} cannot receive ${capability}: the shipped control plane cannot verify or materialize the required external isolated executor`
            : `actor ${actor.role} cannot receive ${capability}`,
        ));
      }
    }
    for (const capability of allowed) {
      if (!actor.capabilities.includes(capability)) findings.push(finding('factory-role-capability-missing', `actor ${actor.role} must declare effective capability ${capability}`));
    }
    if (Array.isArray(actor.capability_grants) && actor.capability_grants.length > 0) {
      findings.push(finding('factory-conditional-capability-unavailable', 'actor capability_grants cannot make a conditional capability effective without an integrated machine-verifying isolated executor'));
    }
  } else if (profile !== 'plan_bound') {
    findings.push(finding('factory-role-policy-default-deny', `actor role ${String(actor?.role)} has no executable capability profile`));
  }
  return findings;
}

export function loadRoleCapabilityPolicy() {
  return readYaml(ROLE_CAPABILITY_POLICY_PATH);
}

export function validateRoleCapabilityPolicy(policy) {
  const findings = [];
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) return [finding('factory-role-policy-shape', 'role capability policy must be an object')];
  const topKeys = ['version', 'default', 'event_actor_capabilities', 'conditional_event_capabilities', 'non_event_roles', 'capabilities', 'forbidden_for_all_agents'];
  addUnknownPolicyKeys(policy, topKeys, 'role policy', findings);
  if (policy.version !== 2) findings.push(finding('factory-role-policy-version', 'role capability policy version must be 2'));
  if (policy.default !== 'deny') findings.push(finding('factory-role-policy-default', 'role capability policy must be deny-by-default'));
  const profiles = policy.event_actor_capabilities;
  if (!profiles || typeof profiles !== 'object' || Array.isArray(profiles)) {
    findings.push(finding('factory-role-policy-event-profiles', 'event_actor_capabilities must be an object'));
  } else {
    addUnknownPolicyKeys(profiles, [...Object.keys(EXACT_EVENT_PROFILES), ...PLAN_BOUND_EVENT_ROLES], 'event actor capability profiles', findings);
    for (const [role, expected] of Object.entries(EXACT_EVENT_PROFILES)) {
      const actual = profiles[role];
      if (!Array.isArray(actual) || new Set(actual).size !== actual.length || !sameSet(actual, expected)) {
        findings.push(finding('factory-role-policy-profile-drift', `${role} capability profile must be exactly ${expected.join(', ')}`));
      }
    }
    for (const role of PLAN_BOUND_EVENT_ROLES) {
      if (profiles[role] !== 'plan_bound') findings.push(finding('factory-role-policy-profile-drift', `${role} capability profile must be plan_bound`));
    }
  }
  const conditional = policy.conditional_event_capabilities;
  if (!conditional || typeof conditional !== 'object' || Array.isArray(conditional)) findings.push(finding('factory-role-policy-conditional', 'conditional_event_capabilities must be an object'));
  else {
    addUnknownPolicyKeys(conditional, ['acceptance'], 'conditional event capability profiles', findings);
    const acceptance = conditional.acceptance;
    if (!acceptance || typeof acceptance !== 'object' || Array.isArray(acceptance)) {
      findings.push(finding('factory-role-policy-profile-drift', 'acceptance conditional capability requirements must be a mapping'));
    } else {
      addUnknownPolicyKeys(acceptance, ['network', 'data_mutation'], 'acceptance conditional capability requirements', findings);
      for (const capability of ['network', 'data_mutation']) {
        const requirement = acceptance[capability];
        if (!requirement || typeof requirement !== 'object' || Array.isArray(requirement)
          || Object.keys(requirement).sort().join(',') !== 'control_plane,prerequisite'
          || requirement.control_plane !== 'deny'
          || requirement.prerequisite !== 'external_attested_executor') {
          findings.push(finding('factory-role-policy-profile-drift', `${capability} must stay denied in the control plane and require an external attested executor`));
        }
      }
    }
  }
  if (!Array.isArray(policy.non_event_roles) || !sameSet(policy.non_event_roles, NON_EVENT_ROLES)) {
    findings.push(finding('factory-role-policy-non-event-roles', `non-event roles must be exactly ${NON_EVENT_ROLES.join(', ')}`));
  }
  const documented = policy.capabilities;
  if (!documented || typeof documented !== 'object' || Array.isArray(documented)) {
    findings.push(finding('factory-role-policy-capabilities', 'capabilities documentation map is required'));
  } else if (JSON.stringify(documented) !== JSON.stringify(EXACT_DOCUMENTED_CAPABILITIES)) {
    findings.push(finding('factory-role-policy-capabilities-drift', 'human-facing capability map must exactly match the executable supported policy'));
  }
  if (JSON.stringify(policy.forbidden_for_all_agents) !== JSON.stringify(EXACT_FORBIDDEN_ACTIONS)) findings.push(finding('factory-role-policy-forbidden-actions', 'forbidden_for_all_agents must exactly match the executable deny list'));
  return findings;
}

function addUnknownPolicyKeys(value, allowed, scope, findings) {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) if (!allowedSet.has(key)) findings.push(finding('factory-role-policy-unknown-field', `${scope} has unknown field ${key}`));
  for (const key of allowed) if (!Object.hasOwn(value, key)) findings.push(finding('factory-role-policy-missing-field', `${scope} is missing ${key}`));
}

function sameSet(left, right) {
  return Array.isArray(left) && left.length === right.length && left.every((item) => right.includes(item));
}

function finding(code, message) {
  return { severity: 'P0', code, message };
}
