"use strict";
// Requires current ShipMBLang in SHIPMB_PYTHON (or python).
// Set SHIPMB_TEST_COMPILER=1 to additionally test the private compiler package.
const assert = require("node:assert/strict");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const path = require("node:path");
const { shipmb, rewrite } = require("..");
const execute = promisify(execFile);
const backends = process.env.SHIPMB_TEST_COMPILER === "1" ? ["language", "compiler"] : ["language"];
const source = `Let measurements be the list of integers 3, 12, and 15.
Let total be a mutable integer with value 0.
For each measurement in measurements:
If measurement is greater than 10 then:
Set total to the sum of total and measurement.
End the condition.
End the loop.
Show total.`;

async function main() {
  // Ambient model configuration must not silently change the bridge contract.
  process.env.SHIPMB_MODEL_PROVIDER = "invalid-provider-for-regression-test";
  const defaultRun = await shipmb.run({ source: 'Show "default language backend".' });
  assert.equal(defaultRun.backend, "language");
  assert.equal(defaultRun.ok, true, JSON.stringify(defaultRun));
  assert.equal(defaultRun.result.runtime.stdout, "default language backend\n");
  for (const backend of backends) {
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

  // Public language client -> this MCP server, without network requests.
  // No network lookup: the reverse dictionary call uses an explicit glossary.
  const script = `import json, sys
from shipmblang.slang import MCPClientError, UrbanDictionaryMCPClient
with UrbanDictionaryMCPClient(sys.argv[1], node_command=sys.argv[2]) as client:
    names = {x['name'] for x in client.request('tools/list', {})['tools']}
    assert {'shipmb_compile', 'shipmb_run'} | {'urban_dictionary_' + op for op in ('define', 'random', 'defid', 'interpret', 'rewrite')} <= names
    glossary = [{'slang':'fr','plain':'for real'}]
    result = client.rewrite('😀 fr!', glossary)
    assert result['output'] == '😀 for real!'
    assert result['replacements'][0]['start'] == 3
    assert client.rewrite(result['output'], glossary, 'to_slang')['output'] == '😀 fr!'
    assert client.interpret('hello', ['fr'])['entries'][0]['status'] == 'not_in_text'
    try:
        client.rewrite('fr', glossary, 'invalid')
    except MCPClientError:
        pass
    else:
        raise AssertionError('Expected tool error propagation')
import subprocess, tempfile
from pathlib import Path
with tempfile.TemporaryDirectory() as directory:
    arguments = Path(directory) / 'arguments.json'
    arguments.write_text(json.dumps({'text':'fr', 'glossary':glossary}), encoding='utf-8')
    cli = subprocess.run([sys.executable, '-m', 'shipmblang', 'slang', 'rewrite',
        '--urban-mcp-server', sys.argv[1], '--node-command', sys.argv[2],
        '--arguments-file', str(arguments)], capture_output=True, text=True, timeout=20)
    assert cli.returncode == 0, cli.stderr
    assert json.loads(cli.stdout)['output'] == 'for real'
print('public language MCP client and slang CLI passed')
`;
  const reverse = await execute(process.env.SHIPMB_PYTHON || "python", ["-X", "utf8", "-c", script, path.resolve(__dirname, "..", "server.js"), process.execPath], { timeout: 30000 });
  assert.match(reverse.stdout, /passed/);

  // Test MCP dispatch end-to-end, including error status and structured content.
  const messages = [];
  let id = 0;
  for (const backend of backends) {
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
  console.log(`ShipMB integration passed (${backends.join(", ")}): compile/run, rejection, Unicode, cancellation, output glossary, public Python client, slang CLI, MCP dispatch.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
