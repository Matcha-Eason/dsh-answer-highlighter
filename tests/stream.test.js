import test from 'node:test'
import assert from 'node:assert/strict'

import { collectTextFromStream } from '../src/stream.js'

test('collectTextFromStream assembles text blocks', async () => {
  async function* stream() {
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: 'hello ' }
    yield { type: 'text-delta', index: 0, text: 'world' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: 'hello world' } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }

  assert.equal(await collectTextFromStream(stream()), 'hello world')
})

test('collectTextFromStream supports delta-only streams', async () => {
  async function* stream() {
    yield { type: 'text-delta', index: 0, text: 'one' }
    yield { type: 'text-delta', index: 1, text: 'two' }
  }

  assert.equal(await collectTextFromStream(stream()), 'onetwo')
})

test('collectTextFromStream rejects non-stop finish reasons', async () => {
  async function* stream() {
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: 'partial' }
    yield { type: 'finish', reason: { kind: 'max-tokens' } }
  }

  await assert.rejects(() => collectTextFromStream(stream()), /max-tokens/)
})

test('collectTextFromStream rejects tool calls', async () => {
  async function* stream() {
    yield { type: 'block-start', index: 0, blockType: 'tool-call' }
    yield {
      type: 'block-end',
      index: 0,
      block: { type: 'tool-call', id: 'call-1', name: 'tool', arguments: '{}' },
    }
    yield { type: 'finish', reason: { kind: 'tool-calls' } }
  }

  await assert.rejects(() => collectTextFromStream(stream()), /tool call/)
})
