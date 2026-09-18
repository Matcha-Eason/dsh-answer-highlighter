/**
 * Host-facing service for storing and reading answer annotations.
 */

import { AnswerHighlightStorage } from './storage.js'

/**
 * Service that owns annotation persistence and the future remote `list`
 * operation.
 */
export class AnswerHighlightService {
  #storage

  /**
   * Create the service.
   *
   * @param {object} input - service input.
   * @param {AnswerHighlightStorage} input.storage - storage backend.
   */
  constructor({ storage }) {
    if (!(storage instanceof AnswerHighlightStorage)) {
      throw new TypeError('answer-highlight service requires an AnswerHighlightStorage')
    }
    this.#storage = storage
  }

  /**
   * Save annotations for one assistant message.
   *
   * @param {object} input - save input.
   * @param {string} input.sessionId - owning session.
   * @param {string} input.messageId - assistant message id.
   * @param {StoredAnnotation[]} input.annotations - validated annotations.
   * @param {string} input.provider - provider route.
   * @param {string} input.model - model id.
   * @returns {Promise<StoredAnnotation[]>} stored annotations.
   */
  save(input) {
    return this.#storage.save(input)
  }

  /**
   * List annotations for one session or message.
   *
   * @param {object} request - list request.
   * @param {string} request.sessionId - owning session.
   * @param {string} [request.messageId] - optional assistant message id.
   * @returns {Promise<{items: StoredAnnotation[]}>} list result.
   */
  async list(request) {
    if (request === null || typeof request !== 'object') {
      throw new TypeError('answer-highlight list request must be an object')
    }
    const items = await this.#storage.list(request.sessionId, request.messageId)
    return { items }
  }

  /**
   * Check whether a message already has annotations.
   *
   * @param {string} sessionId - owning session.
   * @param {string} messageId - assistant message id.
   * @returns {Promise<boolean>} true when records exist.
   */
  hasMessage(sessionId, messageId) {
    return this.#storage.hasMessage(sessionId, messageId)
  }

  /**
   * Close the service and its storage.
   *
   * @returns {Promise<void>} completion promise.
   */
  close() {
    return this.#storage.close()
  }
}
