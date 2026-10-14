// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Olaf Reitmaier

import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import {
  fitCrumbs,
  formatClock,
  humanSize,
  isSafeEntry,
  isHiddenEntry,
  pageSizeFor,
  parsePaths,
  parseZone,
  toFieldText,
  viewEntries,
} from '../hooks/paths'

const BAND = {
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

// The tick box as each surface draws it: emoji on the desktop.
const box = (surface: 'terminal' | 'desktop', isOn: boolean) =>
  surface === 'terminal' ? (isOn ? '☑' : '☐') : isOn ? '✅' : '⬜'

// A file system in memory for $.fs: `list` gives a folder's names (a
// folder's ending in "/"), or undefined when there is no such folder; sizes
// and modification times by full path.
const fakeFs = (
  on: On,
  list: (dir: string) => readonly string[] | undefined,
  sizes: { readonly [path: string]: number } = {},
  times: { readonly [path: string]: number } = {},
) => {
  const kindOf = (path: string): 'file' | 'dir' | undefined => {
    if (list(path) !== undefined) {
      return 'dir'
    }

    const cut = path.lastIndexOf('/')
    const names = list(path.slice(0, cut)) ?? []
    const name = path.slice(cut + 1)

    return names.includes(`${name}/`) ? 'dir' : names.includes(name) ? 'file' : undefined
  }

  on('fs.list', ($, e) => {
    const names = list(e.path)

    if (names === undefined) {
      return { deny: `no such folder: ${e.path}` }
    }

    return {
      value: names.map(n => {
        const name = n.replace(/\/$/, '')
        const isDir = n.endsWith('/')

        return {
          name,
          kind: isDir ? 'dir' : 'file',
          size: isDir ? 0 : (sizes[`${e.path}/${name}`] ?? 0),
          mtimeMs: isDir ? 0 : (times[`${e.path}/${name}`] ?? 0),
          isLink: false,
        }
      }),
    }
  })
  on('fs.exists', ($, e) => ({ value: kindOf(e.path) !== undefined }))
  on('fs.stat', ($, e) => {
    const kind = kindOf(e.path)

    return kind === undefined
      ? { deny: `no such path: ${e.path}` }
      : { value: { kind, size: sizes[e.path] ?? 0, mtimeMs: times[e.path] ?? 0, isLink: false } }
  })
}

// The Target path as the band draws it: the part above the project as text,
// then one button per folder.
const crumbs = async (ui: { findAll: (q: object) => Promise<readonly { key?: string; props: { label?: unknown } }[]> }) =>
  (await ui.findAll({ type: 'Button' }))
    .filter(b => (b.key ?? '').startsWith('crumb:'))
    .map(b => String(b.props.label))

const ran = (stdout: string) => ({
  exitCode: 0,
  stdout,
  stderr: '',
  isStdoutTruncated: false,
  isStderrTruncated: false,
})

test('parses dragged, pasted and URL paths', async () => {
  expect(parsePaths('/a/My\\ File.pdf /b/x.png')).toEqual(['/a/My File.pdf', '/b/x.png'])
  expect(parsePaths("'/a/b c.txt' \"/d/e f.txt\"")).toEqual(['/a/b c.txt', '/d/e f.txt'])
  expect(parsePaths('/a/one two.txt\n/b/three.txt\n')).toEqual(['/a/one two.txt', '/b/three.txt'])
  expect(parsePaths('file:///Users/x/My%20Doc.pdf')).toEqual(['/Users/x/My Doc.pdf'])
  expect(parsePaths('/a.txt /a.txt')).toEqual(['/a.txt'])
  expect(parsePaths('/a/My File.pdf /b/x.png')).toEqual(['/a/My File.pdf', '/b/x.png'])
  expect(parsePaths('/a/x.pdf ~/b/y z.pdf')).toEqual(['/a/x.pdf', '~/b/y z.pdf'])
  const odd = ['/a/My File.pdf', "/b/it's.txt", '/c/back\\slash.txt']
  expect(parsePaths(toFieldText(odd))).toEqual(odd)
})

test('copies on Enter and tells Claude as an FYI', async ($, on) => {
  const session = mock.session(on)
  const runs: (readonly string[])[] = []

  on('session.root', () => ({ value: '/proj' }))
  on('process.run', ($, e) => {
    runs.push(e.argv)

    if (e.argv[0] === '/bin/sh' && e.argv[5] === 'check') {
      return { value: ran('') }
    }

    if (e.argv[0] === '/bin/sh') {
      return {
        value: {
          exitCode: 0,
          stdout: 'OK\t/src/a.txt\ta.txt\nOK\t/src/b.png\tb 2.png\n',
          stderr: '',
          isStdoutTruncated: false,
          isStderrTruncated: false,
        },
      }
    }

    if (e.argv[0] === '/usr/bin/trash') {
      return {
        value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
      }
    }

    return {
      value: { exitCode: 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
    }
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    runs.length = 0
    const ui = await $.ui.mount({ plugin: 'file-copy-macos', surface, ...BAND })
    expect(await crumbs(ui)).toEqual(['proj'])

    const field = await ui.find({ type: 'Input' })
    const key = field?.key ?? ''
    await ui.input({ key, text: '/src/a.txt /src/b.png', kind: 'change' })
    expect(await ui.find({ type: 'Text', text: /^2 items$/ })).toBeDefined()
    expect(await ui.find({ key: 'paste:/src/a.txt' })).toBeDefined()
    expect(await ui.find({ key: 'paste:/src/b.png' })).toBeDefined()

    await ui.input({ key, text: '/src/a.txt /src/b.png' })
    expect((await ui.find({ type: 'Input' }))?.key).not.toBe(key)
    expect(await ui.find({ type: 'Text', text: /items$/ })).toBeUndefined()

    const copy = runs.find(argv => argv[0] === '/bin/sh' && argv[5] === 'keep')
    expect(copy?.slice(4)).toEqual(['/proj', 'keep', '/src/a.txt', '/src/b.png'])
    expect(await ui.find({ type: 'Text', text: 'a.txt, b 2.png' })).toBeDefined()

    await ui.press({ key: 'trash' })
    expect(runs.filter(argv => argv[0] === '/usr/bin/trash')).toEqual([])
    expect(await ui.find({ type: 'Text', text: 'Delete the 2 copied files?' })).toBeDefined()
    await ui.press({ key: 'cancel-trash' })
    expect(runs.filter(argv => argv[0] === '/usr/bin/trash')).toEqual([])

    await ui.press({ key: 'trash' })
    await ui.press({ key: 'confirm-trash' })
    expect(runs.filter(argv => argv[0] === '/usr/bin/trash')).toEqual([
      ['/usr/bin/trash', '/proj/a.txt'],
      ['/usr/bin/trash', '/proj/b 2.png'],
    ])
    expect(await ui.find({ key: 'trash' })).toBeUndefined()
    await ui.unmount()
  }

  const fyi = session.appended().filter(r => r.message.type === 'user')
  expect(fyi.length).toBe(4)
  expect(JSON.stringify(fyi[1])).toContain('to the Trash')
  const block = fyi[0]?.message.content[0]
  expect(JSON.stringify(block)).toContain('Do not open, read or change')
})


test('asks before it overwrites a file already in the project', async ($, on) => {
  const session = mock.session(on)
  const modes: string[] = []
  const others: (readonly string[])[] = []

  on('session.root', () => ({ value: '/proj' }))
  on('process.run', ($, e) => {
    const mode = e.argv[0] === '/bin/sh' ? (e.argv[5] ?? '') : ''

    if (mode !== '') {
      modes.push(mode)
    }

    if (mode === 'check') {
      return { value: ran('CONFLICT\t/src/a.txt\ta.txt\n') }
    }

    if (e.argv[0] === '/bin/sh') {
      return { value: ran('OK\t/src/a.txt\ta.txt\treplaced\n') }
    }

    others.push(e.argv)

    return { value: ran('') }
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    modes.length = 0
    const ui = await $.ui.mount({ plugin: 'file-copy-macos', surface, ...BAND })
    const key = (await ui.find({ type: 'Input' }))?.key ?? ''

    await ui.input({ key, text: '/src/a.txt' })
    expect(modes).toEqual(['check'])
    expect(await ui.find({ type: 'Text', text: /^a\.txt already in the target\. Overwrite\?$/ })).toBeDefined()

    await ui.press({ key: 'cancel' })
    expect(modes).toEqual(['check'])
    expect(await ui.find({ key: 'overwrite' })).toBeUndefined()

    await ui.input({ key: (await ui.find({ type: 'Input' }))?.key ?? '', text: '/src/a.txt' })
    await ui.press({ key: 'overwrite' })
    expect(modes).toEqual(['check', 'check', 'overwrite'])
    expect(await ui.find({ key: 'overwrite' })).toBeUndefined()

    await ui.unmount()
  }

  const fyi = session.appended().filter(r => r.message.type === 'user')
  expect(fyi.length).toBe(2)
  expect(JSON.stringify(fyi[0])).toContain('a.txt (replaced the old file)')
})

test('the file list deletes ticked files only after a confirmation', async ($, on) => {
  const session = mock.session(on)
  const trashed: string[] = []
  let folder = ['a.pdf', 'b.pdf', 'docs/', '.DS_Store']

  on('session.root', () => ({ value: '/proj' }))
  fakeFs(on, dir => (dir === '/proj' ? folder : undefined))
  on('process.run', ($, e) => {
    if (e.argv[0] === '/usr/bin/trash') {
      const path = e.argv[1] ?? ''
      trashed.push(path)
      folder = folder.filter(name => `/proj/${name.replace(/\/$/, '')}` !== path)
    }

    return { value: ran('') }
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    trashed.length = 0
    folder = ['a.pdf', 'b.pdf', 'docs/', '.DS_Store']
    const ui = await $.ui.mount({ plugin: 'file-copy-macos', surface, ...BAND })

    await ui.press({ key: 'list' })
    expect(await ui.find({ key: 'file:a.pdf' })).toBeDefined()
    expect(await ui.find({ key: 'dir:docs/' })).toBeDefined()
    expect(await ui.find({ key: 'file:.DS_Store' })).toBeUndefined()

    await ui.press({ key: 'tick:a.pdf' })
    await ui.press({ key: 'tick:b.pdf' })
    await ui.press({ key: 'tick:b.pdf' })
    await ui.press({ key: 'delete-selected' })
    expect(trashed).toEqual([])
    expect(await ui.find({ type: 'Text', text: 'Delete the selected file?' })).toBeDefined()

    await ui.press({ key: 'cancel-delete' })
    expect(trashed).toEqual([])

    await ui.press({ key: 'delete-selected' })
    await ui.press({ key: 'confirm-delete' })
    expect(trashed).toEqual(['/proj/a.pdf'])
    expect(await ui.find({ key: 'file:a.pdf' })).toBeUndefined()
    expect(await ui.find({ key: 'file:b.pdf' })).toBeDefined()
    expect(await ui.find({ key: 'delete-selected' })).toBeUndefined()

    await ui.press({ key: 'list' })
    expect(await ui.find({ key: 'file:b.pdf' })).toBeUndefined()
    await ui.unmount()
  }

  const fyi = session.appended().filter(r => r.message.type === 'user')
  expect(fyi.length).toBe(2)
  expect(JSON.stringify(fyi[0])).toContain('to the Trash')
})

test('an unticked pasted file leaves the list and is not copied', async ($, on) => {
  const runs: (readonly string[])[] = []

  on('session.root', () => ({ value: '/proj' }))
  on('process.run', ($, e) => {
    runs.push(e.argv)

    return { value: ran(e.argv[5] === 'keep' ? 'OK\t/src/b.png\tb.png\n' : '') }
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    runs.length = 0
    const ui = await $.ui.mount({ plugin: 'file-copy-macos', surface, ...BAND })
    const key = (await ui.find({ type: 'Input' }))?.key ?? ''

    await ui.input({ key, text: '/src/a.txt /src/b.png', kind: 'change' })
    await ui.press({ key: 'paste:/src/a.txt' })
    expect(await ui.find({ key: 'paste:/src/a.txt' })).toBeUndefined()
    expect(await ui.find({ key: 'paste:/src/b.png' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^1 item$/ })).toBeDefined()

    const field = await ui.find({ type: 'Input' })
    expect(field?.key).not.toBe(key)
    expect(field?.props.value).toBe('/src/b.png')

    await ui.input({ key: field?.key ?? '', text: '/src/b.png' })
    const copy = runs.find(argv => argv[5] === 'keep')
    expect(copy?.slice(6)).toEqual(['/src/b.png'])

    const next = (await ui.find({ type: 'Input' }))?.key ?? ''
    await ui.input({ key: next, text: '/src/a.txt', kind: 'change' })
    expect(await ui.find({ key: 'paste:/src/a.txt' })).toBeDefined()
    await ui.unmount()
  }
})

test('Enter with no path shows a hint and copies nothing', async ($, on) => {
  mock.clock(on, { now: 100_000 })
  const runs: (readonly string[])[] = []

  on('session.root', () => ({ value: '/proj' }))
  on('process.run', ($, e) => {
    runs.push(e.argv)

    return { value: ran('') }
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    runs.length = 0
    const ui = await $.ui.mount({ plugin: 'file-copy-macos', surface, ...BAND })
    const key = (await ui.find({ type: 'Input' }))?.key ?? ''

    await ui.input({ key, text: '   ' })
    expect(runs).toEqual([])
    expect(await ui.find({ type: 'Text', text: /^No path yet/ })).toBeDefined()

    await ui.input({ key, text: '/src/a.txt', kind: 'change' })
    expect(await ui.find({ type: 'Text', text: /^No path yet/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('Files never shows the no-path hint', async ($, on) => {
  const clock = mock.clock(on, { now: 100_000 })
  on('session.root', () => ({ value: '/proj' }))
  on('process.run', () => ({ value: ran('') }))

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'file-copy-macos', surface, ...BAND })
    const key = (await ui.find({ type: 'Input' }))?.key ?? ''

    await ui.input({ key, text: '' })
    expect(await ui.find({ type: 'Text', text: /^No path yet/ })).toBeDefined()

    await ui.press({ key: 'pick' })
    expect(await ui.find({ type: 'Text', text: /^No path yet/ })).toBeUndefined()

    await ui.input({ key, text: '' })
    expect(await ui.find({ type: 'Text', text: /^No path yet/ })).toBeUndefined()

    await clock.advance(2000)
    await ui.input({ key, text: '' })
    expect(await ui.find({ type: 'Text', text: /^No path yet/ })).toBeDefined()
    await ui.unmount()
  }
})

test('Content opens folders, makes them the target and creates new ones', async ($, on) => {
  const session = mock.session(on)
  const folders: Record<string, string[]> = { '/proj': ['a.pdf', 'docs/', 'b.pdf', 'img/'], '/proj/docs': ['old.txt'] }
  const runs: (readonly string[])[] = []

  on('session.root', () => ({ value: '/proj' }))
  fakeFs(on, dir => folders[dir])
  on('process.run', ($, e) => {
    runs.push(e.argv)
    const cmd = e.argv[0]
    const path = e.argv[e.argv.length - 1] ?? ''

    if (cmd === '/bin/mkdir') {
      const target = path
      folders[target] = []
      const parent = target.slice(0, target.lastIndexOf('/'))
      folders[parent]?.push(`${target.slice(target.lastIndexOf('/') + 1)}/`)
    }

    return { value: ran('') }
  })

  const ui = await $.ui.mount({ plugin: 'file-copy-macos', surface: 'desktop', ...BAND })
  await ui.press({ key: 'list' })
  const rows = (await ui.findAll({ type: 'Button' }))
    .map(b => b.key ?? '')
    .filter(k => k.startsWith('dir:') || k.startsWith('file:'))
  expect(rows).toEqual(['dir:docs/', 'dir:img/', 'file:a.pdf', 'file:b.pdf'])
  expect((await ui.find({ key: 'dir:docs/' }))?.props.label).toBe('📁 docs/')
  await ui.press({ key: 'dir:docs/' })
  expect(await crumbs(ui)).toEqual(['proj', 'docs'])
  expect(await ui.find({ key: 'file:old.txt' })).toBeDefined()
  expect(await ui.find({ key: 'up' })).toBeDefined()

  // A copy goes to the opened folder.
  const key = (await ui.find({ type: 'Input' }))?.key ?? ''
  await ui.input({ key, text: '/src/x.pdf' })
  expect(runs.find(argv => argv[0] === '/bin/sh')?.[4]).toBe('/proj/docs')

  // A bad name and a taken name are refused; a good one is created and opened.
  await ui.press({ key: 'new-folder' })
  await ui.input({ key: 'folder-name', text: '../out' })
  expect(await ui.find({ type: 'Text', text: /cannot be "\." or "\.\."/ })).toBeDefined()
  folders['/proj/docs/taken'] = []
  await ui.input({ key: 'folder-name', text: 'taken' })
  expect(await ui.find({ type: 'Text', text: '"taken" already exists here.' })).toBeDefined()
  await ui.input({ key: 'folder-name', text: '2026' })
  expect(runs).toContainEqual(['/bin/mkdir', '-p', '/proj/docs/2026'])
  expect(await crumbs(ui)).toEqual(['proj', 'docs', '2026'])
  expect(await ui.find({ key: 'folder-name' })).toBeUndefined()

  // A folder of the path opens it: one level up, then the project itself.
  await ui.press({ key: 'crumb:1' })
  expect(await crumbs(ui)).toEqual(['proj', 'docs'])
  expect(await ui.find({ key: 'file:old.txt' })).toBeDefined()
  await ui.press({ key: 'crumb:0' })
  expect(await crumbs(ui)).toEqual(['proj'])
  expect(await ui.find({ key: 'up' })).toBeUndefined()

  // And back down: ⤴️ up goes one level.
  await ui.press({ key: 'dir:docs/' })
  await ui.press({ key: 'up' })
  expect(await crumbs(ui)).toEqual(['proj'])
  await ui.unmount()

  const fyi = session.appended().filter(r => r.message.type === 'user')
  expect(JSON.stringify(fyi)).toContain('created the folder /proj/docs/2026')
})

test('Content renames a file, never over another one', async ($, on) => {
  const session = mock.session(on)
  let folder = ['a.pdf', 'b.pdf']
  const moves: (readonly string[])[] = []

  on('session.root', () => ({ value: '/proj' }))
  fakeFs(on, dir => (dir === '/proj' ? folder : undefined))
  on('process.run', ($, e) => {
    const [cmd] = e.argv
    const last = e.argv[e.argv.length - 1] ?? ''

    if (cmd === '/bin/mv') {
      moves.push(e.argv)
      const from = (e.argv[2] ?? '').slice('/proj/'.length)
      folder = folder.map(n => (n === from ? last.slice('/proj/'.length) : n))
    }

    return { value: ran('') }
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    folder = ['a.pdf', 'b.pdf']
    moves.length = 0
    const ui = await $.ui.mount({ plugin: 'file-copy-macos', surface, ...BAND })
    await ui.press({ key: 'list' })

    await ui.press({ key: 'rename:a.pdf' })
    expect((await ui.find({ key: 'rename-field:a.pdf' }))?.props.value).toBe('a.pdf')

    await ui.input({ key: 'rename-field:a.pdf', text: 'b.pdf' })
    expect(await ui.find({ type: 'Text', text: '"b.pdf" already exists here.' })).toBeDefined()
    await ui.input({ key: 'rename-field:a.pdf', text: 'x/y.pdf' })
    expect(await ui.find({ type: 'Text', text: 'A file name cannot contain "/".' })).toBeDefined()
    expect(moves).toEqual([])

    await ui.input({ key: 'rename-field:a.pdf', text: 'Report 2026.pdf' })
    expect(moves).toEqual([['/bin/mv', '-n', '/proj/a.pdf', '/proj/Report 2026.pdf']])
    expect(await ui.find({ key: 'rename-field:a.pdf' })).toBeUndefined()
    expect(await ui.find({ key: 'file:Report 2026.pdf' })).toBeDefined()

    await ui.press({ key: 'rename:b.pdf' })
    await ui.press({ key: 'cancel-rename' })
    expect(await ui.find({ key: 'rename-field:b.pdf' })).toBeUndefined()
    await ui.press({ key: 'list' })
    await ui.unmount()
  }

  const fyi = session.appended().filter(r => r.message.type === 'user')
  expect(JSON.stringify(fyi[0])).toContain('renamed the file a.pdf to Report 2026.pdf')
})

test('Copy only new shows the kept files as Skipped, not as Failed', async ($, on) => {
  on('session.root', () => ({ value: '/proj' }))
  on('process.run', ($, e) => {
    const mode = e.argv[0] === '/bin/sh' ? (e.argv[5] ?? '') : ''

    if (mode === 'check') {
      return { value: ran('CONFLICT\t/src/a.txt\ta.txt\n') }
    }

    if (mode === 'skip') {
      return {
        value: ran('SKIP\t/src/a.txt\tkept the existing file\nOK\t/src/b.txt\tb.txt\t\nFAIL\t/src/c.txt\tnot found\n'),
      }
    }

    return { value: ran('') }
  })

  const ui = await $.ui.mount({ plugin: 'file-copy-macos', surface: 'desktop', ...BAND })
  const key = (await ui.find({ type: 'Input' }))?.key ?? ''
  await ui.input({ key, text: '/src/a.txt /src/b.txt /src/c.txt' })
  await ui.press({ key: 'skip' })

  expect(await ui.find({ type: 'Text', text: 'b.txt' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '⏭️ Skipped:' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'a.txt (kept the existing file)' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'c.txt (not found)' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /kept the existing file.*not found|not found.*kept/ })).toBeUndefined()
  expect((await ui.findAll({ type: 'Button' })).filter(b => b.key === 'hide').length).toBe(1)
  await ui.unmount()
})

test('Folder opens the folder picker and copies the folders', async ($, on) => {
  mock.clock(on, { now: 100_000 })
  const scripts: string[] = []
  const copies: (readonly string[])[] = []

  on('session.root', () => ({ value: '/proj' }))
  on('process.run', ($, e) => {
    if (e.argv[0] === '/usr/bin/osascript') {
      scripts.push(e.argv.join(' '))

      return { value: ran('/Users/x/Photos/\n') }
    }

    if (e.argv[0] === '/bin/sh') {
      copies.push(e.argv)
    }

    return { value: ran(e.argv[5] === 'keep' ? 'OK\t/Users/x/Photos\tPhotos\t\n' : '') }
  })

  const ui = await $.ui.mount({ plugin: 'file-copy-macos', surface: 'desktop', ...BAND })
  await ui.press({ key: 'pick-folder' })
  expect(scripts[0]).toContain('choose folder')
  expect(copies.find(argv => argv[5] === 'keep')?.slice(6)).toEqual(['/Users/x/Photos/'])
  expect(await ui.find({ type: 'Text', text: 'Photos' })).toBeDefined()

  await ui.press({ key: 'pick' })
  expect(scripts[1]).toContain('choose file')
  await ui.unmount()
})

test('the pasted list shows folders with a folder icon and counts items', async ($, on) => {
  on('session.root', () => ({ value: '/proj' }))
  on('process.run', () => ({ value: ran('') }))
  fakeFs(on, dir => (dir === '/src' ? ['Photos/', 'a.pdf'] : dir === '/src/Photos' ? [] : undefined))

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'file-copy-macos', surface, ...BAND })
    const key = (await ui.find({ type: 'Input' }))?.key ?? ''

    await ui.input({ key, text: '/src/Photos /src/a.pdf', kind: 'change' })
    expect((await ui.find({ key: 'paste:/src/Photos' }))?.props.label).toBe('☑ 📁 Photos')
    expect((await ui.find({ key: 'paste:/src/a.pdf' }))?.props.label).toBe('☑ 📄 a.pdf')
    expect(await ui.find({ type: 'Text', text: '2 items' })).toBeDefined()
    await ui.unmount()
  }
})

test('the Content label and folder rows use emoji on every surface', async ($, on) => {
  on('session.root', () => ({ value: '/proj' }))
  on('process.run', () => ({ value: ran('') }))
  fakeFs(on, dir => (dir === '/proj' ? ['docs/'] : undefined))

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'file-copy-macos', surface, ...BAND })
    expect(await ui.find({ type: 'Text', text: '📚 Content:' })).toBeDefined()
    await ui.press({ key: 'list' })
    expect((await ui.find({ key: 'dir:docs/' }))?.props.label).toBe('📁 docs/')
    expect(await ui.find({ type: 'Svg' })).toBeUndefined()
    await ui.press({ key: 'list' })
    await ui.unmount()
  }
})

test('Open opens a file with its default app, a folder and the target in Finder', async ($, on) => {
  const opened: (readonly string[])[] = []

  on('session.root', () => ({ value: '/proj' }))
  fakeFs(on, dir => (dir === '/proj' ? ['docs/', 'a.pdf'] : undefined))
  on('process.run', ($, e) => {
    if (e.argv[0] === '/usr/bin/open') {
      opened.push(e.argv)
    }

    return { value: ran('') }
  })

  const ui = await $.ui.mount({ plugin: 'file-copy-macos', surface: 'desktop', ...BAND })
  await ui.press({ key: 'list' })
  await ui.press({ key: 'open:a.pdf' })
  await ui.press({ key: 'open:docs/' })
  await ui.press({ key: 'open-target' })
  await ui.press({ key: 'finder-target' })
  expect(opened).toEqual([
    ['/usr/bin/open', '/proj/a.pdf'],
    ['/usr/bin/open', '/proj/docs'],
    ['/usr/bin/open', '/proj'],
    ['/usr/bin/open', '-R', '/proj'],
  ])
  expect(await ui.find({ type: 'Text', text: '/proj/docs' })).toBeUndefined()
  await ui.press({ key: 'list' })
  await ui.unmount()
})

test('sizes read as Finder shows them', async () => {
  expect(humanSize(0)).toBe('0 bytes')
  expect(humanSize(1)).toBe('1 byte')
  expect(humanSize(999)).toBe('999 bytes')
  expect(humanSize(1000)).toBe('1.0 KB')
  expect(humanSize(13_422)).toBe('13 KB')
  expect(humanSize(1_250_000)).toBe('1.3 MB')
  expect(humanSize(3_400_000_000)).toBe('3.4 GB')
})

test('Content shows each file size and none for folders', async ($, on) => {
  on('session.root', () => ({ value: '/proj' }))
  on('process.run', () => ({ value: ran('') }))
  fakeFs(on, dir => (dir === '/proj' ? ['docs/', 'a.pdf', 'My File.txt'] : undefined), {
    '/proj/a.pdf': 13422,
    '/proj/My File.txt': 512,
  })

  const ui = await $.ui.mount({ plugin: 'file-copy-macos', surface: 'desktop', ...BAND })
  await ui.press({ key: 'list' })
  expect(await ui.find({ type: 'Text', text: '13 KB' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '512 bytes' })).toBeDefined()
  expect((await ui.findAll({ type: 'Text', text: /bytes$|KB$/ })).length).toBe(2)
  await ui.press({ key: 'list' })
  await ui.unmount()
})

test('the desktop band links the version to the README, the terminal has no link', async ($, on) => {
  on('session.root', () => ({ value: '/proj' }))
  on('process.run', () => ({ value: ran('') }))
  on('fs.read', () => ({ value: JSON.stringify({ name: 'file-copy-macos', version: '9.8.7' }) }))
  on('session.start', () => ({ cwd: '/proj' }))
  await $.session.start({ cwd: '/proj', surface: 'desktop', isInteractive: true })

  const desktop = await $.ui.mount({ plugin: 'file-copy-macos', surface: 'desktop', ...BAND })
  const link = await desktop.find({ type: 'Link' })
  expect(link?.props.href).toBe('https://github.com/olafrv/file-copy-macos#readme')
  expect(link?.children).toEqual(['v9.8.7'])
  await desktop.unmount()

  const terminal = await $.ui.mount({ plugin: 'file-copy-macos', surface: 'terminal', ...BAND })
  expect(await terminal.find({ type: 'Link' })).toBeUndefined()
  await terminal.unmount()
})

test('the file list deletes ticked folders with their contents after a confirmation', async ($, on) => {
  const session = mock.session(on)
  const trashed: string[] = []
  let folder = ['a.pdf', 'docs/', 'old/']

  on('session.root', () => ({ value: '/proj' }))
  fakeFs(on, dir => (dir === '/proj' ? folder : undefined))
  on('process.run', ($, e) => {
    if (e.argv[0] === '/usr/bin/trash') {
      const path = e.argv[1] ?? ''
      trashed.push(path)
      folder = folder.filter(name => `/proj/${name.replace(/\/$/, '')}` !== path)
    }

    return { value: ran('') }
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    trashed.length = 0
    folder = ['a.pdf', 'docs/', 'old/']
    const ui = await $.ui.mount({ plugin: 'file-copy-macos', surface, ...BAND })

    await ui.press({ key: 'list' })
    await ui.press({ key: 'tick:docs/' })
    expect(await ui.find({ key: 'dir:docs/' })).toBeDefined()
    await ui.press({ key: 'delete-selected' })
    expect(
      await ui.find({
        type: 'Text',
        text: 'Delete the selected folder? Folders go to the Trash with all their contents.',
      }),
    ).toBeDefined()
    await ui.press({ key: 'cancel-delete' })
    expect(trashed).toEqual([])

    await ui.press({ key: 'tick:old/' })
    await ui.press({ key: 'tick:a.pdf' })
    await ui.press({ key: 'delete-selected' })
    expect(
      await ui.find({
        type: 'Text',
        text: 'Delete 1 file and 2 folders? Folders go to the Trash with all their contents.',
      }),
    ).toBeDefined()
    await ui.press({ key: 'confirm-delete' })
    expect([...trashed].sort()).toEqual(['/proj/a.pdf', '/proj/docs', '/proj/old'])
    expect(await ui.find({ key: 'dir:docs/' })).toBeUndefined()
    expect(await ui.find({ key: 'dir:old/' })).toBeUndefined()
    await ui.press({ key: 'list' })
    await ui.unmount()
  }

  const fyi = session.appended().filter(r => r.message.type === 'user')
  expect(fyi.length).toBe(2)
  expect(JSON.stringify(fyi[0])).toContain('1 file and 2 folders')
})

test('Content renames a folder, never over another one', async ($, on) => {
  const session = mock.session(on)
  let folder = ['docs/', 'old/', 'a.pdf']
  const moves: (readonly string[])[] = []
  const bare = (path: string) => path.slice('/proj/'.length)

  on('session.root', () => ({ value: '/proj' }))
  fakeFs(on, dir => (dir === '/proj' ? folder : undefined))
  on('process.run', ($, e) => {
    const [cmd] = e.argv
    const last = e.argv[e.argv.length - 1] ?? ''

    if (cmd === '/bin/mv') {
      moves.push(e.argv)
      const from = `${bare(e.argv[2] ?? '')}/`
      folder = folder.map(n => (n === from ? `${bare(last)}/` : n))
    }

    return { value: ran('') }
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    folder = ['docs/', 'old/', 'a.pdf']
    moves.length = 0
    const ui = await $.ui.mount({ plugin: 'file-copy-macos', surface, ...BAND })
    await ui.press({ key: 'list' })

    await ui.press({ key: 'rename:docs/' })
    expect((await ui.find({ key: 'rename-field:docs/' }))?.props.value).toBe('docs')

    await ui.input({ key: 'rename-field:docs/', text: 'old' })
    expect(await ui.find({ type: 'Text', text: '"old" already exists here.' })).toBeDefined()
    await ui.input({ key: 'rename-field:docs/', text: 'a/b' })
    expect(await ui.find({ type: 'Text', text: 'A folder name cannot contain "/".' })).toBeDefined()
    expect(moves).toEqual([])

    await ui.input({ key: 'rename-field:docs/', text: 'Docs 2026' })
    expect(moves).toEqual([['/bin/mv', '-n', '/proj/docs', '/proj/Docs 2026']])
    expect(await ui.find({ key: 'rename-field:docs/' })).toBeUndefined()
    expect(await ui.find({ key: 'dir:Docs 2026/' })).toBeDefined()
    expect(await ui.find({ key: 'dir:docs/' })).toBeUndefined()

    await ui.press({ key: 'rename:old/' })
    await ui.press({ key: 'cancel-rename' })
    expect(await ui.find({ key: 'rename-field:old/' })).toBeUndefined()
    await ui.press({ key: 'list' })
    await ui.unmount()
  }

  const fyi = session.appended().filter(r => r.message.type === 'user')
  expect(JSON.stringify(fyi[0])).toContain('renamed the folder docs to Docs 2026')
})

test('Content shows 4 entries per page and keeps ticks across pages', async ($, on) => {
  const start = ['d1/', 'd2/', ...Array.from({ length: 7 }, (_, i) => `f${i + 1}.txt`)]
  const trashed: string[] = []
  let folder = [...start]

  on('session.root', () => ({ value: '/proj' }))
  fakeFs(on, dir => (dir === '/proj' ? folder : dir.startsWith('/proj/') ? [] : undefined))
  on('process.run', ($, e) => {
    const [cmd] = e.argv

    if (cmd === '/usr/bin/trash') {
      const path = e.argv[1] ?? ''
      trashed.push(path)
      folder = folder.filter(name => `/proj/${name.replace(/\/$/, '')}` !== path)
    }

    return { value: ran('') }
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    folder = [...start]
    trashed.length = 0
    const ui = await $.ui.mount({ plugin: 'file-copy-macos', surface, ...BAND })
    await ui.press({ key: 'list' })

    // Page 1: the 2 folders, f1 and f2; no Prev.
    expect(await ui.find({ type: 'Text', text: '1/3 (#9)' })).toBeDefined()
    expect(await ui.find({ key: 'dir:d1/' })).toBeDefined()
    expect(await ui.find({ key: 'file:f2.txt' })).toBeDefined()
    expect(await ui.find({ key: 'file:f3.txt' })).toBeUndefined()
    expect(await ui.find({ key: 'page-prev' })).toBeUndefined()

    await ui.press({ key: 'tick:f1.txt' })
    await ui.press({ key: 'page-next' })
    expect(await ui.find({ type: 'Text', text: '2/3 (#9)' })).toBeDefined()
    expect(await ui.find({ key: 'file:f6.txt' })).toBeDefined()
    expect(await ui.find({ key: 'file:f1.txt' })).toBeUndefined()

    await ui.press({ key: 'page-next' })
    expect(await ui.find({ key: 'file:f7.txt' })).toBeDefined()
    expect(await ui.find({ key: 'page-next' })).toBeUndefined()

    // A tick from page 1 and one from page 3 are deleted together.
    await ui.press({ key: 'tick:f7.txt' })
    expect(await ui.find({ key: 'delete-selected' })).toBeDefined()
    await ui.press({ key: 'delete-selected' })
    await ui.press({ key: 'confirm-delete' })
    expect([...trashed].sort()).toEqual(['/proj/f1.txt', '/proj/f7.txt'])

    // 7 entries left: page 3 is gone, the last page shows.
    expect(await ui.find({ type: 'Text', text: '2/2 (#7)' })).toBeDefined()
    expect(await ui.find({ key: 'file:f6.txt' })).toBeDefined()

    await ui.press({ key: 'page-prev' })
    expect(await ui.find({ type: 'Text', text: '1/2 (#7)' })).toBeDefined()

    // An empty folder has no page row; going up starts on page 1.
    await ui.press({ key: 'dir:d1/' })
    expect(await ui.find({ type: 'Text', text: 'The folder is empty.' })).toBeDefined()
    expect(await ui.find({ key: 'page-next' })).toBeUndefined()
    await ui.press({ key: 'up' })
    expect(await ui.find({ type: 'Text', text: '1/2 (#7)' })).toBeDefined()

    // Closing and opening the list starts on page 1 again.
    await ui.press({ key: 'page-next' })
    await ui.press({ key: 'list' })
    await ui.press({ key: 'list' })
    expect(await ui.find({ type: 'Text', text: '1/2 (#7)' })).toBeDefined()

    await ui.press({ key: 'list' })
    await ui.unmount()
  }
})

test('Content is a table: header, tick, name, size and actions per row', async ($, on) => {
  const opened: string[] = []
  const long = 'A very long file name that does not fit into the name column at all.pdf'

  on('session.root', () => ({ value: '/proj' }))
  fakeFs(on, dir => (dir === '/proj' ? ['docs/', 'a.pdf', long] : undefined), {
    '/proj/a.pdf': 13000,
    [`/proj/${long}`]: 2000000,
  })
  on('process.run', ($, e) => {
    const [cmd] = e.argv

    if (cmd === '/usr/bin/open') {
      opened.push(e.argv[1] ?? '')
    }

    return { value: ran('') }
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    opened.length = 0
    const ui = await $.ui.mount({ plugin: 'file-copy-macos', surface, ...BAND })
    await ui.press({ key: 'list' })

    expect((await ui.find({ key: 'sort-name' }))?.props.label).toBe('Name ▲')
    expect((await ui.find({ key: 'sort-size' }))?.props.label).toBe('Size')
    expect(await ui.find({ type: 'Text', text: 'Actions' })).toBeDefined()

    expect((await ui.find({ key: 'tick:a.pdf' }))?.props.label).toBe(box(surface, false))
    expect((await ui.find({ key: 'tick:docs/' }))?.props.label).toBe(box(surface, false))
    expect(await ui.find({ key: 'rename:docs/' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '13 KB' })).toBeDefined()

    // A name too long for its column ends in "…" and fits it.
    const label = String((await ui.find({ key: `file:${long}` }))?.props.label)
    expect(label.endsWith('…')).toBe(true)
    // The table takes the whole width (100). In the terminal tick (2), size
    // (9), actions (39), padding and frame (10) and 3 column lines leave 37
    // for the name; on the desktop tick (5, no padding), size, actions,
    // padding and frame (8) leave 39.
    const nameWidth = surface === 'terminal' ? 37 : 39
    expect([...label].length + 1).toBe(nameWidth)

    // A frame on both; column lines and a header line in the terminal only,
    // as the desktop's text font does not match its column widths.
    expect((await ui.find({ key: 'table' }))?.props.borderStyle).toBe('single')
    const line = ['─'.repeat(4), '─'.repeat(nameWidth + 2), '─'.repeat(11), '─'.repeat(41)]
    const hasLines = surface === 'terminal'
    expect((await ui.find({ type: 'Text', text: line.join('┼') })) !== undefined).toBe(hasLines)
    expect((await ui.find({ type: 'Text', text: '│' })) !== undefined).toBe(hasLines)

    // The tick box ticks; the name opens the file.
    await ui.press({ key: 'tick:a.pdf' })
    expect((await ui.find({ key: 'tick:a.pdf' }))?.props.label).toBe(box(surface, true))
    expect(opened).toEqual([])
    await ui.press({ key: 'file:a.pdf' })
    expect(opened).toEqual(['/proj/a.pdf'])

    await ui.press({ key: 'list' })
    await ui.unmount()
  }
})

test('the list filters by name and sorts folders first, by name or size', async () => {
  const names = ['b/', 'A/', 'f10.txt', 'f2.txt', 'Big.iso', 'small.md']
  const sizes = { 'f10.txt': 500, 'f2.txt': 20, 'Big.iso': 9000, 'small.md': 1 }

  expect(viewEntries(names, sizes, '', 'name', false)).toEqual([
    'A/', 'b/', 'Big.iso', 'f2.txt', 'f10.txt', 'small.md',
  ])
  expect(viewEntries(names, sizes, '', 'name', true)).toEqual([
    'b/', 'A/', 'small.md', 'f10.txt', 'f2.txt', 'Big.iso',
  ])
  // By size the folders keep the name order.
  expect(viewEntries(names, sizes, '', 'size', false)).toEqual([
    'A/', 'b/', 'small.md', 'f2.txt', 'f10.txt', 'Big.iso',
  ])
  expect(viewEntries(names, sizes, '', 'size', true)).toEqual([
    'A/', 'b/', 'Big.iso', 'f10.txt', 'f2.txt', 'small.md',
  ])
  // The filter ignores case and the folder's "/".
  expect(viewEntries(names, sizes, ' F1 ', 'name', false)).toEqual(['f10.txt'])
  expect(viewEntries(names, sizes, 'b/', 'name', false)).toEqual([])
  expect(viewEntries(names, sizes, 'b', 'name', false)).toEqual(['b/', 'Big.iso'])
})

test('Content sorts by a header click and filters by name', async ($, on) => {
  on('session.root', () => ({ value: '/proj' }))
  on('process.run', () => ({ value: ran('') }))
  fakeFs(on, dir => (dir === '/proj' ? ['docs/', 'big.zip', 'small.txt', 'mid.pdf'] : undefined), {
    '/proj/big.zip': 9000,
    '/proj/small.txt': 10,
    '/proj/mid.pdf': 500,
  })

  const rows = async (ui: { find: (q: object) => Promise<unknown> }) => {
    const order: string[] = []

    for (const name of ['docs/', 'big.zip', 'mid.pdf', 'small.txt']) {
      const key = name.endsWith('/') ? `dir:${name}` : `file:${name}`
      if ((await ui.find({ key })) !== undefined) order.push(name)
    }

    return order
  }

  // Clear and closing the list each draw a new, empty filter field.
  let fieldId = 0

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'file-copy-macos', surface, ...BAND })
    await ui.press({ key: 'list' })

    // Each surface starts where the last one left the order: reset it.
    while ((await ui.find({ key: 'sort-name' }))?.props.label !== 'Name ▲') {
      await ui.press({ key: 'sort-name' })
    }

    await ui.press({ key: 'sort-size' })
    expect((await ui.find({ key: 'sort-size' }))?.props.label).toBe('Size ▲')
    expect((await ui.find({ key: 'sort-name' }))?.props.label).toBe('Name')
    await ui.press({ key: 'sort-size' })
    expect((await ui.find({ key: 'sort-size' }))?.props.label).toBe('Size ▼')
    await ui.press({ key: 'sort-name' })
    expect((await ui.find({ key: 'sort-name' }))?.props.label).toBe('Name ▲')

    await ui.input({ key: `filter-${fieldId}`, text: 'I', kind: 'change' })
    expect(await rows(ui)).toEqual(['big.zip', 'mid.pdf'])
    expect(await ui.find({ key: 'clear-filter' })).toBeDefined()

    await ui.input({ key: `filter-${fieldId}`, text: 'nothing', kind: 'change' })
    expect(await ui.find({ type: 'Text', text: 'No name contains "nothing".' })).toBeDefined()

    await ui.press({ key: 'clear-filter' })
    fieldId += 1
    expect(await ui.find({ key: `filter-${fieldId}` })).toBeDefined()
    expect(await rows(ui)).toEqual(['docs/', 'big.zip', 'mid.pdf', 'small.txt'])

    // With the list closed the field stays; typing in it opens the list.
    await ui.press({ key: 'list' })
    fieldId += 1
    expect(await ui.find({ key: 'sort-name' })).toBeUndefined()
    await ui.input({ key: `filter-${fieldId}`, text: 'big', kind: 'change' })
    expect(await rows(ui)).toEqual(['big.zip'])
    expect((await ui.find({ key: 'list' }))?.props.label).toBe('🙈 Hide')

    await ui.press({ key: 'list' })
    fieldId += 1
    await ui.unmount()
  }
})

test('🧲 Download copies the newest item of ~/Downloads', async ($, on) => {
  const copies: (readonly string[])[] = []
  // A file still downloading is never the newest; a folder's time comes from stat.
  let downloads = ['report.pdf', 'old.txt', 'photos/', 'big.iso.crdownload', '.DS_Store']

  mock.env(on, { HOME: '/Users/me' })
  on('session.root', () => ({ value: '/proj' }))
  fakeFs(
    on,
    dir => (dir === '/Users/me/Downloads' ? downloads : dir === '/Users/me/Downloads/photos' ? [] : undefined),
    {},
    {
      '/Users/me/Downloads/report.pdf': 300,
      '/Users/me/Downloads/old.txt': 100,
      '/Users/me/Downloads/photos': 200,
      '/Users/me/Downloads/big.iso.crdownload': 900,
      '/Users/me/Downloads/.DS_Store': 950,
    },
  )
  on('process.run', ($, e) => {
    if (e.argv[0] === '/bin/sh' && e.argv[5] === 'check') {
      return { value: ran('') }
    }

    if (e.argv[0] === '/bin/sh') {
      copies.push(e.argv.slice(4))
      return { value: ran('OK\t/Users/me/Downloads/report.pdf\treport.pdf\t\n') }
    }

    return { value: ran('') }
  })

  const ui = await $.ui.mount({ plugin: 'file-copy-macos', surface: 'desktop', ...BAND })
  await ui.press({ key: 'latest-download' })
  expect(copies).toEqual([['/proj', 'keep', '/Users/me/Downloads/report.pdf']])
  expect(await ui.find({ type: 'Text', text: 'report.pdf' })).toBeDefined()

  // Without the file, the folder is the newest.
  downloads = ['old.txt', 'photos/']
  await ui.press({ key: 'latest-download' })
  expect(copies[1]).toEqual(['/proj', 'keep', '/Users/me/Downloads/photos'])

  // Nothing to copy: no copy.
  downloads = ['.DS_Store', 'x.part']
  await ui.press({ key: 'latest-download' })
  expect(copies.length).toBe(2)
  await ui.unmount()
})

test('the clock reads the zone from macOS and shows date, time and zone', async () => {
  expect(parseZone('+0200 CEST\n')).toEqual({ offset: 120, name: 'CEST' })
  expect(parseZone('-0330 NST')).toEqual({ offset: -210, name: 'NST' })
  expect(parseZone('')).toEqual({ offset: 0, name: 'UTC' })

  // 12:32:15 UTC is 14:32 in CEST; seconds are not shown.
  expect(formatClock(Date.UTC(2026, 9, 13, 12, 32, 15), 120, 'CEST')).toBe('13.10.2026 14:32 CEST')
  // Late UTC evening is already the next day east of UTC, and the day before west of it.
  expect(formatClock(Date.UTC(2025, 11, 31, 23, 30), 60, 'CET')).toBe('01.01.2026 00:30 CET')
  expect(formatClock(Date.UTC(2026, 0, 1, 2, 0), -300, 'EST')).toBe('31.12.2025 21:00 EST')
})

test('the Finder row shows the clock on both surfaces, the version on the desktop', async ($, on) => {
  on('session.root', () => ({ value: '/proj' }))
  on('clock.now', () => ({ value: Date.UTC(2026, 9, 13, 12, 32, 15) }))
  on('process.run', ($, e) => ({ value: ran(e.argv[0] === '/bin/date' ? '+0200 CEST\n' : '') }))
  on('fs.read', () => ({ value: JSON.stringify({ name: 'file-copy-macos', version: '9.8.7' }) }))

  on('session.start', () => ({ cwd: '/proj' }))
  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'file-copy-macos', surface, ...BAND })
    expect(await ui.find({ type: 'Text', text: '13.10.2026 14:32 CEST' })).toBeDefined()
    // On the desktop a middle dot, then the version as a link, all in the
    // clock's own Text, so no gap of the row widens the space before the dot.
    const version = await ui.find({ type: 'Link' })
    expect(version?.children).toEqual(surface === 'desktop' ? ['v9.8.7'] : undefined)
    const clock = await ui.find({ type: 'Text', text: '13.10.2026 14:32 CEST' })
    const parts = (clock?.children ?? []).filter(c => typeof c === 'string')
    expect(parts).toEqual(
      surface === 'desktop' ? ['13.10.2026 14:32 CEST', ' · '] : ['13.10.2026 14:32 CEST'],
    )
    await ui.unmount()
  }
})

test('Ask puts @paths into the prompt; the header tick selects all shown', async ($, on) => {
  const fills: { text: string; mode: string }[] = []

  on('session.root', () => ({ value: '/proj' }))
  on('process.run', () => ({ value: ran('') }))
  fakeFs(on, dir =>
    dir === '/proj' ? ['docs/', 'a.pdf', 'My File.txt'] : dir === '/proj/docs' ? ['q1.csv'] : undefined,
  )
  on('prompt.fill', ($, e) => {
    fills.push({ text: e.text, mode: e.mode })
    return { isFilled: true, text: e.text, cursor: e.text.length }
  })

  // Clear, opening a folder, going up and closing the list each draw a new
  // filter field.
  let fieldId = 0

  for (const surface of ['terminal', 'desktop'] as const) {
    fills.length = 0
    const ui = await $.ui.mount({ plugin: 'file-copy-macos', surface, ...BAND })
    await ui.press({ key: 'list' })

    // One item, at the cursor; a path with a space is quoted.
    await ui.press({ key: 'mention:a.pdf' })
    await ui.press({ key: 'mention:My File.txt' })
    expect(fills).toEqual([
      { text: '@a.pdf ', mode: 'insert' },
      { text: '@"My File.txt" ', mode: 'insert' },
    ])

    // The header tick ticks all shown, and again unticks them.
    expect((await ui.find({ key: 'tick-all' }))?.props.label).toBe(box(surface, false))
    await ui.press({ key: 'tick-all' })
    expect((await ui.find({ key: 'tick-all' }))?.props.label).toBe(box(surface, true))
    expect((await ui.find({ key: 'tick:docs/' }))?.props.label).toBe(box(surface, true))
    expect(await ui.find({ type: 'Text', text: '3 selected:' })).toBeDefined()
    await ui.press({ key: 'tick-all' })
    expect(await ui.find({ key: 'delete-selected' })).toBeUndefined()

    // With a filter, only the matching items are ticked.
    await ui.input({ key: `filter-${fieldId}`, text: 'a.', kind: 'change' })
    await ui.press({ key: 'tick-all' })
    expect(await ui.find({ type: 'Text', text: '1 selected:' })).toBeDefined()
    await ui.press({ key: 'mention-selected' })
    expect(fills[2]).toEqual({ text: '@a.pdf ', mode: 'insert' })
    await ui.press({ key: 'tick-all' })
    await ui.press({ key: 'clear-filter' })
    fieldId += 1

    // In a subfolder the path starts at the project root.
    await ui.press({ key: 'dir:docs/' })
    fieldId += 1
    await ui.press({ key: 'mention:q1.csv' })
    expect(fills[3]).toEqual({ text: '@docs/q1.csv ', mode: 'insert' })
    await ui.press({ key: 'up' })
    fieldId += 1

    await ui.press({ key: 'list' })
    fieldId += 1
    await ui.unmount()
  }
})

test('Copy puts items on the clipboard, also the ticked ones; Finder selects one item there', async ($, on) => {
  const runs: (readonly string[])[] = []

  on('session.root', () => ({ value: '/proj' }))
  fakeFs(on, dir => (dir === '/proj' ? ['docs/', 'a.pdf', 'My File.txt'] : undefined))
  on('process.run', ($, e) => {
    if (e.argv[0] === '/usr/bin/osascript' || e.argv[0] === '/usr/bin/open') {
      runs.push(e.argv)
      return { value: ran(e.argv[0] === '/usr/bin/osascript' ? `${e.argv.length - 5}\n` : '') }
    }

    return { value: ran('') }
  })

  const ui = await $.ui.mount({ plugin: 'file-copy-macos', surface: 'desktop', ...BAND })
  await ui.press({ key: 'list' })
  await ui.press({ key: 'tick:docs/' })
  await ui.press({ key: 'tick:My File.txt' })
  expect(await ui.find({ type: 'Text', text: '2 selected:' })).toBeDefined()
  expect(await ui.find({ key: 'reveal-selected' })).toBeUndefined()

  // Folders without their "/", spaces as they are: each path is one argument.
  await ui.press({ key: 'copy-selected' })
  expect(runs[0]?.slice(0, 4)).toEqual(['/usr/bin/osascript', '-l', 'JavaScript', '-e'])
  expect(String(runs[0]?.[4])).toContain('writeObjects')
  expect(runs[0]?.slice(5)).toEqual(['/proj/docs', '/proj/My File.txt'])

  // Finder and Copy are row actions, for files and folders alike.
  expect((await ui.find({ key: 'show:docs/' }))?.props.label).toBe('📌 Locate')
  await ui.press({ key: 'show:docs/' })
  await ui.press({ key: 'show:My File.txt' })
  expect(runs.slice(1)).toEqual([
    ['/usr/bin/open', '-R', '/proj/docs'],
    ['/usr/bin/open', '-R', '/proj/My File.txt'],
  ])
  expect((await ui.find({ key: 'copy:a.pdf' }))?.props.label).toBe('📋 Copy')
  await ui.press({ key: 'copy:a.pdf' })
  expect(runs[3]?.slice(5)).toEqual(['/proj/a.pdf'])

  await ui.press({ key: 'list' })
  await ui.unmount()
})

test('Paste adds the files copied in Finder with Cmd+C; the field adds with Add', async ($, on) => {
  const copies: (readonly string[])[] = []
  let clipboard = '/Users/me/Desktop/My File.pdf\n/Users/me/Desktop/photos\n'

  on('session.root', () => ({ value: '/proj' }))
  on('process.run', ($, e) => {
    if (e.argv[0] === '/usr/bin/osascript' && String(e.argv[4]).includes('public.file-url')) {
      return { value: ran(clipboard) }
    }

    if (e.argv[0] === '/bin/sh' && e.argv[5] === 'check') {
      return { value: ran('') }
    }

    if (e.argv[0] === '/bin/sh' && e.argv[5] === 'keep') {
      copies.push(e.argv.slice(6))
      return { value: ran('OK\t/Users/me/Desktop/My File.pdf\tMy File.pdf\t\n') }
    }

    return { value: ran('') }
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    copies.length = 0
    clipboard = '/Users/me/Desktop/My File.pdf\n/Users/me/Desktop/photos\n'
    const ui = await $.ui.mount({ plugin: 'file-copy-macos', surface, ...BAND })
    expect((await ui.find({ key: 'paste-files' }))?.props.label).toBe('📥 Paste')
    expect((await ui.find({ key: 'source-0' }))?.props.submitLabel).toBe('📥 Add')

    await ui.press({ key: 'paste-files' })
    expect(copies).toEqual([['/Users/me/Desktop/My File.pdf', '/Users/me/Desktop/photos']])

    // Text on the clipboard, or nothing: no copy.
    clipboard = ''
    await ui.press({ key: 'paste-files' })
    expect(copies.length).toBe(1)
    await ui.unmount()
  }
})

test('the Finder row names both ways from Finder; the terminal also names drag', async ($, on) => {
  on('session.root', () => ({ value: '/proj' }))
  on('process.run', () => ({ value: ran('') }))
  const tip = '⌘C > 📥 Paste or ⌥⌘C > ⌘V in Src > 📥 Add'

  const desktop = await $.ui.mount({ plugin: 'file-copy-macos', surface: 'desktop', ...BAND })
  expect(await desktop.find({ type: 'Text', text: '💡 Finder:' })).toBeDefined()
  expect(await desktop.find({ type: 'Text', text: tip })).toBeDefined()
  await desktop.unmount()

  const terminal = await $.ui.mount({ plugin: 'file-copy-macos', surface: 'terminal', ...BAND })
  expect(await terminal.find({ type: 'Text', text: `Drag into Src > 📥 Add or ${tip}` })).toBeDefined()
  await terminal.unmount()
})

test('Find searches subfolders with git: Folder column, warnings, rename in place', { options: { searchSkip: '.venv, dist/' } }, async ($, on) => {
  const gits: { argv: readonly string[]; cwd?: string }[] = []
  const moves: (readonly string[])[] = []
  const fills: string[] = []
  let files = [
    'docs/2026/report.pdf',
    'docs/reports/a.txt',
    'archive/x/report-old.pdf',
    '.venv/lib/report.py',
    'dist/report.js',
    'notes.md',
  ]
  let isSlow = false
  const tree: Record<string, string[]> = {
    '/proj': ['docs/', 'archive/', 'notes.md'],
    '/proj/docs': ['2026/', 'reports/'],
    '/proj/docs/2026': ['report.pdf'],
    '/proj/docs/reports': ['a.txt'],
    '/proj/archive': ['x/'],
    '/proj/archive/x': ['report-old.pdf'],
  }

  on('session.root', () => ({ value: '/proj' }))
  fakeFs(on, dir => tree[dir], { '/proj/docs/2026/report.pdf': 13000 })
  on('process.run', ($, e) => {
    const [cmd] = e.argv

    if (cmd === '/usr/bin/git') {
      gits.push({ argv: e.argv, cwd: e.init?.cwd })

      if (e.argv.includes('rev-parse')) {
        return { value: ran('true\n') }
      }

      return isSlow ? { deny: 'timed out' } : { value: ran(files.map(f => `${f}\0`).join('')) }
    }

    if (cmd === '/bin/mv') {
      moves.push(e.argv)
      // Move the name in its folder, as mv would.
      const [from = '', to = ''] = e.argv.slice(2)
      const folder = from.slice(0, from.lastIndexOf('/'))
      tree[folder] = (tree[folder] ?? []).map(n =>
        n === from.slice(folder.length + 1) ? to.slice(to.lastIndexOf('/') + 1) : n,
      )
    }

    return { value: ran('') }
  })
  on('prompt.fill', ($, e) => {
    fills.push(e.text)
    return { isFilled: true, text: e.text, cursor: e.text.length }
  })

  const ui = await $.ui.mount({ plugin: 'file-copy-macos', surface: 'terminal', ...BAND })

  // Find (Enter) opens the list and asks git, with fsmonitor off, for what
  // it tracks and the new files .gitignore lets through.
  await ui.input({ key: 'filter-0', text: 'report' })
  expect(gits[1]).toEqual({
    argv: ['/usr/bin/git', '-c', 'core.fsmonitor=false', 'ls-files', '-z', '-co', '--exclude-standard'],
    cwd: '/proj',
  })
  expect(await ui.find({ key: 'sort-folder' })).toBeDefined()
  // Files and folders whose own name holds the text; not in .venv or dist.
  expect(await ui.find({ key: 'file:docs/2026/report.pdf' })).toBeDefined()
  expect(await ui.find({ key: 'dir:docs/reports/' })).toBeDefined()
  expect(await ui.find({ key: 'file:archive/x/report-old.pdf' })).toBeDefined()
  expect(await ui.find({ key: 'file:.venv/lib/report.py' })).toBeUndefined()
  expect(await ui.find({ key: 'file:dist/report.js' })).toBeUndefined()
  expect((await ui.find({ key: 'file:docs/2026/report.pdf' }))?.props.label).toBe('📄 report.pdf')
  expect((await ui.find({ key: 'folder:docs/2026/report.pdf' }))?.props.label).toBe('docs/2026')
  // The full folder, revealed while the pointer is over the cell.
  const tip = await ui.find({ type: 'Text', text: ' /proj/docs/2026 ' })
  expect(tip?.props.inverse).toBe(true)
  expect((await ui.find({ key: 'dir:docs/reports/' }))?.props.label).toBe('📁 reports/')
  expect(await ui.find({ type: 'Text', text: '13 KB' })).toBeDefined()

  // Ask writes the path from the project.
  await ui.press({ key: 'mention:docs/2026/report.pdf' })
  expect(fills).toEqual(['@docs/2026/report.pdf '])

  // Rename keeps the item in its own folder.
  await ui.press({ key: 'rename:docs/2026/report.pdf' })
  expect((await ui.find({ key: 'rename-field:docs/2026/report.pdf' }))?.props.value).toBe('report.pdf')
  await ui.input({ key: 'rename-field:docs/2026/report.pdf', text: 'final.pdf' })
  expect(moves).toEqual([['/bin/mv', '-n', '/proj/docs/2026/report.pdf', '/proj/docs/2026/final.pdf']])
  expect((await ui.find({ key: 'file:docs/2026/final.pdf' }))?.props.label).toBe('📄 final.pdf')

  // Typing ends the search: the list shows the target again.
  await ui.input({ key: 'filter-0', text: 'doc', kind: 'change' })
  expect(await ui.find({ key: 'sort-folder' })).toBeUndefined()
  expect(await ui.find({ key: 'dir:docs/' })).toBeDefined()

  // More than 500 results: the first 500 and a warning.
  files = Array.from({ length: 501 }, (_, i) => `a/f${i}.txt`)
  await ui.input({ key: 'filter-0', text: '.txt' })
  expect(await ui.find({ type: 'Text', text: '1/125 (#500)' })).toBeDefined()
  expect(
    await ui.find({
      type: 'Text',
      text: '⚠ More than 500 results: showing the first 500. Use a longer search text.',
    }),
  ).toBeDefined()

  // The time limit: git ran too long, and a warning.
  isSlow = true
  await ui.input({ key: 'filter-0', text: 'f1' })
  expect(
    await ui.find({
      type: 'Text',
      text: '⚠ The search stopped after 5 seconds: the results may be incomplete.',
    }),
  ).toBeDefined()
  isSlow = false

  // Nothing found.
  files = ['notes.md']
  await ui.input({ key: 'filter-0', text: 'zzz' })
  expect(await ui.find({ type: 'Text', text: 'Nothing found for "zzz" in this folder and below.' })).toBeDefined()

  // A click on a folder in the Folder column opens it, and ends the search.
  files = ['archive/x/report-old.pdf']
  await ui.input({ key: 'filter-0', text: 'old' })
  await ui.press({ key: 'folder:archive/x/report-old.pdf' })
  expect(await ui.find({ key: 'sort-folder' })).toBeUndefined()
  expect(await ui.find({ key: 'up' })).toBeDefined()

  await ui.unmount()
})

test('Find outside git walks the folders, skips the setting\'s folders and stops in time', { options: { searchSkip: 'node_modules, .venv' } }, async ($, on) => {
  const tree: Record<string, string[]> = {
    '/proj': ['src/', 'node_modules/', '.venv/', 'Readme.md'],
    '/proj/src': ['App.tsx', 'deep/'],
    '/proj/src/deep': ['äpfel.ts'],
    '/proj/node_modules': ['app.js'],
    '/proj/.venv': ['app.py'],
  }
  let now = 0
  let step = 0

  on('session.root', () => ({ value: '/proj' }))
  fakeFs(on, dir => tree[dir])
  on('clock.now', () => ({ value: (now += step) }))
  on('process.run', ($, e) => ({
    value: e.argv.includes('rev-parse') ? { ...ran(''), exitCode: 128 } : ran(''),
  }))

  const ui = await $.ui.mount({ plugin: 'file-copy-macos', surface: 'desktop', ...BAND })

  // Names in any case, umlauts included; skipped folders are not entered.
  await ui.input({ key: 'filter-0', text: 'APP' })
  expect(await ui.find({ key: 'file:src/App.tsx' })).toBeDefined()
  expect(await ui.find({ key: 'file:node_modules/app.js' })).toBeUndefined()
  expect(await ui.find({ key: 'file:.venv/app.py' })).toBeUndefined()

  await ui.input({ key: 'filter-0', text: 'ÄPF' })
  expect(await ui.find({ key: 'file:src/deep/äpfel.ts' })).toBeDefined()

  // Each folder read takes 2 seconds here: the walk stops after 5.
  step = 2000
  await ui.input({ key: 'filter-0', text: 'pfel' })
  expect(await ui.find({ key: 'file:src/deep/äpfel.ts' })).toBeUndefined()
  expect(
    await ui.find({
      type: 'Text',
      text: '⚠ The search stopped after 5 seconds: the results may be incomplete.',
    }),
  ).toBeDefined()
  await ui.unmount()
})

test('only plain names and paths below the target are listed', async () => {
  for (const ok of ['a.pdf', 'docs/', 'docs/2026/a.pdf', '.env', 'ä ö.txt', '..hidden']) {
    expect(isSafeEntry(ok)).toBe(true)
  }

  // A name with a line break would split into a fake ".." line: never listed.
  for (const bad of ['', '.', '..', '../', 'a/../b', '/etc/passwd', 'a//b', './a', 'a\nb', 'a\tb']) {
    expect(isSafeEntry(bad)).toBe(false)
  }
})

test('Clear goes back to page 1', async ($, on) => {
  const names = ['d1/', ...Array.from({ length: 9 }, (_, i) => `f${i + 1}.txt`)]

  on('session.root', () => ({ value: '/proj' }))
  on('process.run', () => ({ value: ran('') }))
  fakeFs(on, dir => (dir === '/proj' ? names : undefined))

  const ui = await $.ui.mount({ plugin: 'file-copy-macos', surface: 'terminal', ...BAND })
  await ui.input({ key: 'filter-0', text: 'f', kind: 'change' })
  await ui.press({ key: 'page-next' })
  expect(await ui.find({ type: 'Text', text: '2/3 (#9)' })).toBeDefined()

  await ui.press({ key: 'clear-filter' })
  expect(await ui.find({ type: 'Text', text: '1/3 (#10)' })).toBeDefined()
  await ui.unmount()
})

test('only the buttons whose label does not say enough carry a help tip', async ($, on) => {
  on('session.root', () => ({ value: '/proj' }))
  on('process.run', () => ({ value: ran('') }))
  fakeFs(on, dir => (dir === '/proj' ? ['docs/', 'a.pdf'] : undefined))

  const kept = [
    ' Copy here the files you copied in Finder with Cmd+C ',
    ' Copy here the newest item of ~/Downloads ',
    ' ⌘ = Command, ⌥ = Option. Copy files in Finder and press 📥 Paste, or copy their paths with Option+Command+C, paste them into Src and press 📥 Add ',
  ]
  const gone = [
    ' Show the target folder selected in its parent folder ',
    ' Pick files to copy into the target ',
    ' Open the target folder in Finder ',
    ' Create a folder in the target and open it ',
    ' Sort by size; click again to reverse ',
    ' Put @path into the prompt to ask Claude about it ',
    ' Put the ticked items on the clipboard as files ',
  ]

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'file-copy-macos', surface, ...BAND })
    await ui.press({ key: 'list' })
    await ui.press({ key: 'tick:a.pdf' })

    // Always there, revealed while the pointer is over its button; no switch.
    for (const text of kept) {
      expect((await ui.find({ type: 'Text', text }))?.props.inverse).toBe(true)
    }

    for (const text of gone) {
      expect(await ui.find({ type: 'Text', text })).toBeUndefined()
    }

    expect(await ui.find({ key: 'tips' })).toBeUndefined()
    await ui.press({ key: 'tick:a.pdf' })
    await ui.press({ key: 'list' })
    await ui.unmount()
  }
})

test('a long Target path is shortened: first the text above the project, then the middle', async ($, on) => {
  const above = '~/Documents/Claude/Code/'
  const parts = ['my-project', 'docs', '2026', 'q3', 'reports']

  // It fits: all of it.
  expect(fitCrumbs(above, parts, 80)).toEqual({ above, crumbs: [0, 1, 2, 3, 4] })
  // The text above the project becomes "…/".
  expect(fitCrumbs(above, parts, 40)).toEqual({ above: '…/', crumbs: [0, 1, 2, 3, 4] })
  // The middle folders become "…": the project and the last ones stay.
  expect(fitCrumbs(above, parts, 28)).toEqual({ above: '…/', crumbs: [0, 'gap', 3, 4] })
  // Never less than the project and the current folder.
  expect(fitCrumbs(above, parts, 5)).toEqual({ above: '…/', crumbs: [0, 'gap', 4] })
  // The desktop's padding per button counts too: here three folders still fit.
  expect(fitCrumbs(above, parts, 40, 2)).toEqual({ above: '…/', crumbs: [0, 'gap', 2, 3, 4] })

  // In the band: a terminal of 60 columns, four folders deep, leaves 29 cells
  // for the path: the project, "…", then q3 and reports.
  const tree: Record<string, string[]> = {
    '/Users/me/Documents/Claude/Code/my-project': ['docs/'],
    '/Users/me/Documents/Claude/Code/my-project/docs': ['2026/'],
    '/Users/me/Documents/Claude/Code/my-project/docs/2026': ['q3/'],
    '/Users/me/Documents/Claude/Code/my-project/docs/2026/q3': ['reports/'],
    '/Users/me/Documents/Claude/Code/my-project/docs/2026/q3/reports': [],
  }
  on('session.root', () => ({ value: '/Users/me/Documents/Claude/Code/my-project' }))
  on('process.run', () => ({ value: ran('') }))
  fakeFs(on, dir => tree[dir])
  const ui = await $.ui.mount({
    plugin: 'file-copy-macos',
    surface: 'terminal',
    ...BAND,
    props: { ...BAND.props, bodyColumns: 60 },
  })
  await ui.press({ key: 'list' })

  for (const folder of ['docs/', '2026/', 'q3/', 'reports/']) {
    await ui.press({ key: `dir:${folder}` })
  }

  expect(await crumbs(ui)).toEqual(['my-project', 'q3', 'reports'])
  expect(await ui.find({ type: 'Text', text: '…' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '…/' })).toBeDefined()

  // The project folder stays one click away.
  await ui.press({ key: 'crumb:0' })
  expect(await crumbs(ui)).toEqual(['my-project'])
  // "~/Documents/Claude/Code/my-project" needs 34 cells: still "…/" here.
  expect(await ui.find({ type: 'Text', text: '…/' })).toBeDefined()
  await ui.press({ key: 'list' })
  await ui.unmount()
})

test('a page shows as many items as the band has rows for: 4 to 10', async ($, on) => {
  expect(pageSizeFor(40, 10)).toBe(10)
  expect(pageSizeFor(17, 10)).toBe(7)
  expect(pageSizeFor(12, 10)).toBe(4)

  const names = Array.from({ length: 23 }, (_, i) => `f${i + 1}.txt`)
  on('session.root', () => ({ value: '/proj' }))
  on('process.run', () => ({ value: ran('') }))
  fakeFs(on, dir => (dir === '/proj' ? names : undefined))

  // In the terminal the list view itself takes 10 rows: Src, Target,
  // Content, the table's frame, header and header line, the selection row
  // and the Finder row with room to wrap.
  for (const [maxRows, perPage, pages] of [
    [40, 10, 3],
    [17, 7, 4],
    [10, 4, 6],
  ] as const) {
    const ui = await $.ui.mount({
      plugin: 'file-copy-macos',
      surface: 'terminal',
      ...BAND,
      props: { ...BAND.props, maxRows },
    })
    await ui.press({ key: 'list' })
    const rows = (await ui.findAll({ type: 'Button' })).filter(b => (b.key ?? '').startsWith('file:'))
    expect(rows.length).toBe(perPage)
    expect(await ui.find({ type: 'Text', text: `1/${pages} (#23)` })).toBeDefined()
    await ui.press({ key: 'list' })
    await ui.unmount()
  }
})

test('hidden names are hidden as in Finder, until the switch shows them', async ($, on) => {
  expect(isHiddenEntry('.env')).toBe(true)
  expect(isHiddenEntry('.claude/')).toBe(true)
  expect(isHiddenEntry('docs/.cache/x.txt')).toBe(true)
  expect(isHiddenEntry('docs/a.pdf')).toBe(false)
  expect(isHiddenEntry('my.file.txt')).toBe(false)

  mock.store(on)
  mock.clock(on)
  on('session.root', () => ({ value: '/proj' }))
  on('session.start', () => ({ cwd: '/proj' }))
  on('process.run', ($, e) => ({
    value: e.argv.includes('rev-parse') ? { ...ran(''), exitCode: 128 } : ran(''),
  }))
  fakeFs(on, dir =>
    dir === '/proj'
      ? ['.claude/', 'docs/', '.env', 'a.pdf']
      : dir === '/proj/docs'
        ? ['.cache/', 'env.md']
        : dir === '/proj/.claude' || dir === '/proj/docs/.cache'
          ? ['env.json']
          : undefined,
  )
  await $.session.start({ cwd: '/proj', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ plugin: 'file-copy-macos', surface: 'desktop', ...BAND })
  await ui.press({ key: 'list' })

  // Hidden at first.
  expect((await ui.find({ key: 'dotfiles' }))?.props.label).toBe('👻 Show .files')
  expect(await ui.find({ key: 'file:.env' })).toBeUndefined()
  expect(await ui.find({ key: 'dir:.claude/' })).toBeUndefined()
  expect(await ui.find({ key: 'file:a.pdf' })).toBeDefined()

  // Shown after a click; a hidden item can be ticked.
  await ui.press({ key: 'dotfiles' })
  expect((await ui.find({ key: 'dotfiles' }))?.props.label).toBe('👻 Hide .files')
  expect(await ui.find({ key: 'file:.env' })).toBeDefined()
  expect(await ui.find({ key: 'dir:.claude/' })).toBeDefined()
  await ui.press({ key: 'tick:.env' })
  await ui.press({ key: 'tick:a.pdf' })
  expect(await ui.find({ type: 'Text', text: '2 selected:' })).toBeDefined()

  // Hidden again: the hidden item is unticked, the other stays ticked.
  await ui.press({ key: 'dotfiles' })
  expect(await ui.find({ type: 'Text', text: '1 selected:' })).toBeDefined()

  // The search leaves out hidden names and anything in hidden folders.
  await ui.input({ key: 'filter-0', text: 'env' })
  expect(await ui.find({ key: 'file:docs/env.md' })).toBeDefined()
  expect(await ui.find({ key: 'file:.env' })).toBeUndefined()
  expect(await ui.find({ key: 'file:.claude/env.json' })).toBeUndefined()
  expect(await ui.find({ key: 'file:docs/.cache/env.json' })).toBeUndefined()
  await ui.press({ key: 'dotfiles' })
  expect(await ui.find({ key: 'file:.claude/env.json' })).toBeDefined()
  await ui.unmount()

  // The choice stays for the next session.
  await $.session.start({ cwd: '/proj', surface: 'desktop', isInteractive: true })
  const next = await $.ui.mount({ plugin: 'file-copy-macos', surface: 'desktop', ...BAND })
  expect((await next.find({ key: 'dotfiles' }))?.props.label).toBe('👻 Hide .files')
  await next.unmount()
})

test('rows are told apart: stripes on both surfaces, and a hover light on the desktop', async ($, on) => {
  on('session.root', () => ({ value: '/proj' }))
  on('process.run', () => ({ value: ran('') }))
  fakeFs(on, dir => (dir === '/proj' ? ['a.txt', 'b.txt', 'c.txt'] : undefined))

  // Terminal: every other row has the theme's faint message background.
  const terminal = await $.ui.mount({ plugin: 'file-copy-macos', surface: 'terminal', ...BAND })
  await terminal.press({ key: 'list' })
  const stripes = await Promise.all(
    ['a.txt', 'b.txt', 'c.txt'].map(async n => (await terminal.find({ key: `row:${n}` }))?.props.backgroundColor),
  )
  expect(stripes).toEqual([undefined, 'userMessageBackground', undefined])
  await terminal.press({ key: 'list' })
  await terminal.unmount()

  // Desktop: faint see-through stripes, and a stronger light under the pointer.
  const desktop = await $.ui.mount({ plugin: 'file-copy-macos', surface: 'desktop', ...BAND })
  await desktop.press({ key: 'list' })
  const row = await desktop.find({ key: 'row:b.txt' })
  expect(row?.props.backgroundColor).toBe('#8080801f')
  expect((await desktop.find({ key: 'row:a.txt' }))?.props.backgroundColor).toBeUndefined()
  // The hover style is in the drawn tree, beside the element's props.
  const inTree = (node: unknown, key: string): { hover?: unknown } | undefined => {
    if (node === null || typeof node !== 'object') return undefined
    const element = node as { props?: { key?: unknown }; children?: unknown[] }
    if (element.props?.key === key) return element as { hover?: unknown }
    for (const child of element.children ?? []) {
      const found = inTree(child, key)
      if (found !== undefined) return found
    }
    return undefined
  }
  expect(inTree(await desktop.drawn(), 'row:b.txt')?.hover).toEqual({ backgroundColor: '#80808038' })
  await desktop.press({ key: 'list' })
  await desktop.unmount()
})
