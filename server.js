#!/usr/bin/env node
"use strict";

const API_BASE = (process.env.URBAN_DICTIONARY_API_BASE || "https://api.urbandictionary.com/v0").replace(/\/+$/, "");
const REQUEST_TIMEOUT_MS = parsePositiveInt(process.env.URBAN_DICTIONARY_TIMEOUT_MS, 10_000);
const MAX_LIMIT = 10;
const DEFAULT_PROTOCOL_VERSION = "2025-06-18";
const SERVER_INFO = {
  name: "urbandictionary-mcp",
  version: "0.2.0",
};

const TOOLS = [
  {
    name: "urban_dictionary_define",
    description:
      "Look up definitions for a term on Urban Dictionary. Results are crowdsourced and may contain explicit or offensive language.",
    inputSchema: {
      type: "object",
      properties: {
        term: {
          type: "string",
          description: "The word or phrase to define.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: MAX_LIMIT,
          default: 3,
          description: "Maximum number of definitions to return.",
        },
        sort_by: {
          type: "string",
          enum: ["top", "recent", "api"],
          default: "top",
          description: "Sort definitions by vote score, newest written date, or the API's original order.",
        },
      },
      required: ["term"],
      additionalProperties: false,
    },
  },
  {
    name: "urban_dictionary_random",
    description:
      "Fetch random Urban Dictionary definitions. Results are crowdsourced and may contain explicit or offensive language.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          minimum: 1,
          maximum: MAX_LIMIT,
          default: 3,
          description: "Maximum number of random definitions to return.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "urban_dictionary_defid",
    description:
      "Fetch an Urban Dictionary definition by definition ID. Results are crowdsourced and may contain explicit or offensive language.",
    inputSchema: {
      type: "object",
      properties: {
        defid: {
          type: "integer",
          minimum: 1,
          description: "Urban Dictionary definition ID.",
        },
      },
      required: ["defid"],
      additionalProperties: false,
    },
  },
];

const { slangTools, interpretText, rewriteText } = require("./slang");
TOOLS.push(...slangTools);

let inputBuffer = "";

if (require.main === module) {
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  inputBuffer += chunk;
  processInputBuffer();
});

process.stdin.on("end", () => {
  processInputBuffer(true);
});

process.stdin.on("error", (error) => {
  logError("stdin error", error);
});

process.on("uncaughtException", (error) => {
  logError("uncaught exception", error);
});

process.on("unhandledRejection", (error) => {
  logError("unhandled rejection", error);
});
}

function processInputBuffer(flush = false) {
  let newlineIndex;
  while ((newlineIndex = inputBuffer.indexOf("\n")) !== -1) {
    const rawLine = inputBuffer.slice(0, newlineIndex);
    inputBuffer = inputBuffer.slice(newlineIndex + 1);
    const line = rawLine.trim();
    if (line) {
      void handleRawMessage(line);
    }
  }

  if (flush && inputBuffer.trim()) {
    const line = inputBuffer.trim();
    inputBuffer = "";
    void handleRawMessage(line);
  }
}

async function handleRawMessage(line) {
  let message;
  try {
    message = JSON.parse(line);
  } catch (error) {
    sendError(null, -32700, "Parse error", String(error.message || error));
    return;
  }

  if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    sendError(message && message.id !== undefined ? message.id : null, -32600, "Invalid Request");
    return;
  }

  const hasId = Object.prototype.hasOwnProperty.call(message, "id");
  try {
    const result = await handleRequest(message.method, message.params || {});
    if (hasId) {
      sendMessage({ jsonrpc: "2.0", id: message.id, result });
    }
  } catch (error) {
    if (hasId) {
      sendError(message.id, error.code || -32603, error.message || "Internal error", error.data);
    } else {
      logError(`notification ${message.method} failed`, error);
    }
  }
}

