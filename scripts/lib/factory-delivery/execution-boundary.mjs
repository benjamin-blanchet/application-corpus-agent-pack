export const INSTALLABLE_EXECUTION_BOUNDARY_CODE = 'acceptance-execution-boundary-unavailable';

// The pack has no process, filesystem and egress sandbox. A signed receipt or
// a protected workflow environment cannot turn an ordinary child process into
// one, so every shipped candidate executor stays fail-closed until an external
// isolated broker is integrated.
export function unavailableExecutionBoundaryFinding(surface = 'candidate execution') {
  return {
    severity: 'P0',
    code: INSTALLABLE_EXECUTION_BOUNDARY_CODE,
    message: `${surface} is blocked: the installable pack has no attestable isolated process/filesystem/egress executor`,
  };
}
