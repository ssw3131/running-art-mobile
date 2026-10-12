import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.argv[2];
if (!root || !existsSync(root)) throw Error('Usage: gallery.mjs android-results');
const esc = value => String(value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const read = file => existsSync(file) ? JSON.parse(readFileSync(file)) : null;
const report = read(path.join(root, 'report.json'));
let body = `<h1>RunPen Android verification</h1><pre>${esc(JSON.stringify(report, null, 2))}</pre>`;
for (const attempt of readdirSync(root).filter(name => /^attempt-\d{2}$/.test(name)).sort()) {
  const visual = read(path.join(root, attempt, 'visual/report.json'));
  body += `<h2>${esc(attempt)}</h2><p>Visual: ${esc(visual?.status ?? 'not_run')}</p>`;
  if (visual?.reason) body += `<p>${esc(visual.reason)}</p>`;
  if (visual?.results) for (const entry of visual.results) {
    body += `<h3>${esc(entry.id)} · ${esc(entry.status)} · ${entry.pixels} pixels</h3><div class="row">`;
    for (const kind of ['baseline', 'current', 'diff']) {
      const file = `${attempt}/visual/${entry.id}-${kind}.png`;
      body += `<figure><figcaption>${kind}</figcaption><a href="${esc(file)}"><img loading="lazy" src="${esc(file)}"></a></figure>`;
    }
    body += '</div>';
  } else {
    body += '<div class="row">';
    for (const file of readdirSync(path.join(root, attempt)).filter(file => /^(visual-.+|failure)\.png$/.test(file))) {
      const url = `${attempt}/${file}`;
      body += `<figure><figcaption>${esc(file)}</figcaption><a href="${esc(url)}"><img loading="lazy" src="${esc(url)}"></a></figure>`;
    }
    body += '</div>';
  }
}
writeFileSync(path.join(root, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>RunPen verification</title><style>body{font:16px system-ui;margin:24px;background:#f4f5f7;color:#152a24}pre{white-space:pre-wrap;font-size:12px;max-height:320px;overflow:auto;background:white;padding:16px}.row{display:flex;gap:16px;overflow:auto}figure{margin:0;min-width:220px}img{width:280px;max-width:85vw;border:1px solid #ddd}h2{border-top:1px solid #bbb;padding-top:24px}</style>${body}</html>`);
