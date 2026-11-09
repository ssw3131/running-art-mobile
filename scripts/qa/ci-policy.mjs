// Shared, dependency-free policy. Unknown changes remain full verification.
export const diagnostics = Object.freeze({
  full: '', home: '--home-only', generation: '--generation-only',
  service: '--service-only', achievements: '--achievements-only',
  accessibility: '--accessibility-only', visual: '--visual-only',
});

export function classifyChanges(changed) {
  const docsOnly = changed.length > 0 && changed.every(file => /^(docs\/.*\.(md|html|json|png)|.*\.md)$/.test(file));
  return { docsOnly, full: !docsOnly, changed };
}

export function androidSelection(event, scenario = 'full') {
  if (event === 'workflow_dispatch' && scenario === 'diagnostics') return { matrix: [36], argument: '' };
  if (!Object.hasOwn(diagnostics, scenario)) throw Error('Unknown Android diagnostic');
  if (event !== 'workflow_dispatch' && scenario !== 'full') throw Error('Diagnostics require a manual run');
  return { matrix: scenario === 'full' ? [36, 29] : [36], argument: diagnostics[scenario] };
}

export function androidJobs(event, scenario = 'full') {
  const selection = androidSelection(event, scenario);
  if (scenario === 'diagnostics') return Object.entries(diagnostics).filter(([key]) => key !== 'full')
    .map(([key, argument]) => ({ api: 36, scenario: key, argument }));
  return selection.matrix.map(api => ({ api, scenario, argument: api === 29 ? '--smoke' : selection.argument }));
}

export function checkGate({ event, draft, full, reused, scope, fast, api, android, suite = 'all' }) {
  if (!['pull_request', 'push', 'workflow_dispatch'].includes(event)) throw Error('Unknown event');
  if (![draft, full, reused].every(value => typeof value === 'boolean')) throw Error('Missing scope decision');
  if (!['all', 'fast', 'api', 'android'].includes(suite)) throw Error('Unknown suite');
  if (scope !== 'success') throw Error('Scope failed');
  if (draft && event !== 'pull_request') throw Error('Only PRs may be drafts');
  if (event !== 'workflow_dispatch' && suite !== 'all') throw Error('Partial required gate forbidden');
  if (reused && (event !== 'push' || !full || draft)) throw Error('Reuse only applies to full main pushes');
  const required = full && !reused
    ? (draft ? ['fast'] : suite === 'all' ? ['fast', 'api', 'android'] : [suite]) : [];
  for (const [name, result] of Object.entries({ fast, api, android })) {
    const expected = required.includes(name) ? 'success' : 'skipped';
    if (result !== expected) throw Error(`${name}: expected ${expected}, got ${result}`);
  }
  return event === 'pull_request' && !draft && full;
}
