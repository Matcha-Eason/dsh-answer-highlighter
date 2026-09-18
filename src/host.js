/**
 * Host-side event pipeline for answer annotations.
 */

import { generateAnnotations } from './model.js'
import { messageText } from './text.js'

/**
 * Create a host pipeline that tracks user questions and annotates completed
 * assistant messages.
 *
 * @param {object} input - host input.
 * @param {object} input.llm - LLM runtime exposing `stream`.
 * @param {object} [input.service] - storage service used to deduplicate and persist annotations.
 * @param {(annotations: ValidatedAnnotation[], context: object) => void|Promise<void>} [input.onAnnotations] - callback for validated annotations.
 * @param {(message: string, ...args: unknown[]) => void} [input.logger] - optional logger.
 * @param {object} [input.options] - model call policy.
 * @returns {{handleEvent: (session: object, event: object) => Promise<void>, processedMessages: Set<string>, sessionQuestions: Map<string, string>}} host pipeline.
 */
export function createAnswerHighlightHost({
  llm,
  service,
  onAnnotations,
  logger = console,
  options = {},
}) {
  const processedMessages = new Set()
  const sessionQuestions = new Map()

  async function handleEvent(session, event) {
    if (event === null || typeof event !== 'object') return

    if (event.type === 'user/message') {
      const message = event.data?.message ?? event.data
      const question = messageText(message)
      if (question.length > 0 && session?.id !== undefined) sessionQuestions.set(session.id, question)
      return
    }

    if (event.type !== 'assistant/message') return
    const message = event.data?.message
    if (message === null || typeof message !== 'object') return
    if (event.data.interrupted === true) return
    if (typeof message.id !== 'string' || processedMessages.has(message.id)) return

    if (service !== undefined && typeof session?.id === 'string') {
      let stored
      try {
        stored = await service.hasMessage(session.id, message.id)
      } catch (error) {
        logger.warn?.('answer-highlight: storage lookup failed', error)
        processedMessages.add(message.id)
        return
      }
      if (stored) {
        processedMessages.add(message.id)
        return
      }
    }

    const provider = options.provider ?? message.source?.provider
    const model = options.model ?? message.source?.model
    if (typeof provider !== 'string' || typeof model !== 'string') {
      logger.warn?.('answer-highlight: assistant message has no provider/model route')
      return
    }

    processedMessages.add(message.id)
    const question = sessionQuestions.get(session?.id) ?? ''

    try {
      const annotations = await generateAnnotations({
        message,
        question,
        llm,
        provider,
        model,
        sessionId: session?.id,
        options,
      })
      const records = service === undefined
        ? annotations
        : await service.save({
          sessionId: session?.id,
          messageId: message.id,
          annotations,
          provider,
          model,
        })

      if (records.length > 0) await onAnnotations?.(records, {
        sessionId: session?.id,
        messageId: message.id,
        provider,
        model,
      })
    } catch (error) {
      logger.warn?.('answer-highlight: annotation generation failed', error)
    }
  }

  return { handleEvent, processedMessages, sessionQuestions }
}
