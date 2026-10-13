// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Olaf Reitmaier

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { CopyResult, Pending, SortKey } from '../types'
import {
  baseName,
  formatClock,
  humanSize,
  parsePaths,
  parseZone,
  toFieldText,
  viewEntries,
} from './paths'

// The mod's version, read from its own plugin.json at session start.
const version = atom({ plugin: 'file-copy-macos', key: 'version' } as const, null)
// The clock: the minute on show (ms since the epoch, 0 before the first
// tick), and the local zone's offset from UTC in minutes and its name.
const clockNow = atom({ plugin: 'file-copy-macos', key: 'clockNow' } as const, 0)
const zoneOffset = atom({ plugin: 'file-copy-macos', key: 'zoneOffset' } as const, 0)
const zoneName = atom({ plugin: 'file-copy-macos', key: 'zoneName' } as const, 'UTC')
const draft = atom({ plugin: 'file-copy-macos', key: 'draft' } as const, '')
// The field is not controlled: the mod never writes text into it, so a redraw
// cannot replace what the person pasted. A new id draws a new, empty field.
const fieldId = atom({ plugin: 'file-copy-macos', key: 'fieldId' } as const, 0)
// The text a new field starts with: set when an untick rewrites the paths.
// Each change of it comes with a new field id, so a field is never handed
// another text while the person types in it.
const seed = atom({ plugin: 'file-copy-macos', key: 'seed' } as const, '')
// A short message under the field, such as Enter pressed with no path.
const hint = atom({ plugin: 'file-copy-macos', key: 'hint' } as const, null)
// Whether the Delete of the "Copied:" row waits for its confirmation.
const isConfirmingLast = atom({ plugin: 'file-copy-macos', key: 'isConfirmingLast' } as const, false)
// Which pasted paths are folders, checked on disk when the field changes,
// so the list under it can show 📁 for them.
const pastedDirs = atom({ plugin: 'file-copy-macos', key: 'pastedDirs' } as const, [])
const busy = atom({ plugin: 'file-copy-macos', key: 'busy' } as const, false)
const last = atom({ plugin: 'file-copy-macos', key: 'last' } as const, null)
const pending = atom({ plugin: 'file-copy-macos', key: 'pending' } as const, null)
// The file list: what is in the project folder, what the person ticked, and
// whether the delete question is open.
const isListOpen = atom({ plugin: 'file-copy-macos', key: 'isListOpen' } as const, false)
const entries = atom({ plugin: 'file-copy-macos', key: 'entries' } as const, [])
// Each file's size in bytes, by name; folders have none.
const sizes = atom({ plugin: 'file-copy-macos', key: 'sizes' } as const, {})
const selected = atom({ plugin: 'file-copy-macos', key: 'selected' } as const, [])
const isConfirming = atom({ plugin: 'file-copy-macos', key: 'isConfirming' } as const, false)
// The page of the file list on show, 0 for the first.
const page = atom({ plugin: 'file-copy-macos', key: 'page' } as const, 0)
// The file list's filter text, and the field's id: a new id draws it empty.
const filter = atom({ plugin: 'file-copy-macos', key: 'filter' } as const, '')
const filterId = atom({ plugin: 'file-copy-macos', key: 'filterId' } as const, 0)
// The file list's order: by name or size, ascending or descending.
const sortBy = atom({ plugin: 'file-copy-macos', key: 'sortBy' } as const, 'name')
const isSortDesc = atom({ plugin: 'file-copy-macos', key: 'isSortDesc' } as const, false)
// The target folder, relative to the project root ('' is the root itself),
// and the "New folder..." field: open or not, and what was wrong with a name.
const subdir = atom({ plugin: 'file-copy-macos', key: 'subdir' } as const, '')
const isNamingFolder = atom({ plugin: 'file-copy-macos', key: 'isNamingFolder' } as const, false)
const folderError = atom({ plugin: 'file-copy-macos', key: 'folderError' } as const, null)
// The file in Contents whose name is being edited, and what was wrong with
// the new name.
const renaming = atom({ plugin: 'file-copy-macos', key: 'renaming' } as const, null)
const renameError = atom({ plugin: 'file-copy-macos', key: 'renameError' } as const, null)
const isHidden = atom({ plugin: 'file-copy-macos', key: 'isHidden' } as const, false)

// Copies each source into the folder given first. The mode decides what
// happens when the name is already taken there:
//   check      copy nothing, list the taken names (CONFLICT lines)
//   keep       copy as "name 2.ext", "name 3.ext"
//   overwrite  move the existing file to the Trash, then copy
//   skip       leave the existing file, copy nothing
// One line per source: OK<tab>source<tab>new name<tab>replaced?,
// CONFLICT<tab>source<tab>name, SKIP or FAIL<tab>source<tab>reason.
type Mode = 'check' | 'keep' | 'overwrite' | 'skip'

const COPY_SCRIPT = `
dest=$1; mode=$2; shift 2
destReal=$(cd "$dest" && pwd -P) || exit 2
for src in "$@"; do
  case "$src" in
    "~/"*) src="$HOME/\${src#??}" ;;
    /*) ;;
    *) printf 'FAIL\\t%s\\tonly a name, not a full path; in Finder use Option+Cmd+C\\n' "$src"; continue ;;
  esac
  src=\${src%/}
  if [ ! -e "$src" ]; then printf 'FAIL\\t%s\\tnot found\\n' "$src"; continue; fi
  srcDir=$(cd "$(dirname "$src")" && pwd -P)
  name=$(basename "$src")
  if [ "$srcDir" = "$destReal" ]; then printf 'SKIP\\t%s\\tthe file is already in this folder\\n' "$src"; continue; fi
  target="$dest/$name"; replaced=""
  if [ -e "$target" ]; then
    case "$mode" in
      check) printf 'CONFLICT\\t%s\\t%s\\n' "$src" "$name"; continue ;;
      skip) printf 'SKIP\\t%s\\tkept the existing file\\n' "$src"; continue ;;
      overwrite)
        if ! /usr/bin/trash "$target" 2>/dev/null; then
          printf 'FAIL\\t%s\\tcould not move the old file to the Trash\\n' "$src"; continue
        fi
        replaced="replaced" ;;
      *)
        case "$name" in
          ?*.*) stem=\${name%.*}; ext=".\${name##*.}" ;;
          *) stem=$name; ext="" ;;
        esac
        n=2
        while [ -e "$target" ]; do target="$dest/$stem $n$ext"; n=$((n+1)); done ;;
    esac
  fi
  [ "$mode" = check ] && continue
  if cp -R "$src" "$target" 2>/dev/null; then
    printf 'OK\\t%s\\t%s\\t%s\\n' "$src" "\${target##*/}" "$replaced"
  else
    printf 'FAIL\\t%s\\tcopy failed\\n' "$src"
  fi
done
`

