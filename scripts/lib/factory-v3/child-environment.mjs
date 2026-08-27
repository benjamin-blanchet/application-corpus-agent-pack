// A child process inherits the environment of whoever spawned it. In a CI job
// that environment is a set of write handles: GITHUB_ENV, GITHUB_PATH,
// GITHUB_OUTPUT and ACTIONS_RUNTIME_TOKEN let anything that runs rewrite the
// steps that follow it. Nothing the factory spawns needs them, so nothing the
// factory spawns receives them.
//
// Deny by default: a variable is passed because it is named here, never
// because it happened to be set.
const INHERITED = [
  'PATH',
  'HOME',
  'LANG',
  'LC_ALL',
  'TZ',
  'TMPDIR',
  'TMP',
  'TEMP',
  'CI',
  // Windows: process creation fails without it.
  'SystemRoot',
  'SYSTEMROOT',
  'COMSPEC',
];

export function minimalChildEnvironment(extra = {}) {
  const env = Object.fromEntries(INHERITED
    .filter((name) => Object.hasOwn(process.env, name))
    .map((name) => [name, process.env[name]]));
  return { ...env, ...extra };
}
