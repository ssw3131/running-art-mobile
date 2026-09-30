import assert from 'node:assert/strict';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { collectBytes } from './publish.mjs';

export function createR2Store(config, env = process.env, clientOverride) {
  const accessKeyId = env.ROAD_R2_ACCESS_KEY_ID, secretAccessKey = env.ROAD_R2_SECRET_ACCESS_KEY;
  assert.ok(accessKeyId && secretAccessKey, 'ROAD_R2_ACCESS_KEY_ID와 ROAD_R2_SECRET_ACCESS_KEY가 필요합니다. 앱 환경 변수에 넣지 마세요.');
  const client = clientOverride ?? new S3Client({ region: 'auto', endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey }, forcePathStyle: true, maxAttempts: 2,
    requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED' });
  const send = command => client.send(command, { abortSignal: AbortSignal.timeout(30000) });
  return {
    async get(key, limit) {
      let result;
      try { result = await send(new GetObjectCommand({ Bucket: config.bucket, Key: key })); }
      catch (error) {
        if (error.name === 'NoSuchKey') return null;
        throw new Error(`R2 읽기 실패: ${key} (HTTP ${error.$metadata?.httpStatusCode ?? 'network'})`);
      }
      try {
        assert.ok(result.ContentLength <= limit, 'R2 응답 크기 초과');
        return { body: await collectBytes(result.Body, limit), etag: result.ETag,
          contentType: result.ContentType, cacheControl: result.CacheControl, contentEncoding: result.ContentEncoding };
      } finally { result.Body?.destroy(); }
    },
    async put(object, condition) {
      assert.ok(condition.ifMatch || condition.ifNoneMatch === '*', '무조건 덮어쓰기 금지');
      try {
        await send(new PutObjectCommand({ Bucket: config.bucket, Key: object.key, Body: object.body,
          ContentLength: object.body.length, ContentType: object.contentType, CacheControl: object.cacheControl,
          Metadata: { sha256: object.sha256 }, IfMatch: condition.ifMatch, IfNoneMatch: condition.ifNoneMatch }));
      } catch (error) {
        const failure = new Error(`R2 쓰기 실패: ${object.key} (HTTP ${error.$metadata?.httpStatusCode ?? 'network'}). 재시도 전에 current 상태를 확인하세요.`);
        failure.status = error.$metadata?.httpStatusCode;
        throw failure;
      }
    },
    close() { client.destroy(); },
  };
}
