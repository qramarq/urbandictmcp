# ShipMB integration

Updated for the compiler 0.2.4 contract on 2026-09-23.

## Installation and ownership

Install the current ShipMBLang release into a Python 3.11+ environment and set
`SHIPMB_PYTHON` to that environment's Python executable. ShipMBLang bundles the
compiler internally; end users do not need the private compiler repository.
Start `node server.js` through your MCP host, with `SHIPMB_PYTHON` in its environment.

The default `language` backend invokes `python -m shipmblang`. Developers may
select `backend: "compiler"` with the private `shipmbcompiler` library installed.
That backend calls `compile_direct_program` and `run_artifact` through Python;
it does not require the removed installed `shipmbc` module or console command.
The five dictionary tools remain usable without Python.

## Tools and JavaScript API

`shipmb_compile` and `shipmb_run` accept `source` and an optional `backend`
(`language` by default, or `compiler`). Compilation also accepts `profile`
(`general` by default, or `roku`). Running is restricted to general computation.

```javascript
const { shipmb, rewrite } = require("urbandictmcp");
async function main() {
  const response = await shipmb.run({
    source: "Let total be an integer with value 27. Show total.",
  });
  if (!response.ok) {
    console.error(response.result.diagnostics, response.result.clarifications);
    return;
  }
  console.log(rewrite({
    text: response.result.runtime.stdout,
    direction: "to_slang",
    glossary: [{ slang: "twenty-seven", plain: "27" }],
  }).output);
}
main().catch(console.error);
```

Both backends explicitly select the direct pipeline and disable persistent
memory and model translation. Current upstream defaults are direct/general
and may automatically accept validated translations from a configured model;
the MCP bridge deliberately retains deterministic compilation. It does not
fall back to IR, legacy parsing, or dictionary rewriting on failure.

Results contain `ok`, `backend`, `profile`, unchanged `source`, `exit_code`,
`stderr`, and the upstream `result`. Diagnostics, clarification, source revision,
and bytecode are preserved; runtime output is included when requested.
Callers must check `ok`, not merely successful JSON parsing. Failed compilation
returns MCP `isError` with structured diagnostics. Transport/installation failures
throw in JavaScript and become MCP tool errors.

## Compiler to dictionary integration

`shipmbcompiler.urban_slang.UrbanDictionaryMCPClient` connects to the local
`server.js` over stdio with an explicit trusted path. The compiler development
checkout also supports this command (enter as one line):

```powershell
python shipmbc.py slang sync --terms "fire up" --map "fire up=open" --urban-mcp-server C:/path/to/urbandictmcp/server.js --out urban-slang.json
```

Only explicitly mapped candidates become active compatibility synonyms. Compile
with `--pipeline ir --thesaurus-path urban-slang.json` to consume them offline.
The default direct grammar does not apply context-free thesaurus rewriting.
Dictionary definitions are untrusted suggestions, not confirmed interpretations,
source transformations, runtime authorization, or shared-memory confirmations.
Use `interpret` and `rewrite` on prose values such as runtime output. If the user
edits source, compile the new revision and discard stale diagnostics/artifacts.

## Process and span contracts

Each invocation uses a temporary UTF-8 file and a shell-free subprocess, with a
30-second timeout, 4 MiB output limit per stream, and 10,000 UTF-16-unit source
limit. Temporary files are removed afterward. The JavaScript API supports an
optional second argument `{ signal }` for cancellation. MCP cancellation
notifications are not wired to this bridge. No host adapters are provided.

Compiler spans use Unicode code-point offsets. Dictionary occurrences and
replacements use UTF-16 offsets with exclusive ends. For `😀 fr`, `fr` starts
at UTF-16 offset 3 and code-point offset 2. Neither offset necessarily applies
to rewritten output. Preserve original source and revision when displaying spans.

## Verification

Run `npm test` for dependency-free unit tests and dictionary MCP smoke tests.
Run `npm run test:shipmb` with `SHIPMB_PYTHON` configured for both backends.
The latter covers default language selection, compile/run, sum-to-27 execution,
unsupported-source rejection with ambient model configuration, Unicode and
shell-like literals, cancellation, runtime-output rewriting, reverse Python MCP
calls, and MCP dispatch. It performs no public dictionary requests.

The current checks passed against the local compiler and language source
checkouts. A fresh wheel build was unavailable in the current Python environment
because setuptools is not installed; this is not a new installed-wheel or VS Code
extension-host verification. Older September 19 pinned builds predate the current
packaging and model-default contracts.
