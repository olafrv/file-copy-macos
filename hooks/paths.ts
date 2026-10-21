// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Olaf Reitmaier

import type { SortKey } from '../types'

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

// A folder's number of items, in the Size column's 9 cells: "Empty",
// "1 item", "3 items", "999+ items".
export const itemCount = (count: number): string =>
  count === 0 ? 'Empty' : count === 1 ? '1 item' : count > 999 ? '999+ items' : `${count} items`

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

// Names as Finder sorts them: "f2" before "f10", case ignored.
const byName = (a: string, b: string): number =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })

/**
 * An entry's own name and its folder. An entry is a name in the target
 * ("a.pdf", "docs/") or, in a search, a path below it ("docs/2026/a.pdf",
 * "docs/old/"); a folder's ends in "/". The folder is "" for the target itself.
 */
export const entryName = (entry: string): string => {
  const bare = entry.replace(/\/$/, '')

  return bare.slice(bare.lastIndexOf('/') + 1) + (entry.endsWith('/') ? '/' : '')
}

export const entryFolder = (entry: string): string => {
  const bare = entry.replace(/\/$/, '')
  const cut = bare.lastIndexOf('/')

  return cut < 0 ? '' : bare.slice(0, cut)
}

/**
 * The entries to show: those whose own name holds the filter text (case
 * ignored), folders first, each group in the chosen order. Folders have no
 * size, so by size they keep the name order.
 */
export const viewEntries = (
  names: readonly string[],
  sizeOf: { readonly [name: string]: number },
  text: string,
  by: SortKey,
  isDesc: boolean,
): string[] => {
  const query = text.trim().toLowerCase()
  const shown = names.filter(n => entryName(n).replace(/\/$/, '').toLowerCase().includes(query))
  const sign = isDesc ? -1 : 1
  // By name, then by folder; by folder, then by name.
  const byEntry = (a: string, b: string) =>
    by === 'folder'
      ? byName(entryFolder(a), entryFolder(b)) || byName(entryName(a), entryName(b))
      : byName(entryName(a), entryName(b)) || byName(entryFolder(a), entryFolder(b))
  const folders = shown
    .filter(n => n.endsWith('/'))
    .sort((a, b) => (by === 'size' ? 1 : sign) * byEntry(a, b))
  const files = shown
    .filter(n => !n.endsWith('/'))
    .sort((a, b) =>
      by === 'size'
        ? sign * ((sizeOf[a] ?? 0) - (sizeOf[b] ?? 0)) || byEntry(a, b)
        : sign * byEntry(a, b),
    )

  return [...folders, ...files]
}

/** A path cut to `width` characters from the left, so its end stays: "…/2026/q3". */
export const fitStart = (path: string, width: number): string => {
  const chars = [...path]

  return chars.length <= width ? path : `…${chars.slice(chars.length - width + 1).join('')}`
}

/** The folder names of the "skip folders" setting: "a, b c" gives a, b and c. */
export const parseSkipList = (text: string): string[] =>
  text
    .split(/[\s,]+/)
    .map(name => name.trim().replace(/\/+$/, ''))
    .filter(name => name !== '' && !name.includes('/'))

/**
 * The parts of `date +%z %Z` ("+0200 CEST"): the offset from UTC in minutes
 * and the zone's name; UTC when the text is not that.
 */
export const parseZone = (text: string): { offset: number; name: string } => {
  const match = /^([+-])(\d{2})(\d{2})\s+(\S+)/.exec(text.trim())

  if (match === null) {
    return { offset: 0, name: 'UTC' }
  }

  const minutes = Number(match[2]) * 60 + Number(match[3])

  return { offset: match[1] === '-' ? -minutes : minutes, name: match[4] ?? 'UTC' }
}

/** A moment as "13.10.2026 14:32 CEST", in the zone given. */
export const formatClock = (ms: number, offset: number, zone: string): string => {
  const d = new Date(ms + offset * 60_000)
  const two = (n: number) => String(n).padStart(2, '0')

  return (
    `${two(d.getUTCDate())}.${two(d.getUTCMonth() + 1)}.${d.getUTCFullYear()} ` +
    `${two(d.getUTCHours())}:${two(d.getUTCMinutes())} ${zone}`
  )
}

const NAME_PREFIX = /^\d{4}-\d{2}-\d{2}_\d{6} - /

