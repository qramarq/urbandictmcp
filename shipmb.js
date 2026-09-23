"use strict";

const { execFile } = require("node:child_process");
const { mkdtemp, writeFile, rm } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const path = require("node:path");

// The compiler wheel is a library; only ShipMBLang owns an installed CLI.
const compilerScript = `import json, sys
from pathlib import Path
from shipmbcompiler import compile_direct_program
from shipmbcompiler.limits import MAX_SOURCE_CHARS, read_text_limited
from shipmbcompiler.runtime import run_artifact
try:
    source = read_text_limited(Path(sys.argv[1]), MAX_SOURCE_CHARS, newline="")
    result = compile_direct_program(source, profile=sys.argv[2], memory=False, model_provider=None)
    if sys.argv[3] == "run" and result["status"] == "compiled":
        result["runtime"], errors = run_artifact(result["target_code"])
        result["diagnostics"].extend(error.to_dict() for error in errors)
except (OSError, UnicodeError, ValueError) as error:
    result = {"status": "error", "target_code": None, "diagnostics": [{"level": "error", "message": str(error)}]}
print(json.dumps(result))
sys.exit(0 if result["status"] == "compiled" and not any(d["level"] == "error" for d in result["diagnostics"]) else 1)
`;

const properties = {
  source: { type: "string", minLength: 1, maxLength: 10000 },
  backend: { type: "string", enum: ["compiler", "language"], default: "language" },
  profile: { type: "string", enum: ["general", "roku"], default: "general" },
};
const shipmbTools = [
  { name: "shipmb_compile", description: "Compile unchanged English source using an installed ShipMB backend. Returns diagnostics and clarification without automatic rewriting or fallback. Requires Python and ShipMB packages.",
    inputSchema: { type: "object", properties, required: ["source"], additionalProperties: false } },
  { name: "shipmb_run", description: "Compile and run a general-computation ShipMB program in the bounded upstream runtime, without host adapters or persistent memory. Requires Python and ShipMB packages.",
    inputSchema: { type: "object", properties: { source: properties.source, backend: properties.backend }, required: ["source"], additionalProperties: false } },
];

function invalid(message) {
  throw Object.assign(new Error(message), { code: -32602, isRpcError: true });
}

async function invoke(args, run, options = {}) {
  if (!args || typeof args !== "object" || Array.isArray(args)) invalid("Expected an argument object");
  const allowed = run ? ["source", "backend"] : ["source", "backend", "profile"];
  for (const key of Object.keys(args)) if (!allowed.includes(key)) invalid(`Unknown argument: ${key}`);
  if (typeof args.source !== "string" || !args.source.trim() || args.source.length > 10000) invalid("source must contain 1–10000 UTF-16 code units");
  const backend = args.backend === undefined ? "language" : args.backend;
  const profile = args.profile === undefined ? "general" : args.profile;
  if (!["compiler", "language"].includes(backend)) invalid("backend must be compiler or language");
  if (!["general", "roku"].includes(profile)) invalid("profile must be general or roku");
  const directory = await mkdtemp(path.join(tmpdir(), "urbandict-shipmb-"));
  try {
    const file = path.join(directory, "source.smb");
    await writeFile(file, args.source, "utf8");
    const command = process.env.SHIPMB_PYTHON || "python";
    const argv = backend === "compiler"
      ? ["-X", "utf8", "-c", compilerScript, file, profile, run ? "run" : "compile"]
      : ["-X", "utf8", "-m", "shipmblang", run ? "run" : "compile", "--file", file, "--format", "json"];
    if (backend === "language") argv.push("--pipeline", "direct", "--profile", profile, "--memory", "off", "--no-english-model");
    const response = await new Promise((resolve, reject) => {
      execFile(command, argv, {
        cwd: directory, windowsHide: true, shell: false, encoding: "utf8",
        timeout: 30000, maxBuffer: 4 * 1024 * 1024, signal: options.signal,
        env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8", SHIPMB_MEMORY: "off" },
      }, (error, stdout, stderr) => {
        if (error && (typeof error.code !== "number" || error.killed)) {
          reject(new Error(`ShipMB process failed: ${error.message}. Set SHIPMB_PYTHON to a Python environment with shipmbcompiler and shipmblang installed.`));
        } else resolve({ exit_code: error ? error.code : 0, stdout, stderr });
      });
    });
    let result;
    try { result = JSON.parse(response.stdout); }
    catch { throw new Error(`ShipMB returned no valid JSON (exit ${response.exit_code}): ${response.stderr.slice(0, 2000)}`); }
    if (!result || typeof result !== "object" || Array.isArray(result) || !Array.isArray(result.diagnostics)) {
      throw new Error("ShipMB returned an invalid diagnostic result");
    }
    const ok = response.exit_code === 0 && result.status === "compiled" && result.target_code != null
      && !result.diagnostics.some(d => d.level === "error") && (!run || result.runtime != null);
    return { ok, backend, profile, source: args.source, exit_code: response.exit_code,
      stderr: response.stderr, result };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

module.exports = { shipmbTools,
  compile: (args, options) => invoke(args, false, options),
  run: (args, options) => invoke(args, true, options) };
