"use strict";
// Requires installed ShipMB packages in SHIPMB_PYTHON (or python).
const assert = require("node:assert/strict");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const path = require("node:path");
const { shipmb, rewrite } = require("..");
const execute = promisify(execFile);
const source = `Let measurements be the list of integers 3, 12, and 15.
Let total be a mutable integer with value 0.
For each measurement in measurements:
If measurement is greater than 10 then:
Set total to the sum of total and measurement.
End the condition.
End the loop.
Show total.`;

async function main() {
  for (const backend of ["compiler", "language"]) {
    const compiled = await shipmb.compile({ source, backend });
    assert.equal(compiled.ok, true, JSON.stringify(compiled));
    assert.equal(compiled.result.runtime, undefined);
    assert.equal(compiled.result.memory.enabled, false);
    const run = await shipmb.run({ source, backend });
    assert.equal(run.ok, true, JSON.stringify(run));
    assert.equal(run.result.runtime.stdout, "27\n");
    const invalid = await shipmb.run({ source: "Teleport the moon into a teacup.", backend });
    assert.equal(invalid.ok, false);
    assert.equal(invalid.result.target_code, null);
    assert.ok(!invalid.result.runtime);
    const unicode = 'Show "😀 café & $(echo never)".';
    const literal = await shipmb.run({ source: unicode, backend });
    assert.equal(literal.ok, true, JSON.stringify(literal));
    assert.equal(literal.source, unicode);
    assert.equal(literal.result.runtime.stdout, "😀 café & $(echo never)\n");
    // Runtime output is a string value: glossary presentation is safe here.
    assert.equal(rewrite({ text: run.result.runtime.stdout, glossary: [{ slang: "twenty-seven", plain: "27" }], direction: "to_slang" }).output, "twenty-seven\n");
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(shipmb.compile({ source, backend }, { signal: controller.signal }), /ShipMB process failed/);
  }

  // Real Python compiler client -> this MCP server -> dictionary API and both backends.
  // No network lookup: the reverse dictionary call uses an explicit glossary.
  const script = `import json, sys
from shipmbcompiler.urban_slang import UrbanDictionaryMCPClient
with UrbanDictionaryMCPClient(sys.argv[1], node_command=sys.argv[2]) as client:
    names = {x['name'] for x in client.request('tools/list', {})['tools']}
    assert {'shipmb_compile', 'shipmb_run', 'urban_dictionary_rewrite'} <= names
    result = client.request('tools/call', {'name':'urban_dictionary_rewrite', 'arguments':{'text':'no cap', 'glossary':[{'slang':'no cap','plain':'honestly'}]}})
    assert result['structuredContent']['output'] == 'honestly'
print('reverse compiler MCP client passed')
`;
  const reverse = await execute(process.env.SHIPMB_PYTHON || "python", ["-X", "utf8", "-c", script, path.resolve(__dirname, "..", "server.js"), process.execPath], { timeout: 30000 });
  assert.match(reverse.stdout, /passed/);

  // Test MCP dispatch end-to-end, including error status and structured content.
  const messages = [];
  let id = 0;
  for (const backend of ["compiler", "language"]) {
    for (const name of ["shipmb_compile", "shipmb_run"]) {
      messages.push({ jsonrpc: "2.0", id: ++id, method: "tools/call", params: { name, arguments: { source, backend } } });
    }
    messages.push({ jsonrpc: "2.0", id: ++id, method: "tools/call", params: { name: "shipmb_run", arguments: { source: "Teleport the moon.", backend } } });
  }
  const result = await new Promise((resolve, reject) => {
    const child = execFile(process.execPath, [path.resolve(__dirname, "..", "server.js")], { timeout: 30000, maxBuffer: 4 * 1024 * 1024 }, (error, stdout) => error ? reject(error) : resolve(stdout));
    child.stdin.end(messages.map(x => JSON.stringify(x)).join("\n") + "\n");
  });
  const replies = result.trim().split("\n").map(JSON.parse);
  assert.equal(replies.length, messages.length);
  for (const message of messages) {
    const reply = replies.find(x => x.id === message.id);
    const invalid = message.params.arguments.source.startsWith("Teleport");
    assert.equal(reply.result.isError, invalid);
    assert.equal(reply.result.structuredContent.ok, !invalid);
    if (!invalid && message.params.name === "shipmb_run") assert.equal(reply.result.structuredContent.result.runtime.stdout, "27\n");
  }
  console.log("ShipMB integration passed: both backends, compile/run, rejection, Unicode, cancellation, output glossary, reverse Python client, MCP dispatch.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
