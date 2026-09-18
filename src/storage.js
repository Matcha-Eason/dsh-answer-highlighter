/**
 * JSONL storage for answer annotations.
 *
 * One file stores one session. Writes are serialized per session in-process so
 * concurrent annotation saves cannot interleave JSONL records.
 */

import { mkdir, readFile, appendFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

const KINDS = new Set(['key-point', 'definition', 'warning', 'question'])

/**
 * Create a storage instance.
 *
 * @param {object} input - storage input.
 * @param {string} input.directory - directory that will contain session JSONL files.
 * @param {object} [input.fs] - filesystem shim for tests.
 * @param {() => number} [input.now] - clock shim for tests.
 * @param {() => string} [input.idFactory] - id factory for tests.
 */
export class AnswerHighlightStorage {
  #directory
  #fs
  #now
  #idFactory
  #locks = new Map()
  #closed = false

  constructor({
    directory,
    fs = { mkdir, readFile, appendFile },
    now = () => Date.now(),
    idFactory = () => randomUUID(),
  } = {}) {
    if (typeof directory !== 'string' || directory.length === 0) {
      throw new TypeError('answer-highlight storage requires a directory')
    }
    this.#directory = directory
    this.#fs = fs
    this.#now = now
    this.#idFactory = idFactory
  }

  /**
   * Append annotations for one assistant message.
   *
   * Existing annotations for the same message are kept. The method returns the
   * current records for that message, so a duplicate call does not create a
   * second set.
   *
   * @param {object} input - save input.
   * @param {string} input.sessionId - owning session.
   * @param {string} input.messageId - owning assistant message.
   * @param {StoredAnnotation[]} input.annotations - validated annotations.
   * @param {string} input.provider - model provider used for the annotation call.
   * @param {string} input.model - model id used for the annotation call.
   * @returns {Promise<StoredAnnotation[]>} annotations stored for the message.
   */
  async save({ sessionId, messageId, annotations, provider, model }) {
    assertId(sessionId, 'sessionId')
    assertId(messageId, 'messageId')
    if (typeof provider !== 'string' || provider.length === 0) {
      throw new TypeError('answer-highlight storage requires provider')
    }
    if (typeof model !== 'string' || model.length === 0) {
      throw new TypeError('answer-highlight storage requires model')
    }
    if (!Array.isArray(annotations) || !annotations.every(isAnnotation)) {
      throw new TypeError('answer-highlight storage requires valid annotations')
    }

    return this.#withLock(sessionId, async () => {
      if (this.#closed) throw new Error('answer-highlight storage is closed')

      const file = this.#fileFor(sessionId)
      const records = await this.#read(sessionId)

      if (records.some(record => record.messageId === messageId)) {
        const existing = records.find(record => record.messageId === messageId)
        return existing.annotations
      }

      const createdAt = this.#now()
      const record = {
        id: this.#idFactory(),
        sessionId,
        messageId,
        provider,
        model,
        createdAt,
        annotations: annotations.map(annotation => ({
          quote: annotation.quote,
          ...(annotation.contextBefore === undefined ? {} : { contextBefore: annotation.contextBefore }),
          ...(annotation.contextAfter === undefined ? {} : { contextAfter: annotation.contextAfter }),
          kind: annotation.kind,
          ...(annotation.note === undefined ? {} : { note: annotation.note }),
          start: annotation.start,
          end: annotation.end,
        })),
      }

      await this.#fs.mkdir(this.#directory, { recursive: true })
      await this.#fs.appendFile(file, `${JSON.stringify(record)}\n`, 'utf8')

      return record.annotations
    })
  }

  /**
   * List annotations for one session, optionally narrowed to one message.
   *
   * @param {string} sessionId - owning session.
   * @param {string} [messageId] - optional assistant message id.
   * @returns {Promise<StoredAnnotation[]>} stored annotations.
   */
  async list(sessionId, messageId) {
    assertId(sessionId, 'sessionId')
    if (messageId !== undefined) assertId(messageId, 'messageId')

    return this.#withLock(sessionId, async () => {
      if (this.#closed) throw new Error('answer-highlight storage is closed')
      const records = await this.#read(sessionId)
      const selected = messageId === undefined ? records : records.filter(record => record.messageId === messageId)
      return selected.flatMap(record => record.annotations)
    })
  }

  /**
   * Check whether one assistant message already has a stored record.
   *
   * Empty annotations are also stored as a message record, so a message with
   * no annotations is not generated again.
   *
   * @param {string} sessionId - owning session.
   * @param {string} messageId - assistant message id.
   * @returns {Promise<boolean>} true when a message record exists.
   */
  async hasMessage(sessionId, messageId) {
    assertId(sessionId, 'sessionId')
    assertId(messageId, 'messageId')

    return this.#withLock(sessionId, async () => {
      if (this.#closed) throw new Error('answer-highlight storage is closed')
      const records = await this.#read(sessionId)
      return records.some(record => record.messageId === messageId)
    })
  }

  /**
   * Wait for in-process writes to finish and prevent later writes.
   *
   * @returns {Promise<void>} completion promise.
   */
  async close() {
    this.#closed = true
    await Promise.all([...this.#locks.values()].map(tail => tail.then(() => undefined, () => undefined)))
    this.#locks.clear()
  }

  /**
   * Serialize operations for one session.
   *
   * @template T
   * @param {string} sessionId - session to lock.
   * @param {() => Promise<T>} operation - operation to serialize.
   * @returns {Promise<T>} operation result.
   */
  async #withLock(sessionId, operation) {
    const previous = this.#locks.get(sessionId) ?? Promise.resolve()
    const result = previous.then(operation, operation)
    const tail = result.then(() => undefined, () => undefined)
    this.#locks.set(sessionId, tail)
    return result.finally(() => {
      if (this.#locks.get(sessionId) === tail) this.#locks.delete(sessionId)
    })
  }

  /**
   * Read and validate one session file.
   *
   * @param {string} sessionId - owning session.
   * @returns {Promise<AnswerAnnotationRecord[]>} valid records.
   */
  async #read(sessionId) {
    try {
      const text = await this.#fs.readFile(this.#fileFor(sessionId), 'utf8')
      return parseRecords(text, sessionId)
    } catch (error) {
      if (error !== null && typeof error === 'object' && error.code === 'ENOENT') return []
      throw error
    }
  }

  /**
   * Build a safe filename for one session.
   *
   * @param {string} sessionId - session id.
   * @returns {string} absolute or directory-relative JSONL path.
   */
  #fileFor(sessionId) {
    return join(this.#directory, `${encodeURIComponent(sessionId)}.jsonl`)
  }
}

