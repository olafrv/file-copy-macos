// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Olaf Reitmaier

export type SortKey = 'name' | 'folder' | 'size'

export type Pending = { sources: string[]; conflicts: string[] }

export type CopyResult = {
  root: string
  copied: string[]
  /** Not copied on purpose ("Copy only new", the source is the target). */
  skipped: string[]
  failed: string[]
}

declare module 'claude-code' {
  interface PluginState {
    'file-copy-macos': {
      draft: string
      version: string | null
      clockNow: number
      zoneOffset: number
      zoneName: string
      fieldId: number
      seed: string
      pastedDirs: string[]
      hint: string | null
      isConfirmingLast: boolean
      busy: boolean
      last: CopyResult | null
      pending: Pending | null
      isHidden: boolean
      tipsOn: boolean
      showDotfiles: boolean
      isListOpen: boolean
      entries: string[]
      sizes: { [name: string]: number }
      selected: string[]
      isConfirming: boolean
      page: number
      filter: string
      filterId: number
      sortBy: SortKey
      searchHits: string[] | null
      searchSizes: { [name: string]: number }
      searchNote: string | null
      isSearching: boolean
      isSortDesc: boolean
      subdir: string
      isNamingFolder: boolean
      folderError: string | null
      renaming: string | null
      renameError: string | null
    }
  }
}
