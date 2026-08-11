"""Read-only inspection of the bundled Material Symbols Rounded WOFF2.

A ligature icon font is addressed by writing the glyph's NAME as the element's
text, so a name the font does not carry renders the literal English word rather
than a missing-glyph box. The only way to know a name is really there is to read
the font's own ligature table out of the shipped binary — an icon gallery lists
names the bundled subset may not have.

This script extracts that table and writes it into the manifest's
`officialSubsetInspection` block, where the Node contract test can assert every
name in `MaterialSymbolNames` against it. It never modifies the font.

Usage:
    py -3 script/inspect-material-symbols.py            # rewrite the manifest
    py -3 script/inspect-material-symbols.py --check    # verify, exit non-zero

Requires fontTools and brotli (`py -3 -m pip install --user fonttools brotli`).
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "app" / "styles" / "fonts" / "font-assets-manifest.json"
SYMBOL_SOURCE = ROOT / "app" / "src" / "ui" / "lib" / "material-symbol.tsx"
FAMILY = "Material Symbols Rounded"


def declared_icon_names() -> list[str]:
    """The ligature names the UI is allowed to render."""
    source = SYMBOL_SOURCE.read_text(encoding="utf-8")
    block = re.search(
        r"export const MaterialSymbolNames = \[(.*?)\] as const", source, re.S
    )
    if block is None:
        raise SystemExit(f"MaterialSymbolNames not found in {SYMBOL_SOURCE}")
    return sorted(re.findall(r"'([a-z0-9_]+)'", block.group(1)))


def ligature_names(font: TTFont) -> set[str]:
    """Every ligature name the font actually carries, read from GSUB."""
    best_cmap = font.getBestCmap()
    glyph_to_char: dict[str, str] = {}
    for code_point, glyph in best_cmap.items():
        glyph_to_char.setdefault(glyph, chr(code_point))

    found: set[str] = set()

    def walk(subtable, lookup_type: int) -> None:
        # Type 7 is an extension lookup; the real subtable hangs off it.
        if lookup_type == 7:
            walk(subtable.ExtSubTable, subtable.ExtensionLookupType)
            return
        if lookup_type != 4:  # 4 is ligature substitution
            return
        for first_glyph, ligatures in subtable.ligatures.items():
            first_char = glyph_to_char.get(first_glyph)
            if first_char is None:
                continue
            for ligature in ligatures:
                components = [glyph_to_char.get(c) for c in ligature.Component]
                if any(c is None for c in components):
                    continue
                found.add(first_char + "".join(components))

    for lookup in font["GSUB"].table.LookupList.Lookup:
        for subtable in lookup.SubTable:
            walk(subtable, lookup.LookupType)

    return found


def main() -> int:
    check = "--check" in sys.argv
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    index = next(
        i for i, a in enumerate(manifest["assets"]) if a.get("family") == FAMILY
    )
    asset = manifest["assets"][index]

    font = TTFont(ROOT / asset["relativePath"])
    names = ligature_names(font)
    declared = declared_icon_names()
    missing = [name for name in declared if name not in names]

    if missing:
        print(f"MISSING from {asset['relativePath']}: {', '.join(missing)}")
        return 1

    if check:
        recorded = asset.get("officialSubsetInspection", {}).get("ligatureNames", [])
        if sorted(recorded) != sorted(names):
            print("manifest ligatureNames is stale; re-run without --check")
            return 1
        print(f"ok {len(declared)} declared names, {len(names)} in the font")
        return 0

    asset["officialSubsetInspection"] = {
        "tool": "fontTools (read-only inspection of the shipped WOFF2)",
        "command": "py -3 script/inspect-material-symbols.py",
        "glyphCount": len(font.getGlyphOrder()),
        "cmapEntryCount": len(font.getBestCmap()),
        "ligatureNameCountIncludingOfficialAliases": len(names),
        "note": (
            "The CSS API query contains only the requested icon names. Google "
            "retains official alias ligatures that map to the same requested "
            "glyph set; the binary was not post-processed."
        ),
        "ligatureNames": sorted(names),
    }

    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(
        f"recorded {len(names)} ligature names covering all "
        f"{len(declared)} declared icons"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
