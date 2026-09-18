/**
 * Prompt construction for the annotation model call.
 */

/**
 * Build the system and user prompts for one answer.
 *
 * @param {object} input - prompt input.
 * @param {string} input.question - user question that produced the answer.
 * @param {string} input.answer - visible answer text.
 * @param {number} [input.maxAnnotations=5] - maximum number of annotations.
 * @returns {{system: string, user: string}} prompt pair.
 */
export function buildAnnotationPrompt({ question, answer, maxAnnotations = 5 }) {
  const system = [
    'You annotate AI assistant answers for a reading interface.',
    'Return only a JSON array. Do not return Markdown, prose, or code fences.',
    'Each item must use this schema:',
    '{"quote": string, "contextBefore": string | undefined, "contextAfter": string | undefined, "kind": "key-point" | "definition" | "warning" | "question", "note": string | undefined}',
    `Return 0 to ${maxAnnotations} items.`,
    'quote must be copied exactly from the answer text.',
    'contextBefore and contextAfter are optional short text snippets from the answer that disambiguate repeated quotes.',
    'note is optional and must be at most 160 characters.',
    'For kind "key-point", prefer one complete paragraph or one contiguous self-contained span.',
    'A key-point quote must be understandable without reading before or after it.',
    'If a key-point depends on pronouns, omitted subjects, or deixis, include the antecedent in the quote or choose another key point.',
    'Do not use contextBefore or contextAfter to make a key-point readable.',
    'A key-point quote should stay inside one Markdown block.',
    'Choose only text that is worth noticing while reading.',
    'If the answer has no useful annotation, return [].',
  ].join('\n')

  const user = [
    'Question:',
    typeof question === 'string' ? question : '',
    '',
    'Answer:',
    typeof answer === 'string' ? answer : '',
  ].join('\n')

  return { system, user }
}
