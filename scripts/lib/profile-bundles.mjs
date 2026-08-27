import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';

export const STATE_PATH = '.corpus-pack/install-state.json';
export const MANIFEST_PATH = '.corpus-pack/manifest.json';
export const BUNDLE_DIR = '.corpus-pack/bundles';
export const PROFILE_ORDER = ['core', 'sources', 'factory'];

const toPosix = (value) => value.replace(/\\/g, '/');
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

function safeParts(rel) {
  const normalized = toPosix(rel);
  if (!normalized || path.posix.isAbsolute(normalized) || path.win32.isAbsolute(rel)) {
    throw new Error(`Unsafe bundle path: ${rel}`);
  }
  const parts = normalized.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) throw new Error(`Unsafe bundle path: ${rel}`);
  return parts;
}

function safeTarget(root, rel, { allowMissing = true } = {}) {
  const parts = safeParts(rel);
  let cursor = root;
  for (let index = 0; index < parts.length; index += 1) {
    cursor = path.join(cursor, parts[index]);
    let stat;
    try {
      stat = fs.lstatSync(cursor);
    } catch (error) {
      if (allowMissing && error.code === 'ENOENT') return path.join(root, ...parts);
      throw error;
    }
    if (stat.isSymbolicLink()) throw new Error(`Bundle path traverses a symbolic link: ${parts.slice(0, index + 1).join('/')}`);
    if (index < parts.length - 1 && !stat.isDirectory()) throw new Error(`Bundle path has a non-directory parent: ${rel}`);
  }
  return path.join(root, ...parts);
}

function mkdirParents(root, rel) {
  const parts = safeParts(rel);
  let cursor = root;
  for (const part of parts.slice(0, -1)) {
    cursor = path.join(cursor, part);
    if (fs.existsSync(cursor)) {
      const stat = fs.lstatSync(cursor);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`Unsafe parent for ${rel}`);
    } else fs.mkdirSync(cursor);
  }
}

let writeCounter = 0;
function atomicWrite(root, rel, bytes, mode = 0o644) {
  mkdirParents(root, rel);
  const destination = safeTarget(root, rel);
  if (fs.existsSync(destination)) {
    const stat = fs.lstatSync(destination);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`Refusing to replace non-file: ${rel}`);
  }
  writeCounter += 1;
  const temporary = path.join(path.dirname(destination), `.${path.basename(rel)}.profile-${process.pid}-${writeCounter}.tmp`);
  const fd = fs.openSync(temporary, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW || 0), mode & 0o777);
  try {
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(temporary, destination);
  fs.chmodSync(destination, mode & 0o777);
}

function readJson(root, rel, { required = false } = {}) {
  const absolute = safeTarget(root, rel);
  if (!fs.existsSync(absolute)) {
    if (required) throw new Error(`Missing ${rel}`);
    return null;
  }
  const stat = fs.lstatSync(absolute);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`${rel} must be a regular file`);
  try {
    return JSON.parse(fs.readFileSync(absolute, 'utf8'));
  } catch (error) {
    throw new Error(`Invalid ${rel}: ${error.message}`);
  }
}

export function loadProfileConfig(sourceRoot) {
  const config = readJson(sourceRoot, 'pack/profiles.json', { required: true });
  if (config.schemaVersion !== 1 || !config.profiles || typeof config.profiles !== 'object') {
    throw new Error('Unsupported pack/profiles.json schema');
  }
  for (const name of PROFILE_ORDER) {
    if (!config.profiles[name]) throw new Error(`Missing profile definition: ${name}`);
  }
  return config;
}

export function profileForPath(rel, config) {
  const normalized = toPosix(rel);
  for (const name of ['factory', 'sources']) {
    const definition = config.profiles[name];
    if ((definition.files || []).includes(normalized)) return name;
    if ((definition.prefixes || []).some((prefix) => normalized.startsWith(prefix))) return name;
  }
  return 'core';
}

