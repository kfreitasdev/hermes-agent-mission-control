import fs from "node:fs";
import path from "node:path";

export function safeWikiRelativePath(wikiDir, value) {
  const candidate = String(value || "").trim().replaceAll("\\", "/");
  if (!candidate || candidate.includes("\0") || candidate.startsWith("/") || path.posix.isAbsolute(candidate)) {
    throw new Error("wiki path must be a relative Markdown path");
  }
  const normalized = path.posix.normalize(candidate);
  if (normalized === "." || normalized === ".." || normalized.startsWith("../")
      || candidate.split("/").includes("..")) {
    throw new Error("wiki path escapes the wiki root");
  }
  if (!normalized.toLowerCase().endsWith(".md")) {
    throw new Error("wiki path must end in .md");
  }
  const root = path.resolve(wikiDir);
  const full = path.resolve(root, ...normalized.split("/"));
  const relative = path.relative(root, full);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("wiki path escapes the wiki root");
  }
  const realRoot = fs.existsSync(root) ? fs.realpathSync.native(root) : root;
  let existing = full;
  while (!fs.existsSync(existing) && existing !== root) existing = path.dirname(existing);
  const realExisting = fs.existsSync(existing) ? fs.realpathSync.native(existing) : realRoot;
  if (realExisting !== realRoot && !realExisting.startsWith(`${realRoot}${path.sep}`)) {
    throw new Error("wiki path follows a symlink outside the wiki root");
  }
  return relative;
}
