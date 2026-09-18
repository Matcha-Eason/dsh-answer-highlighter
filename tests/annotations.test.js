import test from 'node:test'
import assert from 'node:assert/strict'

import { parseAnnotationOutput, validateAnnotations } from '../src/annotations.js'

test('parseAnnotationOutput accepts a JSON array', () => {
  const raw = parseAnnotationOutput('[{"quote":"abc"}]')
  assert.deepEqual(raw, [{ quote: 'abc' }])
})

test('parseAnnotationOutput accepts a fenced JSON array', () => {
  const raw = parseAnnotationOutput('```json\n[]\n```')
  assert.deepEqual(raw, [])
})

test('parseAnnotationOutput rejects non-array JSON', () => {
  assert.throws(() => parseAnnotationOutput('{"quote":"abc"}'), /JSON array/)
})

test('parseAnnotationOutput rejects invalid JSON', () => {
  assert.throws(() => parseAnnotationOutput('not json'), /valid JSON/)
})

test('validateAnnotations keeps a unique quote', () => {
  const text = '这句话是第一条重点内容。后面还有普通说明。'
  const raw = [{ quote: '这句话是第一条重点内容。', kind: 'key-point', note: '开头结论' }]
  const result = validateAnnotations(raw, text)
  assert.equal(result.length, 1)
  assert.equal(result[0].start, 0)
  assert.equal(result[0].end, 12)
})

test('validateAnnotations drops a missing quote', () => {
  const text = '这句话是第一条重点内容。'
  const raw = [{ quote: '不存在的一句话。', kind: 'key-point' }]
  assert.deepEqual(validateAnnotations(raw, text), [])
})

test('validateAnnotations uses context to disambiguate a repeated quote', () => {
  const quote = '这句话是非常重要的内容。'
  const text = `前文${quote}中间${quote}后文`
  const raw = [{
    quote,
    contextBefore: '前文',
    contextAfter: '中间',
    kind: 'key-point',
  }]
  const result = validateAnnotations(raw, text)
  assert.equal(result.length, 1)
  assert.equal(result[0].start, 2)
  assert.equal(result[0].end, 2 + quote.length)
})

test('validateAnnotations drops a repeated quote without context', () => {
  const quote = '这句话是非常重要的内容。'
  const text = `${quote}${quote}`
  const raw = [{ quote, kind: 'key-point' }]
  assert.deepEqual(validateAnnotations(raw, text), [])
})

test('validateAnnotations rejects overlapping ranges', () => {
  const text = '这句话是第一条重点内容，也是最重要的信息。'
  const raw = [
    { quote: '这句话是第一条重点内容，也是最重要的信息。', kind: 'key-point' },
    { quote: '也是最重要的信息。', kind: 'definition' },
  ]
  assert.equal(validateAnnotations(raw, text).length, 1)
})

test('validateAnnotations enforces the maximum count', () => {
  const text = '第一句话是重点内容之一。第二句话是重点内容之二。第三句话是重点内容之三。'
  const raw = [
    { quote: '第一句话是重点内容之一。', kind: 'key-point' },
    { quote: '第二句话是重点内容之二。', kind: 'key-point' },
    { quote: '第三句话是重点内容之三。', kind: 'key-point' },
  ]
  assert.equal(validateAnnotations(raw, text, 2).length, 2)
})

test('validateAnnotations rejects unsupported kind and oversized note', () => {
  const text = '这句话是第一条重点内容。'
  assert.equal(validateAnnotations([{ quote: '这句话是第一条重点内容。', kind: 'other' }], text).length, 0)
  assert.equal(validateAnnotations([{
    quote: '这句话是第一条重点内容。',
    kind: 'key-point',
    note: 'x'.repeat(161),
  }], text).length, 0)
})
