"""Bounded static-screen settling, independent of visual baselines."""
import hashlib
import json
import time


def capture_settled(read_png, output, name, *, clock=time.monotonic, sleep=time.sleep,
                    warmup=2.0, stable_for=1.0, timeout=12.0, interval=0.25):
    if min(warmup, stable_for, timeout, interval) <= 0 or timeout <= warmup + stable_for:
        raise ValueError('Invalid visual readiness timing')
    started = clock()
    evidence = {'capture': name, 'status': 'waiting', 'samples': []}
    previous = None
    unchanged_since = None
    candidate = output / f'{name}.png'
    if candidate.exists():
        candidate.replace(output / f'{name}-before-settle.png')
    # Do not accept an early frame before the native scroll indicator can fade.
    sleep(warmup)
    try:
        while clock() - started < timeout:
            png = read_png(timeout - (clock() - started))
            now = clock()
            if not png.startswith(b'\x89PNG\r\n\x1a\n'):
                raise RuntimeError('Invalid screenshot received')
            changed = png != previous
            if changed:
                unchanged_since = now
                sample = f'{name}-settle-{len(evidence["samples"]):03d}.png'
                (output / sample).write_bytes(png)
            evidence['samples'].append({'elapsedSeconds': round(now - started, 3),
                'sha256': hashlib.sha256(png).hexdigest(), 'changed': changed})
            if now - started >= timeout:
                break
            if not changed and now - unchanged_since >= stable_for:
                (output / f'{name}.png').write_bytes(png)
                evidence['status'] = 'passed'
                return
            previous = png
            sleep(interval)
        raise RuntimeError(f'Static screen did not settle within {timeout}s: {name}')
    finally:
        if evidence['status'] != 'passed':
            evidence['status'] = 'failed'
        (output / f'{name}-settling.json').write_text(json.dumps(evidence, indent=2), encoding='utf8')
