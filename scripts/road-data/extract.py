"""Pinned Korean PBF -> full highway ways covering every sample grid candidate.

Run from the mobile root. Python 3.12 + requirements.txt, no sibling projects.
Raw data and generated files are deliberately outside Git. No road is clipped.
"""
import argparse
import hashlib
import json
import math
import time
from pathlib import Path

import osmium

HERE = Path(__file__).resolve().parent


def bounds(origin, radius):
    angle = radius / 6371000
    height = math.degrees(angle)
    width = math.degrees(math.asin(math.sin(angle) / math.cos(math.radians(origin["lat"]))))
    return [origin["lat"] - height, origin["lng"] - width,
            origin["lat"] + height, origin["lng"] + width]


def intersects(a, b, box):
    """Closed segment/rectangle, including crossing segments without inside nodes."""
    lo, hi = 0.0, 1.0
    for axis, lower, upper in [(0, box[0], box[2]), (1, box[1], box[3])]:
        delta = b[axis] - a[axis]
        if delta == 0:
            if not lower <= a[axis] <= upper:
                return False
        else:
            first, last = sorted(((lower - a[axis]) / delta, (upper - a[axis]) / delta))
            lo, hi = max(lo, first), min(hi, last)
            if lo > hi:
                return False
    return True


class Extract(osmium.SimpleHandler):
    def __init__(self, regions, stream=None):
        super().__init__()
        self.regions = regions
        self.elements = []
        self.highways = 0
        self.stream = stream
        self.extracted = 0

    def way(self, way):
        if not way.tags.get("highway") or len(way.nodes) < 2:
            return
        self.highways += 1
        # Fail on unresolved references rather than silently joining across a gap.
        coordinates = [(node.lat, node.lon) for node in way.nodes]
        extent = [min(p[0] for p in coordinates), min(p[1] for p in coordinates),
                  max(p[0] for p in coordinates), max(p[1] for p in coordinates)]
        regions = [r for r in (self.regions or []) if extent[0] <= r[2] and extent[2] >= r[0]
                   and extent[1] <= r[3] and extent[3] >= r[1]]
        if self.regions is not None and (not regions or not any(intersects(a, b, r) for r in regions
                                  for a, b in zip(coordinates, coordinates[1:]))):
            return
        element = {"type": "way", "id": way.id,
                              "nodes": [node.ref for node in way.nodes],
                              "geometry": [{"lat": p[0], "lon": p[1]} for p in coordinates],
                              "tags": dict(way.tags)}
        self.extracted += 1
        if self.stream:
            self.stream.write(json.dumps(element, ensure_ascii=False, separators=(",", ":")) + "\n")
        else:
            self.elements.append(element)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", default=".cache/road-data/raw")
    parser.add_argument("--source-lock", default=str(HERE / "source-lock.json"))
    parser.add_argument("--output", default=".cache/road-data/extracted.json")
    parser.add_argument("--national", action="store_true", help="Extract all highway ways in the pinned Korean source")
    parser.add_argument("--jsonl", action="store_true", help="Stream metadata then one highway per line, avoiding a national in-memory list")
    args = parser.parse_args()
    source = json.loads(Path(args.source_lock).read_text(encoding="utf-8"))
    samples = json.loads((HERE / "samples.json").read_text(encoding="utf-8"))
    path = Path(args.source_dir) / source["file"]
    if path.stat().st_size != source["bytes"]:
        raise ValueError("Source size mismatch")
    with path.open("rb") as stream:
        if hashlib.file_digest(stream, "sha256").hexdigest() != source["sha256"]:
            raise ValueError("Source SHA-256 mismatch")
    with osmium.io.Reader(str(path)) as reader:
        header = reader.header()
        if header.get("osmosis_replication_timestamp") != source["dataTimestamp"]:
            raise ValueError("Source timestamp mismatch")
    regions = []
    for sample in samples["samples"]:
        box = bounds(sample["origin"], samples["radiusMeters"])
        for step in samples["gridStepsE7"]:
            size = step / 1e7
            regions.append([math.floor(box[0] / size) * size, math.floor(box[1] / size) * size,
                            (math.floor(box[2] / size) + 1) * size,
                            (math.floor(box[3] / size) + 1) * size])
    started = time.perf_counter()
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    selected = None if args.national else regions
    metadata = {"source": source, "regions": selected}
    if args.jsonl:
        temporary = output.with_suffix(output.suffix + ".partial")
        with temporary.open("w", encoding="utf-8", newline="\n") as stream:
            stream.write(json.dumps(metadata, ensure_ascii=False, separators=(",", ":")) + "\n")
            handler = Extract(selected, stream)
            handler.apply_file(str(path), locations=True, idx="sparse_mem_array")
        temporary.replace(output)
    else:
        handler = Extract(selected)
        handler.apply_file(str(path), locations=True, idx="sparse_mem_array")
        handler.elements.sort(key=lambda e: e["id"])
        output.write_text(json.dumps({**metadata, "elements": handler.elements}, ensure_ascii=False,
                                    separators=(",", ":")), encoding="utf-8")
    with output.open("rb") as stream:
        output_hash = hashlib.file_digest(stream, "sha256").hexdigest()
    report = {"output": str(output), "source": source, "national": args.national,
              "jsonl": args.jsonl, "outputBytes": output.stat().st_size,
              "outputSha256": output_hash, "highwayWaysScanned": handler.highways,
              "extractedWays": handler.extracted,
              "elapsedSeconds": round(time.perf_counter() - started, 3)}
    report_path = output.with_suffix(output.suffix + ".report.json")
    report_temp = report_path.with_suffix(report_path.suffix + ".partial")
    report_temp.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    report_temp.replace(report_path)
    print(json.dumps(report), flush=True)


if __name__ == "__main__":
    main()
