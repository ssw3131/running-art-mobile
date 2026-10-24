// Real HTTP handler + real serialized engine fixture. No cloud traffic or user input.
import { createComputeServer } from '../../server/route-compute/server.mjs';
import { response } from '../../tests/helpers/compute-contract.mjs';
import { usageFixture } from '../../tests/helpers/usage.mjs';
response();
const server = createComputeServer({ run: async input => response(input), close: async () => {} }, { ingress: () => {}, usage: usageFixture() });
server.listen(8087, '127.0.0.1', () => console.log('contract harness ready on loopback:8087'));
process.on('SIGTERM', () => server.close());
