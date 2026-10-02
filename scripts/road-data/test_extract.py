import unittest
import io
import json
from types import SimpleNamespace
from extract import intersects, Extract


class BoundaryTests(unittest.TestCase):
    def test_streaming_national_preserves_full_way_and_ids(self):
        way = SimpleNamespace(id=51, tags={"highway": "footway"}, nodes=[
            SimpleNamespace(ref=10, lat=37.0, lon=126.0),
            SimpleNamespace(ref=11, lat=37.1, lon=126.1)])
        regular = Extract(None)
        regular.way(way)
        output = io.StringIO()
        streaming = Extract(None, output)
        streaming.way(way)
        self.assertEqual(json.loads(output.getvalue()), regular.elements[0])
        self.assertEqual(streaming.elements, [])
        self.assertEqual(streaming.extracted, 1)
        excluded = Extract([])
        excluded.way(way)
        self.assertEqual(excluded.extracted, 0)

    def test_crossing_without_inside_nodes(self):
        self.assertTrue(intersects((0.5, -1), (0.5, 2), [0, 0, 1, 1]))

    def test_edge_and_corner_touch(self):
        self.assertTrue(intersects((0, -1), (0, 2), [0, 0, 1, 1]))
        self.assertTrue(intersects((-1, -1), (0, 0), [0, 0, 1, 1]))

    def test_overlapping_bounding_boxes_are_not_enough(self):
        self.assertFalse(intersects((0.5, -1), (2, 0.5), [0, 0, 1, 1]))

    def test_degenerate(self):
        self.assertTrue(intersects((0.5, 0.5), (0.5, 0.5), [0, 0, 1, 1]))
        self.assertFalse(intersects((2, 2), (2, 2), [0, 0, 1, 1]))


if __name__ == '__main__':
    unittest.main()