// The native macOS picker, for files or for folders (one window cannot offer
// both); prints one POSIX path per line, exit 1 on cancel.
type PickKind = 'files' | 'folders'

const pickScript = (kind: PickKind): string[] => [
  kind === 'files'
    ? 'set picked to choose file with prompt "Files to copy into the project" with multiple selections allowed'
    : 'set picked to choose folder with prompt "Folders to copy into the project" with multiple selections allowed',
  'set out to ""',
  'repeat with f in picked',
  'set out to out & POSIX path of f & linefeed',
  'end repeat',
  'return out',
]

// Where the version links to: the README on GitHub. On the desktop only.
const HELP_URL = 'https://github.com/olafrv/file-copy-macos#readme'

// Entries per page of the file list.
const PAGE_SIZE = 4

// The file list's columns, in terminal cells: the tick box, the size
// ("999 KB"), the actions ("↗️ Open 📌 Finder 💬 Ask 📝 Ren 📋 Copy") and the least
// the name gets.
const TICK_WIDTH = 2
// The desktop draws a Button with its own padding: the tick box needs more room.
const DESKTOP_TICK_WIDTH = 5
const SIZE_WIDTH = 9
const ACTIONS_WIDTH = 39
const MIN_NAME_WIDTH = 16

// An icon and a name cut to `width` cells with "…"; the icon takes 2 cells.
const fitName = (label: string, width: number): string => {
  const chars = [...label]

  return chars.length + 1 <= width ? label : `${chars.slice(0, width - 2).join('')}…`
}

// A header button sorts by its column; again, the other way round.
const sortOn = async ($: EngineInterface, by: SortKey) => {
  const isSame = (await read($, sortBy)) === by

  await update($, isSortDesc, desc => (isSame ? !desc : false))
  await update($, sortBy, () => by)
  await update($, page, () => 0)
}

const clearFilter = async ($: EngineInterface) => {
  await update($, filter, () => '')
  await update($, filterId, id => id + 1)
}

// Wide enough for "⚡ Shortcuts:" (an icon is 2 columns), so the rows line up.
const LABEL_WIDTH = 13

const NO_PATH_HINT = 'No path yet. Paste one or more paths first, or use Files... or Folder...'

const shortPath = (path: string): string =>
  path.replace(/^\/Users\/[^/]+/, '~')

// Where copies go: the project root, or the folder opened in Contents.
const targetDir = async ($: EngineInterface): Promise<string> => {
  const root = await $.session.root()
  const dir = await read($, subdir)

  return dir === '' ? root : `${root}/${dir}`
}

// "1 file", "2 folders", "1 file and 2 folders"; a folder name ends in "/".
const countItems = (names: readonly string[]): string => {
  const folders = names.filter(n => n.endsWith('/')).length
  const files = names.length - folders
  const parts = [
    files > 0 ? `${files} file${files === 1 ? '' : 's'}` : '',
    folders > 0 ? `${folders} folder${folders === 1 ? '' : 's'}` : '',
  ].filter(p => p !== '')

  return parts.join(' and ')
}

const deleteQuestion = (names: readonly string[]): string => {
  const hasFolder = names.some(n => n.endsWith('/'))
  const what =
    names.length === 1
      ? `the selected ${hasFolder ? 'folder' : 'file'}`
      : countItems(names)

  return `Delete ${what}?${hasFolder ? ' Folders go to the Trash with all their contents.' : ''}`
}

const tellClaude = async (
  $: EngineInterface,
  root: string,
  names: string[],
  isRemoved = false,
) => {
  const list = names.map(name => `- ${name}`).join('\n')
  const what = isRemoved
    ? `moved ${countItems(names)} from the folder ${root} to the Trash (a name ending in "/" is a folder with all its contents)`
    : `copied ${names.length} file(s) into the folder ${root}`
  const note =
    `FYI from the file-copy-macos mod: the user ${what}:\n${list}\n\n` +
    'This is information only. Do not open, read or change these files and ' +
    'do not reply to this note. Wait for the next request from the user.'
  const notice = isRemoved
    ? `Moved to Trash from ${shortPath(root)}: ${names.join(', ')}`
    : `Copied to ${shortPath(root)}: ${names.join(', ')}`

  await $.session.append({
    message: { type: 'user', content: [{ type: 'text', text: note }] },
  })
  await $.session.append({
    message: { type: 'system', content: [{ type: 'text', text: notice }] },
  })
}

const tellClaudeRename = async (
  $: EngineInterface,
  dir: string,
  from: string,
  to: string,
  isFolder: boolean,
) => {
  const note =
    `FYI from the file-copy-macos mod: the user renamed the ${isFolder ? 'folder' : 'file'} ${from} to ${to} ` +
    `in the folder ${dir}.\n\n` +
    'This is information only. Do not act on it and do not reply to this note. ' +
    'Wait for the next request from the user.'

  await $.session.append({
    message: { type: 'user', content: [{ type: 'text', text: note }] },
  })
  await $.session.append({
    message: {
      type: 'system',
      content: [{ type: 'text', text: `Renamed in ${shortPath(dir)}: ${from} to ${to}` }],
    },
  })
}

const tellClaudeFolder = async ($: EngineInterface, path: string) => {
  const note =
    `FYI from the file-copy-macos mod: the user created the folder ${path}.\n\n` +
    'This is information only. Do not act on it and do not reply to this note. ' +
    'Wait for the next request from the user.'

  await $.session.append({
    message: { type: 'user', content: [{ type: 'text', text: note }] },
  })
  await $.session.append({
    message: { type: 'system', content: [{ type: 'text', text: `Created folder ${shortPath(path)}` }] },
  })
}

