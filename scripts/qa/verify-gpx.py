"""Validate generated GPX against a separately downloaded official schema, with no network access."""
import argparse
import json
from pathlib import Path
from lxml import etree

parser = argparse.ArgumentParser()
parser.add_argument("directory", type=Path)
parser.add_argument("--schema", type=Path, required=True)
args = parser.parse_args()
xml_parser = etree.XMLParser(resolve_entities=False, no_network=True)
schema = etree.XMLSchema(etree.parse(str(args.schema), xml_parser))
namespace = {"g": "http://www.topografix.com/GPX/1/1"}
files = sorted(args.directory.glob("*.gpx"))
if not files:
    raise ValueError("No GPX files to validate")
for filename in files:
    document = etree.parse(str(filename), xml_parser)
    schema.assertValid(document)
    assert len(document.findall("g:trk", namespace)) == 1, filename
    assert len(document.findall("g:trk/g:trkseg", namespace)) == 1, filename
    assert not document.xpath("//g:time | //g:ele | //g:wpt | //g:rte", namespaces=namespace), filename
manifest_file = args.directory / "manifest.json"
compared = 0
if manifest_file.exists():
    for item in json.loads(manifest_file.read_text(encoding="utf-8")):
        document = etree.parse(str(args.directory / item["name"]), xml_parser)
        actual = [[float(p.get("lon")), float(p.get("lat"))] for p in document.findall("g:trk/g:trkseg/g:trkpt", namespace)]
        assert actual == item["route"], item["name"]
        expected_title = ("가상 테스트 코스: " if item["source"] == "synthetic" else "") + item["title"]
        assert document.findtext("g:trk/g:name", namespaces=namespace) == expected_title
        compared += 1
print(json.dumps({"schema_valid_files": len(files), "complete_routes_compared": compared}))
