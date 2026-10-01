import assert from 'node:assert/strict';
import { parseArgs } from 'node:util';
import { readJson } from './common.mjs';
import { prepareBundle, loadBundle, validateConfig, deploymentPlan } from './deployment.mjs';
import { uploadBundle, verifyPublic, currentState, promoteBundle } from './publish.mjs';
import { createR2Store } from './r2-store.mjs';

const help = `도로 표본 배포 준비 (모바일 루트에서 실행)
  roads:deploy -- prepare [--input build/road-data/grid-200000] [--output build/road-deploy]
  roads:deploy -- plan --bundle DIR [--config FILE]
  roads:deploy -- upload --bundle DIR --config FILE [--apply]
  roads:deploy -- verify --bundle DIR --config FILE
  roads:deploy -- current --config FILE
  roads:deploy -- promote --bundle DIR --config FILE --expect SHA256_OR_absent [--apply]
upload/promote는 --apply 없이 계획만 출력합니다. 복구는 이전 bundle로 promote합니다.
publicUrlMode 기본값은 custom-domain입니다. r2.dev 테스트는 설정에 r2-dev를 명시하세요.
r2-dev는 개발용·요청량 제한·CDN 캐시 미지원이며 운영 검증을 대체하지 않습니다.`;

let store;
try {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    input: { type: 'string', default: 'build/road-data/grid-200000' },
    output: { type: 'string', default: 'build/road-deploy' }, bundle: { type: 'string' },
    config: { type: 'string' }, expect: { type: 'string' }, apply: { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  } });
  const [command] = positionals;
  if (values.help || !command) console.log(help);
  else {
    assert.ok(positionals.length === 1 && ['prepare', 'plan', 'upload', 'verify', 'current', 'promote'].includes(command), '알 수 없는 명령');
    assert.ok(!values.apply || ['upload', 'promote'].includes(command), '--apply는 upload/promote 전용입니다.');
    const config = values.config ? validateConfig(readJson(values.config)) : undefined;
    const target = config ? { publicUrlMode: config.publicUrlMode, developmentOnly: config.publicUrlMode === 'r2-dev' } : {};
    if (command === 'prepare') console.log(JSON.stringify(deploymentPlan(prepareBundle(values.input, values.output), config), null, 2));
    else {
      const bundle = command === 'current' ? null : loadBundle(values.bundle ?? '');
      if (command === 'plan' || (['upload', 'promote'].includes(command) && !values.apply)) {
        console.log(JSON.stringify({ ...deploymentPlan(bundle, config), requestedCommand: command, expectedCurrent: values.expect ?? null }, null, 2));
      } else {
        assert.ok(config, '--config로 전용 R2 설정을 지정하세요.');
        if (command === 'verify') console.log(JSON.stringify({ ...target, ...await verifyPublic(bundle, config.publicBaseUrl) }, null, 2));
        else {
          store = createR2Store(config);
          const result = command === 'current' ? await currentState(store)
            : command === 'upload' ? await uploadBundle(bundle, store)
              : await promoteBundle(bundle, store, config.publicBaseUrl, values.expect);
          console.log(JSON.stringify({ command, ...target, ...result }, null, 2));
        }
      }
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally { store?.close(); }