// The project folder's top-level entries, folders with a trailing "/".
const loadEntries = async ($: EngineInterface) => {
  const dir = await targetDir($)
  const { stdout, exitCode } = await $.process.run(['/bin/ls', '-1Ap', dir])

  // The folder is gone (deleted or renamed outside): back to the project root.
  if (exitCode !== 0 && (await read($, subdir)) !== '') {
    await update($, subdir, () => '')
    await loadEntries($)
    return
  }

  const all = stdout.split('\n').filter(name => name !== '' && name !== '.DS_Store')
  // Folders first, then files; each group keeps the order ls gave.
  const names = [...all.filter(n => n.endsWith('/')), ...all.filter(n => !n.endsWith('/'))]

  await update($, entries, () => names)
  await update($, selected, list => list.filter(name => names.includes(name)))
  await update($, sizes, () => ({}))

  const files = names.filter(n => !n.endsWith('/'))

  if (files.length > 0) {
    // One line per file: size, a tab, the name as given (run inside the folder).
    const stat = await $.process.run(['/usr/bin/stat', '-f', '%z%t%N', ...files], { cwd: dir })
    const bytes: { [name: string]: number } = {}

    for (const line of stat.stdout.split('\n')) {
      const tab = line.indexOf('\t')

      if (tab > 0) {
        bytes[line.slice(tab + 1)] = Number(line.slice(0, tab))
      }
    }

    await update($, sizes, () => bytes)
  }
}

// Moves the named files of the project folder to the macOS Trash, so a delete
// can be undone, and tells Claude. Answers the names it could not move.
const trashNames = async ($: EngineInterface, root: string, names: string[]) => {
  await update($, busy, () => true)

  try {
    const removed: string[] = []
    const kept: string[] = []

    for (const name of names) {
      const path = `${root}/${name.replace(/\/$/, '')}`
      const { exitCode } = await $.process.run(['/usr/bin/trash', path])
      ;(exitCode === 0 ? removed : kept).push(name)
    }

    await update($, last, result => {
      if (result === null) {
        return null
      }

      const gone = removed.map(name => name.replace(/\/$/, ''))
      const copied = result.copied.filter(name => !gone.includes(name))

      return copied.length > 0 ? { ...result, copied, skipped: [], failed: [] } : null
    })

    if (removed.length > 0) {
      await tellClaude($, root, removed, true)
      $.ui.toast(`Moved ${countItems(removed)} to the Trash`)
    }

    if (kept.length > 0) {
      $.ui.toast(`Could not move to the Trash: ${kept.join(', ')}`)
    }

    return kept
  } finally {
    await update($, busy, () => false)

    if (await read($, isListOpen)) {
      await loadEntries($)
    }
  }
}

const trashLastCopy = async ($: EngineInterface, result: CopyResult) => {
  await trashNames($, result.root, result.copied)
}

const openFolder = async ($: EngineInterface, dir: string) => {
  await update($, subdir, () => dir)
  await update($, page, () => 0)
  await clearFilter($)
  await update($, selected, () => [])
  await update($, isConfirming, () => false)
  await update($, isNamingFolder, () => false)
  await startRename($, null)
  await loadEntries($)
}

const parentOf = (dir: string): string => dir.split('/').slice(0, -1).join('/')

// A new folder's name: one or more parts ("q1" or "2026/q1"), none of them
// empty, "." or "..", so the folder always stays inside the target.
const folderNameError = (name: string): string | null => {
  const parts = name.split('/')

  if (name === '' || parts.some(part => part.trim() === '')) {
    return 'Type a folder name.'
  }

  if (parts.some(part => part === '.' || part === '..')) {
    return 'A folder name cannot be "." or "..".'
  }

  return null
}

// Opens a file or folder of the target as a double-click in Finder would:
// macOS `open` picks the default app for a file and shows a folder in Finder.
// An empty name opens the target folder itself.
const openWithDefaultApp = async ($: EngineInterface, name: string) => {
  const dir = await targetDir($)
  const path = name === '' ? dir : `${dir}/${name.replace(/\/$/, '')}`
  const { exitCode, stderr } = await $.process.run(['/usr/bin/open', path])

  if (exitCode !== 0) {
    const what = name === '' ? shortPath(dir) : name
    $.ui.toast(`Could not open ${what}: ${stderr.trim() || 'no app for this file type'}`)
  }
}

const startRename = async ($: EngineInterface, name: string | null) => {
  await update($, renameError, () => null)
  await update($, renaming, () => name)
}

// Renames a file of the target folder. Never overwrites: a name already
// taken is refused. The new name stays in the same folder (no "/").
// `entry` is the name as Contents lists it; a folder's ends in "/".
const renameFile = async ($: EngineInterface, entry: string, raw: string) => {
  const isFolder = entry.endsWith('/')
  const kind = isFolder ? 'folder' : 'file'
  const from = entry.replace(/\/$/, '')
  const to = raw.trim()

  if (to === from) {
    await startRename($, null)
    return
  }

  const error =
    to === ''
      ? `Type a ${kind} name.`
      : to.includes('/')
        ? `A ${kind} name cannot contain "/".`
        : to === '.' || to === '..'
          ? `A ${kind} name cannot be "." or "..".`
          : null

  if (error !== null) {
    await update($, renameError, () => error)
    return
  }

  const dir = await targetDir($)
  const taken = await $.process.run(['/bin/test', '-e', `${dir}/${to}`])

  if (taken.exitCode === 0) {
    await update($, renameError, () => `"${to}" already exists here.`)
    return
  }

  const moved = await $.process.run(['/bin/mv', '-n', `${dir}/${from}`, `${dir}/${to}`])
  // macOS `mv -n` exits 0 even when it skipped the move: check the old name is gone.
  const left = await $.process.run(['/bin/test', '-e', `${dir}/${from}`])

  if (moved.exitCode !== 0 || left.exitCode === 0) {
    await update($, renameError, () => `Could not rename "${from}".`)
    return
  }

  await startRename($, null)
  await update($, selected, list => list.map(n => (n === entry ? (isFolder ? `${to}/` : to) : n)))
  await update($, last, result =>
    result === null || result.root !== dir
      ? result
      : { ...result, copied: result.copied.map(n => (n === from ? to : n)) },
  )
  await tellClaudeRename($, dir, from, to, isFolder)
  await loadEntries($)
  $.ui.toast(`Renamed ${from} to ${to}`)
}

const createFolder = async ($: EngineInterface, raw: string) => {
  const name = raw.trim().replace(/^\/+|\/+$/g, '')
  const error = folderNameError(name)

  if (error !== null) {
    await update($, folderError, () => error)
    return
  }

  const parent = await targetDir($)
  const path = `${parent}/${name}`
  const exists = await $.process.run(['/bin/test', '-e', path])

  if (exists.exitCode === 0) {
    await update($, folderError, () => `"${name}" already exists here.`)
    return
  }

  const made = await $.process.run(['/bin/mkdir', '-p', path])

  if (made.exitCode !== 0) {
    await update($, folderError, () => `Could not create "${name}".`)
    return
  }

  await update($, folderError, () => null)
  await update($, isNamingFolder, () => false)
  await tellClaudeFolder($, path)

  const dir = await read($, subdir)
  await openFolder($, dir === '' ? name : `${dir}/${name}`)
  $.ui.toast(`Created folder ${name}`)
}