async function handleRequest(method, params) {
  switch (method) {
    case "initialize":
      return {
        protocolVersion: typeof params.protocolVersion === "string" ? params.protocolVersion : DEFAULT_PROTOCOL_VERSION,
        capabilities: {
          tools: {
            listChanged: false,
          },
        },
        serverInfo: SERVER_INFO,
      };

    case "ping":
      return {};

    case "tools/list":
      return { tools: TOOLS };

    case "tools/call":
      return callTool(params);

    case "resources/list":
      return { resources: [] };

    case "prompts/list":
      return { prompts: [] };

    default:
      if (method.startsWith("notifications/")) {
        return {};
      }
      throw rpcError(-32601, `Method not found: ${method}`);
  }
}

async function callTool(params) {
  if (!params || typeof params.name !== "string") {
    throw rpcError(-32602, "tools/call requires a tool name");
  }

  const args = params.arguments && typeof params.arguments === "object" ? params.arguments : {};

  try {
    switch (params.name) {
      case "urban_dictionary_define":
        return await defineTerm(args);
      case "urban_dictionary_random":
        return await randomDefinitions(args);
      case "urban_dictionary_defid":
        return await definitionById(args);
      case "urban_dictionary_interpret":
        return jsonResult(await interpretText(args, lookup));
      case "urban_dictionary_rewrite":
        return jsonResult(rewriteText(args));
      default:
        throw rpcError(-32602, `Unknown tool: ${params.name}`);
    }
  } catch (error) {
    if (error.isRpcError) {
      throw error;
    }
    return toolError(error.message || "Urban Dictionary request failed");
  }
}

async function defineTerm(args) {
  const term = requireNonEmptyString(args.term, "term");
  const limit = normalizeLimit(args.limit, 3);
  const sortBy = normalizeSort(args.sort_by);
  const payload = await fetchUrbanJson("define", { term });
  const definitions = limitAndSortDefinitions(payload.list, limit, sortBy);

  return toolResult({
    title: `Urban Dictionary definitions for "${term}"`,
    definitions,
    emptyText: `No Urban Dictionary definitions found for "${term}".`,
    structuredContent: {
      query: term,
      result_type: payload.result_type || null,
      tags: Array.isArray(payload.tags) ? payload.tags : [],
      sounds: Array.isArray(payload.sounds) ? payload.sounds : [],
      definitions,
    },
  });
}

async function randomDefinitions(args) {
  const limit = normalizeLimit(args.limit, 3);
  const payload = await fetchUrbanJson("random");
  const definitions = normalizeDefinitions(payload.list).slice(0, limit);

  return toolResult({
    title: "Random Urban Dictionary definitions",
    definitions,
    emptyText: "Urban Dictionary did not return any random definitions.",
    structuredContent: {
      definitions,
    },
  });
}

async function definitionById(args) {
  const defid = requirePositiveInteger(args.defid, "defid");
  const payload = await fetchUrbanJson("define", { defid: String(defid) });
  const definitions = normalizeDefinitions(payload.list).slice(0, 1);

  return toolResult({
    title: `Urban Dictionary definition ${defid}`,
    definitions,
    emptyText: `No Urban Dictionary definition found for defid ${defid}.`,
    structuredContent: {
      defid,
      result_type: payload.result_type || null,
      definitions,
    },
  });
}

