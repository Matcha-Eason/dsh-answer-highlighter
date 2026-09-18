import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const result = await build({
  entryPoints: [join(root, 'src/client.js')],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: ['chrome120'],
  legalComments: 'none',
  write: false,
})
const bundle = result.outputFiles[0].text
const output = `window.__ModuleLoader__.load({
  id: 'dsh-answer-highlight',
  factory: (require) => {
    'use strict'
    var module = { exports: {} }
    var exports = module.exports

${bundle}
    return module.exports
  },
})
`

await mkdir(join(root, 'lib'), { recursive: true })
await writeFile(join(root, 'lib/client.js'), output, 'utf8')
