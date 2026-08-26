import fs from 'node:fs';
import path from 'node:path';

import { isWithin, resolveContainedRegularFile } from '../../lib/factory-delivery/core.mjs';

const MAX_STORAGE_STATE_BYTES = 1024 * 1024;

function privateStorageRoot(repository, storageRoot) {
  if (!path.isAbsolute(storageRoot || '')) throw new Error('ephemeral storage root must use an absolute path');
  if (!fs.existsSync(storageRoot) || fs.lstatSync(storageRoot).isSymbolicLink() || !fs.statSync(storageRoot).isDirectory()) throw new Error('ephemeral storage root must be a real directory');
  const resolvedRoot = fs.realpathSync(storageRoot);
  if (path.resolve(storageRoot) !== resolvedRoot) throw new Error('ephemeral storage root must not traverse a symbolic-link ancestor');
  const realRepository = fs.realpathSync(repository);
  if (isWithin(realRepository, resolvedRoot) || isWithin(resolvedRoot, realRepository)) throw new Error('ephemeral storage root must be disjoint from the repository');
  if ((fs.statSync(resolvedRoot).mode & 0o077) !== 0) throw new Error('ephemeral storage root must not be group/world accessible');
  return { root: resolvedRoot, repository: realRepository };
}

export function resolveEphemeralStorage({ repository, storageRoot, storageState } = {}) {
  if (!path.isAbsolute(storageState || '') || !path.isAbsolute(storageRoot || '')) throw new Error('ephemeral storage state and its root must use absolute paths');
  const { root: resolvedRoot, repository: realRepository } = privateStorageRoot(repository, storageRoot);
  const resolvedState = resolveContainedRegularFile(resolvedRoot, storageState).absolute;
  if (path.resolve(storageState) !== resolvedState) throw new Error('ephemeral storage state must not traverse a symbolic-link ancestor');
  if (isWithin(realRepository, resolvedState)) throw new Error('ephemeral storage state must remain outside the repository after canonicalization');
  if ((fs.statSync(resolvedState).mode & 0o077) !== 0) throw new Error('ephemeral storage state must not be group/world accessible');
  if (fs.statSync(resolvedState).size > MAX_STORAGE_STATE_BYTES) throw new Error('ephemeral storage state exceeds the bounded size limit');
  return { root: resolvedRoot, state: resolvedState };
}

export function materializeEphemeralStorage({
  repository,
  storageRoot,
  storageState = null,
  storageStateJson = null,
} = {}) {
  const hasJson = typeof storageStateJson === 'string' && storageStateJson.trim().length > 0;
  const hasFile = typeof storageState === 'string' && storageState.length > 0;
  if (hasJson && hasFile) throw new Error('provide an ephemeral storage state file or JSON secret, never both');
  if (!hasJson) {
    if (!hasFile) throw new Error('ephemeral_storage_state auth requires a state file or JSON secret');
    return { ...resolveEphemeralStorage({ repository, storageRoot, storageState }), materialized: false, cleanup() { return true; } };
  }
  if (Buffer.byteLength(storageStateJson, 'utf8') > MAX_STORAGE_STATE_BYTES) throw new Error('ephemeral storage state JSON exceeds the bounded size limit');
  let parsed;
  try {
    parsed = JSON.parse(storageStateJson);
  } catch {
    throw new Error('ephemeral storage state JSON must be valid JSON');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('ephemeral storage state JSON must be an object');
  if (Object.hasOwn(parsed, 'cookies') && !Array.isArray(parsed.cookies)) throw new Error('ephemeral storage state cookies must be an array');
  if (Object.hasOwn(parsed, 'origins') && !Array.isArray(parsed.origins)) throw new Error('ephemeral storage state origins must be an array');
  if (!path.isAbsolute(storageRoot || '')) throw new Error('ephemeral storage root must use an absolute path');

  const requestedRoot = path.resolve(storageRoot);
  const parent = path.dirname(requestedRoot);
  if (!fs.existsSync(parent) || fs.lstatSync(parent).isSymbolicLink() || !fs.statSync(parent).isDirectory()) throw new Error('ephemeral storage root parent must be a real directory');
  if (path.resolve(parent) !== fs.realpathSync(parent)) throw new Error('ephemeral storage root parent must not traverse a symbolic-link ancestor');
  const realRepository = fs.realpathSync(repository);
  if (isWithin(realRepository, requestedRoot) || isWithin(requestedRoot, realRepository)) throw new Error('ephemeral storage root must be disjoint from the repository');

  let createdRoot = false;
  let stateFile = null;
  try {
    if (!fs.existsSync(requestedRoot)) {
      fs.mkdirSync(requestedRoot, { mode: 0o700 });
      fs.chmodSync(requestedRoot, 0o700);
      createdRoot = true;
    }
    const { root } = privateStorageRoot(repository, requestedRoot);
    stateFile = path.join(root, 'storage-state.json');
    fs.writeFileSync(stateFile, `${JSON.stringify(parsed)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    fs.chmodSync(stateFile, 0o600);
    const resolved = resolveEphemeralStorage({ repository, storageRoot: root, storageState: stateFile });
    let cleaned = false;
    return {
      ...resolved,
      materialized: true,
      cleanup() {
        if (cleaned) return true;
        cleaned = true;
        let complete = true;
        try {
          if (fs.existsSync(stateFile) && !fs.lstatSync(stateFile).isSymbolicLink()) fs.unlinkSync(stateFile);
        } catch {
          // The caller is already in a safety finalizer; cleanup remains best-effort.
          complete = false;
        }
        if (createdRoot) {
          try {
            fs.rmdirSync(root);
          } catch {
            // Never remove recursively: an unexpected file must not broaden deletion.
            complete = false;
          }
        }
        return complete;
      },
    };
  } catch (error) {
    try {
      if (stateFile && fs.existsSync(stateFile) && !fs.lstatSync(stateFile).isSymbolicLink()) fs.unlinkSync(stateFile);
    } catch {
      // Preserve the original validation/materialization error.
    }
    if (createdRoot) {
      try {
        fs.rmdirSync(requestedRoot);
      } catch {
        // Never remove recursively during rollback.
      }
    }
    throw error;
  }
}
