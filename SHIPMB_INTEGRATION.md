# ShipMB integration

Updated for the compiler 0.2.4 contract on 2026-09-23.

## Installation and ownership

Install a current ShipMBLang build into a Python 3.11+ environment and set
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

## ShipMBLang to dictionary integration

The public `shipmblang.slang.UrbanDictionaryMCPClient` connects to an explicitly
trusted local `server.js` over stdio. Install a ShipMBLang build containing this
public module and the `slang` command; older builds may not include them.

```python
from shipmblang.slang import UrbanDictionaryMCPClient

with UrbanDictionaryMCPClient(r"C:\path\to\urbandictmcp\server.js") as client:
    result = client.rewrite("😀 fr!", [{"slang": "fr", "plain": "for real"}])
    print(result["output"])  # 😀 for real!
    print(result["replacements"][0]["start"])  # 3, original-text UTF-16
    print(client.interpret("hello", ["fr"]))  # not_in_text; no lookup
```

`call_dictionary` provides structured access to `define`, `random`, `defid`,
`interpret`, and `rewrite`. Definition lookups require network access; rewriting
with an explicit glossary is offline. Inspect interpretation entry statuses and
`has_errors` for partial failures. Tool errors raise `MCPClientError`.

For the CLI, save tool arguments as UTF-8 JSON in `arguments.json`:

```json
{"text":"fr","glossary":[{"slang":"fr","plain":"for real"}]}
```

```powershell
python -m shipmblang slang rewrite --urban-mcp-server C:/path/to/urbandictmcp/server.js --arguments-file arguments.json
python -m shipmblang slang sync --terms yeet --map yeet=execute --urban-mcp-server C:/path/to/urbandictmcp/server.js --out reviewed-slang.json
python -m shipmblang compile --pipeline ir --thesaurus-path reviewed-slang.json --file program.smb --memory off
```

Only explicit reviewed mappings activate compatibility synonyms. Review the
output before use. `--thesaurus-path` is supported only by the IR pipeline;
direct compilation rejects it. Definitions remain untrusted suggestions, never
compiler instructions, authorization, or confirmed memory. Rewrite prose values,
not executable source. Compile explicitly edited source as a new revision and
discard stale diagnostics/artifacts.

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
Run `npm run test:shipmb` with `SHIPMB_PYTHON` pointing to an environment with
current ShipMBLang. No separate compiler package is required. Set
`SHIPMB_TEST_COMPILER=1` to additionally test the private compiler backend.
For a source checkout, set `PYTHONPATH` to the directory containing the
`shipmblang` package; the bridge runs Python from a temporary working directory.

The integration check covers default language selection, compile/run,
sum-to-27 execution, rejection with ambient model configuration, Unicode and
shell-like literals, cancellation, output rewriting, the public Python client,
original UTF-16 offsets, absent-term interpretation, tool errors, the slang CLI,
and MCP dispatch. It performs no public dictionary requests.

Current validation targets the local ShipMBLang source, including its bundled
compiler. Historical September 19 private-client, wheel-installation, and editor
checks do not establish current release or VS Code extension-host behavior.

Verified for this update: eight JavaScript unit tests, the MCP smoke test,
the integration script with language alone and with both backends, and the
ShipMBLang suite against this server (73 passed, 1 skipped, 13 subtests passed).
The private backend used the current local compiler source checkout. The local
npm launcher was broken, so its exact Node test commands were invoked directly.
