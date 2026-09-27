#!/usr/bin/env python3
"""Read-only NotebookLM snapshot used to bind evidence to one operation."""
from __future__ import annotations

import asyncio
import json

from mcp_server.tools import list_notebooks, list_sources


async def main() -> None:
    notebooks_result = await list_notebooks()
    notebooks = notebooks_result.get("notebooks", [])
    notebook_ids = [str(item.get("id")) for item in notebooks if item.get("id")]
    sources: dict[str, list[str]] = {}
    for notebook_id in notebook_ids:
        result = await list_sources(notebook_id)
        sources[notebook_id] = [
            str(item.get("id")) for item in result.get("sources", []) if item.get("id")
        ]
    print(json.dumps({"notebooks": notebook_ids, "sources": sources}, ensure_ascii=False))


if __name__ == "__main__":
    asyncio.run(main())
