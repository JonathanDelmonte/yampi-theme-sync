import {assertContext, safeSnapshot, validatePaths, writable, type Assets, type Snapshot, type Files, type Plan, type PlanRow} from './model';
export function makePlan(base: Snapshot, local: Files, remote: Snapshot, localAssets: Assets = {}): Plan {
  assertContext(base.context, remote.context);
  safeSnapshot(base); safeSnapshot(remote); safeSnapshot({...base, files: local, assets: localAssets});
  const paths = [...new Set([...Object.keys(base.files), ...Object.keys(local), ...Object.keys(remote.files), ...Object.keys(base.assets || {}), ...Object.keys(localAssets), ...Object.keys(remote.assets || {})])].sort();
  validatePaths(paths);
  const rows: PlanRow[] = paths.map(path => {
    if (base.assets?.[path] || localAssets[path] || remote.assets?.[path]) {
      const b = base.assets?.[path], l = localAssets[path], r = remote.assets?.[path];
      const equal = (a?: Uint8Array, c?: Uint8Array) => !!a && !!c && a.length === c.length && a.every((v, i) => v === c[i]);
      const status = !l ? 'missing-local' : !b ? 'new-local' : !r ? 'missing-remote' : equal(l, r) ? (equal(l, b) ? 'unchanged' : 'already-applied') : equal(l, b) ? 'remote-only' : !equal(r, b) ? 'conflict' : 'unsupported';
      return {path, status, image: {base: b, local: l, remote: r}};
    }
    const b = base.files[path], l = local[path], r = remote.files[path];
    let status: PlanRow['status'];
    if (l === undefined) status = 'missing-local';
    else if (b === undefined) status = 'new-local';
    else if (r === undefined) status = 'missing-remote';
    else if (l === r) status = l === b ? 'unchanged' : 'already-applied';
    else if (l === b) status = 'remote-only';
    else if (r !== b) status = 'conflict';
    else status = writable(path) ? 'update' : 'unsupported';
    return {path, base: b, local: l, remote: r, status};
  });
  return {context: remote.context, createdAt: new Date().toISOString(), rows};
}
