// Renders og-image.svg to web/public/og-image.png. It needs @resvg/resvg-js and the TTF files for
// Inter, Inter Tight and JetBrains Mono (from Google Fonts), which aren't project dependencies:
//   node web/og/render.mjs <dir with @resvg/resvg-js in node_modules> <font.ttf>...
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [toolDir, ...fontFiles] = process.argv.slice(2)
const { Resvg } = createRequire(join(toolDir, 'index.js'))('@resvg/resvg-js')
const here = new URL('.', import.meta.url)
const svg = readFileSync(new URL('og-image.svg', here), 'utf8')
const png = new Resvg(svg, { font: { fontFiles, loadSystemFonts: false, defaultFontFamily: 'Inter' } }).render().asPng()
writeFileSync(new URL('../public/og-image.png', here), png)
console.log(`og-image.png: ${png.length} bytes`)
