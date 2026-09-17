from pathlib import Path

from PIL import Image

from actionshots_qa.imaging import jpeg_scan_hash


def test_metadata_segment_change_does_not_change_scan_hash(tmp_path: Path):
    image = tmp_path / "fixture.jpg"
    Image.new("RGB", (64, 64), (20, 90, 140)).save(image, "JPEG")
    before = jpeg_scan_hash(image)
    data = image.read_bytes()
    app = b"\xff\xfe" + (7).to_bytes(2, "big") + b"hello"
    image.write_bytes(data[:2] + app + data[2:])
    assert jpeg_scan_hash(image) == before


def test_pixel_change_changes_scan_hash(tmp_path: Path):
    first = tmp_path / "first.jpg"; second = tmp_path / "second.jpg"
    Image.new("RGB", (64, 64), "red").save(first, "JPEG")
    Image.new("RGB", (64, 64), "blue").save(second, "JPEG")
    assert jpeg_scan_hash(first) != jpeg_scan_hash(second)

