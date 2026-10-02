#!/usr/bin/env node

/**
 * Apply the repository's search-index policy to the complete GitHub Pages
 * artifact. The site is published beneath the shared ding-ding-projects.github.io
 * host, so this script adds the page-level directive; it is not a substitute
 * for a host-root robots.txt.
 */

import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const robotsTag = '<meta name="robots" content="noindex">'
const htmlExtension = /\.html?$/i
const crawlerMetaNames = new Set(['robots', 'googlebot', 'googlebot-image', 'googlebot-news', 'bingbot'])
const rawTextTags = new Set(['script', 'style', 'title', 'textarea'])
const voidTags = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta',
  'param', 'source', 'track', 'wbr',
])

/** Read one real start/end tag while honoring quoted `>` characters. */
function readTag(source, start) {
  let index = start + 1
  let closing = false
  if (source[index] === '/') {
    closing = true
    index += 1
  }

  if (!/[a-z]/i.test(source[index] ?? '')) return null
  const nameStart = index
  while (/[a-z0-9:-]/i.test(source[index] ?? '')) index += 1
  const name = source.slice(nameStart, index).toLowerCase()
  let quote = ''
  for (; index < source.length; index += 1) {
    const character = source[index]
    if (quote) {
      if (character === quote) quote = ''
    } else if (character === '"' || character === "'") {
      quote = character
    } else if (character === '>') {
      const raw = source.slice(start, index + 1)
      return {
        name,
        closing,
        start,
        end: index + 1,
        raw,
        selfClosing: !closing && /\/\s*>$/.test(raw),
      }
    }
  }

  return null
}

/** Tokenize tags without treating markup-looking text in comments or raw-text elements as HTML. */
function htmlTags(source) {
  const tags = []
  let index = 0

  while (index < source.length) {
    const start = source.indexOf('<', index)
    if (start < 0) break

    if (source.startsWith('<!--', start)) {
      const commentEnd = source.indexOf('-->', start + 4)
      index = commentEnd < 0 ? source.length : commentEnd + 3
      continue
    }

    if (source.startsWith('<![CDATA[', start)) {
      const cdataEnd = source.indexOf(']]>', start + 9)
      index = cdataEnd < 0 ? source.length : cdataEnd + 3
      continue
    }

    if (source.startsWith('<!', start) || source.startsWith('<?', start)) {
      let cursor = start + 2
      let quote = ''
      while (cursor < source.length) {
        const character = source[cursor]
        if (quote) {
          if (character === quote) quote = ''
        } else if (character === '"' || character === "'") {
          quote = character
        } else if (character === '>') {
          cursor += 1
          break
        }
        cursor += 1
      }
      index = cursor
      continue
    }

    const tag = readTag(source, start)
    if (!tag) {
      index = start + 1
      continue
    }

    tags.push(tag)
    index = tag.end

    if (!tag.closing && !tag.selfClosing && rawTextTags.has(tag.name)) {
      const closePattern = new RegExp(`<\\/${tag.name}\\b`, 'ig')
      closePattern.lastIndex = index
      const close = closePattern.exec(source)
      if (!close) break
      index = close.index
    }
  }

  return tags
}

/** Parse start-tag attributes, including valid unquoted HTML attribute values. */
function startTagAttributes(tag) {
  const attributes = []
  let index = 1
  while (/\s/.test(tag.raw[index] ?? '')) index += 1
  while (/[a-z0-9:-]/i.test(tag.raw[index] ?? '')) index += 1

  while (index < tag.raw.length - 1) {
    while (/\s/.test(tag.raw[index] ?? '')) index += 1
    if (!tag.raw[index] || tag.raw[index] === '>' || tag.raw[index] === '/') break

    const nameStart = index
    while (index < tag.raw.length - 1 && !/[\s=/>]/.test(tag.raw[index])) index += 1
    if (index === nameStart) {
      index += 1
      continue
    }
    const name = tag.raw.slice(nameStart, index).toLowerCase()
    while (/\s/.test(tag.raw[index] ?? '')) index += 1

    let value = null
    let valueStart = null
    let valueEnd = null
    if (tag.raw[index] === '=') {
      index += 1
      while (/\s/.test(tag.raw[index] ?? '')) index += 1
      const quote = tag.raw[index]
      if (quote === '"' || quote === "'") {
        index += 1
        valueStart = index
        while (index < tag.raw.length - 1 && tag.raw[index] !== quote) index += 1
        valueEnd = index
        value = tag.raw.slice(valueStart, valueEnd)
        if (tag.raw[index] === quote) index += 1
      } else {
        valueStart = index
        while (index < tag.raw.length - 1 && !/\s|>/.test(tag.raw[index])) index += 1
        valueEnd = index
        value = tag.raw.slice(valueStart, valueEnd)
      }
    }

    attributes.push({ name, value, valueStart, valueEnd })
  }

  return attributes
}

