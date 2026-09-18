import test from 'node:test'
import assert from 'node:assert/strict'
import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { AnswerHighlightStorage } from '../src/storage.js'

function annotation(overrides = {}) {
  return {
    quote: '这句话是非常重要的内容。',
    contextBefore: '前面',
    contextAfter: '后面',
    kind: 'key-point',
    note: '先看这里',
    start: 2,
    end: 14,
    ...overrides,
  }
}

async function withTempDirectory(run) {
  const directory = await mkdtemp(join(tmpdir(), 'answer-highlight-'))
  try {
    await run(directory)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}


test('storage saves one message record and lists by message', async () => {
  await withTempDirectory(async directory => {
    const storage = new AnswerHighlightStorage({
      directory,
      now: () => 123,
      idFactory: () => 'record-1',
    })
    const first = annotation()
    const second = annotation({ quote: '另一句也很重要。', note: '补充', start: 20, end: 30 })

    await storage.save({
      sessionId: 'session-1',
      messageId: 'message-1',
      annotations: [first],
      provider: 'provider-a',
      model: 'model-a',
    })
    await storage.save({
      sessionId: 'session-1',
      messageId: 'message-2',
      annotations: [second],
      provider: 'provider-a',
      model: 'model-a',
    })

    assert.deepEqual(await storage.list('session-1'), [first, second])
    assert.deepEqual(await storage.list('session-1', 'message-2'), [second])
    assert.deepEqual(await storage.list('session-1', 'missing'), [])

    const lines = (await readFile(join(directory, 'session-1.jsonl'), 'utf8')).trim().split('\n')
    assert.equal(lines.length, 2)
    assert.deepEqual(JSON.parse(lines[0]), {
      id: 'record-1',
      sessionId: 'session-1',
      messageId: 'message-1',
      provider: 'provider-a',
      model: 'model-a',
      createdAt: 123,
      annotations: [first],
    })
  })
})

test('storage keeps the first record for a repeated message', async () => {
  await withTempDirectory(async directory => {
    const storage = new AnswerHighlightStorage({
      directory,
      idFactory: () => 'record-1',
      now: () => 123,
    })
    const first = annotation()
    const replacement = annotation({ note: 'changed' })

    const savedFirst = await storage.save({ sessionId: 'session-1', messageId: 'message-1', annotations: [first], provider: 'p', model: 'm' })
    const savedSecond = await storage.save({ sessionId: 'session-1', messageId: 'message-1', annotations: [replacement], provider: 'p', model: 'm' })

    assert.deepEqual(savedFirst, [first])
    assert.deepEqual(savedSecond, [first])
    const lines = (await readFile(join(directory, 'session-1.jsonl'), 'utf8')).trim().split('\n')
    assert.equal(lines.length, 1)
  })
})

test('storage persists an empty message record for deduplication', async () => {
  await withTempDirectory(async directory => {
    const storage = new AnswerHighlightStorage({ directory })
    const saved = await storage.save({ sessionId: 'session-1', messageId: 'message-1', annotations: [], provider: 'p', model: 'm' })

    assert.deepEqual(saved, [])
    assert.deepEqual(await storage.list('session-1'), [])
    const line = (await readFile(join(directory, 'session-1.jsonl'), 'utf8')).trim()
    assert.equal(JSON.parse(line).messageId, 'message-1')
    assert.equal(await storage.hasMessage('session-1', 'missing'), false)

    const lines = (await readFile(join(directory, 'session-1.jsonl'), 'utf8')).trim().split('\n')
    assert.equal(lines.length, 1)
    assert.deepEqual(JSON.parse(lines[0]).annotations, [])
  })
})

test('storage skips invalid JSON lines', async () => {
  await withTempDirectory(async directory => {
    const valid = {
      id: 'record-1',
      sessionId: 'session-1',
      messageId: 'message-1',
      provider: 'p',
      model: 'm',
      createdAt: 123,
      annotations: [annotation()],
    }
    const text = [
      '{broken json',
      JSON.stringify(valid),
      JSON.stringify({ ...valid, messageId: 'message-2', annotations: [] }),
    ].join('\n')

    await writeFile(join(directory, 'session-1.jsonl'), `${text}\n`, 'utf8')
    const storage = new AnswerHighlightStorage({ directory })

    assert.deepEqual(await storage.list('session-1'), [annotation()])
    assert.equal(await storage.hasMessage('session-1', 'message-2'), true)
  })
})

test('storage serializes concurrent writes for one session', async () => {
  await withTempDirectory(async directory => {
    let activeAppends = 0
    let maxActiveAppends = 0
    const storage = new AnswerHighlightStorage({
      directory,
      fs: {
        mkdir,
        readFile,
        appendFile: async (...args) => {
          activeAppends += 1
          maxActiveAppends = Math.max(maxActiveAppends, activeAppends)
          await new Promise(resolve => setImmediate(resolve))
          activeAppends -= 1
          return appendFile(...args)
        },
      },
    })

    await Promise.all([
      storage.save({ sessionId: 'session-1', messageId: 'message-1', annotations: [annotation()], provider: 'p', model: 'm' }),
      storage.save({ sessionId: 'session-1', messageId: 'message-2', annotations: [annotation({ note: 'second' })], provider: 'p', model: 'm' }),
    ])

    assert.equal(maxActiveAppends, 1)
    assert.equal((await storage.list('session-1')).length, 2)
    const lines = (await readFile(join(directory, 'session-1.jsonl'), 'utf8')).trim().split('\n')
    assert.equal(lines.length, 2)
    assert.deepEqual(new Set(lines.map(line => JSON.parse(line).messageId)), new Set(['message-1', 'message-2']))
  })
})

test('storage rejects operations after close', async () => {
  await withTempDirectory(async directory => {
    const storage = new AnswerHighlightStorage({ directory })
    await storage.save({ sessionId: 'session-1', messageId: 'message-1', annotations: [], provider: 'p', model: 'm' })
    await storage.close()

    await assert.rejects(storage.save({ sessionId: 'session-1', messageId: 'message-2', annotations: [], provider: 'p', model: 'm' }), /closed/)
    await assert.rejects(storage.list('session-1'), /closed/)
    await assert.rejects(storage.hasMessage('session-1', 'message-1'), /closed/)
  })
})

test('storage rejects an invalid annotation before writing', async () => {
  await withTempDirectory(async directory => {
    const storage = new AnswerHighlightStorage({ directory })
    const invalid = annotation({ quote: 1 })

    await assert.rejects(storage.save({ sessionId: 'session-1', messageId: 'message-1', annotations: [invalid], provider: 'p', model: 'm' }), TypeError)
    assert.deepEqual(await storage.list('session-1'), [])
    await assert.rejects(readFile(join(directory, 'session-1.jsonl'), 'utf8'), { code: 'ENOENT' })
  })
})

test('storage close waits for an append that has already started', async () => {
  await withTempDirectory(async directory => {
    let releaseAppend
    const appendContinues = new Promise(resolve => {
      releaseAppend = resolve
    })
    let signalAppendStarted
    const appendStarted = new Promise(resolve => {
      signalAppendStarted = resolve
    })
    const storage = new AnswerHighlightStorage({
      directory,
      fs: {
        mkdir,
        readFile,
        appendFile: async (...args) => {
          signalAppendStarted()
          await appendContinues
          return appendFile(...args)
        },
      },
    })

    const saving = storage.save({ sessionId: 'session-1', messageId: 'message-1', annotations: [], provider: 'p', model: 'm' })
    await appendStarted
    const closing = storage.close()
    releaseAppend()

    await saving
    await closing
    const line = (await readFile(join(directory, 'session-1.jsonl'), 'utf8')).trim()
    assert.equal(JSON.parse(line).messageId, 'message-1')
  })
})