/**
 * Parse JSONL text into valid records.
 *
 * @param {string} text - JSONL content.
 * @param {string} sessionId - expected session id.
 * @returns {AnswerAnnotationRecord[]} valid records.
 */
function parseRecords(text, sessionId) {
  if (typeof text !== 'string' || text.length === 0) return []

  const records = []
  for (const line of text.split('\n')) {
    if (line.trim().length === 0) continue
    try {
      const value = JSON.parse(line)
      if (isRecord(value, sessionId)) records.push(value)
    } catch {
      continue
    }
  }
  return records
}

/**
 * Check whether one parsed JSON value is a valid annotation record.
 *
 * @param {unknown} value - parsed JSON value.
 * @param {string} sessionId - expected session id.
 * @returns {boolean} true when the value is valid.
 */
function isRecord(value, sessionId) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value
  return typeof record.id === 'string'
    && record.id.length > 0
    && record.sessionId === sessionId
    && typeof record.messageId === 'string'
    && record.messageId.length > 0
    && typeof record.provider === 'string'
    && record.provider.length > 0
    && typeof record.model === 'string'
    && record.model.length > 0
    && typeof record.createdAt === 'number'
    && Number.isInteger(record.createdAt)
    && Array.isArray(record.annotations)
    && record.annotations.every(isAnnotation)
}

/**
 * Check whether one annotation inside a message record is valid.
 *
 * @param {unknown} value - parsed annotation.
 * @returns {boolean} true when the annotation is valid.
 */
function isAnnotation(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const annotation = value
  return typeof annotation.quote === 'string'
    && annotation.quote.length > 0
    && typeof annotation.kind === 'string'
    && KINDS.has(annotation.kind)
    && typeof annotation.start === 'number'
    && Number.isInteger(annotation.start)
    && annotation.start >= 0
    && typeof annotation.end === 'number'
    && Number.isInteger(annotation.end)
    && annotation.end > annotation.start
    && (annotation.contextBefore === undefined || typeof annotation.contextBefore === 'string')
    && (annotation.contextAfter === undefined || typeof annotation.contextAfter === 'string')
    && (annotation.note === undefined || typeof annotation.note === 'string')
}

/**
 * Assert a nonempty string id.
 *
 * @param {unknown} value - value to check.
 * @param {string} name - field name for the error message.
 */
function assertId(value, name) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`answer-highlight storage requires ${name}`)
  }
}
