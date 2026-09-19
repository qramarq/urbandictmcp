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

Urbandictmcp remains an optional dictionary and prose-glossary service. Its five
MCP tools and JavaScript API neither compile nor execute ShipMB programs. No
compiler dependency, editor extension, shared-memory database, or automatic
source-normalization hook is installed by this repository.

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
required. These checks validate the dictionary boundary, not end-to-end ShipMB
compilation or VS Code execution.

Broader language features and rollout gates remain upstream work. Updating this
context does not change pipeline defaults, remove Core, or publish a new package.