/** Whether a name already starts with a namePrefix ("2026-10-13_143215 - "). */
export const hasNamePrefix = (name: string): boolean => NAME_PREFIX.test(name)

/** A name with `prefix` before it, in place of the date it may have already. */
export const withNamePrefix = (name: string, prefix: string): string => `${prefix}${name.replace(NAME_PREFIX, '')}`

/**
 * A moment as the start of a file name, "2026-10-13_143215 - ", in the zone
 * given: what a click on the clock copies, so a name can be typed after it.
 */
export const namePrefix = (ms: number, offset: number): string => {
  const d = new Date(ms + offset * 60_000)
  const two = (n: number) => String(n).padStart(2, '0')

  return (
    `${d.getUTCFullYear()}-${two(d.getUTCMonth() + 1)}-${two(d.getUTCDate())}_` +
    `${two(d.getUTCHours())}${two(d.getUTCMinutes())}${two(d.getUTCSeconds())} - `
  )
}

/**
 * Whether an entry from `ls`, `find` or `git` is a plain name or path below
 * the target: no ".", "..", empty or absolute parts, no control characters.
 * A name with a line break could otherwise split into a fake ".." entry.
 */
export const isSafeEntry = (entry: string): boolean => {
  const bare = entry.replace(/\/$/, '')
  // eslint-disable-next-line no-control-regex
  const hasControl = /[\u0000-\u001f\u007f]/.test(entry)

  return (
    bare !== '' &&
    !hasControl &&
    !bare.startsWith('/') &&
    bare.split('/').every(part => part !== '' && part !== '.' && part !== '..')
  )
}

/** One part of a shortened path: a folder by its index, or "…" for the folders left out. */
export type Crumb = number | 'gap'

/**
 * Fits a path into `width` cells: the text above the project, then the
 * folders from the project down, "/" between them. `extra` is what each
 * folder button costs beyond its name (the desktop's padding). First the
 * text above the project becomes "…/"; then the folders in the middle become
 * one "…", keeping the project folder and as many of the last ones as fit.
 */
export const fitCrumbs = (
  above: string,
  parts: readonly string[],
  width: number,
  extra = 0,
): { above: string; crumbs: Crumb[] } => {
  const cost = (index: number) => [...(parts[index] ?? '')].length + extra
  const length = (crumbs: readonly Crumb[]) =>
    crumbs.reduce<number>((sum, c) => sum + (c === 'gap' ? 1 : cost(c)), 0) + crumbs.length - 1
  const all = parts.map((_, i) => i)

  if ([...above].length + length(all) <= width) {
    return { above, crumbs: all }
  }

  if (2 + length(all) <= width || parts.length <= 2) {
    return { above: '…/', crumbs: all }
  }

  // The project folder, "…", then the last k folders: as many as fit, at least one.
  for (let k = parts.length - 2; k >= 1; k -= 1) {
    const crumbs: Crumb[] = [0, 'gap', ...all.slice(parts.length - k)]

    if (2 + length(crumbs) <= width || k === 1) {
      return { above: '…/', crumbs }
    }
  }

  return { above: '…/', crumbs: all }
}

/** The fewest and the most items a page of the file list shows. */
export const MIN_PAGE_SIZE = 4
export const MAX_PAGE_SIZE = 10

/**
 * Items per page: as many as the band's rows leave after everything else it
 * draws, so the band need not scroll; at least MIN_PAGE_SIZE, at most
 * MAX_PAGE_SIZE.
 */
export const pageSizeFor = (maxRows: number, otherRows: number): number =>
  Math.max(MIN_PAGE_SIZE, Math.min(MAX_PAGE_SIZE, maxRows - otherRows))

/** Whether an entry is hidden as Finder hides it: a name in its path starts with ".". */
export const isHiddenEntry = (entry: string): boolean =>
  entry
    .replace(/\/$/, '')
    .split('/')
    .some(part => part.startsWith('.'))

/**
 * A screenshot's file name at a moment, in the zone given (minutes from
 * UTC): "2026-10-16_173756 - Screenshot.png", with the namePrefix that 📅 Date
 * and the clock use; `n` above 1 adds " n" for a second shot in the same
 * second. `word` names the kind ("Pasted").
 */
export const shotName = (ms: number, offset: number, n = 1, word = 'Screenshot'): string =>
  `${namePrefix(ms, offset)}${word}${n > 1 ? ` ${n}` : ''}.png`