const toggleList = async ($: EngineInterface) => {
  const isOpen = !(await read($, isListOpen))

  await update($, isListOpen, () => isOpen)
  await update($, isConfirming, () => false)

  if (isOpen) {
    await update($, page, () => 0)
    await loadEntries($)
  } else {
    await update($, selected, () => [])
    await clearFilter($)
  }
}

// The filter field is always drawn: typing in it shows the list.
const filterBy = async ($: EngineInterface, value: string) => {
  await update($, filter, () => value)
  await update($, page, () => 0)

  if (value.trim() !== '' && !(await read($, isListOpen))) {
    await toggleList($)
  }
}

// Ticks every item shown (all pages, the filter applied), or, when all of
// them are ticked, unticks them.
const toggleAll = async ($: EngineInterface, shown: readonly string[]) => {
  await update($, isConfirming, () => false)
  await update($, selected, list =>
    shown.every(n => list.includes(n))
      ? list.filter(n => !shown.includes(n))
      : [...list, ...shown.filter(n => !list.includes(n))],
  )
}

// Puts "@path" for each item, relative to the project, at the cursor in the
// prompt, so the person can ask Claude about them. A path with a space is
// quoted.
const mention = async ($: EngineInterface, names: readonly string[]) => {
  const dir = await read($, subdir)
  const text = names
    .map(name => (dir === '' ? name : `${dir}/${name}`))
    .map(path => (/\s/.test(path) ? `@"${path}"` : `@${path}`))
    .join(' ')
  const filled = await $.prompt.fill({ text: `${text} `, mode: 'insert' })

  if (!filled.isFilled) {
    $.ui.toast('Could not write into the prompt now')
  }
}

// JavaScript for Automation: puts the files given on the clipboard as files,
// so Cmd+V pastes them in Finder, Mail or Slack; the mod cannot drag them out.
// After the write, the script reads every item back: without that, macOS kept
// only the first file once the script ended (tested on macOS 26). Prints how
// many files the clipboard holds.
const CLIPBOARD_SCRIPT = `function run(argv) {
  ObjC.import('AppKit')
  const board = $.NSPasteboard.generalPasteboard
  board.clearContents
  const urls = $.NSMutableArray.alloc.init
  argv.forEach(p => urls.addObject($.NSURL.fileURLWithPath(p)))
  board.writeObjects(urls)
  const items = board.pasteboardItems
  let count = 0
  for (let i = 0; i < items.count; i++) {
    if (ObjC.unwrap(items.objectAtIndex(i).stringForType('public.file-url'))) count++
  }
  return String(count)
}`

const pathsOf = async ($: EngineInterface, names: readonly string[]) => {
  const dir = await targetDir($)

  return names.map(name => `${dir}/${name.replace(/\/$/, '')}`)
}

const copyToClipboard = async ($: EngineInterface, names: readonly string[]) => {
  const paths = await pathsOf($, names)
  const { stdout } = await $.process.run([
    '/usr/bin/osascript',
    '-l',
    'JavaScript',
    '-e',
    CLIPBOARD_SCRIPT,
    ...paths,
  ])

  $.ui.toast(
    Number(stdout.trim()) === paths.length
      ? `Copied ${countItems(names)} to the clipboard. Paste with Cmd+V in Finder.`
      : 'Could not copy to the clipboard',
  )
}

// Opens Finder at the item's folder with the item selected, as "Show in
// Finder" does; for a folder too (Finder's reveal script did not do that).
// An empty name shows the target folder itself.
const showInFinder = async ($: EngineInterface, name: string) => {
  const [path = ''] = name === '' ? [await targetDir($)] : await pathsOf($, [name])
  const { exitCode } = await $.process.run(['/usr/bin/open', '-R', path])

  if (exitCode !== 0) {
    $.ui.toast(`Could not show ${name === '' ? shortPath(path) : name} in Finder`)
  }
}

const toggleSelected = async ($: EngineInterface, name: string) => {
  await update($, isConfirming, () => false)
  await update($, selected, list =>
    list.includes(name) ? list.filter(n => n !== name) : [...list, name],
  )
}

const deleteSelected = async ($: EngineInterface) => {
  const root = await targetDir($)
  const names = await read($, selected)

  await update($, isConfirming, () => false)
  await update($, selected, () => [])
  await trashNames($, root, names)
}

const runScript = async ($: EngineInterface, root: string, mode: Mode, sources: string[]) =>
  $.process.run(['/bin/sh', '-c', COPY_SCRIPT, 'file-copy-macos', root, mode, ...sources], {
    timeoutMs: 600_000,
  })

const copyWith = async ($: EngineInterface, sources: string[], mode: Mode) => {
  await update($, busy, () => true)

  try {
    const root = await targetDir($)
    const { stdout, exitCode } = await runScript($, root, mode, sources)
    const result: CopyResult = { root, copied: [], skipped: [], failed: [] }
    const notes: string[] = []

    if (exitCode === 2) {
      result.failed.push(`target folder not found: ${root}`)
    }

    for (const line of stdout.split('\n')) {
      const [kind, src = '', detail = '', replaced = ''] = line.split('\t')

      if (kind === 'OK') {
        result.copied.push(detail)
        notes.push(replaced === 'replaced' ? `${detail} (replaced the old file)` : detail)
      } else if (kind === 'SKIP') {
        result.skipped.push(`${baseName(src)} (${detail})`)
      } else if (kind === 'FAIL') {
        result.failed.push(`${baseName(src)} (${detail})`)
      }
    }

    await update($, last, () => result)
    await update($, isHidden, () => false)
    await update($, isConfirmingLast, () => false)

    if (await read($, isListOpen)) {
      await loadEntries($)
    }

    if (result.copied.length > 0) {
      await tellClaude($, root, notes)
      $.ui.toast(`Copied ${result.copied.length} file(s) to ${shortPath(root)}`)
    }

    if (result.failed.length > 0) {
      $.ui.toast(`Not copied: ${result.failed.join(', ')}`)
    }
  } finally {
    await update($, busy, () => false)
  }
}

