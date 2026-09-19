# ShipMB integration context

## Verified upstream handoff

This context records the terminal/editor integration handoff on 2026-09-19:

- [Language and VS Code extension](https://github.com/qramarq/shipmblang/commit/2062f44da83592981b56634f92d1fabe5ea1f601).
- [Compiler](https://github.com/qramarq/shipmblang-compiler/commit/936c90dff6708c93db43e162c0107ccd69cdb887).

The upstream owners report module/API/console entry points, clean offline wheel
installation, both package installation orders, paths containing spaces and
Unicode, and a real VS Code extension-host check as validated. These are upstream
results, not tests executed by this repository.

## Responsibilities and current scope

ShipMBCompiler owns parsing, name resolution, validation, diagnostics, and bytecode.
Its direct pipeline compiles supported English through source-linked syntax and
resolved symbols to bytecode without requiring ShipMBLangCore target text or an
IR-generation step. ShipMBLang owns user commands and editor integration. Core
retains normative contracts and conformance knowledge; it is not required target
code for direct compilation.

Direct compilation is opt-in. IR and the language's legacy pipeline remain
distinct compatibility paths with existing defaults. The general profile supports
the implemented computation subset, including typed functions and recursion;
this is not a claim that arbitrary English or every application domain compiles.
Weather/permission handling was a build example, not a feature to add here.

Urbandictmcp now exposes `shipmb_compile` and `shipmb_run` alongside its five
dictionary tools. Its JavaScript `shipmb.compile` and `shipmb.run` API uses the
same bridge. This delegates to installed Python packages; it does not duplicate
the compiler, change upstream defaults, or automatically normalize source.

## Install and use the bridge

Use Python 3.11 or newer with both packages installed. The compiler must include
`--diagnostic-format json`; older wheels also labeled 0.2.1 can predate this flag.
The pinned commits above were tested. With access to the private repositories:

```powershell
python -m venv .venv-shipmb
.\.venv-shipmb\Scripts\python.exe -m pip install "shipmbcompiler @ git+https://github.com/qramarq/shipmblang-compiler.git@936c90dff6708c93db43e162c0107ccd69cdb887#subdirectory=shipmbcompiler" "shipmblang @ git+https://github.com/qramarq/shipmblang.git@2062f44da83592981b56634f92d1fabe5ea1f601"
$env:SHIPMB_PYTHON = (Resolve-Path .\.venv-shipmb\Scripts\python.exe).Path
node server.js
```

Alternatively install locally built wheels from these revisions. On Unix use
the environment's `bin/python`. `SHIPMB_PYTHON` is a single executable path,
configured by the host, never a tool argument or shell command. It defaults to
`python`. Include it in your MCP server configuration's `env` to persist the
choice. Missing packages produce a tool error; dictionary tools still work.

Example MCP arguments to either new tool:

```json
{"source":"Let total be an integer with value 27. Show total.","backend":"language"}
```

`backend` selects `compiler` (default, `python -m shipmbc`) or `language`
(`python -m shipmblang`). Compilation also accepts `profile: "general"` (default)
or `"roku"`. Running is restricted to the general profile without host adapters.
Both use the direct pipeline explicitly and disable persistent memory. No
legacy/IR fallback, model provider, host permissions, or dictionary rewrite is
inferred from tool input.

```javascript
const { shipmb, rewrite } = require("urbandictmcp");
async function main() {
  const response = await shipmb.run({
    source: "Let total be an integer with value 27. Show total.",
    backend: "compiler",
  });
  if (!response.ok) {
    console.error(response.result.diagnostics, response.result.clarifications);
    return;
  }
  console.log(response.result.runtime.stdout); // 27
  console.log(rewrite({
    text: response.result.runtime.stdout,
    direction: "to_slang",
    glossary: [{ slang: "twenty-seven", plain: "27" }],
  }).output);
}
main().catch(console.error);
```

Results contain `ok`, `backend`, `profile`, unchanged `source`, `exit_code`,
`stderr`, and the upstream `result`, including diagnostics, clarification,
bytecode, source revision, and runtime output when requested. Failed compilation
is an MCP `isError` result with structured diagnostics, not a runnable artifact.
Transport/installation failures throw in JavaScript and return MCP tool errors.
Compiler diagnostic spans retain code-point units; dictionary offsets remain
UTF-16. No span conversion is silently applied by the bridge.

Each call uses a temporary UTF-8 file, removed afterward, and a shell-free child
process with a 30-second timeout and 4 MiB output limit per stream. Source is
limited to 10,000 UTF-16 units. The JavaScript API accepts an optional second
argument `{ signal }` for AbortSignal cancellation. MCP request-cancellation
notifications are not currently wired to the bridge. The runtime is not a
security sandbox for untrusted Python installations; choose a trusted executable
and packages. The native offshoot retains its existing dictionary tool surface.

## Reverse integration

The upstream compiler's `UrbanDictionaryMCPClient` already connects to this
server over stdio. Its `shipmbc slang sync` command collects dictionary candidates
with an explicit trusted `--urban-mcp-server` path. Only explicit reviewed
`--map` entries activate compatibility thesaurus synonyms; the direct grammar
does not apply context-free thesaurus rewriting. No upstream code change is
needed for the new tools to coexist with that client. Language/compiler runtime
output can also be passed to this package's `interpret` or `rewrite` as a string
value, as shown above.

## Dictionary suggestions and compiler source

1. Keep the exact original source and its revision. Use `interpret` with
   caller-selected terms to display dictionary suggestions alongside that source.
2. Treat definitions as untrusted candidate meanings. Ranking, lookup success,
   and glossary matches do not establish intended meaning, supported grammar,
   authorization, or compiler confirmation.
3. Let the user resolve meaning through the compiler's clarification workflow.
   Do not silently replace source phrases, negation, names, quotations, or
   conditions with dictionary definitions. Ambiguous or unsupported compilation
   must not become a successful runnable artifact through a fallback rewrite.
4. `rewrite` is for prose string values and presentation. It is not a source
   transformation pass. If a user explicitly edits program source, compile that
   new revision and discard diagnostics/artifacts tied to the prior revision.
5. Shared ShipMB memory remains owned by the upstream compiler tooling. A lookup
   result must not be written as a confirmed interpretation automatically.
   Confirmation requires the upstream context/version checks; remembered ability
   does not grant current runtime authorization. Memory is not autonomous training.

## Terminal and editor contracts

The compiler's opt-in `--diagnostic-format json` supports structured invocation
errors and retains diagnostics under emit filters. Consumers must inspect process
status and structured diagnostics, not equate parseable JSON with success.

The language extension owns pipeline/profile selection, Problems diagnostics,
`.smb` syntax support, Unicode span conversion, cancellation, and process bounds.
For general compilation its configuration selects `direct` and `general`;
the language pipeline default remains `legacy`. Urbandictmcp's VS Code MCP setup
in [README.md](README.md#vs-code-setup) connects dictionary tools separately.

Offset contracts must not be mixed:

- Urbandictmcp `occurrences` and `replacements` use zero-based UTF-16 offsets,
  with exclusive ends, into the returned original `text` (JavaScript `slice`).
- Compiler source spans count Unicode code points. The upstream extension
  converts them to UTF-16 before using VS Code positions.
- Do not convert urbandictmcp offsets a second time. For `😀 fr`, the dictionary
  occurrence of `fr` starts at UTF-16 offset 3, while its code-point offset is 2.
- Neither original-source offset applies directly to rewritten output. Rewriting
  may change lengths; recompile/reinterpret the new text before highlighting it.

Any future host that invokes both services should pass argument arrays without a
shell, preserve UTF-8 process I/O, support cancellation and bounded output/time,
and reject results for stale source revisions. Those host responsibilities do
not require copying the language extension into this MCP server.

## Local verification

Run `npm test` from this repository. The existing tests cover silent API imports,
UTF-16 matching with non-BMP text, literal/non-cascading glossary replacements,
ambiguous reverse mappings, per-term lookup errors, and MCP behavior against a
local fake API. No public dictionary service or installed ShipMB package is
required. Run `npm run test:shipmb` (or `node scripts/test-shipmb-integration.js`)
with `SHIPMB_PYTHON` configured for real integration checks. It exercises both
backends through the JavaScript and MCP APIs, compile-only and run behavior,
sum-to-27 execution, unsupported-source rejection, literal Unicode/shell-like
text, cancellation, runtime-output glossary rewriting, and the actual Python
compiler MCP client calling this server in reverse. No network lookup is needed.

These tests passed on Python 3.14 using both source checkouts and freshly built,
installed packages from the pinned revisions, without PYTHONPATH for the latter.
The eight dependency-free unit tests and dictionary MCP smoke test also passed.
This repository does not rerun the upstream VS Code extension-host suite.

Broader language features and rollout gates remain upstream work. Updating this
context does not change pipeline defaults, remove Core, or publish a new package.
