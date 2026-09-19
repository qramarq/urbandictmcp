"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { shipmb } = require("..");

test("ShipMB rejects invalid arguments before starting Python", async () => {
  for (const args of [null, [], {}, { source: " " }, { source: "x".repeat(10001) },
    { source: "Show 1.", backend: "shell" }, { source: "Show 1.", profile: "legacy" },
    { source: "Show 1.", command: "anything" }, { source: "Show 1.", backend: null }]) {
    await assert.rejects(shipmb.compile(args), { code: -32602 });
  }
  await assert.rejects(shipmb.run({ source: "Show 1.", profile: "roku" }), { code: -32602 });
});

test("ShipMB reports a missing configured executable", async () => {
  const previous = process.env.SHIPMB_PYTHON;
  process.env.SHIPMB_PYTHON = require("node:path").join(__dirname, "nonexistent-python");
  try { await assert.rejects(shipmb.compile({ source: "Show 1." }), /Set SHIPMB_PYTHON/); }
  finally {
    if (previous === undefined) delete process.env.SHIPMB_PYTHON;
    else process.env.SHIPMB_PYTHON = previous;
  }
});
