"""Explicit emulator overlays and measured OS insets for visual evidence."""
import re

PIXEL5 = {'com.android.internal.emulation.pixel_5', 'com.android.systemui.emulation.pixel_5'}


def device_overlays(text):
    return {name: state == 'x' for state, name in re.findall(r'^\[([ x])\] (\S+)\r?$', text, re.M)
            if re.match(r'com\.android\.(?:internal|systemui)\.emulation\.pixel_', name)
            or name.startswith('com.android.internal.display.cutout.emulation.')}


def display_geometry(text):
    def frame(kind):
        match = re.search(r'type=' + kind + r' frame=\[(\d+),(\d+)\]\[(\d+),(\d+)\] visible=true', text)
        if not match:
            raise ValueError('Missing visible ' + kind + ' frame')
        return list(map(int, match.groups()))
    cutout = re.search(r'mDisplayCutout=DisplayCutout\{insets=Rect\((\d+), (\d+) - (\d+), (\d+)\)', text)
    if not cutout:
        raise ValueError('Missing display cutout geometry')
    return {'statusBar': frame('statusBars'), 'navigationBar': frame('navigationBars'),
            'cutoutInsets': list(map(int, cutout.groups()))}


def is_pixel5_geometry(geometry):
    return geometry == {'statusBar': [0, 0, 1080, 136], 'navigationBar': [0, 2277, 1080, 2340],
                        'cutoutInsets': [0, 136, 0, 0]}
