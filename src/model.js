/**
 * One auxiliary model call for answer annotations.
 */

import { randomUUID } from 'node:crypto'

import { parseAnnotationOutput, validateAnnotations } from './annotations.js'
import { buildAnnotationPrompt } from './prompt.js'
import { collectTextFromStream } from './stream.js'
import { messageText, toVisibleText, utf8Length } from './text.js'

/**
 * Generate annotations for one completed assistant message.
 *
 * @param {object} input - call input.
 * @param {object} input.message - completed assistant message.
 * @param {string} input.question - user question that produced the answer.
 * @param {object} input.llm - LLM runtime exposing `stream`.
 * @param {string} input.provider - current provider route.
 * @param {string} input.model - current model id.
 * @param {string} input.sessionId - session id.
 * @param {object} [input.options] - optional policy overrides.
 * @param {number} [input.options.maxInputBytes=49152] - maximum UTF-8 bytes for the user prompt.
 * @param {number} [input.options.maxOutputTokens=1200] - output token cap.
 * @param {number} [input.options.timeoutMs=20000] - end-to-end timeout.
 * @param {number} [input.options.maxAnnotations=5] - maximum annotations to return.
 * @returns {Promise<ValidatedAnnotation[]>} validated annotations.
 */
export async function generateAnnotations({
  message,
  question,
  llm,
  provider,
  model,
  sessionId,
  options = {},
}) {
  const maxInputBytes = options.maxInputBytes ?? 49152
  const maxOutputTokens = options.maxOutputTokens ?? 1200
  const timeoutMs = options.timeoutMs ?? 20000
  const maxAnnotations = options.maxAnnotations ?? 5

  const answer = toVisibleText(messageText(message))
  if (answer.length === 0) return []

  const prompt = buildAnnotationPrompt({ question, answer, maxAnnotations })
  if (utf8Length(prompt.user) > maxInputBytes) return []

  const signal = AbortSignal.timeout(timeoutMs)
  const streamOptions = {
    provider,
    model,
    reasoningEffort: 'off',
    messages: [{
      id: randomUUID(),
      role: 'user',
      content: [{ type: 'text', text: prompt.user }],
      source: { kind: 'plugin', plugin: 'dsh-answer-highlighter' },
    }],
    system: prompt.system,
    maxTokens: maxOutputTokens,
    sessionId,
    signal,
  }

  const output = await withTimeout(
    collectTextFromStream(llm.stream(streamOptions)),
    timeoutMs,
    'annotation model timed out',
  )
  const rawAnnotations = parseAnnotationOutput(output)
  return validateAnnotations(rawAnnotations, answer, maxAnnotations)
}

/**
 * Reject a promise after a deadline.
 *
 * @template T
 * @param {Promise<T>} promise - promise to guard.
 * @param {number} timeoutMs - deadline in milliseconds.
 * @param {string} message - timeout error message.
 * @returns {Promise<T>} the guarded promise.
 */
async function withTimeout(promise, timeoutMs, message) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    clearTimeout(timer)
  }
}
