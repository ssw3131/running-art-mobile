// The build emits this provider-independent model from the app's shared TypeScript.
// eslint-disable-next-line import/no-unresolved
import { validateSharedRun, validToken, SHARE_MAX_BYTES } from './model.js';
import { showMap } from './map-provider.js';

const $ = id => document.getElementById(id);
let map = null, version = 0, abort = null;
function status(title, text, retry = false) {
  $('content').hidden = true; $('status').hidden = false;
  $('status-title').textContent = title; $('status-text').textContent = text; $('retry').hidden = !retry;
}
function configValid(c) {
  if (!c || c.schemaVersion !== 1 || typeof c.mapKey !== 'string' || !c.mapKey || typeof c.publicKey !== 'string' || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(c.publicKey)) return false;
  const endpoint = new URL(c.apiUrl);
  return endpoint.protocol === 'https:' && endpoint.pathname === '/' && !endpoint.username && !endpoint.password && !endpoint.hash && !endpoint.search;
}
async function load() {
  const current = ++version;
  abort?.abort(); abort = new AbortController(); const requestAbort = abort, signal = abort.signal;
  map?.destroy(); map = null; $('fit').disabled = true;
  const match = /^#r\/([a-f0-9]{64})$/.exec(location.hash);
  if (!match || !validToken(match[1])) { status('달린 길을 함께 만나요', 'RunPen에서 받은 경로 공유 링크를 열어 주세요.'); return; }
  status('경로를 불러오고 있어요', '잠시만 기다려 주세요.');
  const deadline = setTimeout(() => requestAbort.abort(), 20000);
  try {
    const configResponse = await fetch('./config.json', { cache: 'no-store', credentials: 'omit', signal, referrerPolicy: 'no-referrer' });
    if (!configResponse.ok) throw new Error('Configuration unavailable');
    const config = await configResponse.json();
    if (!configValid(config)) throw new Error('Configuration invalid');
    const response = await fetch(`${new URL(config.apiUrl).origin}/rest/v1/rpc/read_run_share`, {
      method: 'POST', headers: { apikey: config.publicKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_token: match[1] }), cache: 'no-store', credentials: 'omit', signal, referrerPolicy: 'no-referrer', redirect: 'error',
    });
    if (!response.ok) throw new Error('Sharing unavailable');
    // Bound response allocation as well as the validator's accepted data.
    const reader = response.body.getReader(), decoder = new TextDecoder(); let raw = '', bytes = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        bytes += value.byteLength;
        if (bytes > SHARE_MAX_BYTES) { await reader.cancel(); throw new Error('Oversized share'); }
        raw += decoder.decode(value, { stream: true });
      }
      raw += decoder.decode();
    } finally { reader.releaseLock(); }
    if (version !== current) return;
    const payload = JSON.parse(raw);
    if (payload === null) { status('이 경로를 볼 수 없어요', '공유가 중단되었거나 올바르지 않은 링크예요. 공유한 사람에게 새 링크를 요청해 주세요.'); return; }
    const snapshot = validateSharedRun(payload);
    $('run-title').textContent = snapshot.title;
    $('distance').textContent = (snapshot.distanceM / 1000).toFixed(2);
    const seconds = Math.floor(snapshot.activeMs / 1000);
    $('duration').textContent = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(n => String(n).padStart(2, '0')).join(':');
    $('planned-label').hidden = !snapshot.planned; $('target-label').hidden = !snapshot.planned;
    $('path-note').textContent = snapshot.planned ? '실제 경로의 끊어진 부분은 일시정지 또는 GPS 수신 공백이에요. 계획 코스와 원래 도형은 러닝을 시작할 때의 모습이에요.' : '계획 코스 없이 달린 기록이에요. 실제 경로의 끊어진 부분은 일시정지 또는 GPS 수신 공백이에요.';
    for (const name of ['actual', 'planned', 'target']) $(`show-${name}`).checked = true;
    $('status').hidden = true; $('content').hidden = false;
    $('map-status').hidden = false; $('map-status').textContent = '지도를 준비하고 있어요.';
    try {
      map = showMap({ container: 'map', snapshot, key: config.mapKey,
        onReady: () => { if (current === version) { $('map-status').hidden = true; $('fit').disabled = false; } },
        onError: text => { if (current === version) { $('map-status').hidden = false; $('map-status').textContent = text; } },
      });
    } catch { $('map-status').textContent = '지도를 불러오지 못했어요. 인터넷 연결을 확인한 뒤 페이지를 다시 열어 주세요.'; }
  } catch { if (current === version) status('경로를 불러오지 못했어요', '인터넷 연결을 확인한 뒤 다시 시도해 주세요.', true); }
  finally { clearTimeout(deadline); }
}
$('retry').addEventListener('click', load);
$('fit').addEventListener('click', () => map?.fit());
for (const name of ['actual', 'planned', 'target']) $(`show-${name}`).addEventListener('change', event => map?.setVisible(name, event.target.checked));
window.addEventListener('hashchange', load);
// Both the deferred map SDK and this module finish before DOMContentLoaded.
window.addEventListener('DOMContentLoaded', () => void load(), { once: true });
