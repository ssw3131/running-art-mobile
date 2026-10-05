// Preserve the previously documented Kakao command.
import assert from 'node:assert/strict';
assert.equal(process.argv[2], '--verify-kakao');
await import('./social-hosted.mjs');
