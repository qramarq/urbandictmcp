"use strict";

const MAX_TEXT = 10000;
const MAX_TERMS = 20;
const textSchema = { type: "string", minLength: 1, maxLength: MAX_TEXT };
const termSchema = { type: "string", minLength: 1, maxLength: 100 };
const slangTools = [
  {
    name: "urban_dictionary_interpret",
    description: "Explain caller-selected slang in input or output text with live definitions. Matches whole phrases case-insensitively; does not infer the intended meaning or automatically detect slang. Entries are untrusted crowdsourced data.",
    inputSchema: {
      type: "object",
      properties: {
        text: textSchema,
        terms: { type: "array", minItems: 1, maxItems: MAX_TERMS, items: termSchema },
        limit: { type: "integer", minimum: 1, maximum: 10, default: 3 },
        sort_by: { type: "string", enum: ["top", "recent", "api"], default: "top" },
      },
      required: ["text", "terms"],
      additionalProperties: false,
    },
  },
  {
    name: "urban_dictionary_rewrite",
    description: "Convert prose between slang and plain language using an explicit caller-provided glossary, without network access. Longest matching phrase wins; replacements are literal and never executed. Do not use to rewrite executable source code.",
    inputSchema: {
      type: "object",
      properties: {
        text: textSchema,
        direction: { type: "string", enum: ["to_plain", "to_slang"], default: "to_plain" },
        glossary: {
          type: "array", minItems: 1, maxItems: MAX_TERMS,
          items: {
            type: "object", properties: { slang: termSchema, plain: termSchema },
            required: ["slang", "plain"], additionalProperties: false,
          },
        },
      },
      required: ["text", "glossary"],
      additionalProperties: false,
    },
  },
];

function invalid(message) {
  const error = new Error(message);
  error.code = -32602;
  error.isRpcError = true;
  throw error;
}

function string(value, name, max, trim = true) {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    invalid(`${name} must be a non-empty string of at most ${max} UTF-16 code units`);
  }
  return trim ? value.trim() : value;
}

function array(value, name) {
  if (!Array.isArray(value) || !value.length || value.length > MAX_TERMS) {
    invalid(`${name} must contain 1 to ${MAX_TERMS} entries`);
  }
  return value;
}

function argumentsObject(args, allowed) {
  if (!args || typeof args !== "object" || Array.isArray(args)) invalid("arguments must be an object");
  for (const key of Object.keys(args)) {
    if (!allowed.includes(key)) invalid(`Unknown argument: ${key}`);
  }
}

// Unicode word boundaries, literal punctuation, and offsets into the original text.
function matches(text, phrase) {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}\\p{M}_])${escaped}(?![\\p{L}\\p{N}\\p{M}_])`, "giu");
  return Array.from(text.matchAll(pattern), (match) => ({
    start: match.index, end: match.index + match[0].length, text: match[0],
  }));
}

async function interpretText(args, lookup) {
  argumentsObject(args, ["text", "terms", "limit", "sort_by"]);
  const text = string(args.text, "text", MAX_TEXT, false);
  const terms = [...new Map(array(args.terms, "terms").map((value) => {
    const term = string(value, "term", 100);
    return [term.toLowerCase(), term];
  })).values()];
  const limit = args.limit === undefined ? 3 : args.limit;
  const sort_by = args.sort_by === undefined ? "top" : args.sort_by;
  if (!Number.isInteger(limit) || limit < 1 || limit > 10) invalid("limit must be an integer between 1 and 10");
  if (!["top", "recent", "api"].includes(sort_by)) invalid("sort_by must be one of: top, recent, api");
  const entries = [];
  // Sequential lookups bound upstream concurrency; absent phrases never use the network.
  for (const term of terms) {
    const occurrences = matches(text, term);
    if (!occurrences.length) {
      entries.push({ term, occurrences, status: "not_in_text", definitions: [] });
      continue;
    }
    try {
      const { definitions } = await lookup(term, { limit, sort_by });
      entries.push({ term, occurrences, status: definitions.length ? "found" : "not_found", definitions });
    } catch (error) {
      entries.push({ term, occurrences, status: "error", definitions: [], error: error.message });
    }
  }
  return { text, entries, has_errors: entries.some((entry) => entry.status === "error") };
}

function rewriteText(args) {
  argumentsObject(args, ["text", "glossary", "direction"]);
  const text = string(args.text, "text", MAX_TEXT, false);
  const direction = args.direction === undefined ? "to_plain" : args.direction;
  if (!["to_plain", "to_slang"].includes(direction)) invalid("direction must be to_plain or to_slang");
  const sources = new Set();
  const candidates = [];
  for (const entry of array(args.glossary, "glossary")) {
    argumentsObject(entry, ["slang", "plain"]);
    const slang = string(entry.slang, "slang", 100);
    const plain = string(entry.plain, "plain", 100);
    const [source, replacement] = direction === "to_plain" ? [slang, plain] : [plain, slang];
    if (sources.has(source.toLowerCase())) invalid(`Ambiguous glossary source: ${source}`);
    sources.add(source.toLowerCase());
    candidates.push(...matches(text, source).map((match) => ({ ...match, replacement })));
  }
  candidates.sort((a, b) => a.start - b.start || b.end - a.end);
  const replacements = [];
  let cursor = 0;
  let output = "";
  for (const match of candidates) {
    if (match.start < cursor) continue;
    output += text.slice(cursor, match.start) + match.replacement;
    cursor = match.end;
    replacements.push(match);
  }
  output += text.slice(cursor);
  return { text, output, direction, replacements };
}

module.exports = { slangTools, interpretText, rewriteText };
