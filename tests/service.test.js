import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { AnswerHighlightService } from '../src/service.js'
import { AnswerHighlightStorage } from '../src/storage.js'

test('service saves, lists, checks messages, and closes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'answer-highlight-'))
  try {
    const storage = new AnswerHighlightStorage({ directory })
    const service = new AnswerHighlightService({ storage })
    const item = {
      quote: '这句话是非常重要的内容。',
      kind: 'key-point',
      note: '先看这里',
      start: 0,
      end: 12,
    }

    const saved = await service.save({
      sessionId: 'session-1',
      messageId: 'message-1',
      annotations: [item],
      provider: 'provider-a',
      model: 'model-a',
    })

    assert.deepEqual(saved, [item])
    assert.deepEqual(await service.list({ sessionId: 'session-1' }), { items: [item] })
    assert.deepEqual(await service.list({ sessionId: 'session-1', messageId: 'missing' }), { items: [] })
    assert.equal(await service.hasMessage('session-1', 'message-1'), true)
    assert.equal(await service.hasMessage('session-1', 'missing'), false)

    await service.save({ sessionId: 'session-1', messageId: 'message-empty', annotations: [], provider: 'provider-a', model: 'model-a' })
    assert.deepEqual(await service.list({ sessionId: 'session-1', messageId: 'message-empty' }), { items: [] })
    assert.equal(await service.hasMessage('session-1', 'message-empty'), true)

    await service.close()
    await assert.rejects(service.list({ sessionId: 'session-1' }), /closed/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('service validates the list request shape', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'answer-highlight-'))
  try {
    const service = new AnswerHighlightService({ storage: new AnswerHighlightStorage({ directory }) })

    await assert.rejects(service.list(null), TypeError)
    await assert.rejects(service.list('session-1'), TypeError)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
