"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const { spawn } = require("node:child_process");
const path = require("node:path");

const fixtures = {
  "/v0/define?term=hello": {
    result_type: "exact",
    tags: ["greeting"],
    sounds: [],
    list: [
      {
        defid: 101,
        word: "hello",
        definition: "A [greeting] used to begin a conversation.",
        example: "[Hello], world.",
        author: "tester",
        permalink: "https://www.urbandictionary.com/define.php?term=hello",
        thumbs_up: 50,
        thumbs_down: 5,
        written_on: "2026-01-02T00:00:00.000Z",
      },
    ],
  },
  "/v0/define?defid=101": {
    result_type: "exact",
    list: [
      {
        defid: 101,
        word: "hello",
        definition: "A greeting used to begin a conversation.",
        example: "Hello, world.",
        author: "tester",
        permalink: "https://www.urbandictionary.com/define.php?term=hello",
        thumbs_up: 50,
        thumbs_down: 5,
        written_on: "2026-01-02T00:00:00.000Z",
      },
    ],
  },
  "/v0/random": {
    list: [
      {
        defid: 202,
        word: "random phrase",
        definition: "A fixture definition.",
        example: "This is a random phrase.",
        author: "tester",
        permalink: "https://www.urbandictionary.com/random.php",
        thumbs_up: 7,
        thumbs_down: 1,
        written_on: "2026-01-03T00:00:00.000Z",
      },
    ],
  },
};

async function main() {
  const api = await startFixtureServer();
  const child = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      URBAN_DICTIONARY_API_BASE: `http://127.0.0.1:${api.port}/v0`,
    },
  });

  const client = createJsonRpcClient(child);

  try {
    const init = await client.request("initialize", {
      protocolVersion: "2025-06-18",
      clientInfo: { name: "smoke-test", version: "0.0.0" },
      capabilities: {},
    });
    assert.equal(init.serverInfo.name, "urbandictionary-mcp");

    const tools = await client.request("tools/list", {});
    assert.deepEqual(
      tools.tools.map((tool) => tool.name),
      ["urban_dictionary_define", "urban_dictionary_random", "urban_dictionary_defid"],
    );

    const lookup = await client.request("tools/call", {
      name: "urban_dictionary_define",
      arguments: { term: "hello", limit: 1 },
    });
    assert.match(lookup.content[0].text, /Urban Dictionary definitions for "hello"/);
    assert.equal(lookup.structuredContent.definitions[0].definition, "A greeting used to begin a conversation.");

    const byId = await client.request("tools/call", {
      name: "urban_dictionary_defid",
      arguments: { defid: 101 },
    });
    assert.equal(byId.structuredContent.definitions[0].defid, 101);

    const random = await client.request("tools/call", {
      name: "urban_dictionary_random",
      arguments: { limit: 1 },
    });
    assert.equal(random.structuredContent.definitions[0].word, "random phrase");

    console.log("smoke test passed");
  } finally {
    child.kill();
    await api.close();
  }
}

function startFixtureServer() {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    const fixture = fixtures[`${url.pathname}${url.search}`];
    if (!fixture) {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "not found" }));
      return;
    }

    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(fixture));
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        port: address.port,
        close: () =>
          new Promise((closeResolve, closeReject) => {
            server.close((error) => (error ? closeReject(error) : closeResolve()));
          }),
      });
    });
  });
}

function createJsonRpcClient(child) {
  let nextId = 1;
  let buffer = "";
  const pending = new Map();

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    let newlineIndex;
    while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (!line) {
        continue;
      }

      const message = JSON.parse(line);
      const deferred = pending.get(message.id);
      if (!deferred) {
        continue;
      }
      pending.delete(message.id);

      if (message.error) {
        deferred.reject(new Error(message.error.message));
      } else {
        deferred.resolve(message.result);
      }
    }
  });

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));

  return {
    request(method, params) {
      const id = nextId++;
      const message = { jsonrpc: "2.0", id, method, params };
      child.stdin.write(`${JSON.stringify(message)}\n`);
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`Timed out waiting for ${method}`));
        }, 5_000);

        pending.set(id, {
          resolve(result) {
            clearTimeout(timeout);
            resolve(result);
          },
          reject(error) {
            clearTimeout(timeout);
            reject(error);
          },
        });
      });
    },
  };
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
