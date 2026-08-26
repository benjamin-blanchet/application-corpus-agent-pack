#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import { exitCodeFor, parseArgs, printResult } from './lib/factory-delivery/core.mjs';
import { extractSpecificationCriteria, readData } from './lib/factory-delivery/files.mjs';
import { currentHead, verifyEvidenceOnlyCommit } from './lib/factory-delivery/provenance.mjs';
import {
  validateAcceptancePlan,
  validateCrossContracts,
  validateEnvironment,
  validateEnvironmentObservation,
  validateEvidence,
  validateFactoryCi,
  validatePrDraft,
} from './lib/factory-delivery/validation.mjs';

const args = parseArgs(process.argv.slice(2));
const root = path.resolve(args.root || process.cwd());
const lintTemplate = args['lint-template'] === true;
const packageDir = args.package ? path.resolve(root, args.package) : null;
const templateRoot = path.join(root, '.github/templates/software-factory');
const environmentFile = path.resolve(root, args.environment || (lintTemplate
  ? path.join(templateRoot, 'environment/environment-contract.yaml')
  : 'doc/project/runtime/ENVIRONMENTS.yaml'));
const ciFile = path.resolve(root, args.ci || (lintTemplate
  ? path.join(templateRoot, 'delivery/factory-ci.yaml')
  : 'doc/project/cicd/FACTORY_CI.yaml'));
const planFile = path.resolve(root, args.plan || (packageDir
  ? path.join(packageDir, 'acceptance-plan.yaml')
  : lintTemplate ? path.join(templateRoot, 'acceptance/acceptance-plan.yaml') : 'doc/spec/<required-package>/acceptance-plan.yaml'));
const prFile = path.resolve(root, args.pr || (packageDir
  ? path.join(packageDir, 'pr-draft.yaml')
  : lintTemplate ? path.join(templateRoot, 'delivery/pr-draft.yaml') : 'doc/spec/<required-package>/pr-draft.yaml'));

try {
  const environment = readData(environmentFile);
  const ci = readData(ciFile);
  const plan = readData(planFile);
  const pr = readData(prFile);
  const specFile = plan.spec_ref && !String(plan.spec_ref).includes('<') ? path.resolve(root, plan.spec_ref) : null;
  const criteria = extractSpecificationCriteria(specFile);
  const findings = [
    ...validateFactoryCi(ci, { file: path.relative(root, ciFile), root, allowPlaceholders: lintTemplate, checkPipelineFile: !lintTemplate }),
    ...validateEnvironment(environment, ci, { file: path.relative(root, environmentFile), allowPlaceholders: lintTemplate }),
    ...validateAcceptancePlan(plan, {
      file: path.relative(root, planFile),
      root,
      checkFiles: Boolean(packageDir),
      specificationCriteria: criteria.length ? criteria : null,
      allowPlaceholders: lintTemplate,
    }),
    ...validatePrDraft(pr, ci, { file: path.relative(root, prFile), allowPlaceholders: lintTemplate }),
    ...validateCrossContracts({ environment, ci, plan, pr }, {
      environment: path.relative(root, environmentFile),
      ci: path.relative(root, ciFile),
      plan: path.relative(root, planFile),
      pr: path.relative(root, prFile),
      allowPlaceholders: lintTemplate,
    }),
  ];

  if (args.observation) findings.push(...validateEnvironmentObservation(readData(path.resolve(root, args.observation)), { file: args.observation }));
  if (args.evidence) {
    const evidenceFile = path.resolve(root, args.evidence);
    const manifest = readData(evidenceFile);
    const expectedSubject = String(args['subject-sha'] || currentHead(root)).toLowerCase();
    if (manifest?.subject?.tested_sha?.toLowerCase() !== expectedSubject) findings.push({ severity: 'P0', code: 'evidence-subject-stale', message: `evidence subject does not equal expected candidate ${expectedSubject}` });
    const artifactsRoot = path.resolve(root, args['artifacts-root'] || path.dirname(evidenceFile));
    findings.push(...validateEvidence(manifest, plan, {
      file: path.relative(root, evidenceFile),
      artifactsRoot,
      verifyArtifacts: args['skip-artifact-check'] !== true,
      acceptancePlanFile: planFile,
      environmentContractFile: environmentFile,
      repositoryRoot: root,
    }));
    if (manifest?.subject?.evidence_commit_sha) {
      const allowed = [packageDir ? path.relative(root, path.join(packageDir, 'acceptance/runs')) : `${manifest.spec_package}/acceptance/runs`];
      const check = verifyEvidenceOnlyCommit(root, manifest.subject.tested_sha, manifest.subject.evidence_commit_sha, allowed);
      if (!check.ok) findings.push({ severity: 'P0', code: check.code, message: `evidence commit is not evidence-only: ${(check.forbidden || []).join(', ')}` });
    }
  }

  const result = {
    title: 'Factory delivery validation',
    summary: { findings: findings.length, P0: findings.filter((item) => item.severity === 'P0').length },
    files: {
      environment: path.relative(root, environmentFile),
      ci: path.relative(root, ciFile),
      plan: path.relative(root, planFile),
      pr: path.relative(root, prFile),
    },
    findings,
  };
  printResult(result, args.json === true);
  process.exit(exitCodeFor(findings));
} catch (error) {
  const result = { title: 'Factory delivery validation', summary: { findings: 1, internal: 1 }, findings: [{ severity: 'P0', code: 'delivery-validator-error', message: error.message }] };
  printResult(result, args.json === true);
  process.exit(1);
}
