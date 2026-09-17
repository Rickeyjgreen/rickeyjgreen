from pathlib import Path

from actionshots_qa.roster import load_roster_codes, normalize_code


def test_barcode_1_is_loaded_without_private_fields(tmp_path: Path):
    roster = tmp_path / "GotPhoto export.csv"
    roster.write_text("NAME,Parent Email,Barcode (1)\nA Kid,parent@example.com,ABC-1\n", encoding="utf-8")
    result = load_roster_codes(roster)
    assert result.codes == frozenset({"ABC-1"})
    assert not hasattr(result, "rows")


def test_numeric_excel_style_code_is_normalized():
    assert normalize_code("12345.0") == "12345"

