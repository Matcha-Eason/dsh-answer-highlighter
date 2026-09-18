import assert from 'node:assert/strict'
import test from 'node:test'

import {
  currentSessionId,
  locateAnnotationsInRows,
  rangesStillConnected,
  renderSignature,
  requestAnnotations,
} from '../src/client.js'

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

function row(value, key) {
  const paragraph = { localName: 'p', children: [], parentElement: undefined }
  const root = {
    localName: 'div',
    children: [paragraph],
    parentElement: undefined,
    dataset: { chatFlowKey: key },
  }
  paragraph.parentElement = root
  const node = { nodeType: 4, data: value, children: [], parentElement: paragraph }
  paragraph.children.push(node)
  return root
}

function environment() {
  return {
    createTreeWalker: (node, whatToShow, filter) => new FakeTreeWalker(node, filter),
    createRange: () => new FakeRange(),
  }
}

test('client reads the current session id', () => {
  const ctx = {
    uiSession: {
      adapter: { current: { getSnapshot: () => ({ key: 'session-1' }) } },
    },
  }

  assert.equal(currentSessionId(ctx), 'session-1')
  assert.equal(currentSessionId({}), undefined)
})

test('client keeps an annotation found in one assistant row only', () => {
  const rows = [row('first unique sentence'), row('other answer')]
  const annotation = { kind: 'key-point', quote: 'unique sentence' }

  const ranges = locateAnnotationsInRows(rows, [annotation], environment())

  assert.equal(ranges.length, 1)
  assert.equal(ranges[0].kind, 'key-point')
  assert.equal(ranges[0].range.startOffset, 6)
  assert.equal(ranges[0].range.endOffset, 21)
})

test('client drops an annotation repeated across assistant rows', () => {
  const rows = [row('same sentence'), row('same sentence')]
  const annotation = { kind: 'warning', quote: 'same sentence' }

  assert.deepEqual(locateAnnotationsInRows(rows, [annotation], environment()), [])
})

test('client drops an annotation repeated inside one assistant row', () => {
  const rows = [row('target text target text')]
  const annotation = { kind: 'definition', quote: 'target' }

  assert.deepEqual(locateAnnotationsInRows(rows, [annotation], environment()), [])
})

test('client signature changes when mounted rows change', () => {
  const annotation = { kind: 'key-point', quote: 'unique sentence' }
  const first = renderSignature('session-1', [annotation], [row('a', 'row-1')])
  const second = renderSignature('session-1', [annotation], [row('a', 'row-2')])

  assert.notEqual(first, second)
})

test('client checks whether old ranges remain connected', () => {
  const connected = {
    range: { startContainer: { isConnected: true }, endContainer: { isConnected: true } },
  }
  const disconnected = {
    range: { startContainer: { isConnected: true }, endContainer: { isConnected: false } },
  }

  assert.equal(rangesStillConnected([connected]), true)
  assert.equal(rangesStillConnected([connected, disconnected]), false)
})

test('client requests and validates the annotation list', async () => {
  const items = [{ kind: 'key-point', quote: 'important sentence' }]
  const fetch = async (url, init) => {
    assert.equal(url, '/api/plugins/answer-highlight/annotations?sessionId=session-1')
    assert.equal(init.cache, 'no-store')
    return Response.json({ items })
  }

  assert.deepEqual(await requestAnnotations('session-1', { fetch }), items)
})

test('client rejects a malformed annotation list response', async () => {
  const fetch = async () => Response.json({ annotations: [] })

  await assert.rejects(
    () => requestAnnotations('session-1', { fetch }),
    /no annotation list/,
  )
})
