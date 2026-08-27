import fs from 'node:fs';
import path from 'node:path';

import { asArray, resolveContainedRegularFile } from '../../lib/factory-delivery/core.mjs';

function commonDirectory(files) {
  const directories = files.map((file) => path.dirname(file).split(path.sep));
  const shared = [];
  for (let index = 0; index < directories[0].length; index += 1) {
    if (!directories.every((parts) => parts[index] === directories[0][index])) break;
    shared.push(directories[0][index]);
  }
  return shared.join(path.sep) || path.parse(files[0]).root;
}

function inside(parent, child) {
  return child === parent || child.startsWith(`${parent}${path.sep}`);
}

export function resolvePlannedPlaywrightInputs({ root, planFile, plan, explicitConfig = null }) {
  const repository = fs.realpathSync(root);
  const packageRoot = fs.realpathSync(path.dirname(planFile));
  const configured = explicitConfig || plan?.campaign?.config;
  if (!configured) throw new Error('Playwright campaign has no config');
  if (explicitConfig && path.resolve(repository, explicitConfig) !== path.resolve(repository, plan?.campaign?.config || '')) {
    throw new Error('--config must equal campaign.config from the frozen acceptance plan');
  }
  const config = resolveContainedRegularFile(repository, path.resolve(repository, configured)).absolute;
  const tests = [...new Set(asArray(plan?.cases).map((testCase) => (
    resolveContainedRegularFile(repository, path.resolve(repository, testCase?.test_ref?.path || '')).absolute
  )))];
  if (tests.length === 0) throw new Error('Playwright plan contains no test files');
  if (!inside(packageRoot, config) || tests.some((testFile) => !inside(packageRoot, testFile))) {
    throw new Error('Playwright config and tests must be confined to the specification package');
  }
  const testDir = commonDirectory(tests);
  if (!inside(packageRoot, testDir)) throw new Error('derived Playwright testDir escapes the specification package');
  return { config, tests, testDir, packageRoot };
}
