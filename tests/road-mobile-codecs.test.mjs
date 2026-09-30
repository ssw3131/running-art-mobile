import assert from 'node:assert/strict';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import { randomBytes, createHash } from 'node:crypto';
import { mobileRoadCodecs } from '../src/modules/road-data/mobile-codecs.ts';

test('Hermes-compatible codecs agree with native gzip and SHA-256 for UTF-8 and multi-block input', () => {
  for (const bytes of [Buffer.from('{"name":"서울·부산 도로"}'), randomBytes(200000)]) {
    const compressed = gzipSync(bytes);
    const decoded = mobileRoadCodecs.gunzip(compressed, bytes.length);
    assert.deepEqual(Buffer.from(decoded), bytes);
    assert.equal(mobileRoadCodecs.sha256(decoded), createHash('sha256').update(bytes).digest('hex'));
  }
  assert.equal(mobileRoadCodecs.utf8(Buffer.from('서울·부산 도로')), '서울·부산 도로');
});

test('gzip decoded-size bounds reject truncated data, size mismatch, and excessive output', () => {
  const compressed = gzipSync(Buffer.alloc(200000, 65));
  assert.throws(() => mobileRoadCodecs.gunzip(compressed, 10), /GZIP_SIZE/);
  assert.throws(() => mobileRoadCodecs.gunzip(compressed.subarray(0, 17), 200000), /GZIP_SIZE/);
  assert.throws(() => mobileRoadCodecs.gunzip(compressed, 100000000), /GZIP_SIZE/);
});
