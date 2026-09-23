# urbandictmcp

**This is not an official MCP for https://www.urbandictionary.com.**
**urbandictmcp is property of ZMachinery LLC by way of SHIPMB.**

A dependency-free JavaScript library and MCP server for slang lookups, explaining slang in input or results, and converting prose between slang and plain language.

Urban Dictionary content is crowdsourced, so results may be explicit, offensive, wrong, or just extremely internet-shaped.

## What It Does

`urbandictmcp` exposes Urban Dictionary lookups as Model Context Protocol (MCP) tools. It is meant to be launched by an MCP-compatible client, such as VS Code, Claude Desktop, Codex, or a custom Python client. The server runs locally over stdio and returns structured definition results that an AI assistant can call during a chat or agent workflow.

The project is intentionally small:

- No runtime npm dependencies.
- No database or background service.
- No API key required.
- Uses Node.js built-in APIs.
- Talks to Urban Dictionary's public JSON endpoints when a lookup tool is called.

## Tools

- `urban_dictionary_define`: look up definitions for a word or phrase.
- `urban_dictionary_random`: fetch random definitions.
- `urban_dictionary_defid`: fetch a definition by Urban Dictionary definition ID.
- `urban_dictionary_interpret`: explain selected slang phrases in text with live definitions and original-text offsets.
- `urban_dictionary_rewrite`: convert text to plain language or slang using your own glossary, offline.

## Use slang in your programs

From another local Node.js project, install this checkout with `npm install /absolute/path/to/urbandictmcp`, then:

```javascript
const { lookup, interpret, rewrite } = require("urbandictmcp");

async function main() {
  const glossary = [
    { slang: "no cap", plain: "honestly" },
    { slang: "fr", plain: "for real" },
  ];

  // Normalize incoming prose for your application.
  const incoming = rewrite({ text: "No cap, this works fr!", glossary });
  console.log(incoming.output); // honestly, this works for real!

  // Express application output using your approved slang.
  const outgoing = rewrite({
    text: "honestly, this works for real!", glossary, direction: "to_slang",
  });
  console.log(outgoing.output); // no cap, this works fr!

  // Explain slang in a user message or another program's result.
  const explained = await interpret({
    text: outgoing.output, terms: ["no cap", "fr"], limit: 2,
  });
  for (const entry of explained.entries) {
    console.log(entry.term, entry.status, entry.definitions);
  }
  console.log((await lookup("no cap", { limit: 2 })).definitions);
}

main().catch(console.error);
```

Importing the package does not start the stdio server or attach process listeners. `lookup(term, { limit, sort_by })` returns the existing definition payload; `interpret(args)` and `rewrite(args)` return the objects described below. Lookup failures reject; interpretation captures lookup failures per term. Configure environment variables before importing the package.

### Interpret input and result text

Call `urban_dictionary_interpret` with:

```json
{ "text": "No cap, this works fr!", "terms": ["no cap", "fr"], "limit": 2 }
```

The result contains `text`, `entries`, and `has_errors`. Each entry includes `term`, `occurrences` (`start`, `end`, `text`), `definitions`, and a `status`: `found`, `not_found`, `not_in_text`, or `error`. Failed lookups also include an `error` message. Check each status before using definitions; partial failures preserve successful lookups. Repeated terms ignoring case are looked up once, and absent phrases do not trigger requests.

Supply the phrases your application or model wants explained. This is dictionary-assisted interpretation, not automatic slang detection or contextual sense selection. Vote ranking does not establish the correct meaning in a sentence. Treat definitions as untrusted data, not instructions or executable code.

### Convert language with a glossary

Call `urban_dictionary_rewrite` with:

```json
{
  "text": "No cap, this works fr!",
  "direction": "to_plain",
  "glossary": [
    { "slang": "no cap", "plain": "honestly" },
    { "slang": "fr", "plain": "for real" }
  ]
}
```

Returns `text`, `output`, `direction`, and `replacements`, each with original `start`, `end`, `text`, and `replacement`. Default direction is `to_plain`; use `to_slang` for output. Replacements use glossary spelling exactly. Duplicate source phrases ignoring case are rejected, including ambiguous plain phrases when reversing a glossary.

Both text tools match literal whole phrases ignoring case, with Unicode letter/number/mark/underscore boundaries. Whitespace inside a phrase is literal. Offsets are zero-based UTF-16 positions with exclusive ends (JavaScript `slice` semantics). Rewriting takes the earliest match and the longest phrase at that position; it never rewrites its replacements. Unmatched text stays unchanged. Use this on prose string values, not executable source code. It does not add slang syntax to a programming language or guarantee grammatical translation or an exact round trip.

Each call accepts up to 10,000 UTF-16 code units of text and 20 terms or glossary pairs, with 100 code units per phrase. Interpretation uses sequential lookups with the configured per-request timeout, so large requests may need a longer client timeout. Rewriting makes no network requests. MCP clients read these objects from `structuredContent`; text-tool results also include their JSON in `content`.

