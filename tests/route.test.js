import assert from 'node:assert/strict'
import test from 'node:test'

import { ANNOTATION_LIST_PATH } from '../src/protocol.js'
import { createAnnotationListRoute } from '../src/route.js'

function service(list) {
  return { list }
}

test('annotation list route has an exact GET API path', () => {
  const route = createAnnotationListRoute(service(async () => ({ items: [] })))

  assert.equal(route.path, ANNOTATION_LIST_PATH)
  assert.equal(ANNOTATION_LIST_PATH, '/api/plugins/answer-highlight/annotations')
  assert.deepEqual(route.methods, ['GET'])
  assert.equal(route.requestBody, 'buffered')
})

test('annotation list route rejects a missing sessionId', async () => {
  const route = createAnnotationListRoute(service(async () => {
    throw new Error('list must not run')
  }))

  const response = await route.fetch(new Request('http://dsh.test/api/plugins/answer-highlight/annotations'))

  assert.equal(response.status, 400)
  assert.deepEqual(await response.json(), { error: 'missing sessionId' })
})

test('annotation list route returns annotations without storing them', async () => {
  const items = [{ quote: 'important part', kind: 'key-point', start: 0, end: 14 }]
  const route = createAnnotationListRoute(service(async request => {
    assert.deepEqual(request, { sessionId: 'session-1' })
    return { items }
  }))

  const response = await route.fetch(new Request(
    'http://dsh.test/api/plugins/answer-highlight/annotations?sessionId=session-1',
  ))

  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await response.json(), { items })
})

test('annotation list route hides service failure details', async () => {
  const warnings = []
  const route = createAnnotationListRoute(
    service(async () => { throw new Error('disk exploded') }),
    { warn: (...args) => warnings.push(args) },
  )

  const response = await route.fetch(new Request(
    'http://dsh.test/api/plugins/answer-highlight/annotations?sessionId=session-1',
  ))

  assert.equal(response.status, 500)
  assert.deepEqual(await response.json(), { error: 'annotation list failed' })
  assert.equal(warnings.length, 1)
})
