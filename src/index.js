/** Cordis plugin entry and public exports for the answer-highlight pipeline. */

import { homedir } from 'node:os'
import { join } from 'node:path'

import { createAnswerHighlightHost } from './host.js'
import { AnswerHighlightStorage } from './storage.js'
import { AnswerHighlightService } from './service.js'
import { createAnnotationListRoute } from './route.js'

export const name = 'answer-highlight'
export const inject = ['llm', 'connection']

const DEFAULT_PROVIDER = 'deepseek-official'
const DEFAULT_MODEL = 'deepseek-flash'

export function apply(ctx, config = {}) {
  const logger = ctx.logger ?? console
  const storageDirectory = config.storageDirectory
    ?? process.env.DSH_ANSWER_HIGHLIGHT_DATA
    ?? join(
      process.env.DSH_HOME ?? join(homedir(), '.dsh'),
      'plugin-data',
      'dsh-answer-highlighter',
      'annotations',
    )

  const storage = new AnswerHighlightStorage({ directory: storageDirectory })
  const service = new AnswerHighlightService({ storage })
  const host = createAnswerHighlightHost({
    llm: ctx.llm,
    service,
    logger,
    options: {
      provider: config.provider ?? DEFAULT_PROVIDER,
      model: config.model ?? DEFAULT_MODEL,
    },
  })

  ctx.on('session/event', (session, event) => {
    void host.handleEvent(session, event)
  })

  ctx.effect(() => ctx.connection.fetch.register(
    createAnnotationListRoute(service, logger),
  ), 'answer-highlight: annotation route')

  ctx.effect(() => () => {
    void service.close().catch(error => {
      logger.warn?.('answer-highlight: storage close failed', error)
    })
  }, 'answer-highlight: storage lifecycle')
}

export { toVisibleText, messageText, codePointLength, utf8Length } from './text.js'
export { buildAnnotationPrompt } from './prompt.js'
export { parseAnnotationOutput, validateAnnotations } from './annotations.js'
export { collectTextFromStream } from './stream.js'
export { generateAnnotations } from './model.js'
export { createAnswerHighlightHost } from './host.js'
export { AnswerHighlightStorage } from './storage.js'
export { AnswerHighlightService } from './service.js'
export { createAnnotationListRoute } from './route.js'
export { locateAnnotation, locateRange, collectTextNodes } from './locate.js'
export {
  highlightName,
  installHighlightStyles,
  renderAnswerHighlights,
  clearAnswerHighlights,
} from './highlight.js'
