import assert from 'node:assert/strict'
import test from 'node:test'

import {
  clearAnswerHighlights,
  highlightName,
  installHighlightStyles,
  renderAnswerHighlights,
} from '../src/highlight.js'

class FakeHighlight {
  constructor(...ranges) {
    this.ranges = ranges
  }
}

class FakeRange {
  constructor(id) {
    this.id = id
  }

  setStart() {}

  setEnd() {}
}

function fakeDocument() {
  const styles = []
  const document = {
    styles,
    querySelector(selector) {
      return styles.find(style => selector === 'style[data-answer-highlight]') ?? null
    },
    createElement() {
      return {
        removed: false,
        remove() {
          this.removed = true
          const index = styles.indexOf(this)
          if (index >= 0) styles.splice(index, 1)
        },
        setAttribute(name, value) {
          this[name] = value
        },
      }
    },
    head: {
      appendChild(style) {
        styles.push(style)
      },
    },
  }
  return document
}

function highlightApi() {
  const css = { highlights: new Map() }
  return { css, Highlight: FakeHighlight }
}

test('highlight names are stable for the four kinds', () => {
  assert.equal(highlightName('key-point'), 'answer-key-point')
  assert.equal(highlightName('definition'), 'answer-definition')
  assert.equal(highlightName('warning'), 'answer-warning')
  assert.equal(highlightName('question'), 'answer-question')
  assert.throws(() => highlightName('other'))
})

test('render groups ranges by kind and replaces previous highlights', () => {
  const document = fakeDocument()
  const { css, Highlight } = highlightApi()
  const first = new FakeRange('first')
  const second = new FakeRange('second')
  const third = new FakeRange('third')

  assert.equal(renderAnswerHighlights([
    { kind: 'key-point', range: first },
    { kind: 'warning', range: second },
  ], { document, css, Highlight }), true)
  assert.equal(css.highlights.get('answer-key-point').ranges[0], first)
  assert.equal(css.highlights.get('answer-warning').ranges[0], second)

  renderAnswerHighlights([
    { kind: 'key-point', range: third },
  ], { document, css, Highlight })
  assert.equal(css.highlights.size, 1)
  assert.equal(css.highlights.get('answer-key-point').ranges[0], third)
  assert.equal(css.highlights.has('answer-warning'), false)
})

test('styles are injected once and cleanup removes both highlight and style', () => {
  const document = fakeDocument()
  const { css, Highlight } = highlightApi()
  const range = new FakeRange('range')

  const firstStyle = installHighlightStyles(document)
  renderAnswerHighlights([{ kind: 'definition', range }], { document, css, Highlight })
  const secondStyle = installHighlightStyles(document)

  assert.equal(firstStyle, secondStyle)
  assert.equal(document.styles.length, 1)
  assert.equal(document.styles[0].textContent.includes('::highlight(answer-definition)'), true)
  assert.equal(document.styles[0].textContent.includes('--answer-highlight-key-point'), true)
  assert.equal(document.styles[0].textContent.includes('--answer-highlight-definition'), true)
  assert.equal(document.styles[0].textContent.includes('--answer-highlight-warning'), true)
  assert.equal(document.styles[0].textContent.includes('--answer-highlight-question'), true)
  assert.equal(document.styles[0].textContent.includes('body[data-ds-dark-theme]'), true)

  clearAnswerHighlights({ document, css })
  assert.equal(css.highlights.size, 0)
  assert.equal(document.styles.length, 0)
})

test('unsupported browsers keep the page unchanged', () => {
  const document = fakeDocument()
  const warnings = []
  const logger = { warn: message => warnings.push(message) }

  assert.equal(renderAnswerHighlights([], {
    document,
    css: {},
    Highlight: FakeHighlight,
    logger,
  }), false)
  assert.equal(document.styles.length, 0)
  assert.equal(warnings.length, 1)
})
