urbandictmcp

A dependency-free MCP server that lets an MCP client look up Urban Dictionary definitions.

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
        "C:\\Users\\admin\\Documents\\urbandictmcp\\server.js"
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


SERVER_PATH = r"C:\Users\admin\Documents\urbandictmcp\server.js"


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

## Generic MCP Client Config

Use the absolute path to `server.js` from this checkout:

```json
{
  "mcpServers": {
    "urban-dictionary": {
      "command": "node",
      "args": [
        "C:\\Users\\admin\\Documents\\urbandictmcp\\server.js"
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
