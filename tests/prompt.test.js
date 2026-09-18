import assert from 'node:assert/strict'
import test from 'node:test'

import { buildAnnotationPrompt } from '../src/prompt.js'

test('prompt asks for self-contained key-point spans', () => {
  const { system } = buildAnnotationPrompt({
    question: '请总结',
    answer: '第一段是重点。',
    maxAnnotations: 5,
  })

  assert.equal(system.includes('For kind "key-point", prefer one complete paragraph or one contiguous self-contained span.'), true)
  assert.equal(system.includes('A key-point quote must be understandable without reading before or after it.'), true)
  assert.equal(system.includes('If a key-point depends on pronouns, omitted subjects, or deixis, include the antecedent in the quote or choose another key point.'), true)
  assert.equal(system.includes('Do not use contextBefore or contextAfter to make a key-point readable.'), true)
  assert.equal(system.includes('A key-point quote should stay inside one Markdown block.'), true)
})
