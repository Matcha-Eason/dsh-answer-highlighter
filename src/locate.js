/**
 * DOM search for annotation quotes.
 *
 * The host computes offsets against a Markdown projection. Rendering has a
 * different DOM text stream, so this module searches the browser text again and
 * returns a Range only when the quote has one visible location.
 */

const SHOW_TEXT = 4
const HIDDEN_TAGS = new Set(['script', 'style', 'noscript'])

/**
 * Collect the visible text nodes under one DOM subtree.
 *
 * @param {Node} root - search root.
 * @param {object} [environment] - DOM factory override for tests.
 * @param {(root: Node, whatToShow: number, filter: object) => TreeWalker} [environment.createTreeWalker] - factory.
 * @returns {{node: Text, start: number, end: number}[]} node index.
 */
export function collectTextNodes(root, environment = domEnvironment()) {
  if (root === null || typeof root !== 'object') return []
  const walker = environment.createTreeWalker(root, SHOW_TEXT, {
    acceptNode(node) {
      if (hidden(node)) return 2
      return textOf(node).length > 0 ? 1 : 3
    },
  })

  const nodes = []
  let start = 0
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const length = textOf(node).length
    nodes.push({ node, start, end: start + length })
    start += length
  }
  return nodes
}

/**
 * Locate one stored annotation in a DOM subtree.
 *
 * @param {Node} root - search root.
 * @param {StoredAnnotation} annotation - stored annotation.
 * @param {object} [environment] - DOM factory override for tests.
 * @returns {Range|undefined} range, or undefined when no unique location exists.
 */
export function locateAnnotation(root, annotation, environment = domEnvironment()) {
  if (annotation === null || typeof annotation !== 'object') return undefined
  return locateRange(
    root,
    annotation.quote,
    annotation.contextBefore,
    annotation.contextAfter,
    environment,
  )
}

/**
 * Locate a quote and turn its text offsets into a DOM Range.
 *
 * Search order is exact quote, whitespace-normalized quote, exact context
 * anchor, and normalized context anchor. Every step must produce one match.
 *
 * @param {Node} root - search root.
 * @param {string} quote - quote to highlight.
 * @param {string} [contextBefore] - text immediately before the quote.
 * @param {string} [contextAfter] - text immediately after the quote.
 * @param {object} [environment] - DOM factory override for tests.
 * @param {(root: Node, whatToShow: number, filter: object) => TreeWalker} [environment.createTreeWalker] - factory.
 * @param {() => Range} [environment.createRange] - factory.
 * @returns {Range|undefined} range, or undefined when no unique location exists.
 */
export function locateRange(
  root,
  quote,
  contextBefore,
  contextAfter,
  environment = domEnvironment(),
) {
  if (typeof quote !== 'string' || quote.length === 0) return undefined
  const nodes = collectTextNodes(root, environment)
  if (nodes.length === 0) return undefined

  const text = nodes.map(entry => textOf(entry.node)).join('')
  const exactQuote = uniqueOccurrence(text, quote)
  if (exactQuote !== undefined) return rangeFor(nodes, exactQuote, exactQuote + quote.length, environment)

  const normalizedText = normalizeText(text)
  const normalizedQuote = normalizeText(quote)
  if (normalizedQuote.text.length === 0) return undefined
  const normalizedQuoteMatch = uniqueOccurrence(normalizedText.text, normalizedQuote.text)
  if (normalizedQuoteMatch !== undefined) {
    return rangeForNormalized(
      normalizedText,
      nodes,
      normalizedQuoteMatch,
      normalizedQuoteMatch + normalizedQuote.text.length,
      environment,
    )
  }

  const before = typeof contextBefore === 'string' ? contextBefore : ''
  const after = typeof contextAfter === 'string' ? contextAfter : ''
  if (before.length === 0 && after.length === 0) return undefined

  const anchor = before + quote + after
  const exactAnchor = uniqueOccurrence(text, anchor)
  if (exactAnchor !== undefined) {
    const quoteStart = exactAnchor + before.length
    return rangeFor(nodes, quoteStart, quoteStart + quote.length, environment)
  }

  const normalizedBefore = normalizeText(before)
  const normalizedAfter = normalizeText(after)
  const normalizedAnchorText = normalizedBefore.text + normalizedQuote.text + normalizedAfter.text
  const normalizedAnchor = uniqueOccurrence(normalizedText.text, normalizedAnchorText)
  if (normalizedAnchor === undefined) return undefined

  const quoteStart = normalizedAnchor + normalizedBefore.text.length
  return rangeForNormalized(
    normalizedText,
    nodes,
    quoteStart,
    quoteStart + normalizedQuote.text.length,
    environment,
  )
}