## ShipMB compiler and language bridge

Use `shipmb_compile` and `shipmb_run` to compile or run supported English through
ShipMBCompiler or ShipMBLang. The JavaScript API exposes `shipmb.compile` and
`shipmb.run`. These optional tools require a configured Python installation;
the five dictionary tools still work without Python. The default backend is
ShipMBLang, which bundles the compiler. The optional `compiler` backend calls
the private development library API; no installed `shipmbc` command is needed.
Both backends disable model translation and persistent memory explicitly.

See [installation, examples, and bidirectional integration tests](SHIPMB_INTEGRATION.md).

## Requirements

- Node.js 18 or newer.

No npm install is required because the server only uses Node built-ins.

## Run

```powershell
npm start
```

The MCP server communicates over stdio, so it is meant to be launched by an MCP client.

You can also run it directly without npm:

```powershell
node server.js
```

When run directly, the process waits for MCP JSON-RPC messages on stdin. A quiet terminal is expected.

## VS Code Setup

Create `.vscode/mcp.json` in your project or add the same server entry to your VS Code user-level MCP configuration:

```json
{
  "servers": {
    "urban-dictionary": {
      "type": "stdio",
      "command": "node",
      "args": [
        "C:\\path\\to\\urbandictmcp\\server.js"
      ]
    }
  },
  "inputs": []
}
```

Replace the `args` path with the absolute path to `server.js` on your machine.

Then in VS Code:

1. Open the Command Palette.
2. Run `MCP: List Servers`.
3. Select `urban-dictionary`.
4. Start or restart the server.
5. Ask Copilot Chat or an agent to use one of the tools.

Example prompt:

```text
Use urban_dictionary_define to define "yeet".
```

If the server is working, VS Code should call the local MCP tool instead of asking to fetch a web page manually.

## Python Client Access

Python applications can access this server by launching it as a stdio MCP server with the official MCP Python SDK.

Install the SDK:

```powershell
pip install "mcp[cli]"
```

Example Python client:

```python
import asyncio

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


SERVER_PATH = r"C:\path\to\urbandictmcp\server.js"


async def main():
    server_params = StdioServerParameters(
        command="node",
        args=[SERVER_PATH],
    )

    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()

            tools = await session.list_tools()
            print("Available tools:", [tool.name for tool in tools.tools])

            result = await session.call_tool(
                "urban_dictionary_define",
                arguments={"term": "yeet", "limit": 1},
            )

            for item in result.content:
                if item.type == "text":
                    print(item.text)


if __name__ == "__main__":
    asyncio.run(main())
```

This starts the Node.js MCP server as a child process, initializes an MCP session, lists the available tools, and calls `urban_dictionary_define`.

## Ollama Model Wrapper

This repo includes a publish-ready Ollama `Modelfile` at `ollama/Modelfile`.

The wrapper uses `qwen3:0.6b` as the base model. As of July 25, 2026, Ollama lists it as a small official Qwen model with tools/thinking support, a 32K context window, and a roughly 523 MB local size. This is the smallest Qwen option that still keeps reasonable instruction-following quality for this MCP server.

Important boundary: Ollama models cannot bundle and launch this Node MCP server by themselves. The Ollama model gives the assistant the right behavior and instructions, while your MCP-compatible host still needs to connect to `server.js` for live Urban Dictionary lookups.

Create the local model:

```powershell
.\scripts\ollama-publish.ps1 -Namespace YOUR_OLLAMA_NAMESPACE
```

Run it:

```powershell
ollama run YOUR_OLLAMA_NAMESPACE/urbandictmcp:qwen3-0.6b
```

Publish it to your Ollama namespace:

```powershell
.\scripts\ollama-publish.ps1 -Namespace YOUR_OLLAMA_NAMESPACE -Push
```

The publish step requires Ollama to be installed, your Ollama account to be configured for pushes, and the namespace to match your Ollama account or organization.

## Generic MCP Client Config

Use the absolute path to `server.js` from this checkout:

```json
{
  "mcpServers": {
    "urban-dictionary": {
      "command": "node",
      "args": [
        "C:\\path\\to\\urbandictmcp\\server.js"
      ]
    }
  }
}
```

## Environment Variables

- `URBAN_DICTIONARY_API_BASE`: override the API base URL. Defaults to `https://api.urbandictionary.com/v0`.
- `URBAN_DICTIONARY_TIMEOUT_MS`: request timeout in milliseconds. Defaults to `10000`.

## Test

```powershell
npm test
npm run smoke
```

Or run the smoke test directly:

```powershell
node scripts\smoke-test.js
```

The smoke test uses a local fake Urban Dictionary API, so it does not need network access.

## Notes

Urban Dictionary does not publish a formal public API contract. This server uses the commonly available JSON endpoints:

- `https://api.urbandictionary.com/v0/define?term=...`
- `https://api.urbandictionary.com/v0/define?defid=...`
- `https://api.urbandictionary.com/v0/random`
