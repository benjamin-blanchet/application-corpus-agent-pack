const DECISION_DOMAINS = new Set(['business', 'architecture', 'security', 'migration']);
export const CAPABILITIES = new Set(['read', 'write', 'execute', 'network', 'git_commit', 'git_push', 'open_pr', 'data_mutation']);

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
  }

  if (role === 'reviewer') {
    findings.push(finding('factory-reviewer-owning-implementation', `${lot.id}: reviewer role is read-only and cannot own an implementation lot`));
  }

  if (!['economy', 'standard', 'expert', 'reviewer'].includes(role)) {
    findings.push(finding('factory-unknown-model-role', `${lot.id}: unknown model role ${String(role)}`));
  }
  return findings;
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
  const findings = [];
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
  return findings;
}

function finding(code, message) {
  return { severity: 'P0', code, message };
}