export function resolveProfiles(requested, config) {
  const wanted = new Set(requested?.length ? requested : ['core']);
  wanted.add('core');
  for (const name of [...wanted]) {
    if (!config.profiles[name]) throw new Error(`Unknown profile: ${name}`);
    for (const dependency of config.profiles[name].dependsOn || []) wanted.add(dependency);
  }
  return PROFILE_ORDER.filter((name) => wanted.has(name));
}

export function loadInstallState(target) {
  return readJson(target, STATE_PATH) || null;
}

export function detectLegacyProfiles(target, sourceFiles, config) {
  const detected = new Set(['core']);
  for (const rel of sourceFiles) {
    const profile = profileForPath(rel, config);
    if (profile === 'core') continue;
    const absolute = safeTarget(target, rel);
    if (fs.existsSync(absolute)) detected.add(profile);
  }
  return PROFILE_ORDER.filter((name) => detected.has(name));
}

function bundlePath(profile) {
  return `${BUNDLE_DIR}/${profile}.bundle.json.gz`;
}

export function writeOfflineBundles({ sourceRoot, target, sourceFiles, config, version }) {
  const manifest = { schemaVersion: 1, packVersion: version, profiles: {} };
  for (const profile of ['sources', 'factory']) {
    const files = [];
    for (const rel of sourceFiles.filter((item) => profileForPath(item, config) === profile).sort()) {
      const absolute = safeTarget(sourceRoot, rel, { allowMissing: false });
      const stat = fs.lstatSync(absolute);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Bundle source must be a regular file: ${rel}`);
      const bytes = fs.readFileSync(absolute);
      files.push({ path: rel, mode: stat.mode & 0o777, sha256: sha256(bytes), content: bytes.toString('base64') });
    }
    const payload = Buffer.from(JSON.stringify({
      schemaVersion: 1,
      profile,
      packVersion: version,
      dependsOn: config.profiles[profile].dependsOn || [],
      files,
    }));
    const compressed = zlib.gzipSync(payload, { level: 9, mtime: 0 });
    const rel = bundlePath(profile);
    atomicWrite(target, rel, compressed, 0o644);
    manifest.profiles[profile] = { path: rel, sha256: sha256(compressed), files: files.length };
  }
  atomicWrite(target, MANIFEST_PATH, Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`));
  return manifest;
}

export function writeInstallState(target, state) {
  atomicWrite(target, STATE_PATH, Buffer.from(`${JSON.stringify(state, null, 2)}\n`));
}

export function targetFileDigest(target, rel) {
  const absolute = safeTarget(target, rel);
  if (!fs.existsSync(absolute)) return null;
  const stat = fs.lstatSync(absolute);
  if (stat.isSymbolicLink() || !stat.isFile()) return null;
  return sha256(fs.readFileSync(absolute));
}

export function sourceTreeDigest(sourceRoot, sourceFiles) {
  const hash = crypto.createHash('sha256');
  for (const rel of [...sourceFiles].sort()) {
    hash.update(rel);
    hash.update('\0');
    hash.update(fs.readFileSync(safeTarget(sourceRoot, rel, { allowMissing: false })));
    hash.update('\0');
  }
  return hash.digest('hex');
}

function readVerifiedBundle(target, profile) {
  const manifest = readJson(target, MANIFEST_PATH, { required: true });
  const entry = manifest.profiles?.[profile];
  if (!entry) throw new Error(`No offline bundle is available for profile '${profile}'`);
  const absolute = safeTarget(target, entry.path, { allowMissing: false });
  const bytes = fs.readFileSync(absolute);
  if (sha256(bytes) !== entry.sha256) throw new Error(`Offline bundle digest mismatch for '${profile}'`);
  let bundle;
  try {
    bundle = JSON.parse(zlib.gunzipSync(bytes).toString('utf8'));
  } catch (error) {
    throw new Error(`Invalid offline bundle for '${profile}': ${error.message}`);
  }
  if (bundle.schemaVersion !== 1 || bundle.profile !== profile || !Array.isArray(bundle.files)) {
    throw new Error(`Invalid offline bundle contract for '${profile}'`);
  }
  if (bundle.packVersion !== manifest.packVersion) throw new Error(`Offline bundle version mismatch for '${profile}'`);
  const seen = new Set();
  for (const file of bundle.files) {
    if (!file || typeof file.path !== 'string' || seen.has(file.path)) throw new Error(`Invalid or duplicate file in '${profile}' bundle`);
    seen.add(file.path);
  }
  return { manifest, bundle };
}

