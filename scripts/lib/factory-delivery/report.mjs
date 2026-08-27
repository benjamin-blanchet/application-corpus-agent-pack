import { asArray } from './core.mjs';
import { evidenceSummary } from './evidence.mjs';

function cell(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

export function renderEvidenceReport(manifest) {
  const lines = [
    '# Acceptance report',
    '',
    '## Provenance',
    '',
    '| Field | Value |',
    '|---|---|',
    `| Run | ${cell(manifest.run_id)} |`,
    `| Generated | ${cell(manifest.generated_at)} |`,
    `| Specification | ${cell(manifest.spec_package)} |`,
    `| Tested revision | \`${cell(manifest.subject?.tested_sha)}\` |`,
    `| Source tree digest | \`${cell(manifest.subject?.source_tree_digest)}\` |`,
    `| Environment profile | ${cell(manifest.environment?.profile)} |`,
    `| Deployed revision | \`${cell(manifest.environment?.deployed_revision)}\` |`,
    `| Build / image | ${cell(manifest.environment?.build_or_image)} |`,
    `| Schema / dataset | ${cell(manifest.environment?.schema_version)} / ${cell(manifest.environment?.dataset_id)}@${cell(manifest.environment?.dataset_version)} |`,
    `| Adapter / browser | ${cell(manifest.toolchain?.adapter)} / ${cell(manifest.toolchain?.browser)} ${cell(manifest.toolchain?.browser_version)} |`,
    '',
    '## Results',
    '',
    '| Case | Criteria | Outcome | User-visible error | Oracles | Attempts | Evidence |',
    '|---|---|---|---|---|---:|---|',
  ];
  for (const testCase of asArray(manifest.cases)) {
    const oracles = asArray(testCase.oracle_results).map((oracle) => `${oracle.id}:${oracle.outcome}${oracle.recorded === false ? ':unrecorded' : ''}`).join(', ') || 'none';
    lines.push(`| ${cell(testCase.id)} | ${cell(asArray(testCase.criteria).join(', '))} | **${cell(testCase.outcome)}** | ${testCase.user_visible_error === true ? '**yes**' : 'no'} | ${cell(oracles)} | ${cell(testCase.attempts)} | ${cell(asArray(testCase.evidence_ids).join(', ') || 'none')} |`);
  }
  lines.push('', '## Mutations and cleanup', '', '| Mutation | Outcome | Cleanup | Declared operation / digest / exit | Cleanup evidence |', '|---|---|---|---|---|');
  if (asArray(manifest.mutations).length === 0) lines.push('| none | not applicable | not_required | — | none |');
  else for (const mutation of manifest.mutations) {
    const execution = mutation.cleanup_execution;
    const operation = execution ? `${execution.operation_id} / ${execution.operation_digest} / ${execution.exit_code} (${execution.started_at} → ${execution.finished_at})` : 'none';
    lines.push(`| ${cell(mutation.id)} | ${cell(mutation.outcome)} | ${cell(mutation.cleanup)} | ${cell(operation)} | ${cell(asArray(mutation.cleanup_evidence_ids).join(', ') || 'none')} |`);
  }
  lines.push('', '## Evidence inventory', '', '| ID | Path | Byte-derived type | PII policy | SHA-256 | Bytes |', '|---|---|---|---|---|---:|');
  if (asArray(manifest.artifacts).length === 0) lines.push('| none | — | — | — | — | 0 |');
  else for (const artifact of manifest.artifacts) lines.push(`| ${cell(artifact.id)} | \`${cell(artifact.path)}\` | ${cell(artifact.media_type)} | ${cell(artifact.pii_policy)} | \`${cell(artifact.sha256)}\` | ${cell(artifact.bytes)} |`);
  lines.push(
    '',
    '## Verdict',
    '',
    `**${String(manifest.verdict || 'blocked').toUpperCase()}** — ${evidenceSummary(manifest)}`,
  );
  if (asArray(manifest.generation_findings).length) {
    lines.push('', '### Blocking evidence facts', '');
    for (const item of manifest.generation_findings) lines.push(`- \`${cell(item.code)}\`: ${cell(item.message)}`);
  }
  lines.push('');
  return lines.join('\n');
}