async function fetchUrbanJson(path, query = {}) {
  const url = new URL(`${API_BASE}/${path}`);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: "application/json",
        "user-agent": `urbandictmcp/${SERVER_INFO.version}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Urban Dictionary returned HTTP ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      const text = await response.text();
      throw new Error(`Urban Dictionary returned ${contentType || "non-JSON"} content: ${text.slice(0, 120)}`);
    }

    return await response.json();
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error(`Urban Dictionary request timed out after ${REQUEST_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function toolResult({ title, definitions, emptyText, structuredContent }) {
  const text = definitions.length ? `${title}\n\n${definitions.map(formatDefinition).join("\n\n")}` : emptyText;
  return {
    content: [{ type: "text", text }],
    structuredContent,
  };
}

function toolError(message) {
  return {
    isError: true,
    content: [{ type: "text", text: message }],
  };
}

function limitAndSortDefinitions(rawDefinitions, limit, sortBy) {
  const definitions = normalizeDefinitions(rawDefinitions);
  if (sortBy === "top") {
    definitions.sort((a, b) => b.score - a.score || b.thumbs_up - a.thumbs_up || a.rank - b.rank);
  } else if (sortBy === "recent") {
    definitions.sort((a, b) => dateValue(b.written_on) - dateValue(a.written_on) || a.rank - b.rank);
  }
  return definitions.slice(0, limit);
}

function normalizeDefinitions(rawDefinitions) {
  if (!Array.isArray(rawDefinitions)) {
    return [];
  }

  return rawDefinitions.filter((item) => item && typeof item === "object").map((item, index) => {
    const thumbsUp = toInteger(item.thumbs_up);
    const thumbsDown = toInteger(item.thumbs_down);
    return {
      rank: index + 1,
      defid: toInteger(item.defid),
      word: cleanText(item.word),
      definition: cleanUrbanText(item.definition),
      example: cleanUrbanText(item.example),
      author: cleanText(item.author),
      permalink: cleanText(item.permalink),
      thumbs_up: thumbsUp,
      thumbs_down: thumbsDown,
      score: thumbsUp - thumbsDown,
      written_on: cleanText(item.written_on),
    };
  });
}

function formatDefinition(definition, index) {
  const voteText = `+${definition.thumbs_up} / -${definition.thumbs_down}`;
  const dateText = definition.written_on ? `, ${definition.written_on}` : "";
  const authorText = definition.author ? ` by ${definition.author}` : "";
  const lines = [
    `${index + 1}. ${definition.word || "(untitled)"} (${voteText}${authorText}${dateText})`,
    definition.definition || "(No definition text returned.)",
  ];

  if (definition.example) {
    lines.push(`Example: ${definition.example}`);
  }

  if (definition.permalink) {
    lines.push(`Link: ${definition.permalink}`);
  }

  if (definition.defid) {
    lines.push(`Definition ID: ${definition.defid}`);
  }

  return lines.join("\n");
}

function cleanUrbanText(value) {
  return cleanText(value).replace(/\[([^\]]+)]/g, "$1");
}

function cleanText(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

function normalizeLimit(value, defaultValue) {
  if (value === undefined || value === null) {
    return defaultValue;
  }
  const parsed = requirePositiveInteger(value, "limit");
  if (parsed > MAX_LIMIT) {
    throw rpcError(-32602, `limit must be between 1 and ${MAX_LIMIT}`);
  }
  return parsed;
}

function normalizeSort(value) {
  if (value === undefined || value === null) {
    return "top";
  }
  if (!["top", "recent", "api"].includes(value)) {
    throw rpcError(-32602, "sort_by must be one of: top, recent, api");
  }
  return value;
}

function requireNonEmptyString(value, name) {
  if (typeof value !== "string" || !value.trim()) {
    throw rpcError(-32602, `${name} must be a non-empty string`);
  }
  return value.trim();
}

function requirePositiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw rpcError(-32602, `${name} must be a positive integer`);
  }
  return parsed;
}

function parsePositiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function toInteger(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

function dateValue(value) {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function sendMessage(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function sendError(id, code, message, data) {
  const error = { code, message };
  if (data !== undefined) {
    error.data = data;
  }
  sendMessage({ jsonrpc: "2.0", id, error });
}

function rpcError(code, message, data) {
  const error = new Error(message);
  error.code = code;
  error.data = data;
  error.isRpcError = true;
  return error;
}

function logError(label, error) {
  const detail = error && error.stack ? error.stack : String(error);
  process.stderr.write(`[${SERVER_INFO.name}] ${label}: ${detail}\n`);
}

function jsonResult(structuredContent) {
  return { content: [{ type: "text", text: JSON.stringify(structuredContent) }], structuredContent };
}

async function lookup(term, options = {}) {
  return (await defineTerm({ ...options, term })).structuredContent;
}

module.exports = {
  lookup,
  interpret: (args) => interpretText(args, lookup),
  rewrite: rewriteText,
};
