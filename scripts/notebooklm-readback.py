#!/usr/bin/env python3
"""Read-only NotebookLM evidence check for the Hermes bridge."""
from __future__ import annotations

import asyncio
import json
import sys
from typing import Any

from mcp_server.tools import list_notebooks, list_sources


async def main(notebook_id: str, source_id: str | None) -> None:
    notebooks_result: dict[str, Any] = await list_notebooks()
    notebooks = notebooks_result.get("notebooks", [])
    notebook = next((item for item in notebooks if str(item.get("id")) == notebook_id), None)
    if notebook is None:
        raise RuntimeError("notebook_id was not found by NotebookLM read-back")

    output: dict[str, Any] = {
        "status": "completed",
        "notebook_id": notebook_id,
        "notebook": notebook,
    }
    if source_id:
        sources_result: dict[str, Any] = await list_sources(notebook_id)
        sources = sources_result.get("sources", [])
        source = next((item for item in sources if str(item.get("id")) == source_id), None)
        if source is None:
            raise RuntimeError("source_id was not found in NotebookLM read-back")
        output["source_id"] = source_id
        output["source"] = source
    print(json.dumps(output, ensure_ascii=False))


if __name__ == "__main__":
    if len(sys.argv) not in {2, 3}:
        raise SystemExit("usage: notebooklm-readback.py NOTEBOOK_ID [SOURCE_ID]")
    try:
        asyncio.run(main(sys.argv[1], sys.argv[2] if len(sys.argv) == 3 else None))
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1) from exc
