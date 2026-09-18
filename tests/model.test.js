import test from 'node:test'
import assert from 'node:assert/strict'

import { generateAnnotations } from '../src/model.js'

function textStream(text, delayMs = 0) {
  return async function* stream() {
    if (delayMs > 0) await new Promise(resolve => setTimeout(resolve, delayMs))
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text }
    yield { type: 'block-end', index: 0, block: { type: 'text', text } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

test('generateAnnotations returns validated annotations', async () => {
  const message = {
    id: 'message-model',
    content: [{ type: 'text', text: '这句话是非常重要的内容。后面是补充。' }],
    source: { kind: 'model', provider: 'provider-a', model: 'model-a' },
  }
  const llm = {
    stream(options) {
      assert.equal(options.provider, 'provider-a')
      assert.equal(options.model, 'model-a')
      assert.equal(options.reasoningEffort, 'off')
      assert.equal(options.messages.length, 1)
      assert.equal(options.messages[0].role, 'user')
      assert.ok(Array.isArray(options.messages[0].content))
      assert.equal(options.messages[0].content[0].type, 'text')
      assert.equal(options.messages[0].source.kind, 'plugin')
      assert.equal(options.messages[0].source.plugin, 'dsh-answer-highlight')
      assert.ok(options.messages[0].content[0].text.includes('Question:'))
      assert.ok(options.messages[0].content[0].text.includes('请总结'))
      return textStream('[{"quote":"这句话是非常重要的内容。","kind":"key-point","note":"核心结论"}]')()
    },
  }

  const annotations = await generateAnnotations({
    message,
    question: '请总结',
    llm,
    provider: 'provider-a',
    model: 'model-a',
    sessionId: 'session-model',
  })

  assert.equal(annotations.length, 1)
  assert.equal(annotations[0].start, 0)
})

test('generateAnnotations rejects when the model times out', async () => {
  const message = {
    id: 'message-timeout',
    content: [{ type: 'text', text: '这句话是非常重要的内容。' }],
    source: { kind: 'model', provider: 'provider-a', model: 'model-a' },
  }
  const llm = { stream: () => textStream('[]', 20)() }

  await assert.rejects(
    () => generateAnnotations({
      message,
      question: '请总结',
      llm,
      provider: 'provider-a',
      model: 'model-a',
      sessionId: 'session-timeout',
      options: { timeoutMs: 1 },
    }),
    /timed out/,
  )
})

test('generateAnnotations skips oversized input', async () => {
  const message = {
    id: 'message-large',
    content: [{ type: 'text', text: '这句话是非常重要的内容。' }],
    source: { kind: 'model', provider: 'provider-a', model: 'model-a' },
  }
  let streamCalls = 0
  const llm = {
    stream() {
      streamCalls++
      return textStream('[]')()
    },
  }

  const annotations = await generateAnnotations({
    message,
    question: '请总结',
    llm,
    provider: 'provider-a',
    model: 'model-a',
    sessionId: 'session-large',
    options: { maxInputBytes: 1 },
  })

  assert.deepEqual(annotations, [])
  assert.equal(streamCalls, 0)
})