/**
 * Build a browser DOM environment.
 *
 * @returns {object} factories from the global document.
 */
function domEnvironment() {
  const document = globalThis.document
  if (document === undefined) {
    throw new TypeError('answer-highlight locate requires a DOM document')
  }
  return {
    createTreeWalker: (root, whatToShow, filter) => document.createTreeWalker(root, whatToShow, filter),
    createRange: () => document.createRange(),
  }
}

/**
 * Read text from a DOM text node.
 *
 * @param {Node} node - DOM node.
 * @returns {string} node text.
 */
function textOf(node) {
  const value = node?.data ?? node?.nodeValue
  return typeof value === 'string' ? value : ''
}

/**
 * Reject text nodes inside normally invisible containers.
 *
 * @param {Node} node - text node.
 * @returns {boolean} true when its parent is hidden by tag name.
 */
function hidden(node) {
  const name = node?.parentElement?.localName
  return typeof name === 'string' && HIDDEN_TAGS.has(name)
}

/**
 * Find the only occurrence of a value.
 *
 * @param {string} text - searched text.
 * @param {string} value - exact value.
 * @returns {number|undefined} start offset, or undefined when absent or repeated.
 */
function uniqueOccurrence(text, value) {
  if (value.length === 0 || value.length > text.length) return undefined
  const first = text.indexOf(value)
  if (first === -1) return undefined
  if (text.indexOf(value, first + 1) !== -1) return undefined
  return first
}

/**
 * Collapse whitespace and keep a map back to original offsets.
 *
 * @param {string} value - original text.
 * @returns {{text: string, starts: number[], ends: number[]}} normalized text and offsets.
 */
function normalizeText(value) {
  const text = []
  const starts = []
  const ends = []
  let previousWasSpace = false

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]
    if (/\s/u.test(char)) {
      if (previousWasSpace) continue
      text.push(' ')
      starts.push(index)
      ends.push(index + 1)
      previousWasSpace = true
      continue
    }
    text.push(char)
    starts.push(index)
    ends.push(index + 1)
    previousWasSpace = false
  }

  while (text.length > 0 && text[0] === ' ') {
    text.shift()
    starts.shift()
    ends.shift()
  }
  while (text.length > 0 && text[text.length - 1] === ' ') {
    text.pop()
    starts.pop()
    ends.pop()
  }
  return { text: text.join(''), starts, ends, length: value.length }
}

/**
 * Create a Range from original text offsets.
 *
 * @param {{node: Text, start: number, end: number}[]} nodes - node index.
 * @param {number} start - inclusive global start.
 * @param {number} end - exclusive global end.
 * @param {object} environment - DOM factory.
 * @returns {Range} DOM range.
 */
function rangeFor(nodes, start, end, environment) {
  const startEntry = entryAt(nodes, start, false)
  const endEntry = entryAt(nodes, end, true)
  const range = environment.createRange()
  range.setStart(startEntry.node, start - startEntry.start)
  range.setEnd(endEntry.node, end - endEntry.start)
  return range
}

/**
 * Create a Range from normalized text offsets.
 *
 * @param {{text: string, starts: number[], ends: number[]}} normalized - normalized text.
 * @param {{node: Text, start: number, end: number}[]} nodes - node index.
 * @param {number} start - inclusive normalized start.
 * @param {number} end - exclusive normalized end.
 * @param {object} environment - DOM factory.
 * @returns {Range} DOM range.
 */
function rangeForNormalized(normalized, nodes, start, end, environment) {
  if (start < 0 || end > normalized.starts.length || start >= end) return undefined
  return rangeFor(
    nodes,
    normalized.starts[start],
    normalized.starts[end] ?? normalized.length,
    environment,
  )
}

/**
 * Find the node containing one global offset.
 *
 * @param {{node: Text, start: number, end: number}[]} nodes - node index.
 * @param {number} offset - global offset.
 * @param {boolean} atEnd - true when selecting the preceding node at a boundary.
 * @returns {{node: Text, start: number, end: number}} containing node entry.
 */
function entryAt(nodes, offset, atEnd) {
  if (atEnd) return nodes.find(entry => offset > entry.start && offset <= entry.end)
  return nodes.find(entry => offset >= entry.start && offset < entry.end)
}
