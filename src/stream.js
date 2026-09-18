/**
 * Stream collection for the auxiliary model call.
 *
 * The shapes follow DSH's `StreamChunk` protocol. This module is intentionally
 * dependency-free so the pipeline can be tested without installing the whole
 * harness.
 */

/**
 * Collect visible text from one model stream.
 *
 * @param {AsyncIterable<object>} stream - model stream chunks.
 * @returns {Promise<string>} concatenated text blocks.
 * @throws {Error} when the finish reason is not `stop`, or tool calls are present.
 */
export async function collectTextFromStream(stream) {
  const partialText = new Map()
  const blocks = new Map()
  let finishReason
  let hasToolCall = false

  for await (const chunk of stream) {
    if (chunk === null || typeof chunk !== 'object') continue

    switch (chunk.type) {
      case 'block-start': {
        if (chunk.blockType === 'tool-call') hasToolCall = true
        if (!partialText.has(chunk.index) && !blocks.has(chunk.index)) partialText.set(chunk.index, '')
        break
      }
      case 'text-delta': {
        const current = partialText.get(chunk.index) ?? ''
        if (!blocks.has(chunk.index)) partialText.set(chunk.index, current + chunk.text)
        break
      }
      case 'block-end': {
        if (chunk.block?.type === 'tool-call') hasToolCall = true
        if (chunk.block !== null && typeof chunk.block === 'object' && chunk.block.type === 'text') {
          blocks.set(chunk.index, typeof chunk.block.text === 'string' ? chunk.block.text : '')
          partialText.delete(chunk.index)
        }
        break
      }
      case 'finish': {
        finishReason = chunk.reason?.kind
        break
      }
      default:
        break
    }
  }

  if (hasToolCall) throw new Error('annotation model returned a tool call')
  if (finishReason !== undefined && finishReason !== 'stop') {
    throw new Error(`annotation model finished with ${finishReason}`)
  }

  const indices = [...new Set([...blocks.keys(), ...partialText.keys()])].sort((a, b) => a - b)
  const texts = indices.map(index => blocks.get(index) ?? partialText.get(index) ?? '')
  return texts.join('')
}
