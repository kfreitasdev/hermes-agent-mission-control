#!/usr/bin/env node
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const profile = "glowryia";
if (process.env.HERMES_PROFILE && process.env.HERMES_PROFILE !== profile) {
  console.error(`This audit is fixed to the Bridge profile: ${profile}`);
  process.exit(2);
}

async function run(command, args) {
  try {
    const result = await execFileAsync(command, args, { timeout: 120000, maxBuffer: 200000 });
    return { ok: true, stdout: result.stdout || "", stderr: result.stderr || "" };
  } catch (error) {
    return {
      ok: false,
      stdout: error.stdout || "",
      stderr: error.stderr || error.message || "command failed",
    };
  }
}

const mcp = await run("hermes", ["-p", profile, "mcp", "test", "notebooklm"]);
const safeMcp = await run("hermes", ["-p", profile, "mcp", "test", "notebooklm-safe"]);
const auth = await run("notebooklm-auth", ["verify"]);
let authJson = null;
try {
  authJson = JSON.parse(auth.stdout.trim());
} catch {
  // The check below reports a useful failure without echoing auth material.
}

const checks = [
  {
    name: "profile-mcp-connected",
    ok: mcp.ok && /Connected/i.test(mcp.stdout) && /Tools discovered:\s*13/i.test(mcp.stdout),
    detail: mcp.ok ? "NotebookLM MCP connected with 13 tools" : "NotebookLM MCP test failed",
  },
  {
    name: "profile-mcp-safe-facade",
    ok: safeMcp.ok && /Connected/i.test(safeMcp.stdout) && /Tools discovered:\s*4/i.test(safeMcp.stdout)
      && /nlm_create_notebook/.test(safeMcp.stdout) && /nlm_add_source/.test(safeMcp.stdout)
      && !/nlm_delete|nlm_generate|nlm_research|nlm_download/.test(safeMcp.stdout),
    detail: safeMcp.ok ? "Restricted NotebookLM facade connected with 4 tools" : "Restricted NotebookLM facade test failed",
  },
  {
    name: "notebooklm-authenticated",
    ok: auth.ok && authJson?.valid === true,
    detail: auth.ok && authJson?.valid === true ? "NotebookLM auth is valid" : "NotebookLM auth verify failed",
  },
];

const result = { ok: checks.every((check) => check.ok), profile, checks };
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.ok ? 0 : 1;
