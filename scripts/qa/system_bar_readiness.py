"""Observe the declared SystemUI state within the existing screenshot deadline."""
import json
import time
import uuid


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
            pin(budget())
            png = read_png(budget())
            ready = is_ready(png, budget())
            budget()  # A late successful response cannot extend the deadline.
            evidence['samples'].append({'elapsedSeconds': round(clock() - started, 3), 'fullSignal': ready})
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
