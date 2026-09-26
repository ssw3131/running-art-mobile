import assert from 'node:assert/strict';
import test from 'node:test';

import { mapStyleUrl } from '../src/modules/map/config.ts';

test('missing map key makes no request to an unconfigured or substitute provider', () => {
  for (const key of [undefined, '', '   ']) assert.equal(mapStyleUrl(key), null);
});

test('client key cannot inject additional URL parameters', () => {
  const url = new URL(mapStyleUrl(' sample&other=value '));
  assert.equal(url.origin, 'https://api.maptiler.com');
  assert.equal(url.searchParams.get('key'), 'sample&other=value');
  assert.equal(url.searchParams.has('other'), false);
});
