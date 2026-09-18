window.__ModuleLoader__.load({
  id: 'dsh-answer-highlight',
  factory: (require) => {
    'use strict'
    var module = { exports: {} }
    var exports = module.exports

var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client.js
var client_exports = {};
__export(client_exports, {
  apply: () => apply,
  assistantRows: () => assistantRows,
  currentSessionId: () => currentSessionId,
  inject: () => inject,
  locateAnnotationsInRows: () => locateAnnotationsInRows,
  rangesStillConnected: () => rangesStillConnected,
  renderSignature: () => renderSignature,
  requestAnnotations: () => requestAnnotations
});
module.exports = __toCommonJS(client_exports);

// src/locate.js
var SHOW_TEXT = 4;
var HIDDEN_TAGS = /* @__PURE__ */ new Set(["script", "style", "noscript"]);
function collectTextNodes(root, environment = domEnvironment()) {
  if (root === null || typeof root !== "object") return [];
  const walker = environment.createTreeWalker(root, SHOW_TEXT, {
    acceptNode(node) {
      if (hidden(node)) return 2;
      return textOf(node).length > 0 ? 1 : 3;
    }
  });
  const nodes = [];
  let start = 0;
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const length = textOf(node).length;
    nodes.push({ node, start, end: start + length });
    start += length;
  }
  return nodes;
}
function locateAnnotation(root, annotation, environment = domEnvironment()) {
  if (annotation === null || typeof annotation !== "object") return void 0;
  return locateRange(
    root,
    annotation.quote,
    annotation.contextBefore,
    annotation.contextAfter,
    environment
  );
}
function locateRange(root, quote, contextBefore, contextAfter, environment = domEnvironment()) {
  if (typeof quote !== "string" || quote.length === 0) return void 0;
  const nodes = collectTextNodes(root, environment);
  if (nodes.length === 0) return void 0;
  const text = nodes.map((entry) => textOf(entry.node)).join("");
  const exactQuote = uniqueOccurrence(text, quote);
  if (exactQuote !== void 0) return rangeFor(nodes, exactQuote, exactQuote + quote.length, environment);
  const normalizedText = normalizeText(text);
  const normalizedQuote = normalizeText(quote);
  if (normalizedQuote.text.length === 0) return void 0;
  const normalizedQuoteMatch = uniqueOccurrence(normalizedText.text, normalizedQuote.text);
  if (normalizedQuoteMatch !== void 0) {
    return rangeForNormalized(
      normalizedText,
      nodes,
      normalizedQuoteMatch,
      normalizedQuoteMatch + normalizedQuote.text.length,
      environment
    );
  }
  const before = typeof contextBefore === "string" ? contextBefore : "";
  const after = typeof contextAfter === "string" ? contextAfter : "";
  if (before.length === 0 && after.length === 0) return void 0;
  const anchor = before + quote + after;
  const exactAnchor = uniqueOccurrence(text, anchor);
  if (exactAnchor !== void 0) {
    const quoteStart2 = exactAnchor + before.length;
    return rangeFor(nodes, quoteStart2, quoteStart2 + quote.length, environment);
  }
  const normalizedBefore = normalizeText(before);
  const normalizedAfter = normalizeText(after);
  const normalizedAnchorText = normalizedBefore.text + normalizedQuote.text + normalizedAfter.text;
  const normalizedAnchor = uniqueOccurrence(normalizedText.text, normalizedAnchorText);
  if (normalizedAnchor === void 0) return void 0;
  const quoteStart = normalizedAnchor + normalizedBefore.text.length;
  return rangeForNormalized(
    normalizedText,
    nodes,
    quoteStart,
    quoteStart + normalizedQuote.text.length,
    environment
  );
}
function domEnvironment() {
  const document2 = globalThis.document;
  if (document2 === void 0) {
    throw new TypeError("answer-highlight locate requires a DOM document");
  }
  return {
    createTreeWalker: (root, whatToShow, filter) => document2.createTreeWalker(root, whatToShow, filter),
    createRange: () => document2.createRange()
  };
}
function textOf(node) {
  const value = node?.data ?? node?.nodeValue;
  return typeof value === "string" ? value : "";
}
function hidden(node) {
  const name = node?.parentElement?.localName;
  return typeof name === "string" && HIDDEN_TAGS.has(name);
}
function uniqueOccurrence(text, value) {
  if (value.length === 0 || value.length > text.length) return void 0;
  const first = text.indexOf(value);
  if (first === -1) return void 0;
  if (text.indexOf(value, first + 1) !== -1) return void 0;
  return first;
}
function normalizeText(value) {
  const text = [];
  const starts = [];
  const ends = [];
  let previousWasSpace = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (/\s/u.test(char)) {
      if (previousWasSpace) continue;
      text.push(" ");
      starts.push(index);
      ends.push(index + 1);
      previousWasSpace = true;
      continue;
    }
    text.push(char);
    starts.push(index);
    ends.push(index + 1);
    previousWasSpace = false;
  }
  while (text.length > 0 && text[0] === " ") {
    text.shift();
    starts.shift();
    ends.shift();
  }
  while (text.length > 0 && text[text.length - 1] === " ") {
    text.pop();
    starts.pop();
    ends.pop();
  }
  return { text: text.join(""), starts, ends, length: value.length };
}
function rangeFor(nodes, start, end, environment) {
  const startEntry = entryAt(nodes, start, false);
  const endEntry = entryAt(nodes, end, true);
  const range = environment.createRange();
  range.setStart(startEntry.node, start - startEntry.start);
  range.setEnd(endEntry.node, end - endEntry.start);
  return range;
}
function rangeForNormalized(normalized, nodes, start, end, environment) {
  if (start < 0 || end > normalized.starts.length || start >= end) return void 0;
  return rangeFor(
    nodes,
    normalized.starts[start],
    normalized.starts[end] ?? normalized.length,
    environment
  );
}
function entryAt(nodes, offset, atEnd) {
  if (atEnd) return nodes.find((entry) => offset > entry.start && offset <= entry.end);
  return nodes.find((entry) => offset >= entry.start && offset < entry.end);
}

// src/highlight.js
var HIGHLIGHT_NAMES = {
  "key-point": "answer-key-point",
  definition: "answer-definition",
  warning: "answer-warning",
  question: "answer-question"
};
var STYLE_ATTRIBUTE = "data-answer-highlight";
var STYLE_CSS = [
  ":root {",
  "  --answer-highlight-key-point: rgba(250, 204, 21, 0.42);",
  "  --answer-highlight-definition: rgba(59, 130, 246, 0.28);",
  "  --answer-highlight-warning: rgba(239, 68, 68, 0.30);",
  "  --answer-highlight-question: rgba(34, 197, 94, 0.28);",
  "}",
  "body[data-ds-dark-theme] {",
  "  --answer-highlight-key-point: rgba(253, 224, 71, 0.32);",
  "  --answer-highlight-definition: rgba(96, 165, 250, 0.40);",
  "  --answer-highlight-warning: rgba(248, 113, 113, 0.34);",
  "  --answer-highlight-question: rgba(74, 222, 128, 0.32);",
  "}",
  "::highlight(answer-key-point) {",
  "  background-color: var(--answer-highlight-key-point);",
  "}",
  "::highlight(answer-definition) {",
  "  background-color: var(--answer-highlight-definition);",
  "}",
  "::highlight(answer-warning) {",
  "  background-color: var(--answer-highlight-warning);",
  "}",
  "::highlight(answer-question) {",
  "  background-color: var(--answer-highlight-question);",
  "}"
].join("\n");
function highlightName(kind) {
  const name = HIGHLIGHT_NAMES[kind];
  if (name === void 0) throw new TypeError(`answer-highlight has no highlight for ${JSON.stringify(kind)}`);
  return name;
}
function installHighlightStyles(document2 = globalThis.document) {
  if (document2 === void 0) return void 0;
  const existing = document2.querySelector(`style[${STYLE_ATTRIBUTE}]`);
  if (existing !== null) return existing;
  const style = document2.createElement("style");
  style.setAttribute(STYLE_ATTRIBUTE, "true");
  style.textContent = STYLE_CSS;
  document2.head.appendChild(style);
  return style;
}
function renderAnswerHighlights(ranges, {
  document: document2 = globalThis.document,
  css = globalThis.CSS,
  Highlight = globalThis.Highlight,
  logger = console
} = {}) {
  if (css?.highlights === void 0 || typeof Highlight !== "function") {
    logger?.warn?.("answer-highlight: CSS Custom Highlight API is unavailable");
    return false;
  }
  installHighlightStyles(document2);
  const grouped = /* @__PURE__ */ new Map();
  for (const item of ranges) {
    if (item === null || typeof item !== "object" || typeof item.range?.setStart !== "function") continue;
    const name = highlightName(item.kind);
    const list = grouped.get(name);
    if (list === void 0) grouped.set(name, [item.range]);
    else list.push(item.range);
  }
  for (const name of Object.values(HIGHLIGHT_NAMES)) css.highlights.delete(name);
  for (const [name, list] of grouped) css.highlights.set(name, new Highlight(...list));
  return true;
}
function clearAnswerHighlights({
  document: document2 = globalThis.document,
  css = globalThis.CSS
} = {}) {
  if (css?.highlights !== void 0) {
    for (const name of Object.values(HIGHLIGHT_NAMES)) css.highlights.delete(name);
  }
  document2?.querySelector(`style[${STYLE_ATTRIBUTE}]`)?.remove();
}

// src/protocol.js
var ANNOTATION_LIST_PATH = "/api/plugins/answer-highlight/annotations";

// src/client.js
var ROOT_SELECTOR = "[data-chat-flow]";
var ASSISTANT_ROW_SELECTOR = '[data-chat-flow-kind="assistant-step"]';
function currentSessionId(ctx) {
  const key = ctx?.uiSession?.adapter?.current?.getSnapshot?.()?.key;
  return typeof key === "string" && key.length > 0 ? key : void 0;
}
function assistantRows(document2 = globalThis.document) {
  const root = document2?.querySelector(ROOT_SELECTOR);
  if (root === null || root === void 0) return [];
  return [...root.querySelectorAll(ASSISTANT_ROW_SELECTOR)];
}
async function requestAnnotations(sessionId, {
  fetch = globalThis.fetch,
  signal
} = {}) {
  if (typeof sessionId !== "string" || sessionId.length === 0) {
    throw new TypeError("answer-highlight requires a sessionId");
  }
  if (typeof fetch !== "function") {
    throw new Error("answer-highlight requires browser fetch");
  }
  const url = `${ANNOTATION_LIST_PATH}?sessionId=${encodeURIComponent(sessionId)}`;
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    cache: "no-store",
    signal
  });
  if (!response.ok) {
    throw new Error(`answer-highlight request failed with ${response.status}`);
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("answer-highlight response is not valid JSON");
  }
  if (payload === null || typeof payload !== "object" || !Array.isArray(payload.items)) {
    throw new Error("answer-highlight response has no annotation list");
  }
  return payload.items;
}
function locateAnnotationsInRows(rows, annotations, environment) {
  const located = [];
  for (const annotation of annotations ?? []) {
    const matches = [];
    for (const row of rows ?? []) {
      const range = locateAnnotation(row, annotation, environment);
      if (range !== void 0) matches.push(range);
    }
    if (matches.length === 1) located.push({ kind: annotation.kind, range: matches[0] });
  }
  return located;
}
function renderSignature(sessionId, annotations, rows) {
  const rowKeys = rows.map((row) => row?.dataset?.chatFlowKey ?? "");
  return JSON.stringify({ sessionId, annotations, rowKeys });
}
function rangesStillConnected(ranges) {
  return ranges.every((item) => {
    const start = item?.range?.startContainer;
    const end = item?.range?.endContainer;
    return start?.isConnected === true && end?.isConnected === true;
  });
}
function apply(ctx, config = {}) {
  if (typeof document === "undefined") return;
  const logger = ctx?.logger ?? console;
  const configuredInterval = config.pollIntervalMs;
  const pollIntervalMs = typeof configuredInterval === "number" && configuredInterval >= 250 ? configuredInterval : 1500;
  let stopped = false;
  let timer;
  let request;
  let signature = "";
  let ranges = [];
  function schedule(delay = pollIntervalMs) {
    if (!stopped) timer = setTimeout(() => {
      void tick();
    }, delay);
  }
  async function tick() {
    if (stopped) return;
    const sessionId = currentSessionId(ctx);
    const rows = assistantRows();
    if (sessionId === void 0 || rows.length === 0) {
      if (signature !== "") {
        clearAnswerHighlights();
        signature = "";
        ranges = [];
      }
      schedule();
      return;
    }
    request = new AbortController();
    let annotations;
    try {
      annotations = await requestAnnotations(sessionId, { signal: request.signal });
    } catch (error) {
      if (stopped || error?.name === "AbortError") return;
      logger.warn?.("answer-highlight: browser request failed", error);
      schedule();
      return;
    }
    if (stopped) return;
    const nextSignature = renderSignature(sessionId, annotations, rows);
    if (nextSignature === signature && rangesStillConnected(ranges)) {
      schedule();
      return;
    }
    ranges = locateAnnotationsInRows(rows, annotations);
    renderAnswerHighlights(ranges);
    signature = nextSignature;
    schedule();
  }
  ctx.effect(() => {
    schedule(0);
    return () => {
      stopped = true;
      clearTimeout(timer);
      request?.abort();
      clearAnswerHighlights();
      signature = "";
      ranges = [];
    };
  }, "answer-highlight: browser rendering");
}
var inject = ["uiSession"];

    return module.exports
  },
})
