#!/usr/bin/env node

/** Independently verify the built Pages HTML using a standards-oriented DOM parser. */

import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { JSDOM } from 'jsdom'

const HTML_EXTENSION = /\.html?$/i
const CRAWLER_NAMES = ['robots', 'googlebot', 'googlebot-image', 'googlebot-news', 'bingbot']

async function htmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await htmlFiles(fullPath)))
    else if (entry.isFile() && HTML_EXTENSION.test(entry.name)) files.push(fullPath)
  }
  return files
}

export async function verifyNoindex(directory) {
  const root = path.resolve(directory)
  if (!(await stat(root)).isDirectory()) throw new Error(`Pages artifact path is not a directory: ${root}`)
  const files = (await htmlFiles(root)).sort()
  if (files.length === 0) throw new Error(`No HTML pages found in Pages artifact: ${root}`)

  for (const file of files) {
    const dom = new JSDOM(await readFile(file, 'utf8'))
    const head = dom.window.document.head
    if (!head) {
      dom.window.close()
      throw new Error(`${path.relative(root, file)} has no parsed <head>`)
    }

    for (const name of CRAWLER_NAMES) {
      const metas = [...head.querySelectorAll('meta[name]')]
        .filter((meta) => meta.getAttribute('name')?.trim().toLowerCase() === name)
      if (name === 'robots' && metas.length !== 1) {
        dom.window.close()
        throw new Error(`${path.relative(root, file)} has ${metas.length} effective robots meta tags in <head>`)
      }
      for (const meta of metas) {
        if (meta.getAttribute('content')?.trim().toLowerCase() !== 'noindex') {
          dom.window.close()
          throw new Error(`${path.relative(root, file)} has a ${name} directive other than noindex`)
        }
      }
    }

    dom.window.close()
  }

  return files.length
}

async function main() {
  const directory = process.argv[2]
  if (!directory) throw new Error('Usage: node script/verify-pages-noindex.mjs <pages-artifact-directory>')
  const count = await verifyNoindex(directory)
  console.log(`DOM-verified noindex on all ${count} Pages HTML file(s).`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
