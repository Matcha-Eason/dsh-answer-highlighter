/**
 * Annotation parsing and local validation.
 */

/** @typedef {import('./types.js').AnnotationKind} AnnotationKind */
/** @typedef {import('./types.js').RawAnnotation} RawAnnotation */
/** @typedef {import('./types.js').ValidatedAnnotation} ValidatedAnnotation */

const KINDS = new Set(['key-point', 'definition', 'warning', 'question'])
const MIN_QUOTE_LENGTH = 12
const MAX_QUOTE_LENGTH = 180
const MAX_NOTE_LENGTH = 160
const MAX_CONTEXT_LENGTH = 180

/**
 * Parse model output into a raw annotation array.
 *
 * The parser accepts a JSON array optionally wrapped in a Markdown code fence.
 * It rejects any other shape.
 *
 * @param {string} output - model output.
 * @returns {RawAnnotation[]} raw annotation objects.
 * @throws {Error} when the output is not a JSON array.
 */
export function parseAnnotationOutput(output) {
  if (typeof output !== 'string') throw new TypeError('annotation output must be a string')

  let text = output.trim()
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(text)
  if (fenced !== null) text = fenced[1].trim()

  let value
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error('annotation output is not valid JSON')
  }

  if (!Array.isArray(value)) throw new Error('annotation output must be a JSON array')
  return value
}

/**
 * Validate raw annotations against the projected answer text.
 *
 * The validator only checks structure and whether a quote can be located. It
 * does not judge whether the model's semantic annotation is useful.
 *
 * @param {RawAnnotation[]} rawAnnotations - parsed model output.
 * @param {string} text - visible answer text.
 * @param {number} [maxAnnotations=5] - maximum number of annotations to return.
 * @returns {ValidatedAnnotation[]} validated annotations.
 */
export function validateAnnotations(rawAnnotations, text, maxAnnotations = 5) {
  if (!Array.isArray(rawAnnotations)) return []
  if (typeof text !== 'string' || text.length === 0) return []

  const accepted = []
  const ranges = []

  for (const raw of rawAnnotations) {
    if (accepted.length >= maxAnnotations) break
    const annotation = validateOne(raw, text)
    if (annotation === undefined) continue
    if (overlaps(annotation, ranges)) continue
    accepted.push(annotation)
    ranges.push(annotation)
  }

  return accepted
}

/**
 * Validate one raw annotation.
 *
 * @param {RawAnnotation} raw - one parsed annotation.
 * @param {string} text - visible answer text.
 * @returns {ValidatedAnnotation|undefined} validated annotation, or undefined when invalid.
 */
function validateOne(raw, text) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return undefined

  const quote = raw.quote
  if (typeof quote !== 'string') return undefined
  const quoteLength = [...quote].length
  if (quoteLength < MIN_QUOTE_LENGTH || quoteLength > MAX_QUOTE_LENGTH) return undefined

  const kind = raw.kind
  if (typeof kind !== 'string' || !KINDS.has(kind)) return undefined

  const note = raw.note
  if (note !== undefined && (typeof note !== 'string' || [...note].length > MAX_NOTE_LENGTH)) return undefined

  const contextBefore = raw.contextBefore
  if (contextBefore !== undefined
    && (typeof contextBefore !== 'string' || [...contextBefore].length > MAX_CONTEXT_LENGTH)) return undefined

  const contextAfter = raw.contextAfter
  if (contextAfter !== undefined
    && (typeof contextAfter !== 'string' || [...contextAfter].length > MAX_CONTEXT_LENGTH)) return undefined

  const quoteStarts = findAll(text, quote)
  if (quoteStarts.length === 0) return undefined

  let start
  let end
  if (quoteStarts.length === 1) {
    start = quoteStarts[0]
    end = start + quote.length
  } else {
    const anchor = `${contextBefore ?? ''}${quote}${contextAfter ?? ''}`
    if (anchor === quote) return undefined
    const anchorStarts = findAll(text, anchor)
    if (anchorStarts.length !== 1) return undefined
    const anchorStart = anchorStarts[0]
    const quoteOffset = (contextBefore ?? '').length
    if (text.slice(anchorStart + quoteOffset, anchorStart + quoteOffset + quote.length) !== quote) return undefined
    start = anchorStart + quoteOffset
    end = start + quote.length
  }

  return {
    quote,
    contextBefore: typeof contextBefore === 'string' ? contextBefore : undefined,
    contextAfter: typeof contextAfter === 'string' ? contextAfter : undefined,
    kind,
    note: typeof note === 'string' ? note : undefined,
    start,
    end,
  }
}

/**
 * Check whether a candidate annotation overlaps an accepted range.
 *
 * @param {ValidatedAnnotation} candidate - candidate annotation.
 * @param {ValidatedAnnotation[]} accepted - already accepted annotations.
 * @returns {boolean} true when the candidate overlaps any accepted range.
 */
function overlaps(candidate, accepted) {
  return accepted.some(item => candidate.start < item.end && item.start < candidate.end)
}

/**
 * Find all occurrences of a needle in a haystack.
 *
 * @param {string} haystack - text to search.
 * @param {string} needle - text to find.
 * @returns {number[]} start offsets.
 */
function findAll(haystack, needle) {
  const positions = []
  let position = haystack.indexOf(needle)
  while (position !== -1) {
    positions.push(position)
    position = haystack.indexOf(needle, position + 1)
  }
  return positions
}
