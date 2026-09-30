import unittest
from extract import intersects


class BoundaryTests(unittest.TestCase):
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
