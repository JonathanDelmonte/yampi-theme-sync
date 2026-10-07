import {assertContext, validatePaths, writable, type Snapshot, type Files, type Plan, type PlanRow} from './model';
export function makePlan(base: Snapshot, local: Files, remote: Snapshot): Plan {
  assertContext(base.context, remote.context);
  validatePaths([...new Set([...Object.keys(base.files), ...Object.keys(local), ...Object.keys(remote.files)])]);
  const paths = [...new Set([...Object.keys(base.files), ...Object.keys(local), ...Object.keys(remote.files)])].sort();
  const rows: PlanRow[] = paths.map(path => {
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
