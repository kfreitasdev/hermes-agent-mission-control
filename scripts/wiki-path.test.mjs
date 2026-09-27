import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { safeWikiRelativePath } from "../hermes-bridge/wiki-path.mjs";

const root = "/root/.hermes/wiki";

test("wiki paths stay relative to the wiki root", () => {
  assert.equal(safeWikiRelativePath(root, "facts/example.md"), "facts/example.md");
  assert.equal(safeWikiRelativePath(root, "facts\\example.md"), "facts/example.md");
});

test("wiki paths reject traversal, absolute paths, and non-Markdown files", () => {
  for (const value of ["../outside.md", "facts/../outside.md", "/tmp/out.md", "facts/out.txt", "facts\\..\\outside.md"]) {
    assert.throws(() => safeWikiRelativePath(root, value));
  }
});

test("wiki paths reject symlink escapes", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-path-"));
  const tempRoot = path.join(temp, "wiki");
  const outside = path.join(temp, "outside");
  fs.mkdirSync(tempRoot);
  fs.mkdirSync(outside);
  fs.symlinkSync(outside, path.join(tempRoot, "linked"), "dir");
  try {
    assert.throws(() => safeWikiRelativePath(tempRoot, "linked/escape.md"));
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
