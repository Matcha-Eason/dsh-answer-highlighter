/** Browser half that pulls annotations and renders CSS highlights. */

import { locateAnnotation } from './locate.js'
import { renderAnswerHighlights, clearAnswerHighlights } from './highlight.js'
import { ANNOTATION_LIST_PATH } from './protocol.js'

const ROOT_SELECTOR = '[data-chat-flow]'
const ASSISTANT_ROW_SELECTOR = '[data-chat-flow-kind="assistant-step"]'

/**
 * Read the current Session id from the standard UI session adapter.
 *
 * @param {object} ctx - client Cordis context.
 * @returns {string|undefined} current Session id.
 */
export function currentSessionId(ctx) {
  const key = ctx?.uiSession?.adapter?.current?.getSnapshot?.()?.key
  return typeof key === 'string' && key.length > 0 ? key : undefined
}

/**
 * Read visible assistant rows from the current chat root.
 *
 * @param {Document} [document] - DOM document override.
 * @returns {Element[]} assistant rows currently mounted by React.
 */
export function assistantRows(document = globalThis.document) {
  const root = document?.querySelector(ROOT_SELECTOR)
  if (root === null || root === undefined) return []
  return [...root.querySelectorAll(ASSISTANT_ROW_SELECTOR)]
}

/**
 * Request annotations for one Session.
 *
 * @param {string} sessionId - current Session id.
 * @param {object} [options] - browser overrides.
 * @param {typeof fetch} [options.fetch] - fetch implementation.
 * @param {AbortSignal} [options.signal] - request abort signal.
 * @returns {Promise<import('./types.js').StoredAnnotation[]>} annotations.
 */
export async function requestAnnotations(sessionId, {
  fetch = globalThis.fetch,
  signal,
} = {}) {
  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    throw new TypeError('answer-highlight requires a sessionId')
  }
  if (typeof fetch !== 'function') {
    throw new Error('answer-highlight requires browser fetch')
  }

  const url = `${ANNOTATION_LIST_PATH}?sessionId=${encodeURIComponent(sessionId)}`
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    cache: 'no-store',
    signal,
  })
  if (!response.ok) {
    throw new Error(`answer-highlight request failed with ${response.status}`)
  }

  let payload
  try {
    payload = await response.json()
  } catch {
    throw new Error('answer-highlight response is not valid JSON')
  }
  if (payload === null || typeof payload !== 'object' || !Array.isArray(payload.items)) {
    throw new Error('answer-highlight response has no annotation list')
  }
  return payload.items
}

/**
 * Locate annotations across mounted assistant rows.
 *
 * An annotation is kept only when exactly one row gives it one unique Range.
 *
 * @param {Element[]} rows - mounted assistant rows.
 * @param {import('./types.js').StoredAnnotation[]} annotations - stored annotations.
 * @param {object} [environment] - DOM factory override for tests.
 * @returns {{kind: import('./types.js').AnnotationKind, range: Range}[]} render inputs.
 */
export function locateAnnotationsInRows(rows, annotations, environment) {
  const located = []
  for (const annotation of annotations ?? []) {
    const matches = []
    for (const row of rows ?? []) {
      const range = locateAnnotation(row, annotation, environment)
      if (range !== undefined) matches.push(range)
    }
    if (matches.length === 1) located.push({ kind: annotation.kind, range: matches[0] })
  }
  return located
}

/**
 * Build a signature covering the payload and mounted assistant row keys.
 *
 * @param {string} sessionId - current Session id.
 * @param {import('./types.js').StoredAnnotation[]} annotations - current payload.
 * @param {Element[]} rows - mounted assistant rows.
 * @returns {string} deterministic signature.
 */
export function renderSignature(sessionId, annotations, rows) {
  const rowKeys = rows.map(row => row?.dataset?.chatFlowKey ?? '')
  return JSON.stringify({ sessionId, annotations, rowKeys })
}

/**
 * Check whether every previously rendered Range still points into the document.
 *
 * @param {{range: Range}[]} ranges - previous render inputs.
 * @returns {boolean} true when all Range boundaries remain connected.
 */
export function rangesStillConnected(ranges) {
  return ranges.every(item => {
    const start = item?.range?.startContainer
    const end = item?.range?.endContainer
    return start?.isConnected === true && end?.isConnected === true
  })
}

/**
 * Install the browser polling renderer.
 *
 * @param {object} ctx - client Cordis context.
 * @param {object} [config] - client configuration.
 * @param {number} [config.pollIntervalMs] - poll interval, minimum 250 ms.
 */
export function apply(ctx, config = {}) {
  if (typeof document === 'undefined') return

  const logger = ctx?.logger ?? console
  const configuredInterval = config.pollIntervalMs
  const pollIntervalMs = typeof configuredInterval === 'number' && configuredInterval >= 250
    ? configuredInterval
    : 1500
  let stopped = false
  let timer
  let request
  let signature = ''
  let ranges = []

  function schedule(delay = pollIntervalMs) {
    if (!stopped) timer = setTimeout(() => { void tick() }, delay)
  }

  async function tick() {
    if (stopped) return
    const sessionId = currentSessionId(ctx)
    const rows = assistantRows()

    if (sessionId === undefined || rows.length === 0) {
      if (signature !== '') {
        clearAnswerHighlights()
        signature = ''
        ranges = []
      }
      schedule()
      return
    }

    request = new AbortController()
    let annotations
    try {
      annotations = await requestAnnotations(sessionId, { signal: request.signal })
    } catch (error) {
      if (stopped || error?.name === 'AbortError') return
      logger.warn?.('answer-highlight: browser request failed', error)
      schedule()
      return
    }
    if (stopped) return

    const nextSignature = renderSignature(sessionId, annotations, rows)
    if (nextSignature === signature && rangesStillConnected(ranges)) {
      schedule()
      return
    }

    ranges = locateAnnotationsInRows(rows, annotations)
    renderAnswerHighlights(ranges)
    signature = nextSignature
    schedule()
  }

  ctx.effect(() => {
    schedule(0)
    return () => {
      stopped = true
      clearTimeout(timer)
      request?.abort()
      clearAnswerHighlights()
      signature = ''
      ranges = []
    }
  }, 'answer-highlight: browser rendering')
}

export const inject = ['uiSession']
