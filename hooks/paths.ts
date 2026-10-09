// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Olaf Reitmaier

// Turns what a drag, a paste or a typed line put in the field into paths.
// Terminals insert dragged files as `/a/My\ File.pdf /b/x.png` or quoted;
// Finder's "Copy as Pathname" gives one path per line; browsers give file:// URLs.

const fromUrl = (token: string): string => {
  if (!token.startsWith('file://')) {
    return token
  }

  try {
    return decodeURIComponent(new URL(token).pathname)
  } catch {
    return token
  }
}

const unquote = (line: string): string => {
  const t = line.trim()
  const isQuoted =
    t.length >= 2 && (t[0] === '"' || t[0] === "'") && t[t.length - 1] === t[0]

  return isQuoted ? t.slice(1, -1) : t
}

const splitShellWords = (text: string): string[] => {
  const words: string[] = []
  let word = ''
  let quote: '"' | "'" | null = null
  let hasWord = false

  for (let i = 0; i < text.length; i += 1) {
    const c = text[i] ?? ''

    if (quote) {
      if (c === quote) {
        quote = null
      } else if (c === '\\' && quote === '"' && i + 1 < text.length) {
        i += 1
        word += text[i] ?? ''
      } else {
        word += c
      }
    } else if (c === '"' || c === "'") {
      quote = c
      hasWord = true
    } else if (c === '\\' && i + 1 < text.length) {
      i += 1
      word += text[i] ?? ''
      hasWord = true
    } else if (/\s/.test(c)) {
      if (hasWord) {
        words.push(word)
      }
      word = ''
      hasWord = false
    } else {
      word += c
      hasWord = true
    }
  }

  if (hasWord) {
    words.push(word)
  }

  return words
}

const startsPath = (word: string): boolean =>
  word.startsWith('/') || word.startsWith('~/') || word.startsWith('file://')

// A pasted path with plain spaces ("/a/My File.pdf /b/x.png") splits into
// "/a/My", "File.pdf", "/b/x.png". A path starts with "/", "~/" or "file://",
// so a word that does not belongs to the path before it.
const joinPathParts = (words: string[]): string[] => {
  const paths: string[] = []

  for (const word of words) {
    const lastIndex = paths.length - 1

    if (lastIndex >= 0 && !startsPath(word)) {
      paths[lastIndex] = `${paths[lastIndex]} ${word}`
    } else {
      paths.push(word)
    }
  }

  return paths
}

/** Every path the text names, in order, duplicates removed. */
export const parsePaths = (text: string): string[] => {
  const lines = text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l !== '')
  const tokens =
    lines.length > 1 ? lines.map(unquote) : joinPathParts(splitShellWords(lines[0] ?? ''))

  return [...new Set(tokens.map(fromUrl).filter(p => p !== ''))]
}

/** The last part of a path, as `basename` gives it. */
export const baseName = (path: string): string =>
  path.replace(/\/+$/, '').split('/').pop() ?? path

/** Paths as field text that parsePaths reads back the same; spaces stay plain. */
export const toFieldText = (paths: readonly string[]): string =>
  paths.map(path => path.replace(/[\\'"]/g, c => `\\${c}`)).join(' ')

// A size as Finder shows it: 1 KB is 1000 bytes; one decimal below 10.
export const humanSize = (bytes: number): string => {
  const units = ['bytes', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0

  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000
    unit += 1
  }

  if (unit === 0) {
    return bytes === 1 ? '1 byte' : `${bytes} bytes`
  }

  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}
