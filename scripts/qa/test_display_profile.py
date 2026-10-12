import unittest
from display_profile import device_overlays, display_geometry, is_pixel5_geometry


class DisplayProfileTest(unittest.TestCase):
    def test_only_device_overlays_are_selected(self):
        self.assertEqual(device_overlays('[x] com.android.internal.emulation.pixel_7\n[ ] com.android.systemui.emulation.pixel_5\n[x] com.android.internal.systemui.navbar.gestural\n[x] com.google.android.overlay.googleconfig\n'),
                         {'com.android.internal.emulation.pixel_7': True, 'com.android.systemui.emulation.pixel_5': False})

    def test_default_insets_cannot_match_the_pixel5_reference(self):
        template = '''mDisplayCutout=DisplayCutout{{insets=Rect(0, {top} - 0, 0) waterfall=Insets{{left=0}}
InsetsSource id=aa type=statusBars frame=[0,0][1080,{top}] visible=true flags= sideHint=TOP
InsetsSource id=bb type=navigationBars frame=[0,2277][1080,2340] visible=true flags=SUPPRESS_SCRIM'''
        self.assertTrue(is_pixel5_geometry(display_geometry(template.format(top=136))))
        self.assertFalse(is_pixel5_geometry(display_geometry(template.format(top=63))))
        stale_bar = template.format(top=136).replace('frame=[0,0][1080,136]', 'frame=[0,0][1080,63]')
        self.assertFalse(is_pixel5_geometry(display_geometry(stale_bar)))
        with self.assertRaises(ValueError):
            display_geometry('statusBars frame unavailable')


if __name__ == '__main__':
    unittest.main()
