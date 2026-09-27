#!/usr/bin/env python3
"""Restricted NotebookLM MCP facade for approved Mission Control requests.

Only creation, source ingestion, and read-back/list operations are exposed.
Destructive generation, deletion, research, download, and artifact operations
stay unavailable to prompts executed by the Bridge.
"""
from __future__ import annotations

import asyncio

from fastmcp import FastMCP
from mcp_server import tools

mcp = FastMCP("notebooklm-safe")


@mcp.tool(name="nlm_create_notebook")
async def nlm_create_notebook(
    title: str,
    sources: list[str] | None = None,
    text_sources: list[str] | None = None,
    file_sources: list[str] | None = None,
):
    return await tools.create_notebook(title, sources, text_sources, file_sources)


@mcp.tool(name="nlm_add_source")
async def nlm_add_source(
    name_or_id: str,
    url: str | None = None,
    text: str | None = None,
    text_title: str | None = None,
    file_path: str | None = None,
):
    return await tools.add_source(name_or_id, url, text, text_title, file_path)


@mcp.tool(name="nlm_list")
async def nlm_list():
    return await tools.list_notebooks()


@mcp.tool(name="nlm_list_sources")
async def nlm_list_sources(name_or_id: str):
    return await tools.list_sources(name_or_id)


if __name__ == "__main__":
    mcp.run(transport="stdio")
