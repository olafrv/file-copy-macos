// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Olaf Reitmaier

import { expect, mock, test } from 'claude-code/testing'

import { humanSize, parsePaths, toFieldText } from '../hooks/paths'

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
    expect(await ui.find({ type: 'Text', text: /^\/proj$/ })).toBeDefined()

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
  on('process.run', ($, e) => {
    if (e.argv[0] === '/bin/ls') {
      return { value: ran(folder.join('\n') + '\n') }
    }

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

test('Files... never shows the no-path hint', async ($, on) => {
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

test('Contents opens folders, makes them the target and creates new ones', async ($, on) => {
  const session = mock.session(on)
  const folders: Record<string, string[]> = { '/proj': ['a.pdf', 'docs/', 'b.pdf', 'img/'], '/proj/docs': ['old.txt'] }
  const runs: (readonly string[])[] = []

  on('session.root', () => ({ value: '/proj' }))
  on('process.run', ($, e) => {
    runs.push(e.argv)
    const cmd = e.argv[0]
    const path = e.argv[e.argv.length - 1] ?? ''

    if (cmd === '/bin/ls') {
      const list = folders[path]

      return { value: list ? ran(list.join('\n') + '\n') : { ...ran(''), exitCode: 1 } }
    }

    if (cmd === '/bin/test') {
      return { value: { ...ran(''), exitCode: path in folders ? 0 : 1 } }
    }

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
  expect(await ui.find({ type: 'Text', text: '/proj/docs' })).toBeDefined()
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
  expect(await ui.find({ type: 'Text', text: '/proj/docs/2026' })).toBeDefined()
  expect(await ui.find({ key: 'folder-name' })).toBeUndefined()

  await ui.press({ key: 'up' })
  await ui.press({ key: 'up' })
  expect(await ui.find({ type: 'Text', text: '/proj' })).toBeDefined()
  expect(await ui.find({ key: 'up' })).toBeUndefined()
  await ui.unmount()

  const fyi = session.appended().filter(r => r.message.type === 'user')
  expect(JSON.stringify(fyi)).toContain('created the folder /proj/docs/2026')
})

test('Contents renames a file, never over another one', async ($, on) => {
  const session = mock.session(on)
  let folder = ['a.pdf', 'b.pdf']
  const moves: (readonly string[])[] = []

  on('session.root', () => ({ value: '/proj' }))
  on('process.run', ($, e) => {
    const [cmd] = e.argv
    const last = e.argv[e.argv.length - 1] ?? ''

    if (cmd === '/bin/ls') {
      return { value: ran(folder.join('\n') + '\n') }
    }

    if (cmd === '/bin/test') {
      return { value: { ...ran(''), exitCode: folder.includes(last.slice('/proj/'.length)) ? 0 : 1 } }
    }

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

test('Folder... opens the folder picker and copies the folders', async ($, on) => {
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
  on('process.run', ($, e) => {
    const isDirCheck = e.argv[0] === '/bin/sh' && (e.argv[2] ?? '').includes('[ -d')

    return { value: ran(isDirCheck ? '/src/Photos\n' : '') }
  })

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

test('the Contents label and folder rows use emoji on every surface', async ($, on) => {
  on('session.root', () => ({ value: '/proj' }))
  on('process.run', ($, e) => ({ value: ran(e.argv[0] === '/bin/ls' ? 'docs/\n' : '') }))

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'file-copy-macos', surface, ...BAND })
    expect(await ui.find({ type: 'Text', text: '📋 Contents:' })).toBeDefined()
    await ui.press({ key: 'list' })
    expect((await ui.find({ key: 'dir:docs/' }))?.props.label).toBe('📁 docs/')
    expect(await ui.find({ type: 'Svg' })).toBeUndefined()
    await ui.press({ key: 'list' })
    await ui.unmount()
  }
})

test('Open opens a file with its default app and a folder in Finder', async ($, on) => {
  const opened: (readonly string[])[] = []

  on('session.root', () => ({ value: '/proj' }))
  on('process.run', ($, e) => {
    if (e.argv[0] === '/usr/bin/open') {
      opened.push(e.argv)
    }

    return { value: ran(e.argv[0] === '/bin/ls' ? 'docs/\na.pdf\n' : '') }
  })

  const ui = await $.ui.mount({ plugin: 'file-copy-macos', surface: 'desktop', ...BAND })
  await ui.press({ key: 'list' })
  await ui.press({ key: 'open:a.pdf' })
  await ui.press({ key: 'open:docs/' })
  expect(opened).toEqual([
    ['/usr/bin/open', '/proj/a.pdf'],
    ['/usr/bin/open', '/proj/docs'],
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

test('Contents shows each file size and none for folders', async ($, on) => {
  on('session.root', () => ({ value: '/proj' }))
  on('process.run', ($, e) => {
    if (e.argv[0] === '/bin/ls') {
      return { value: ran('docs/\na.pdf\nMy File.txt\n') }
    }

    if (e.argv[0] === '/usr/bin/stat') {
      expect(e.argv.slice(3)).toEqual(['a.pdf', 'My File.txt'])
      expect(e.init?.cwd).toBe('/proj')

      return { value: ran('13422\ta.pdf\n512\tMy File.txt\n') }
    }

    return { value: ran('') }
  })

  const ui = await $.ui.mount({ plugin: 'file-copy-macos', surface: 'desktop', ...BAND })
  await ui.press({ key: 'list' })
  expect(await ui.find({ type: 'Text', text: '13 KB' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '512 bytes' })).toBeDefined()
  expect((await ui.findAll({ type: 'Text', text: /bytes$|KB$/ })).length).toBe(2)
  await ui.press({ key: 'list' })
  await ui.unmount()
})

test('the desktop band links the version to the repository, the terminal band hides it', async ($, on) => {
  const reads: string[] = []

  on('session.root', () => ({ value: '/proj' }))
  on('process.run', () => ({ value: ran('') }))
  on('fs.read', ($, e) => {
    reads.push(String(e.path))

    return { value: JSON.stringify({ name: 'file-copy-macos', version: '9.8.7' }) }
  })

  on('session.start', () => ({ cwd: '/proj' }))
  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })
  expect(reads[0]).toMatch(/\/\.claude-plugin\/plugin\.json$/)

  // The desktop shows it as a link to the repository; the terminal not at all.
  const desktop = await $.ui.mount({ plugin: 'file-copy-macos', surface: 'desktop', ...BAND })
  const link = await desktop.find({ type: 'Link' })
  expect(link?.props.href).toBe('https://github.com/olafrv/file-copy-macos')
  expect(link?.children).toEqual(['file-copy-macos v9.8.7'])
  await desktop.unmount()

  const terminal = await $.ui.mount({ plugin: 'file-copy-macos', surface: 'terminal', ...BAND })
  expect(await terminal.find({ type: 'Link' })).toBeUndefined()
  expect(await terminal.find({ type: 'Text', text: 'file-copy-macos v9.8.7' })).toBeUndefined()
  await terminal.unmount()
})

test('the file list deletes ticked folders with their contents after a confirmation', async ($, on) => {
  const session = mock.session(on)
  const trashed: string[] = []
  let folder = ['a.pdf', 'docs/', 'old/']

  on('session.root', () => ({ value: '/proj' }))
  on('process.run', ($, e) => {
    if (e.argv[0] === '/bin/ls') {
      return { value: ran(folder.join('\n') + '\n') }
    }

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

test('Contents renames a folder, never over another one', async ($, on) => {
  const session = mock.session(on)
  let folder = ['docs/', 'old/', 'a.pdf']
  const moves: (readonly string[])[] = []
  const bare = (path: string) => path.slice('/proj/'.length)

  on('session.root', () => ({ value: '/proj' }))
  on('process.run', ($, e) => {
    const [cmd] = e.argv
    const last = e.argv[e.argv.length - 1] ?? ''

    if (cmd === '/bin/ls') {
      return { value: ran(folder.join('\n') + '\n') }
    }

    if (cmd === '/bin/test') {
      const name = bare(last)
      const exists = folder.includes(name) || folder.includes(`${name}/`)
      return { value: { ...ran(''), exitCode: exists ? 0 : 1 } }
    }

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

test('Contents shows 5 entries per page and keeps ticks across pages', async ($, on) => {
  const start = ['d1/', 'd2/', ...Array.from({ length: 9 }, (_, i) => `f${i + 1}.txt`)]
  const trashed: string[] = []
  let folder = [...start]

  on('session.root', () => ({ value: '/proj' }))
  on('process.run', ($, e) => {
    const [cmd] = e.argv

    if (cmd === '/bin/ls') {
      const dir = e.argv[e.argv.length - 1] ?? ''
      return { value: ran(dir === '/proj' ? folder.join('\n') + '\n' : '') }
    }

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

    // Page 1: the 2 folders and f1 to f3; no Prev.
    expect(await ui.find({ type: 'Text', text: 'Page 1 of 3 (11 items)' })).toBeDefined()
    expect(await ui.find({ key: 'dir:d1/' })).toBeDefined()
    expect(await ui.find({ key: 'file:f3.txt' })).toBeDefined()
    expect(await ui.find({ key: 'file:f4.txt' })).toBeUndefined()
    expect(await ui.find({ key: 'page-prev' })).toBeUndefined()

    await ui.press({ key: 'tick:f1.txt' })
    await ui.press({ key: 'page-next' })
    expect(await ui.find({ type: 'Text', text: 'Page 2 of 3 (11 items)' })).toBeDefined()
    expect(await ui.find({ key: 'file:f4.txt' })).toBeDefined()
    expect(await ui.find({ key: 'file:f1.txt' })).toBeUndefined()

    await ui.press({ key: 'page-next' })
    expect(await ui.find({ key: 'file:f9.txt' })).toBeDefined()
    expect(await ui.find({ key: 'page-next' })).toBeUndefined()

    // A tick from page 1 and one from page 3 are deleted together.
    await ui.press({ key: 'tick:f9.txt' })
    expect(await ui.find({ key: 'delete-selected' })).toBeDefined()
    await ui.press({ key: 'delete-selected' })
    await ui.press({ key: 'confirm-delete' })
    expect([...trashed].sort()).toEqual(['/proj/f1.txt', '/proj/f9.txt'])

    // 9 entries left: page 3 is gone, the last page shows.
    expect(await ui.find({ type: 'Text', text: 'Page 2 of 2 (9 items)' })).toBeDefined()
    expect(await ui.find({ key: 'file:f8.txt' })).toBeDefined()

    await ui.press({ key: 'page-prev' })
    expect(await ui.find({ type: 'Text', text: 'Page 1 of 2 (9 items)' })).toBeDefined()

    // An empty folder has no page row; going up starts on page 1.
    await ui.press({ key: 'dir:d1/' })
    expect(await ui.find({ type: 'Text', text: 'The folder is empty.' })).toBeDefined()
    expect(await ui.find({ key: 'page-next' })).toBeUndefined()
    await ui.press({ key: 'up' })
    expect(await ui.find({ type: 'Text', text: 'Page 1 of 2 (9 items)' })).toBeDefined()

    // Closing and opening the list starts on page 1 again.
    await ui.press({ key: 'page-next' })
    await ui.press({ key: 'list' })
    await ui.press({ key: 'list' })
    expect(await ui.find({ type: 'Text', text: 'Page 1 of 2 (9 items)' })).toBeDefined()

    await ui.press({ key: 'list' })
    await ui.unmount()
  }
})

test('Contents is a table: header, tick, name, size and actions per row', async ($, on) => {
  const opened: string[] = []
  const long = 'A very long file name that does not fit into the name column at all.pdf'

  on('session.root', () => ({ value: '/proj' }))
  on('process.run', ($, e) => {
    const [cmd] = e.argv

    if (cmd === '/bin/ls') {
      return { value: ran(`docs/\na.pdf\n${long}\n`) }
    }

    if (cmd === '/usr/bin/stat') {
      return { value: ran(`13000\ta.pdf\n2000000\t${long}\n`) }
    }

    if (cmd === '/usr/bin/open') {
      opened.push(e.argv[1] ?? '')
    }

    return { value: ran('') }
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    opened.length = 0
    const ui = await $.ui.mount({ plugin: 'file-copy-macos', surface, ...BAND })
    await ui.press({ key: 'list' })

    for (const text of ['Name', 'Size', 'Actions']) {
      expect(await ui.find({ type: 'Text', text })).toBeDefined()
    }

    expect((await ui.find({ key: 'tick:a.pdf' }))?.props.label).toBe('☐')
    expect((await ui.find({ key: 'tick:docs/' }))?.props.label).toBe('☐')
    expect(await ui.find({ key: 'rename:docs/' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '13 KB' })).toBeDefined()

    // A name too long for its column ends in "…" and fits it.
    const label = String((await ui.find({ key: `file:${long}` }))?.props.label)
    expect(label.endsWith('…')).toBe(true)
    // 100 columns less the label (13) and its gap (1), then in the terminal
    // tick (2), size (9), actions (18), padding and frame (10) and 3 column
    // lines leave 44 for the name; on the desktop tick (5, no padding), size,
    // actions, padding and frame (8) leave 46.
    const nameWidth = surface === 'terminal' ? 44 : 46
    expect([...label].length + 1).toBe(nameWidth)

    // A frame on both; column lines and a header line in the terminal only,
    // as the desktop's text font does not match its column widths.
    expect((await ui.find({ key: 'table' }))?.props.borderStyle).toBe('single')
    const line = ['─'.repeat(4), '─'.repeat(nameWidth + 2), '─'.repeat(11), '─'.repeat(20)]
    const hasLines = surface === 'terminal'
    expect((await ui.find({ type: 'Text', text: line.join('┼') })) !== undefined).toBe(hasLines)
    expect((await ui.find({ type: 'Text', text: '│' })) !== undefined).toBe(hasLines)

    // The tick box ticks; the name opens the file.
    await ui.press({ key: 'tick:a.pdf' })
    expect((await ui.find({ key: 'tick:a.pdf' }))?.props.label).toBe('☑')
    expect(opened).toEqual([])
    await ui.press({ key: 'file:a.pdf' })
    expect(opened).toEqual(['/proj/a.pdf'])

    await ui.press({ key: 'list' })
    await ui.unmount()
  }
})
