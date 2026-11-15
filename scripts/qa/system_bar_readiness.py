"""Observe the declared SystemUI state within the existing screenshot deadline."""
import json
import time
import uuid


def pin_system_bar(radio, demo, remaining, *, clock=time.monotonic):
    """Refresh the real modem and demo consumer inside one remaining budget."""
    deadline = clock() + remaining
    response = radio(remaining).decode().strip()
    if 'OK' not in response or 'KO' in response:
        raise RuntimeError('Modem signal profile rejected: ' + response)
    left = deadline - clock()
    if left <= 0:
        raise TimeoutError('Modem signal pin exceeded visual settling deadline')
    demo(left)
    if clock() >= deadline:
        raise TimeoutError('SystemUI signal pin exceeded visual settling deadline')
    return {'profile': 4, 'response': response}


def wait_system_bar(pin, read_png, is_ready, output, name, remaining, *, clock=time.monotonic, sleep=time.sleep):
    started = clock()
    deadline = started + remaining
    evidence = {'capture': name, 'status': 'waiting', 'samples': []}
    token = uuid.uuid4().hex

    def budget():
        left = deadline - clock()
        if left <= 0:
            raise TimeoutError('SystemUI full signal not ready within visual settling deadline')
        return left

    try:
        while True:
            pinned = pin(budget())
            png = read_png(budget())
            ready = is_ready(png, budget())
            budget()  # A late successful response cannot extend the deadline.
            evidence['samples'].append({'elapsedSeconds': round(clock() - started, 3), 'fullSignal': ready})
            if pinned is not None:
                evidence['samples'][-1]['radioSignalProfile'] = pinned
            if ready:
                evidence['status'] = 'passed'
                return png  # Return the exact device bytes; never alter the PNG.
            filename = f'{name}-systembar-{token}-{len(evidence["samples"]):02d}.png'
            (output / filename).write_bytes(png)
            evidence['samples'][-1]['file'] = filename
            sleep(min(.25, budget()))
    finally:
        if evidence['status'] != 'passed':
            evidence['status'] = 'failed'
        with (output / 'systembar-readiness.jsonl').open('a', encoding='utf8') as log:
            log.write(json.dumps(evidence) + '\n')
