/**
 * Text extraction and Markdown-to-visible-text projection.
 *
 * The model sees a projection that is close to what the browser renders. The
 * browser remains the final authority; if a quote cannot be located there, the
 * annotation is dropped.
 */

/**
 * Extract visible text blocks from a DSH message.
 *
 * @param {AssistantMessage} message - message containing content blocks.
 * @returns {string} text blocks joined by two newlines.
 */
export function messageText(message) {
  if (message === null || typeof message !== 'object' || !Array.isArray(message.content)) return ''
  return message.content
    .filter(block => block !== null && typeof block === 'object' && block.type === 'text')
    .map(block => typeof block.text === 'string' ? block.text : '')
    .join('\n\n')
}

/**
 * Convert common Markdown source to visible text.
 *
 * This is a conservative projection, not a Markdown renderer. It removes
 * formatting syntax that the browser would not show, while preserving code
 * blocks and ordinary punctuation.
 *
 * @param {string} text - Markdown source text.
 * @returns {string} visible text projection.
 */
export function toVisibleText(text) {
  if (typeof text !== 'string') return ''
  const lines = text.split('\n')
  const output = []
  let inFence = false
  let fenceMarker = ''

  for (const line of lines) {
    const fence = fenceMatch(line)
    if (fence !== undefined) {
      if (!inFence) {
        inFence = true
        fenceMarker = fence
      } else if (fence === fenceMarker) {
        inFence = false
        fenceMarker = ''
      }
      continue
    }

    if (inFence) {
      output.push(line)
      continue
    }

    if (isTableSeparator(line)) continue
    output.push(projectLine(line))
  }

  return output.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * Match a Markdown fence opener or closer.
 *
 * @param {string} line - source line.
 * @returns {string|undefined} fence marker, or undefined when the line is not a fence.
 */
function fenceMatch(line) {
  const trimmed = line.trimStart()
  if (trimmed.startsWith('```')) return '```'
  if (trimmed.startsWith('~~~')) return '~~~'
  return undefined
}

/**
 * Project one non-code Markdown line to visible text.
 *
 * @param {string} line - source line outside a fenced code block.
 * @returns {string} projected line.
 */
function projectLine(line) {
  let value = line
  value = value.replace(/^[ \t]{0,3}#{1,6}[ \t]+/, '')
  value = value.replace(/^[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+/, '')
  value = value.replace(/^[ \t]*>[ \t]?/, '')
  value = value.replace(/\[([^\]]*)\]\(([^)]*)\)/g, '$1')
  value = value.replace(/`([^`]*)`/g, '$1')
  value = value.replace(/\*\*([^*]+)\*\*/g, '$1')
  value = value.replace(/\*([^*]+)\*/g, '$1')
  if (isTableRow(value)) return projectTableRow(value)
  return value
}

/** Whether one Markdown line is a GFM table separator row. */
function isTableSeparator(line) {
  if (!isTableRow(line)) return false
  const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|')
  return cells.every(cell => /^:?-{3,}:?$/.test(cell.trim()))
}

/** Whether one Markdown line is a GFM table row. */
function isTableRow(line) {
  return /^\|.*\|$/.test(line.trim())
}

/** Project one GFM table row to the text the browser's DOM concatenates. */
function projectTableRow(line) {
  const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|')
  return cells.map(cell => projectInline(cell.trim())).join('')
}

/** Project one table cell without touching underscores. */
function projectInline(value) {
  return value
    .replace(/\[([^\]]*)\]\(([^)]*)\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
}

/**
 * Count Unicode code points in a string.
 *
 * @param {string} value - text to count.
 * @returns {number} number of code points.
 */
export function codePointLength(value) {
  return [...value].length
}

/**
 * Measure UTF-8 byte length without depending on Node's Buffer.
 *
 * @param {string} value - text to measure.
 * @returns {number} byte length.
 */
export function utf8Length(value) {
  return new TextEncoder().encode(value).length
}
