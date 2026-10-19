#!/usr/bin/env python3
"""Fast, dependency-free structural checks for the Flutter sample."""

from __future__ import annotations

import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
EXPECTED = {
    "onboarding": ["welcome", "permissions", "plan"],
    "main-flow": ["home", "activity", "settings"],
}


def load_json(path: Path) -> object:
    try:
        return json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as error:
        raise AssertionError(f"{path}: {error}") from error


def main() -> int:
    workspace = load_json(ROOT / "workspace.json")
    assert isinstance(workspace, dict)
    assert workspace["kind"] == "flutter-workspace"
    assert workspace["flutter"]["root"] == "flutter"
    assert workspace["flutter"]["queryParameter"] == "fg_screen"

    catalog = (ROOT / "flutter/lib/preview_catalog.dart").read_text()
    main_source = (ROOT / "flutter/lib/main.dart").read_text()
    assert "fg_screen" in main_source

    discovered = []
    for canvas_id, expected_ids in EXPECTED.items():
        canvas_dir = ROOT / "canvases" / canvas_id
        manifest = load_json(canvas_dir / "frames.json")
        layout = load_json(canvas_dir / ".opendesign/layout.json")
        assert isinstance(manifest, dict)
        assert manifest["kind"] == "flutter-canvas"
        assert manifest["workspaceId"] == workspace["id"]
        assert manifest["preview"]["queryParameter"] == "fg_screen"
        ids = [frame["id"] for frame in manifest["frames"]]
        assert ids == expected_ids, f"{canvas_id}: unexpected screen ids {ids}"
        assert set(ids) == set(layout), f"{canvas_id}: layout and frame ids differ"
        for frame in manifest["frames"]:
            assert frame["type"] == "flutter"
            assert frame["screenId"] == frame["id"]
            assert frame["width"] == 390 and frame["height"] == 844
            assert f"'{frame['id']}'" in catalog
            assert layout[frame["id"]]["w"] == 390
            assert layout[frame["id"]]["h"] == 844
            discovered.append(frame["id"])

    assert len(discovered) == 6
    print("PASS: workspace, two canvases, six Flutter screen ids, and layouts agree.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (AssertionError, KeyError, OSError) as error:
        print(f"FAIL: {error}", file=sys.stderr)
        raise SystemExit(1)
