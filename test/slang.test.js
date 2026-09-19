"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { rewrite } = require("..");
const { interpretText } = require("../slang");

const glossary = [
  { slang: "no cap", plain: "honestly" },
  { slang: "fr", plain: "for real" },
];

test("package import is silent and does not attach process listeners", () => {
  const result = spawnSync(process.execPath, ["-e", `
    const assert = require('node:assert/strict');
    const before = process.stdin.listenerCount('data');
    const errors = process.listenerCount('uncaughtException');
    const api = require('./');
    assert.equal(typeof api.lookup, 'function');
    assert.equal(typeof api.interpret, 'function');
    assert.equal(process.stdin.listenerCount('data'), before);
    assert.equal(process.listenerCount('uncaughtException'), errors);
  `], { cwd: require("node:path").join(__dirname, ".."), encoding: "utf8", timeout: 3000 });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "");
});

test("rewrite handles both directions and preserves unmatched text", () => {
  const result = rewrite({ text: "  NO CAP, fr! fresh caféfr fr_2 😀fr.", glossary });
  assert.equal(result.output, "  honestly, for real! fresh caféfr fr_2 😀for real.");
  for (const match of result.replacements) {
    assert.equal(result.text.slice(match.start, match.end), match.text);
  }
  assert.equal(rewrite({ text: "honestly, for real!", glossary, direction: "to_slang" }).output, "no cap, fr!");
});

test("longest phrase wins without cascading or expanding replacement metacharacters", () => {
  const result = rewrite({ text: "no cap cap a+b", glossary: [
    { slang: "cap", plain: "lie" }, { slang: "no cap", plain: "cap" },
    { slang: "a+b", plain: "$& $1" },
  ] });
  assert.equal(result.output, "cap lie $& $1");
  assert.equal(result.replacements.length, 3);
});

test("invalid input and ambiguous reverse mappings are rejected", () => {
  for (const args of [null, {}, { text: "x", glossary: [] },
    { text: "x".repeat(10001), glossary }, { text: "x", glossary, direction: "wrong" },
    { text: "x", glossary: [{ slang: "FR", plain: "yes" }, { slang: "fr", plain: "no" }] },
    { text: "x", direction: "to_slang", glossary: [{ slang: "a", plain: "same" }, { slang: "b", plain: "same" }] },
    { text: "x", glossary, extra: true },
  ]) assert.throws(() => rewrite(args), { code: -32602 });
});

test("interpret returns occurrences, missing entries, and partial errors without guessing", async () => {
  const calls = [];
  const result = await interpretText({ text: "😀 FR fr, no cap, oof", terms: ["fr", "FR", "no cap", "oof", "absent"] }, async (term, options) => {
    calls.push(term);
    assert.deepEqual(options, { limit: 3, sort_by: "top" });
    if (term === "oof") throw new Error("HTTP 503");
    return { definitions: term === "no cap" ? [] : [{ word: term, definition: "for real" }] };
  });
  assert.deepEqual(calls, ["FR", "no cap", "oof"]);
  assert.deepEqual(result.entries.map((entry) => entry.status), ["found", "not_found", "error", "not_in_text"]);
  assert.equal(result.entries[0].occurrences.length, 2);
  assert.equal(result.entries[0].occurrences[0].start, 3);
  assert.equal(result.has_errors, true);
});

test("interpret validates even when selected terms are absent", async () => {
  for (const args of [ { text: "hi", terms: [] }, { text: "hi", terms: ["fr"], limit: true },
    { text: "hi", terms: ["fr"], sort_by: "invalid" } ]) {
    await assert.rejects(interpretText(args, () => assert.fail("must not fetch")), { code: -32602 });
  }
});
