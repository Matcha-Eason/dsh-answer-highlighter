/**
 * CSS Custom Highlight registration for answer annotations.
 */

const HIGHLIGHT_NAMES = {
  'key-point': 'answer-key-point',
  definition: 'answer-definition',
  warning: 'answer-warning',
  question: 'answer-question',
}

const STYLE_ATTRIBUTE = 'data-answer-highlight'
const STYLE_CSS = [
  ':root {',
  '  --answer-highlight-key-point: rgba(250, 204, 21, 0.42);',
  '  --answer-highlight-definition: rgba(59, 130, 246, 0.28);',
  '  --answer-highlight-warning: rgba(239, 68, 68, 0.30);',
  '  --answer-highlight-question: rgba(34, 197, 94, 0.28);',
  '}',
  'body[data-ds-dark-theme] {',
  '  --answer-highlight-key-point: rgba(253, 224, 71, 0.32);',
  '  --answer-highlight-definition: rgba(96, 165, 250, 0.40);',
  '  --answer-highlight-warning: rgba(248, 113, 113, 0.34);',
  '  --answer-highlight-question: rgba(74, 222, 128, 0.32);',
  '}',
  '::highlight(answer-key-point) {',
  '  background-color: var(--answer-highlight-key-point);',
  '}',
  '::highlight(answer-definition) {',
  '  background-color: var(--answer-highlight-definition);',
  '}',
  '::highlight(answer-warning) {',
  '  background-color: var(--answer-highlight-warning);',
  '}',
  '::highlight(answer-question) {',
  '  background-color: var(--answer-highlight-question);',
  '}',
].join('\n')

/**
 * Resolve the highlight name for one annotation kind.
 *
 * @param {AnnotationKind} kind - annotation kind.
 * @returns {string} CSS Custom Highlight name.
 */
export function highlightName(kind) {
  const name = HIGHLIGHT_NAMES[kind]
  if (name === undefined) throw new TypeError(`answer-highlight has no highlight for ${JSON.stringify(kind)}`)
  return name
}

/**
 * Install the plugin stylesheet once.
 *
 * @param {Document} [document=globalThis.document] - DOM document.
 * @returns {HTMLStyleElement|undefined} existing or newly created style element.
 */
export function installHighlightStyles(document = globalThis.document) {
  if (document === undefined) return undefined
  const existing = document.querySelector(`style[${STYLE_ATTRIBUTE}]`)
  if (existing !== null) return existing

  const style = document.createElement('style')
  style.setAttribute(STYLE_ATTRIBUTE, 'true')
  style.textContent = STYLE_CSS
  document.head.appendChild(style)
  return style
}

/**
 * Replace all answer highlights with the supplied ranges.
 *
 * @param {Iterable<{kind: AnnotationKind, range: Range}>} ranges - located ranges.
 * @param {object} [options] - browser overrides.
 * @param {Document} [options.document] - DOM document.
 * @param {object} [options.css] - CSS object exposing `highlights`.
 * @param {new (...ranges: Range[]) => Highlight} [options.Highlight] - highlight constructor.
 * @param {object} [options.logger] - logger for unsupported browsers.
 * @returns {boolean} true when the browser registered highlights.
 */
export function renderAnswerHighlights(ranges, {
  document = globalThis.document,
  css = globalThis.CSS,
  Highlight = globalThis.Highlight,
  logger = console,
} = {}) {
  if (css?.highlights === undefined || typeof Highlight !== 'function') {
    logger?.warn?.('answer-highlight: CSS Custom Highlight API is unavailable')
    return false
  }

  installHighlightStyles(document)

  const grouped = new Map()
  for (const item of ranges) {
    if (item === null || typeof item !== 'object' || typeof item.range?.setStart !== 'function') continue
    const name = highlightName(item.kind)
    const list = grouped.get(name)
    if (list === undefined) grouped.set(name, [item.range])
    else list.push(item.range)
  }

  for (const name of Object.values(HIGHLIGHT_NAMES)) css.highlights.delete(name)
  for (const [name, list] of grouped) css.highlights.set(name, new Highlight(...list))
  return true
}

/**
 * Remove all answer highlights and the injected stylesheet.
 *
 * @param {object} [options] - browser overrides.
 * @param {Document} [options.document] - DOM document.
 * @param {object} [options.css] - CSS object exposing `highlights`.
 */
export function clearAnswerHighlights({
  document = globalThis.document,
  css = globalThis.CSS,
} = {}) {
  if (css?.highlights !== undefined) {
    for (const name of Object.values(HIGHLIGHT_NAMES)) css.highlights.delete(name)
  }
  document?.querySelector(`style[${STYLE_ATTRIBUTE}]`)?.remove()
}
