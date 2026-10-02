"""Validate a dated Geofabrik download and preserve a separate immutable source lock."""
import argparse
import hashlib
import json
import re
from pathlib import Path
import osmium


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--file", required=True, help="Completed download or .part file")
    parser.add_argument("--md5", required=True, help="Official adjacent .md5 file")
    parser.add_argument("--expected-bytes", required=True, type=int)
    parser.add_argument("--expected-timestamp", required=True)
    parser.add_argument("--output", required=True, help="New dated source lock")
    args = parser.parse_args()
    raw = Path(args.file)
    name = raw.name.removesuffix(".part")
    if not re.fullmatch(r"south-korea-\d{6}\.osm\.pbf", name):
        raise ValueError("A dated Korean source filename is required")
    expected_md5 = Path(args.md5).read_text().split()
    if len(expected_md5) != 2 or expected_md5[1].lstrip("*") != name:
        raise ValueError("Official checksum filename mismatch")
    if raw.stat().st_size != args.expected_bytes:
        raise ValueError("Incomplete download")
    digest, md5 = hashlib.sha256(), hashlib.md5()
    with raw.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
            md5.update(chunk)
    if md5.hexdigest() != expected_md5[0]:
        raise ValueError("Official checksum mismatch")
    # Explicit format permits reading the .part filename without renaming an
    # unverified download first.
    with osmium.io.Reader(osmium.io.File(str(raw), "pbf")) as reader:
        header = reader.header()
        timestamp = header.get("osmosis_replication_timestamp")
        sequence = header.get("osmosis_replication_sequence_number")
    # Release native ownership too: on Windows a closed Reader may retain the
    # underlying file object until its Python wrapper is destroyed.
    del header, reader
    if timestamp != args.expected_timestamp:
        raise ValueError("Official data timestamp mismatch")
    source = {"url": f"https://download.geofabrik.de/asia/{name}", "file": name,
              "bytes": raw.stat().st_size, "sha256": digest.hexdigest(), "md5": md5.hexdigest(),
              "dataTimestamp": timestamp, "replicationSequence": sequence,
              "attribution": "© OpenStreetMap contributors; extract by Geofabrik",
              "license": "ODbL-1.0", "licenseUrl": "https://www.openstreetmap.org/copyright"}
    output = Path(args.output)
    if output.exists():
        if json.loads(output.read_text(encoding="utf-8")) != source:
            raise ValueError("Cannot overwrite a different source lock")
    else:
        output.parent.mkdir(parents=True, exist_ok=True)
        with output.open("x", encoding="utf-8") as stream:
            stream.write(json.dumps(source, ensure_ascii=False, indent=2) + "\n")
    destination = raw.with_name(name)
    if destination != raw:
        if destination.exists():
            raise ValueError("Verified destination already exists; retained download")
        raw.rename(destination)
    print(json.dumps(source), flush=True)


if __name__ == "__main__":
    main()
