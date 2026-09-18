import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { apply, inject, name } from '../src/index.js'
import { AnswerHighlightService } from '../src/service.js'
import { ANNOTATION_LIST_PATH } from '../src/protocol.js'

function textStream(text) {
  return async function* stream() {
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text }
    yield { type: 'block-end', index: 0, block: { type: 'text', text } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

function mountContext(llm = {}) {
  const events = []
  const effects = []
  const routes = []
  const ctx = {
    llm,
    connection: {
      fetch: {
        register(route) {
          routes.push(route)
          return () => {}
        },
      },
    },
    logger: { warn() {} },
    effect(install, label) {
      const dispose = install()
      effects.push({ dispose, label })
      return () => dispose()
    },
    on(type, listener) {
      events.push({ type, listener })
      return () => {}
    },
  }
  return { ctx, events, effects, routes }
}

test('plugin entry registers the host route and event listener', () => {
  const originalClose = AnswerHighlightService.prototype.close
  let closeCalls = 0
  AnswerHighlightService.prototype.close = async function close() {
    closeCalls += 1
  }

  try {
    const { ctx, events, effects, routes } = mountContext()
    apply(ctx, { storageDirectory: './tmp-answer-highlight-data' })

    assert.equal(name, 'answer-highlight')
    assert.deepEqual(inject, ['llm', 'connection'])
    assert.equal(events.length, 1)
    assert.equal(events[0].type, 'session/event')
    assert.equal(routes.length, 1)
    assert.equal(routes[0].path, ANNOTATION_LIST_PATH)
    assert.equal(effects.length, 2)
    assert.equal(effects[0].label, 'answer-highlight: annotation route')
    assert.equal(effects[1].label, 'answer-highlight: storage lifecycle')

    const listenerResult = events[0].listener(
      { id: 'session-1' },
      { type: 'user/message', data: { message: { content: [{ type: 'text', text: 'question' }] } } },
    )
    assert.equal(listenerResult, undefined)

    effects[1].dispose()
    assert.equal(closeCalls, 1)
  } finally {
    AnswerHighlightService.prototype.close = originalClose
  }
})


test('plugin defaults to DeepSeek Flash for annotations', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'answer-highlight-plugin-default-'))
  const calls = []
  let resolveModelCalled
  const modelCalled = new Promise(resolve => {
    resolveModelCalled = resolve
  })
  const llm = {
    stream(options) {
      calls.push(options)
      resolveModelCalled()
      return textStream('[]')()
    },
  }

  try {
    const { ctx, events, effects } = mountContext(llm)
    apply(ctx, { storageDirectory: directory })

    await events[0].listener(
      { id: 'session-default-model' },
      { type: 'user/message', data: { content: [{ type: 'text', text: '请总结' }], role: 'user', source: {} } },
    )
    await events[0].listener(
      { id: 'session-default-model' },
      {
        type: 'assistant/message',
        data: {
          interrupted: false,
          message: {
            id: 'message-default-model',
            content: [{ type: 'text', text: '这句话是重点。' }],
            source: { kind: 'model', provider: 'provider-a', model: 'model-a' },
          },
        },
      },
    )

    await modelCalled

    assert.equal(calls.length, 1)
    assert.equal(calls[0].provider, 'deepseek-official')
    assert.equal(calls[0].model, 'deepseek-flash')

    effects[1].dispose()
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
