import json
import os
from pathlib import Path

from PIL import Image

from actionshots_qa.metadata import write_rating_verified


def test_rating_write_contract_preserves_copyright_and_scan_bytes(tmp_path: Path):
    image = tmp_path / "athlete.jpg"
    Image.new("RGB", (64, 64), "green").save(image, "JPEG")
    state = Path(str(image) + ".state.json")
    state.write_text(json.dumps({"Copyright": "CODE-7", "Rating": 0}))
    fake = tmp_path / "fake_exiftool.py"
    fake.write_text("""#!/usr/bin/env python3
import json, shutil, sys
from pathlib import Path
p=Path(sys.argv[-1]); s=Path(str(p)+'.state.json')
if '-json' in sys.argv:
 print(json.dumps([json.loads(s.read_text())])); raise SystemExit(0)
rating=next(int(x.split('=',1)[1]) for x in sys.argv if x.startswith('-XMP:Rating='))
shutil.copy2(p, Path(str(p)+'_original'))
d=json.loads(s.read_text()); d['Rating']=rating; s.write_text(json.dumps(d))
print('1 image files updated')
""", encoding="utf-8")
    fake.chmod(fake.stat().st_mode | 0o111)
    result = write_rating_verified(fake, image, 5)
    assert result.rating == 5
    assert result.copyright_before == result.copyright_after == "CODE-7"
    assert result.scan_hash_before == result.scan_hash_after
    assert not Path(str(image) + "_original").exists()