// Copies at once when no name is taken; otherwise asks first (the band
// draws the question from `pending`).
const copyIntoProject = async ($: EngineInterface, sources: string[]) => {
  if (sources.length === 0) {
    return
  }

  const root = await targetDir($)
  const { stdout } = await runScript($, root, 'check', sources)
  const conflicts = stdout
    .split('\n')
    .filter(line => line.startsWith('CONFLICT\t'))
    .map(line => line.split('\t')[2] ?? '')

  if (conflicts.length === 0) {
    await copyWith($, sources, 'keep')
    return
  }

  await update($, pending, () => ({ sources, conflicts }))
}

const answer = async ($: EngineInterface, ask: Pending, mode: Mode | null) => {
  await update($, pending, () => null)

  if (mode !== null) {
    await copyWith($, ask.sources, mode)
  }
}

const pickPaths = async ($: EngineInterface, kind: PickKind): Promise<string[]> => {
  const argv = ['/usr/bin/osascript', ...pickScript(kind).flatMap(l => ['-e', l])]
  const { exitCode, stdout } = await $.process.run(argv, { timeoutMs: 600_000 })

  if (exitCode !== 0) {
    return []
  }

  return stdout.split('\n').filter(l => l !== '')
}

// Removes one pasted path: the field is drawn again with the paths left.
// Prints each argument that is a folder; "~/" is the home folder.
const DIRS_SCRIPT = `
for p in "$@"; do
  case "$p" in "~/"*) q="$HOME/\${p#??}" ;; *) q=$p ;; esac
  [ -d "$q" ] && printf '%s\\n' "$p"
done
`

const checkPastedDirs = async ($: EngineInterface, text: string) => {
  const paths = parsePaths(text)

  if (paths.length === 0) {
    await update($, pastedDirs, () => [])
    return
  }

  const { stdout } = await $.process.run(['/bin/sh', '-c', DIRS_SCRIPT, 'file-copy-macos', ...paths])
  const dirs = stdout.split('\n').filter(line => line !== '')

  // A later edit may have changed the field meanwhile: keep only its paths.
  const now = parsePaths(await read($, draft))
  await update($, pastedDirs, () => dirs.filter(d => now.includes(d)))
}

const untick = async ($: EngineInterface, paths: string[], path: string) => {
  const text = toFieldText(paths.filter(p => p !== path))

  await update($, draft, () => text)
  await update($, pastedDirs, dirs => dirs.filter(d => d !== path))
  await update($, seed, () => text)
  await update($, fieldId, id => id + 1)
}

// Whether the macOS picker is open, and when it closed: see the field's onSubmit.
let isPicking = false
let pickEndedAt = 0

const pickAndCopy = async ($: EngineInterface, kind: PickKind) => {
  isPicking = true
  await update($, hint, () => null)

  try {
    const sources = await pickPaths($, kind)
    pickEndedAt = await $.clock.now()
    isPicking = false
    await copyIntoProject($, sources)
  } finally {
    isPicking = false
  }
}

// Prints the newest item in ~/Downloads, file or folder, skipping Finder's
// own files and downloads still in progress; exit 2 when there is none.
const LATEST_DOWNLOAD_SCRIPT = `
cd "$HOME/Downloads" 2>/dev/null || exit 2
/bin/ls -1tA | while IFS= read -r name; do
  case "$name" in
    .DS_Store|.localized|*.crdownload|*.download|*.part|*.partial) continue ;;
  esac
  printf '%s/%s\\n' "$PWD" "$name"
  exit 0
done | /usr/bin/grep . || exit 2
`

const copyLatestDownload = async ($: EngineInterface) => {
  const { stdout, exitCode } = await $.process.run([
    '/bin/sh',
    '-c',
    LATEST_DOWNLOAD_SCRIPT,
    'file-copy-macos',
  ])
  const path = stdout.split('\n')[0] ?? ''

  if (exitCode !== 0 || path === '') {
    $.ui.toast('No download found in ~/Downloads')
    return
  }

  await update($, hint, () => null)
  await copyIntoProject($, [path])
}

const loadVersion = async ($: EngineInterface) => {
  try {
    const manifest = JSON.parse(await $.fs.read(`${$.plugin.root}/.claude-plugin/plugin.json`))

    if (typeof manifest.version === 'string') {
      await update($, version, () => manifest.version)
    }
  } catch {
    // No version shown: the band works the same without it.
  }
}

// The mod has no time zone of its own: macOS names the local one.
const loadZone = async ($: EngineInterface) => {
  const { stdout, exitCode } = await $.process.run(['/bin/date', '+%z %Z'])
  const zone = parseZone(exitCode === 0 ? stdout : '')

  await update($, zoneOffset, () => zone.offset)
  await update($, zoneName, () => zone.name)
}

const MINUTE = 60_000

// Stores the time once a minute, on the minute, so the band redraws the
// clock; the zone is asked again each hour, for the change of summer time.
const startClock = async ($: EngineInterface) => {
  const tick = async () => {
    const now = await $.clock.now()

    if (now % (60 * MINUTE) < MINUTE) {
      await loadZone($)
    }

    await update($, clockNow, () => now - (now % MINUTE))
  }

  await loadZone($)
  await tick()
  const now = await $.clock.now()

  $.clock.after(MINUTE - (now % MINUTE), () => {
    void tick()
    $.clock.every(MINUTE, () => void tick())
  })
}

