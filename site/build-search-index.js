#!/usr/bin/env node
'use strict'

/**
 * Builds the GitHub Pages documentation search index.
 *
 * Walks the rendered `_site/docs` tree, extracts each page's title and plain
 * text from its HTML `<main>` body, and writes one `search-index.json` the
 * client-side search page fetches. Text is normalized to single spaces so
 * regular expressions written against prose behave predictably.
 *
 * Usage: node site/build-search-index.js <siteDir>
 */

const fs = require('fs')
const path = require('path')
const { JSDOM } = require('jsdom')

const siteDir = path.resolve(process.argv[2] ?? '_site')
const docsDir = path.join(siteDir, 'docs')
const MaximumPageCharacters = 200_000

function textWithElementBoundaries(node) {
  return Array.from(node.childNodes)
    .map(child =>
      child.nodeType === 3
        ? child.nodeValue ?? ''
        : textWithElementBoundaries(child)
    )
    .join(' ')
}

function htmlToText(html) {
  const fragment = JSDOM.fragment(html)
  const root = fragment.querySelector('main') ?? fragment
  const clone = root.cloneNode(true)
  for (const element of clone.querySelectorAll('script, style, template')) {
    element.remove()
  }
  return textWithElementBoundaries(clone)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MaximumPageCharacters)
}

function titleOf(html, fallback) {
  const fragment = JSDOM.fragment(html)
  const heading = fragment.querySelector('h1')
  if (heading !== null) {
    const text = htmlToText(heading.outerHTML)
    if (text !== '') {
      return text
    }
  }
  const tag = fragment.querySelector('title')
  if (tag !== null) {
    return (tag.textContent ?? '')
      .replace(/\s*·\s*Desktop Material Docs\s*$/, '')
      .trim()
  }
  return fallback
}

function* walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      yield* walk(full)
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      yield full
    }
  }
}

function main() {
  if (!fs.existsSync(docsDir)) {
    throw new Error(`Rendered documentation directory is missing: ${docsDir}`)
  }

  const pages = []
  for (const file of walk(docsDir)) {
    const relative = path.relative(docsDir, file).split(path.sep).join('/')
    if (relative === 'search.html') {
      continue
    }
    const html = fs.readFileSync(file, 'utf8')
    const text = htmlToText(html)
    if (text === '') {
      continue
    }
    pages.push({
      url: relative,
      path: relative
        .replace(/(?:^|\/)index\.html$/, '/')
        .replace(/\.html$/, ''),
      title: titleOf(html, relative),
      text,
    })
  }

  pages.sort((left, right) => left.url.localeCompare(right.url))
  const out = path.join(docsDir, 'search-index.json')
  fs.writeFileSync(out, JSON.stringify({ pages }))
  process.stdout.write(
    `Indexed ${pages.length} documentation pages into ${out}\n`
  )
}

if (require.main === module) {
  main()
}

module.exports = { htmlToText, titleOf }
