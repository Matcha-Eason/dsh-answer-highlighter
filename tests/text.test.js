import test from 'node:test'
import assert from 'node:assert/strict'

import { messageText, toVisibleText, codePointLength, utf8Length } from '../src/text.js'

test('messageText extracts only text blocks', () => {
  const message = {
    content: [
      { type: 'text', text: 'first' },
      { type: 'reasoning', text: 'hidden' },
      { type: 'text', text: 'second' },
    ],
  }
  assert.equal(messageText(message), 'first\n\nsecond')
})

test('toVisibleText removes common Markdown syntax', () => {
  const markdown = [
    '## 结论',
    '',
    '**重点**是 `route` 和 [链接](https://example.com)。',
    '- 第一项',
    '1. 第二项',
    '> 引用',
  ].join('\n')

  assert.equal(
    toVisibleText(markdown),
    [
      '结论',
      '',
      '重点是 route 和 链接。',
      '第一项',
      '第二项',
      '引用',
    ].join('\n'),
  )
})

test('toVisibleText preserves table cells and code identifiers', () => {
  const markdown = [
    '| 工具 | 说明 |',
    '|---|---|',
    '| `invoke_child_capability` | 调用子智能体 |',
  ].join('\n')

  assert.equal(toVisibleText(markdown), '工具说明\ninvoke_child_capability调用子智能体')
})

test('toVisibleText preserves fenced code and removes fences', () => {
  const markdown = [
    '说明',
    '',
    '```ts',
    'const value = 1',
    '```',
    '',
    '结束',
  ].join('\n')

  assert.equal(toVisibleText(markdown), '说明\n\nconst value = 1\n\n结束')
})

test('codePointLength counts Unicode code points', () => {
  assert.equal(codePointLength('🎉a'), 2)
})

test('utf8Length counts bytes', () => {
  assert.equal(utf8Length('a🎉'), 5)
})
