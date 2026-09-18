/**
 * Shared structural types for the host pipeline.
 *
 * These are intentionally local to this package. The plugin does not need the
 * full DSH type surface to build or test the pipeline; when it is mounted into
 * DSH, the runtime objects already satisfy these shapes.
 */

/**
 * A visible text block from an assistant message.
 * @typedef {object} TextBlock
 * @property {'text'} type
 * @property {string} text
 */

/**
 * The subset of an assistant message used by the highlighter.
 * @typedef {object} AssistantMessage
 * @property {string} id
 * @property {string} role
 * @property {Array<object>} content
 * @property {{kind?: string, provider?: string, model?: string}} source
 */

/**
 * A user or assistant event envelope used by the host.
 * @typedef {object} SessionEvent
 * @property {string} type
 * @property {object} data
 */

/**
 * Annotation kinds supported by the first version.
 * @typedef {'key-point'|'definition'|'warning'|'question'} AnnotationKind
 */

/**
 * Raw annotation parsed from the model output.
 * @typedef {object} RawAnnotation
 * @property {unknown} quote
 * @property {unknown} contextBefore
 * @property {unknown} contextAfter
 * @property {unknown} kind
 * @property {unknown} note
 */

/**
 * An annotation persisted inside one assistant-message record.
 * @typedef {object} StoredAnnotation
 * @property {string} quote
 * @property {string} [contextBefore]
 * @property {string} [contextAfter]
 * @property {AnnotationKind} kind
 * @property {string} [note]
 * @property {number} start
 * @property {number} end
 */

/**
 * One JSONL record for one assistant message.
 * @typedef {object} AnswerAnnotationRecord
 * @property {string} id
 * @property {string} sessionId
 * @property {string} messageId
 * @property {string} provider
 * @property {string} model
 * @property {number} createdAt
 * @property {StoredAnnotation[]} annotations
 */

/**
 * A validated annotation with a resolved position in the visible answer text.
 * @typedef {object} ValidatedAnnotation
 * @property {string} quote
 * @property {string|undefined} contextBefore
 * @property {string|undefined} contextAfter
 * @property {AnnotationKind} kind
 * @property {string|undefined} note
 * @property {number} start
 * @property {number} end
 */

export {}

/**
 * One located range prepared for CSS Highlight registration.
 * @typedef {object} ClientRenderRange
 * @property {AnnotationKind} kind
 * @property {Range} range
 */

/**
 * Exact Connection Fetch route returned to the DSH host.
 * @typedef {object} AnnotationListRoute
 * @property {string} path
 * @property {string[]} methods
 * @property {'buffered'} requestBody
 * @property {(request: Request) => Promise<Response>} fetch
 */
