import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { nativeFingerprint } from '../native-fingerprint.mjs';
const kind = process.env.APK_KIND;
if (!['development', 'preview'].includes(kind)) throw Error('Invalid APK_KIND');
const variant = kind === 'development' ? 'debug' : 'release';
const apk = 'android/app/build/outputs/apk/' + variant + '/app-' + variant + '.apk';
const tools = path.join(process.env.ANDROID_HOME, 'build-tools', '36.0.0');
const cert = execFileSync(path.join(tools, 'apksigner'), ['verify', '--verbose', '--print-certs', apk], { encoding: 'utf8' });
const fingerprint = cert.match(/Signer #1 certificate SHA-256 digest: ([a-f0-9]+)/i)?.[1]?.toLowerCase();
if (!fingerprint || fingerprint !== process.env.RUNPEN_CERT_SHA256?.replaceAll(':', '').toLowerCase()) throw Error('APK signing certificate mismatch');
const badging = execFileSync(path.join(tools, 'aapt'), ['dump', 'badging', apk], { encoding: 'utf8' });
if (!badging.includes("name='com.runningart.mobile.dev'") || !badging.includes("versionCode='" + process.env.RUNPEN_VERSION_CODE + "'")) throw Error('APK identity/version mismatch');
for (const abi of ['arm64-v8a', 'armeabi-v7a']) if (!badging.includes("'" + abi + "'")) throw Error('Missing APK ABI: ' + abi);
if (kind === 'preview' && badging.includes('application-debuggable')) throw Error('Preview APK must not be debuggable');
const contents = execFileSync('unzip', ['-Z1', apk], { encoding: 'utf8' });
if (kind === 'preview' && !contents.split('\n').includes('assets/index.android.bundle')) throw Error('Preview JavaScript bundle missing');
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const name = 'runpen-' + kind + '-' + sha.slice(0, 12) + '-' + process.env.RUNPEN_VERSION_CODE + '.apk';
mkdirSync('build/handset', { recursive: true });
copyFileSync(apk, 'build/handset/' + name);
const hash = createHash('sha256').update(readFileSync(apk)).digest('hex');
writeFileSync('build/handset/' + name + '.sha256', hash + '  ' + name + '\n');
writeFileSync('build/handset/metadata.json', JSON.stringify({ commit: sha, kind, versionCode: Number(process.env.RUNPEN_VERSION_CODE), applicationId: 'com.runningart.mobile.dev', certificateSHA256: fingerprint, sha256: hash, abis: ['arm64-v8a', 'armeabi-v7a'], native: nativeFingerprint(), buildRun: process.env.GITHUB_RUN_ID }, null, 2) + '\n');
writeFileSync('build/handset/INSTALL-ko.txt', [
  'RunPen ' + kind + ' / commit ' + sha,
  '압축을 풀고 APK를 Android 휴대폰으로 내려받아 설치합니다. Windows에서 직접 실행하는 파일이 아닙니다.',
  kind === 'development' ? '개발용: PC에서 preview.ps1 Start 후 해당 Metro에 연결합니다.' : '독립 실행용: Metro 없이 실행합니다. 로그인·지도·서버 기능은 인터넷이 필요합니다.',
  '기존 앱과 서명이 다르면 업데이트할 수 없습니다. 자료 보존 여부를 확인하기 전 앱을 삭제하지 마세요.',
  '개발용과 독립 실행용은 동일 앱을 교체합니다. 서명 지문과 버전·커밋을 metadata.json에서 확인하세요.',
  '설치 성공은 GPS·성능·로그인 검증 완료를 뜻하지 않습니다. 확인 결과와 기기를 별도로 기록하세요.',
  '이 산출물은 7일 후 만료됩니다. 중요한 APK·메타데이터·해시는 별도로 보관하세요.'
].join('\n') + '\n');
console.log('Packaged ' + name);