export const register: Register = on => {
  // A result from an earlier session says nothing about the folder now.
  on('session.start', async ($, e, next) => {
    await update($, version, () => null)
    await loadVersion($)
    await startClock($)
    await update($, last, () => null)
    await update($, subdir, () => '')

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }

    // Mobile draws no Input; the band needs one.
    if (e.surface === 'mobile') {
      return next(e)
    }

    const { Box, Button, Input, Link, Text } = $.ui.resolve(e)

    const root = await $.session.root()
    const dir = await read($, subdir)
    const modVersion = await read($, version)
    const shownMinute = await read($, clockNow)
    const clock =
      shownMinute === 0
        ? null
        : formatClock(shownMinute, await read($, zoneOffset), await read($, zoneName))
    const target = dir === '' ? root : `${root}/${dir}`
    const naming = await read($, isNamingFolder)
    const editing = await read($, renaming)
    const editError = await read($, renameError)
    const nameError = await read($, folderError)
    const isBusy = await read($, busy)
    const result = await read($, last)
    const hidden = await read($, isHidden)
    const ask = await read($, pending)
    const listOpen = await read($, isListOpen)
    const names = listOpen ? await read($, entries) : []
    const ticked = listOpen ? await read($, selected) : []
    const sizeOf = listOpen ? await read($, sizes) : {}
    const confirming = listOpen && ticked.length > 0 && (await read($, isConfirming))
    const filterText = await read($, filter)
    const by = await read($, sortBy)
    const desc = await read($, isSortDesc)
    const view = viewEntries(names, sizeOf, filterText, by, desc)
    const arrow = (key: SortKey) => (by === key ? (desc ? ' ▼' : ' ▲') : '')
    // A page past the end (after a delete) shows the last page.
    const pageCount = Math.max(1, Math.ceil(view.length / PAGE_SIZE))
    const shownPage = Math.min(listOpen ? await read($, page) : 0, pageCount - 1)
    const pageNames = view.slice(shownPage * PAGE_SIZE, (shownPage + 1) * PAGE_SIZE)
    // The "│" and "─┼─" lines only meet the columns in the terminal's monospace
    // font; the desktop draws text in another font, so it gets the frame alone.
    const lines = e.surface === 'terminal'
    // Each column has a cell of padding on both sides (on the desktop, not the
    // tick box), the frame 2 sides, and in the terminal 3 "│" between them.
    const tickWidth = lines ? TICK_WIDTH : DESKTOP_TICK_WIDTH
    const frame = tickWidth + SIZE_WIDTH + ACTIONS_WIDTH + (lines ? 13 : 8)
    // The Name column takes what the label, its gap and the other columns leave.
    const nameWidth = Math.max(MIN_NAME_WIDTH, e.props.bodyColumns - LABEL_WIDTH - 1 - frame)
    const tableWidth = nameWidth + frame
    const showResult = result !== null && !hidden && !isBusy && ask === null
    // The Hide button sits on the last result line drawn.
    const hideOn =
      result === null || result.failed.length > 0
        ? 'failed'
        : result.skipped.length > 0
          ? 'skipped'
          : 'copied'
    const text = await read($, draft)
    const paths = parsePaths(text)
    const dirs = await read($, pastedDirs)
    const message = await read($, hint)
    const confirmingLast = await read($, isConfirmingLast)
    const startText = await read($, seed)
    const count = paths.length

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={1} alignItems="center">
          <Box width={LABEL_WIDTH}>
            <Text>📎 Source(s):</Text>
          </Box>
          <Box flexGrow={1}>
            <Input
              key={`source-${await read($, fieldId)}`}
              value={startText === '' ? undefined : startText}
              placeholder={isBusy ? 'Copying...' : 'Paste paths -> Enter'}
              submitLabel="📥 Copy"
              onInput={async (value: string) => {
                await update($, draft, () => value)
                await checkPastedDirs($, value)

                if (message !== null) {
                  await update($, hint, () => null)
                }

                if (!hidden) {
                  await update($, isHidden, () => true)
                }
              }}
              onSubmit={async (value: string) => {
                const sources = parsePaths(value)

                if (sources.length === 0) {
                  // An empty Enter while the picker is open, or just after it
                  // closed (its Open key), is not the person's Enter here.
                  const isFromPicker = isPicking || (await $.clock.now()) < pickEndedAt + 1000

                  if (!isFromPicker) {
                    await update($, hint, () => NO_PATH_HINT)
                  }

                  return
                }

                await update($, hint, () => null)
                await update($, draft, () => '')
                await update($, seed, () => '')
                await update($, pastedDirs, () => [])
                await update($, fieldId, id => id + 1)
                await copyIntoProject($, sources)
              }}
            />
          </Box>
          {count > 0 && (
            <Text dimColor>
              {count === 1 ? '1 item' : `${count} items`}
            </Text>
          )}
          <Button
            key="pick"
            label="📄 Files..."
            onPress={() => pickAndCopy($, 'files')}
          />
          <Button
            key="pick-folder"
            label="📂 Folder..."
            onPress={() => pickAndCopy($, 'folders')}
          />
          <Button
            key="latest-download"
            label="⬇️ Latest download"
            onPress={() => copyLatestDownload($)}
          />
        </Box>
        {message !== null && (
          <Box flexDirection="row" gap={1}>
            <Box width={LABEL_WIDTH} />
            <Text color="yellow">{message}</Text>
          </Box>
        )}
        {count > 0 && (
          <Box flexDirection="row" gap={1}>
            <Box width={LABEL_WIDTH} />
            <Box flexDirection="column" flexGrow={1}>
              {paths.map(path => (
                <Button
                  key={`paste:${path}`}
                  label={`☑ ${dirs.includes(path) ? '📁' : '📄'} ${baseName(path)}`}
                  plain
                  onPress={() => untick($, paths, path)}
                />
              ))}
            </Box>
          </Box>
        )}
        <Box flexDirection="row" gap={1}>
          <Box width={LABEL_WIDTH}>
            <Text>🎯 Target:</Text>
          </Box>
          <Text dimColor>{shortPath(target)}</Text>
          {/* Side by side as in the table's Actions: no gap on the desktop. */}
          <Box flexDirection="row" gap={lines ? 1 : 0}>
            <Button
              key="open-target"
              label="↗️ Open"
              plain
              dimColor
              onPress={() => openWithDefaultApp($, '')}
            />
            <Button
              key="finder-target"
              label="📌 Finder"
              plain
              dimColor
              onPress={() => showInFinder($, '')}
            />
          </Box>
        </Box>
        <Box flexDirection="row" gap={1}>
          <Box width={LABEL_WIDTH}>
            <Text>🗂️ Contents:</Text>
          </Box>
          <Button
            key="list"
            label={listOpen ? '🙈 Hide' : '👀 Show'}
            plain
            onPress={() => toggleList($)}
          />
          {!naming && (
            <Button
              key="new-folder"
              label="❇️ New folder..."
              plain
              onPress={() => update($, isNamingFolder, () => true)}
            />
          )}
          {/* The terminal draws the field as wide as its box; the desktop at its
              own width, so a fixed box there would push Clear away. */}
          <Box width={lines ? 38 : undefined}>
            <Input
              key={`filter-${await read($, filterId)}`}
              label="Filter"
              placeholder="Name"
              submitLabel="🔍 Find"
              onInput={(value: string) => filterBy($, value)}
              onSubmit={(value: string) => filterBy($, value)}
            />
          </Box>
          {filterText !== '' && (
            <Button key="clear-filter" label="🧹 Clear" plain dimColor onPress={() => clearFilter($)} />
          )}
          {listOpen && pageCount > 1 && (
            <Box flexDirection="row" gap={1}>
              {shownPage > 0 && (
                <Button
                  key="page-prev"
                  label="◀"
                  plain
                  onPress={() => update($, page, () => shownPage - 1)}
                />
              )}
              <Text dimColor>{`${shownPage + 1}/${pageCount} (#${view.length})`}</Text>
              {shownPage < pageCount - 1 && (
                <Button
                  key="page-next"
                  label="▶"
                  plain
                  onPress={() => update($, page, () => shownPage + 1)}
                />
              )}
            </Box>
          )}
        </Box>
        {naming && (
          <Box flexDirection="row" gap={1}>
            <Box width={LABEL_WIDTH} />
            <Box flexDirection="column" flexGrow={1}>
              <Box flexDirection="row" gap={1}>
                <Box flexGrow={1}>
                  <Input
                    key="folder-name"
                    label="❇️ New folder"
                    placeholder="Name, then Enter"
                    submitLabel="❇️ Create"
                    autoFocus
                    onInput={() => (nameError === null ? undefined : update($, folderError, () => null))}
                    onSubmit={(value: string) => createFolder($, value)}
                  />
                </Box>
                <Button
                  key="cancel-folder"
                  label="⏹️ Cancel"
                  plain
                  onPress={async () => {
                    await update($, folderError, () => null)
                    await update($, isNamingFolder, () => false)
                  }}
                />
              </Box>
              {nameError !== null && <Text color="yellow">{nameError}</Text>}
            </Box>
          </Box>
        )}
        {listOpen && (
          <Box flexDirection="row" gap={1}>
            <Box width={LABEL_WIDTH} />
            <Box flexDirection="column" flexGrow={1}>
              {dir !== '' && (
                <Button
                  key="up"
                  label={`⤴️ ${parentOf(dir) === '' ? baseName(root) : baseName(parentOf(dir))}/`}
                  plain
                  onPress={() => openFolder($, parentOf(dir))}
                />
              )}
              {names.length === 0 && <Text dimColor>The folder is empty.</Text>}
              {names.length > 0 && view.length === 0 && (
                <Text dimColor>{`No name contains "${filterText.trim()}".`}</Text>
              )}
              {view.length > 0 && (
                <Box
                  key="table"
                  flexDirection="column"
                  width={tableWidth}
                  borderStyle="single"
                  borderDimColor
                >
                  <Box key="table-head" flexDirection="row">
                    <Box width={lines ? tickWidth + 2 : tickWidth} paddingX={lines ? 1 : 0}>
                      <Button
                        key="tick-all"
                        label={view.every(n => ticked.includes(n)) ? '☑' : '☐'}
                        plain
                        onPress={() => toggleAll($, view)}
                      />
                    </Box>
                    {lines && <Text dimColor>│</Text>}
                    <Box width={nameWidth + 2} paddingX={1}>
                      <Button
                        key="sort-name"
                        label={`Name${arrow('name')}`}
                        plain
                        dimColor
                        onPress={() => sortOn($, 'name')}
                      />
                    </Box>
                    {lines && <Text dimColor>│</Text>}
                    <Box width={SIZE_WIDTH + 2} paddingX={1}>
                      <Button
                        key="sort-size"
                        label={`Size${arrow('size')}`}
                        plain
                        dimColor
                        onPress={() => sortOn($, 'size')}
                      />
                    </Box>
                    {lines && <Text dimColor>│</Text>}
                    <Box width={ACTIONS_WIDTH + 2} paddingX={1}>
                      <Text dimColor>Actions</Text>
                    </Box>
                  </Box>
                  {lines && (
                    <Text key="table-line" dimColor>
                      {[tickWidth, nameWidth, SIZE_WIDTH, ACTIONS_WIDTH]
                        .map(width => '─'.repeat(width + 2))
                        .join('┼')}
                    </Text>
                  )}
                  {pageNames.map(name =>
                    editing === name ? (
                      <Box key={`edit:${name}`} flexDirection="column" paddingX={1}>
                        <Box flexDirection="row" gap={1}>
                          <Box flexGrow={1}>
                            <Input
                              key={`rename-field:${name}`}
                              label="📝 Rename to"
                              value={name.replace(/\/$/, '')}
                              submitLabel="📝 Rename"
                              autoFocus
                              onInput={() =>
                                editError === null ? undefined : update($, renameError, () => null)
                              }
                              onSubmit={(value: string) => renameFile($, name, value)}
                            />
                          </Box>
                          <Button
                            key="cancel-rename"
                            label="⏹️ Cancel"
                            plain
                            onPress={() => startRename($, null)}
                          />
                        </Box>
                        {editError !== null && <Text color="yellow">{editError}</Text>}
                      </Box>
                    ) : (
                      <Box key={`row:${name}`} flexDirection="row">
                        <Box width={lines ? tickWidth + 2 : tickWidth} paddingX={lines ? 1 : 0}>
                          <Button
                            key={`tick:${name}`}
                            label={ticked.includes(name) ? '☑' : '☐'}
                            plain
                            onPress={() => toggleSelected($, name)}
                          />
                        </Box>
                        {lines && <Text dimColor>│</Text>}
                        <Box width={nameWidth + 2} paddingX={1}>
                          {name.endsWith('/') ? (
                            <Button
                              key={`dir:${name}`}
                              label={fitName(`📁 ${name}`, nameWidth)}
                              plain
                              onPress={() =>
                                openFolder($, `${dir === '' ? '' : `${dir}/`}${name.slice(0, -1)}`)
                              }
                            />
                          ) : (
                            <Button
                              key={`file:${name}`}
                              label={fitName(`📄 ${name}`, nameWidth)}
                              plain
                              onPress={() => openWithDefaultApp($, name)}
                            />
                          )}
                        </Box>
                        {lines && <Text dimColor>│</Text>}
                        <Box width={SIZE_WIDTH + 2} paddingX={1}>
                          {sizeOf[name] !== undefined && (
                            <Text dimColor>{humanSize(sizeOf[name])}</Text>
                          )}
                        </Box>
                        {lines && <Text dimColor>│</Text>}
                        {/* The desktop draws each Button with its own padding: no gap
                            needed there. The terminal needs one cell between labels. */}
                        <Box
                          width={ACTIONS_WIDTH + 2}
                          paddingX={1}
                          flexDirection="row"
                          gap={lines ? 1 : 0}
                        >
                          <Button
                            key={`open:${name}`}
                            label="↗️ Open"
                            plain
                            dimColor
                            onPress={() => openWithDefaultApp($, name)}
                          />
                          <Button
                            key={`show:${name}`}
                            label="📌 Finder"
                            plain
                            dimColor
                            onPress={() => showInFinder($, name)}
                          />
                          <Button
                            key={`mention:${name}`}
                            label="💬 Ask"
                            plain
                            dimColor
                            onPress={() => mention($, [name])}
                          />
                          <Button
                            key={`rename:${name}`}
                            label="📝 Ren"
                            plain
                            dimColor
                            onPress={() => startRename($, name)}
                          />
                          <Button
                            key={`copy:${name}`}
                            label="📋 Copy"
                            plain
                            dimColor
                            onPress={() => copyToClipboard($, [name])}
                          />
                        </Box>
                      </Box>
                    ),
                  )}
                </Box>
              )}
              {ticked.length > 0 && !confirming && (
                <Box flexDirection="row" gap={1} alignItems="center">
                  <Text dimColor>{`${ticked.length} selected:`}</Text>
                  <Button
                    key="delete-selected"
                    label="❌ Delete"
                    onPress={() => update($, isConfirming, () => true)}
                  />
                  <Button key="mention-selected" label="💬 Ask" onPress={() => mention($, ticked)} />
                  <Button key="copy-selected" label="📋 Copy" onPress={() => copyToClipboard($, ticked)} />
                </Box>
              )}
              {confirming && (
                <Box flexDirection="column">
                  <Text color="yellow">
                    {deleteQuestion(ticked)}
                  </Text>
                  <Box flexDirection="row" gap={1}>
                    <Button
                      key="confirm-delete"
                      label="❌ Delete"
                      onPress={() => deleteSelected($)}
                    />
                    <Button
                      key="cancel-delete"
                      label="⏹️ Cancel"
                      plain
                      onPress={() => update($, isConfirming, () => false)}
                    />
                  </Box>
                </Box>
              )}
            </Box>
          </Box>
        )}
        <Box flexDirection="row" gap={1}>
          <Box width={LABEL_WIDTH}>
            <Text>⚡ Shortcuts:</Text>
          </Box>
          <Box flexGrow={1} flexShrink={1}>
            <Text dimColor wrap="wrap">
              {e.surface === 'terminal'
                ? 'Drag files into the field'
                : 'Option+Cmd+C in Finder copies paths'}
            </Text>
          </Box>
          {/* One Text, so the row's gap does not widen the space before the dot. */}
          {(clock !== null || e.surface === 'desktop') && (
            <Text dimColor>
              {clock ?? ''}
              {e.surface === 'desktop' && clock !== null && ' · '}
              {e.surface === 'desktop' && (
                <Link href={HELP_URL}>{modVersion === null ? 'Help' : `v${modVersion}`}</Link>
              )}
            </Text>
          )}
        </Box>
        {ask !== null && (
          <Box flexDirection="row" gap={1}>
            <Box width={LABEL_WIDTH}>
              <Text color="yellow">⚠ Exists:</Text>
            </Box>
            <Box flexDirection="column" flexGrow={1} flexShrink={1}>
              <Text color="yellow" wrap="wrap">
                {`${ask.conflicts.join(', ')} already in the target. Overwrite?`}
              </Text>
              <Box flexDirection="row" gap={1}>
                <Button key="overwrite" label="🔁 Overwrite" onPress={() => answer($, ask, 'overwrite')} />
                <Button key="keep" label="👯 Keep both" onPress={() => answer($, ask, 'keep')} />
                <Button key="skip" label="⏭️ Copy only new" onPress={() => answer($, ask, 'skip')} />
                <Button key="cancel" label="⏹️ Cancel" plain onPress={() => answer($, ask, null)} />
              </Box>
            </Box>
          </Box>
        )}
        {showResult && result.copied.length > 0 && (
          <Box flexDirection="row" gap={1} alignItems="center">
            <Box width={LABEL_WIDTH}>
              <Text color="green">✅ Copied:</Text>
            </Box>
            <Box flexGrow={1} flexShrink={1}>
              <Text wrap="wrap">{result.copied.join(', ')}</Text>
            </Box>
            {!confirmingLast && (
              <Button
                key="trash"
                label="❌ Delete"
                onPress={() => update($, isConfirmingLast, () => true)}
              />
            )}
            {!confirmingLast && hideOn === 'copied' && (
              <Button key="hide" label="🙈 Hide" onPress={() => update($, isHidden, () => true)} />
            )}
          </Box>
        )}
        {showResult && confirmingLast && result.copied.length > 0 && (
          <Box flexDirection="row" gap={1}>
            <Box width={LABEL_WIDTH} />
            <Box flexDirection="column" flexGrow={1}>
              <Text color="yellow">
                {result.copied.length === 1
                  ? 'Delete the copied file?'
                  : `Delete the ${result.copied.length} copied files?`}
              </Text>
              <Box flexDirection="row" gap={1}>
                <Button
                  key="confirm-trash"
                  label="❌ Delete"
                  onPress={async () => {
                    await update($, isConfirmingLast, () => false)
                    await trashLastCopy($, result)
                  }}
                />
                <Button
                  key="cancel-trash"
                  label="⏹️ Cancel"
                  onPress={() => update($, isConfirmingLast, () => false)}
                />
              </Box>
            </Box>
          </Box>
        )}
        {showResult && result.skipped.length > 0 && (
          <Box flexDirection="row" gap={1} alignItems="center">
            <Box width={LABEL_WIDTH}>
              <Text dimColor>⏭️ Skipped:</Text>
            </Box>
            <Box flexGrow={1} flexShrink={1}>
              <Text dimColor wrap="wrap">{result.skipped.join(', ')}</Text>
            </Box>
            {!confirmingLast && hideOn === 'skipped' && (
              <Button key="hide" label="🙈 Hide" onPress={() => update($, isHidden, () => true)} />
            )}
          </Box>
        )}
        {showResult && result.failed.length > 0 && (
          <Box flexDirection="row" gap={1} alignItems="center">
            <Box width={LABEL_WIDTH}>
              <Text color="yellow">⚠ Failed:</Text>
            </Box>
            <Box flexGrow={1} flexShrink={1}>
              <Text wrap="wrap">{result.failed.join(', ')}</Text>
            </Box>
            {!confirmingLast && (
              <Button key="hide" label="🙈 Hide" onPress={() => update($, isHidden, () => true)} />
            )}
          </Box>
        )}
      </Box>
    )
  })
}
