import assert from 'node:assert/strict'
import test from 'node:test'

import { collectTextNodes, locateAnnotation, locateRange } from '../src/locate.js'

class FakeTreeWalker {
  #nodes
  #filter
  #index

  constructor(root, filter) {
    this.#nodes = []
    this.#filter = filter
    this.#index = 0
    this.#visit(root)
  }

  nextNode() {
    while (this.#index < this.#nodes.length) {
      const node = this.#nodes[this.#index]
      this.#index += 1
      if (this.#filter.acceptNode(node) === 1) return node
    }
    return null
  }

  #visit(node) {
    for (const child of node.children ?? []) {
      this.#nodes.push(child)
      this.#visit(child)
    }
  }
}

class FakeRange {
  setStart(node, offset) {
    this.startContainer = node
    this.startOffset = offset
  }

  setEnd(node, offset) {
    this.endContainer = node
    this.endOffset = offset
  }
}

function element(localName, children = []) {
  return { localName, children, parentElement: undefined }
}

function text(value, parent) {
  const node = { nodeType: 4, data: value, children: [], parentElement: parent }
  parent.children.push(node)
  return node
}

function connect(root) {
  const stack = [root]
  while (stack.length > 0) {
    const node = stack.pop()
    for (const child of node.children ?? []) {
      child.parentElement = node
      stack.push(child)
    }
  }
  return root
}

function environmentFor(root) {
  return {
    createTreeWalker: (node, whatToShow, filter) => new FakeTreeWalker(node, filter),
    createRange: () => new FakeRange(),
  }
}

test('collectTextNodes skips hidden tags and keeps global offsets', () => {
  const root = connect(element('div', [
    element('p'),
    element('script'),
    element('style'),
  ]))
  const first = text('one ', root.children[0])
  text('hidden', root.children[1])
  text('hidden', root.children[2])
  const second = text('two', root.children[0])

  const nodes = collectTextNodes(root, environmentFor(root))

  assert.equal(nodes.length, 2)
  assert.deepEqual(nodes.map(entry => entry.node), [first, second])
  assert.deepEqual(nodes.map(entry => [entry.start, entry.end]), [[0, 4], [4, 7]])
})

test('locates a unique quote across multiple text nodes', () => {
  const paragraph = element('p')
  const strong = element('strong')
  const root = connect(element('div', [paragraph]))
  const before = text('hello ', paragraph)
  const target = text('world', strong)
  paragraph.children.push(strong)
  const after = text('!', paragraph)

  const range = locateRange(root, 'world', undefined, undefined, environmentFor(root))

  assert.equal(range.startContainer, target)
  assert.equal(range.startOffset, 0)
  assert.equal(range.endContainer, target)
  assert.equal(range.endOffset, 5)
  assert.notEqual(range.startContainer, before)
  assert.notEqual(range.endContainer, after)
})

test('rejects a repeated quote and accepts a unique context anchor', () => {
  const root = connect(element('div', [element('p')]))
  const node = text('alpha target beta target gamma', root.children[0])
  const environment = environmentFor(root)

  assert.equal(locateRange(root, 'target', undefined, undefined, environment), undefined)

  const range = locateRange(root, 'target', 'alpha ', ' beta', environment)
  assert.equal(range.startContainer, node)
  assert.equal(range.startOffset, 6)
  assert.equal(range.endOffset, 12)
})

test('matches after whitespace normalization', () => {
  const root = connect(element('div', [element('p')]))
  const node = text('first   second', root.children[0])

  const range = locateRange(root, 'first second', undefined, undefined, environmentFor(root))

  assert.equal(range.startContainer, node)
  assert.equal(range.startOffset, 0)
  assert.equal(range.endOffset, 14)
})

test('finds code text and projected list text without Markdown markers', () => {
  const root = connect(element('div', [
    element('pre', [element('code')]),
    element('ul', [element('li')]),
  ]))
  const code = text('const value = 1', root.children[0].children[0])
  const item = text('visible item', root.children[1].children[0])
  const environment = environmentFor(root)

  const codeRange = locateRange(root, 'const value = 1', undefined, undefined, environment)
  const itemRange = locateRange(root, 'visible item', undefined, undefined, environment)

  assert.equal(codeRange.startContainer, code)
  assert.equal(itemRange.startContainer, item)
})

test('locateAnnotation forwards quote and context fields', () => {
  const root = connect(element('div', [element('p')]))
  const node = text('alpha answer beta', root.children[0])

  const range = locateAnnotation(root, {
    quote: 'answer',
    contextBefore: 'alpha ',
    contextAfter: ' beta',
    kind: 'key-point',
  }, environmentFor(root))

  assert.equal(range.startContainer, node)
  assert.equal(range.startOffset, 6)
  assert.equal(range.endOffset, 12)
})
