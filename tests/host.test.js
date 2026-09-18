import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createAnswerHighlightHost } from '../src/host.js'
import { AnswerHighlightService } from '../src/service.js'
import { AnswerHighlightStorage } from '../src/storage.js'

function textStream(text) {
  return async function* stream() {
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text }
    yield { type: 'block-end', index: 0, block: { type: 'text', text } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

test('host annotates a completed assistant message once', async () => {
  const calls = []
  const llm = {
    stream(options) {
      assert.equal(options.provider, 'provider-a')
      assert.equal(options.model, 'model-a')
      assert.equal(options.messages.length, 1)
      return textStream('[{"quote":"这句话是非常重要的内容。","kind":"key-point","note":"核心结论"}]')()
    },
  }

  const host = createAnswerHighlightHost({
    llm,
    onAnnotations: (annotations, context) => {
      calls.push({ annotations, context })
    },
    logger: { warn() {} },
  })

  const session = { id: 'session-1' }
  await host.handleEvent(session, {
    type: 'user/message',
    data: { content: [{ type: 'text', text: '请总结' }], role: 'user', id: 'user-1', source: {} },
  })
  assert.equal(host.sessionQuestions.get('session-1'), '请总结')
  await host.handleEvent(session, {
    type: 'assistant/message',
    data: {
      interrupted: false,
      message: {
        id: 'message-1',
        content: [{ type: 'text', text: '这句话是非常重要的内容。后面是补充。' }],
        source: { kind: 'model', provider: 'provider-a', model: 'model-a' },
      },
    },
  })
  await host.handleEvent(session, {
    type: 'assistant/message',
    data: {
      interrupted: false,
      message: {
        id: 'message-1',
        content: [{ type: 'text', text: '这句话是非常重要的内容。后面是补充。' }],
        source: { kind: 'model', provider: 'provider-a', model: 'model-a' },
      },
    },
  })

  assert.equal(calls.length, 1)
  assert.equal(calls[0].annotations.length, 1)
  assert.equal(calls[0].context.messageId, 'message-1')
})

test('host uses a configured annotation model route', async () => {
  let seen
  const llm = {
    stream(options) {
      seen = options
      return textStream('[]')()
    },
  }
  const host = createAnswerHighlightHost({
    llm,
    logger: { warn() {} },
    options: { provider: 'deepseek-official', model: 'deepseek-flash' },
  })

  await host.handleEvent({ id: 'session-model-route' }, {
    type: 'assistant/message',
    data: {
      interrupted: false,
      message: {
        id: 'message-model-route',
        content: [{ type: 'text', text: '这句话是重点。' }],
        source: { kind: 'model', provider: 'provider-a', model: 'model-a' },
      },
    },
  })

  assert.equal(seen.provider, 'deepseek-official')
  assert.equal(seen.model, 'deepseek-flash')
})

test('host skips interrupted messages', async () => {
  let streamCalls = 0
  const llm = {
    stream() {
      streamCalls++
      return textStream('[]')()
    },
  }
  const host = createAnswerHighlightHost({ llm, logger: { warn() {} } })

  await host.handleEvent({ id: 'session-2' }, {
    type: 'assistant/message',
    data: {
      interrupted: true,
      message: {
        id: 'message-2',
        content: [{ type: 'text', text: 'partial' }],
        source: { kind: 'model', provider: 'p', model: 'm' },
      },
    },
  })

  assert.equal(streamCalls, 0)
})

test('host skips messages without a model route', async () => {
  const warnings = []
  const llm = { stream() { throw new Error('should not be called') } }
  const host = createAnswerHighlightHost({ llm, logger: { warn: message => warnings.push(message) } })

  await host.handleEvent({ id: 'session-3' }, {
    type: 'assistant/message',
    data: {
      message: {
        id: 'message-3',
        content: [{ type: 'text', text: 'text' }],
        source: { kind: 'model' },
      },
    },
  })

  assert.equal(warnings.length, 1)
})

test('host swallows model failures', async () => {
  const warnings = []
  const llm = {
    async *stream() {
      yield { type: 'finish', reason: { kind: 'error', failure: { message: 'boom' } } }
    },
  }
  const host = createAnswerHighlightHost({ llm, logger: { warn: (...args) => warnings.push(args) } })

  await host.handleEvent({ id: 'session-4' }, {
    type: 'assistant/message',
    data: {
      message: {
        id: 'message-4',
        content: [{ type: 'text', text: '这句话是非常重要的内容。' }],
        source: { kind: 'model', provider: 'p', model: 'm' },
      },
    },
  })

  assert.equal(warnings.length, 1)
})

test('host persists annotations and skips them after restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'answer-highlight-'))
  try {
    let modelCalls = 0
    const llm = {
      stream() {
        modelCalls += 1
        return textStream('[{"quote":"这句话是非常重要的内容。","kind":"key-point","note":"核心结论"}]')()
      },
    }
    const service = new AnswerHighlightService({ storage: new AnswerHighlightStorage({ directory }) })
    const event = {
      type: 'assistant/message',
      data: {
        interrupted: false,
        message: {
          id: 'message-1',
          content: [{ type: 'text', text: '这句话是非常重要的内容。后面是补充。' }],
          source: { kind: 'model', provider: 'provider-a', model: 'model-a' },
        },
      },
    }
    const firstHost = createAnswerHighlightHost({ llm, service, logger: { warn() {} } })

    await firstHost.handleEvent({ id: 'session-1' }, event)
    assert.deepEqual(await service.list({ sessionId: 'session-1', messageId: 'message-1' }), {
      items: [{ quote: '这句话是非常重要的内容。', kind: 'key-point', note: '核心结论', start: 0, end: 12 }],
    })

    const secondHost = createAnswerHighlightHost({ llm, service, logger: { warn() {} } })
    await secondHost.handleEvent({ id: 'session-1' }, event)
    assert.equal(modelCalls, 1)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('host persists an empty annotation result and does not call the model again', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'answer-highlight-'))
  try {
    let modelCalls = 0
    const llm = {
      stream() {
        modelCalls += 1
        return textStream('[]')()
      },
    }
    const service = new AnswerHighlightService({ storage: new AnswerHighlightStorage({ directory }) })
    const event = {
      type: 'assistant/message',
      data: {
        interrupted: false,
        message: {
          id: 'message-empty',
          content: [{ type: 'text', text: '这句话是非常重要的内容。' }],
          source: { kind: 'model', provider: 'provider-a', model: 'model-a' },
        },
      },
    }
    const host = createAnswerHighlightHost({ llm, service, logger: { warn() {} } })

    await host.handleEvent({ id: 'session-1' }, event)
    assert.deepEqual(await service.list({ sessionId: 'session-1', messageId: 'message-empty' }), { items: [] })
    assert.equal(await service.hasMessage('session-1', 'message-empty'), true)

    const restartedHost = createAnswerHighlightHost({ llm, service, logger: { warn() {} } })
    await restartedHost.handleEvent({ id: 'session-1' }, event)
    assert.equal(modelCalls, 1)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('host keeps the main answer path when storage writes fail', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'answer-highlight-'))
  try {
    const warnings = []
    const llm = { stream: () => textStream('[]')() }
    const failingStorage = new AnswerHighlightStorage({
      directory,
      fs: {
        mkdir,
        readFile,
        appendFile: async () => {
          throw new Error('write failed')
        },
      },
    })
    const service = new AnswerHighlightService({ storage: failingStorage })
    const host = createAnswerHighlightHost({
      llm,
      service,
      logger: { warn: (...args) => warnings.push(args) },
    })

    await host.handleEvent({ id: 'session-1' }, {
      type: 'assistant/message',
      data: {
        interrupted: false,
        message: {
          id: 'message-1',
          content: [{ type: 'text', text: '这句话是非常重要的内容。' }],
          source: { kind: 'model', provider: 'provider-a', model: 'model-a' },
        },
      },
    })

    assert.equal(warnings.length, 1)
    assert.equal(warnings[0][0], 'answer-highlight: annotation generation failed')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('host skips annotation when the storage lookup fails', async () => {
  const warnings = []
  let modelCalls = 0
  const llm = {
    stream() {
      modelCalls += 1
      throw new Error('should not be called')
    },
  }
  const service = {
    async hasMessage() {
      throw new Error('read failed')
    },
  }
  const host = createAnswerHighlightHost({
    llm,
    service,
    logger: { warn: (...args) => warnings.push(args) },
  })

  await host.handleEvent({ id: 'session-1' }, {
    type: 'assistant/message',
    data: {
      interrupted: false,
      message: {
        id: 'message-1',
        content: [{ type: 'text', text: '这句话是非常重要的内容。' }],
        source: { kind: 'model', provider: 'provider-a', model: 'model-a' },
      },
    },
  })

  assert.equal(modelCalls, 0)
  assert.equal(warnings.length, 1)
  assert.equal(warnings[0][0], 'answer-highlight: storage lookup failed')
})