/** Return only effective robots meta tags that are direct children of the HTML head. */
function inspectHead(html, file) {
  let headOpen = null
  let headClose = null
  let insideHead = false
  const elementStack = []
  const directives = []

  for (const tag of htmlTags(html)) {
    if (!insideHead) {
      if (tag.name === 'head' && !tag.closing) {
        headOpen = tag
        insideHead = true
        elementStack.push('head')
      }
      continue
    }

    if (tag.name === 'head' && tag.closing) {
      headClose = tag
      break
    }

    if (tag.closing) {
      for (let index = elementStack.length - 1; index > 0; index -= 1) {
        if (elementStack[index] === tag.name) {
          elementStack.splice(index)
          break
        }
      }
      continue
    }

    if (tag.name === 'meta' && elementStack.length === 1) {
      const attributes = startTagAttributes(tag)
      const nameAttributes = attributes.filter((attribute) => attribute.name === 'name')
      if (nameAttributes.length > 1 && nameAttributes.some((attribute) => crawlerMetaNames.has(attribute.value?.trim().toLowerCase()))) {
        throw new Error(`${file} has a crawler meta tag with duplicate name attributes`)
      }
      const name = nameAttributes[0]?.value?.trim().toLowerCase()
      if (crawlerMetaNames.has(name)) {
        directives.push({ name, tag, attributes })
      }
    }

    if (!tag.selfClosing && !voidTags.has(tag.name)) elementStack.push(tag.name)
  }

  if (!headOpen || !headClose) {
    throw new Error(`${file} has no complete <head> element for a robots meta tag`)
  }
  return { headClose, directives }
}

export function addNoindex(html, file = '<html>') {
  const { headClose, directives: initialDirectives } = inspectHead(html, file)
  const names = new Set()
  for (const directive of initialDirectives) {
    if (names.has(directive.name)) {
      throw new Error(`${file} has more than one effective ${directive.name} meta tag in <head>`)
    }
    names.add(directive.name)
  }

  if (!names.has('robots')) {
    html = `${html.slice(0, headClose.start)}${robotsTag}${html.slice(headClose.start)}`
  }

  const directives = inspectHead(html, file).directives
  for (const { tag, attributes } of [...directives].sort((left, right) => right.tag.start - left.tag.start)) {
    const contentAttributes = attributes.filter((attribute) => attribute.name === 'content')
    if (contentAttributes.length > 1) {
      throw new Error(`${file} has a crawler meta tag with duplicate content attributes`)
    }

    const content = contentAttributes[0]
    if (content?.valueStart !== null && content?.valueStart !== undefined) {
      const start = tag.start + content.valueStart
      const end = tag.start + content.valueEnd
      html = `${html.slice(0, start)}noindex${html.slice(end)}`
    } else {
      let insertionPoint = tag.end - 1
      if (tag.selfClosing && html[insertionPoint - 1] === '/') insertionPoint -= 1
      html = `${html.slice(0, insertionPoint)} content="noindex"${html.slice(insertionPoint)}`
    }
  }

  const finalDirectives = inspectHead(html, file).directives
  const finalNames = new Set()
  for (const directive of finalDirectives) {
    if (finalNames.has(directive.name)) {
      throw new Error(`${file} could not be normalized to one ${directive.name} meta tag in <head>`)
    }
    finalNames.add(directive.name)
    const content = directive.attributes.find((attribute) => attribute.name === 'content')?.value
    if (content?.trim().toLowerCase() !== 'noindex') {
      throw new Error(`${file} could not be normalized to noindex for ${directive.name}`)
    }
  }
  if (!finalNames.has('robots')) {
    throw new Error(`${file} could not be normalized to a robots noindex meta tag in <head>`)
  }

  return html
}

async function htmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await htmlFiles(fullPath)))
    } else if (entry.isFile() && htmlExtension.test(entry.name)) {
      files.push(fullPath)
    }
  }

  return files
}

export async function applyNoindexToSite(directory) {
  const root = path.resolve(directory)
  if (!(await stat(root)).isDirectory()) {
    throw new Error(`Pages artifact path is not a directory: ${root}`)
  }

  const files = (await htmlFiles(root)).sort()
  if (files.length === 0) {
    throw new Error(`No HTML pages found in Pages artifact: ${root}`)
  }

  let updated = 0
  for (const file of files) {
    const original = await readFile(file, 'utf8')
    const normalized = addNoindex(original, path.relative(root, file))
    if (normalized !== original) {
      await writeFile(file, normalized)
      updated += 1
    }
  }

  return { htmlFiles: files.length, updated }
}

async function main() {
  const directory = process.argv[2]
  if (!directory) {
    throw new Error('Usage: node script/apply-pages-noindex.mjs <pages-artifact-directory>')
  }

  const result = await applyNoindexToSite(directory)
  console.log(
    `Verified noindex on ${result.htmlFiles} Pages HTML file(s); normalized ${result.updated}.`,
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