export function inspectProfileEnable({ target, profile }) {
  if (profile === 'core') throw new Error("Profile 'core' is installed by sync and cannot be enabled from a bundle");
  if (!['sources', 'factory'].includes(profile)) throw new Error(`Unknown profile: ${profile}`);
  const { bundle } = readVerifiedBundle(target, profile);
  const plan = { profile, copyNew: [], conflicts: [], unchanged: [], bundle };
  for (const file of bundle.files) {
    safeParts(file.path);
    const bytes = Buffer.from(file.content, 'base64');
    if (sha256(bytes) !== file.sha256) throw new Error(`File digest mismatch inside '${profile}' bundle: ${file.path}`);
    const existingDigest = targetFileDigest(target, file.path);
    if (existingDigest === null) plan.copyNew.push(file);
    else if (existingDigest === file.sha256) plan.unchanged.push(file);
    else plan.conflicts.push(file);
  }
  return plan;
}

export function enableOfflineProfile({ target, profile, apply = false }) {
  const state = loadInstallState(target);
  if (!state) throw new Error(`Cannot enable a profile before installation (${STATE_PATH} is missing)`);
  const plan = inspectProfileEnable({ target, profile });
  if (plan.bundle && plan.bundle.packVersion !== state.packVersion) {
    throw new Error(`Offline bundle '${profile}' belongs to pack ${plan.bundle.packVersion}, but the installation is ${state.packVersion}`);
  }
  if (!apply) return { plan, state };

  for (const file of plan.copyNew) {
    atomicWrite(target, file.path, Buffer.from(file.content, 'base64'), file.mode);
  }
  for (const file of plan.conflicts) {
    const incoming = `.corpus-pack/incoming/${String(state.packVersion).replace(/[^A-Za-z0-9._-]/g, '-')}/${file.path}`;
    atomicWrite(target, incoming, Buffer.from(file.content, 'base64'), file.mode);
  }

  const active = new Set(state.activeProfiles || ['core']);
  active.add('core');
  const pending = new Set(state.pendingProfiles || []);
  if (plan.conflicts.length) {
    active.delete(profile);
    pending.add(profile);
  } else {
    active.add(profile);
    pending.delete(profile);
  }
  const managedFiles = { ...(state.managedFiles || {}) };
  for (const file of plan.conflicts) delete managedFiles[file.path];
  for (const file of [...plan.copyNew, ...plan.unchanged]) {
    managedFiles[file.path] = { profile, sha256: file.sha256 };
  }
  state.activeProfiles = PROFILE_ORDER.filter((name) => active.has(name));
  state.pendingProfiles = PROFILE_ORDER.filter((name) => pending.has(name));
  state.managedFiles = managedFiles;
  state.conflicts = [...new Set([...(state.conflicts || []), ...plan.conflicts.map((file) => file.path)])]
    .filter((rel) => !managedFiles[rel])
    .sort();
  writeInstallState(target, state);
  return { plan, state };
}

export function profileStatus(target) {
  const state = loadInstallState(target);
  if (!state) throw new Error(`No corpus pack installation found (${STATE_PATH} is missing)`);
  const manifest = readJson(target, MANIFEST_PATH, { required: true });
  return PROFILE_ORDER.map((name) => ({
    name,
    active: (state.activeProfiles || []).includes(name),
    pending: (state.pendingProfiles || []).includes(name),
    bundled: name === 'core' || Boolean(manifest.profiles?.[name]),
    files: name === 'core'
      ? Object.values(state.managedFiles || {}).filter((entry) => entry.profile === 'core').length
      : manifest.profiles?.[name]?.files || 0,
  }));
}
