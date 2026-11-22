"""Set the intended API 29 heap on the disposable GitHub Actions AVD only."""
import os
from pathlib import Path
import sys


def configure(api):
    if api != '29':
        print('API ' + api + ': existing AVD profile retained')
        return
    assert os.environ.get('GITHUB_ACTIONS') == 'true', 'Only the disposable CI runner is permitted'
    root = Path(os.environ['ANDROID_AVD_HOME']).resolve(strict=True)
    config = (root / 'RunPen_CI.avd' / 'config.ini').resolve(strict=True)
    assert config.is_relative_to(root), 'AVD configuration escaped its CI directory'
    lines = config.read_text(encoding='utf8').splitlines()
    lines = [line for line in lines if line.split('=', 1)[0].strip() not in ('vm.heapSize', 'hw.heapSize')]
    config.write_text('\n'.join([*lines, 'vm.heapSize=256', '']), encoding='utf8')
    print('API 29 disposable AVD: vm.heapSize=256 MB')


if __name__ == '__main__':
    configure(sys.argv[1])
