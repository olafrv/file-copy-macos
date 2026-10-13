# file-copy-macos

A [Claude Code](https://claude.com/claude-code) mod for macOS. It adds a bar above the prompt where you can copy files and folders from anywhere on your Mac into your project. After each change, Claude gets a short note about it.

```
📎 Src:        [Paste paths (↵ add)] 📥 Add   📄 Files  📂 Folder  📥 Paste  🧲 Download
🎯 Target:     ~/Projects/my-app/docs   ↗️ Open  📌 Finder
📚 Contents:   🙈 Hide   🗂️ New folder   Filter: [Name (↵ recursive)] 🔍 Find   ◀ 2/3 (#9) ▶
⤴️ my-app/
┌────────────────────────────────────────────────────────────────────────────┐
│ ☐  │ Name ▲            │ Size    │ Actions                                │
│────┼───────────────────┼─────────┼────────────────────────────────────────│
│ ☐  │ 📁 2026/          │         │ ↗️ Open 📌 Finder 💬 Ask 📝 Ren 📋 Copy│
│ ☑  │ 📄 report.pdf     │ 13 KB   │ ↗️ Open 📌 Finder 💬 Ask 📝 Ren 📋 Copy│
└────────────────────────────────────────────────────────────────────────────┘
1 selected:  ❌ Delete  💬 Ask  📋 Copy
💡 In Finder:  Cmd+C > 📥 Paste or Opt+Cmd+C > Cmd+V in Src > 📥 Add   13.10.2026 14:32 CEST · v1.13.4
✅ Copied:     report.pdf                          [❌ Delete] [🙈 Hide]
```

## Install

Run these two commands in a terminal. The first adds this GitHub repository as a plugin marketplace, the second installs the mod for your user (all projects):

```bash
claude plugin marketplace add olafrv/file-copy-macos
```

```bash
claude plugin install file-copy-macos@file-copy-macos
```

The bar appears in every Claude Code session started after the install, in the terminal and in the Code tab of the Claude desktop app.

You can also install it from inside a Claude Code terminal session with one line. Answer `y` to "Add marketplace?", then press Enter:

```
/plugin install file-copy-macos --marketplace olafrv/file-copy-macos
```

### Update

Get the newest version, then reload the mods in an open session:

```bash
claude plugin update file-copy-macos
```

```
/reload-plugins
```

### Uninstall

```bash
claude plugin uninstall file-copy-macos
```

## Requirements

- macOS 15 or later.
- Claude Code with mod (function hook) support.

The mod is for macOS only, because it uses these macOS commands:

| Command | Used for |
| --- | --- |
| `/bin/sh` with `cp -R` | Copying into the project, and the "name 2" rule for Keep both |
| `/bin/mv` | 📝 Ren |
| `/bin/mkdir` | 🗂️ New folder |
| `/usr/bin/trash` (macOS 15 and later) | ❌ Delete and 🔁 Overwrite, which move items to the Trash |
| `/usr/bin/open` | ↗️ Open and 📌 Finder |
| `/usr/bin/osascript` | 📄 Files and 📂 Folder pickers, 📋 Copy and 📥 Paste (clipboard) |
| `/bin/date` | The time zone of the clock |
| `/usr/bin/git` (optional) | 🔍 Find in git projects. Without git, the mod searches the folders itself |

Listing folders, file sizes, name checks, 🧲 Download and the search outside git use Claude Code's own file access, not commands.

## What it does

### Copy files and folders

- **Paste paths** into the field and press Enter (or **📥 Add**). In Finder, Option+Cmd+C copies the paths of the selected items. In a terminal you can also drag files into the field.
- **📄 Files** and **📂 Folder** open the macOS picker. You can select several items.
- **📥 Paste** adds the files and folders you copied in Finder with Cmd+C. Text on the clipboard is ignored.
- **🧲 Download** copies the newest file or folder in `~/Downloads`. Downloads still in progress are skipped.
- Before you press Enter, the list under the field shows each pasted item. Click an item to remove it. Its path is also removed from the field.
- Folders are copied with all their contents.

### Name conflicts

If a name already exists in the target, the mod asks first:

| Button | Result |
| --- | --- |
| 🔁 Overwrite | The old item goes to the Trash, the new one takes its place. |
| 👯 Keep both | The new item is saved as "name 2.ext". |
| ⏭️ Copy only new | Items with a conflict are not copied. The others are. |
| ⏹️ Cancel | Nothing is copied. |

### Target and contents

- **🎯 Target** is the project root at the start. Each folder of its path is a button: a click makes that folder the target. **↗️ Open** opens the target folder in Finder. **📌 Finder** shows it in its parent folder, selected.
- **📚 Contents** is a framed table with the columns tick box, Name, Size and Actions. Long names are cut with "…". The terminal also draws lines between the columns and under the header.
- Click a 📁 folder name to open it. It becomes the target. ⤴️ goes up one level. You cannot leave the project.
- Click a 📄 file name to open it with its default macOS app.
- **🗂️ New folder** creates a folder in the target and opens it.
- **Filter:** is always shown. While you type, it shows only the items of the target folder whose name contains the text (case is ignored). Typing in it opens the list. **🧹 Clear** removes the filter, and so does **🙈 Hide**.
- **🔍 Find** (or Enter) searches the target folder and all folders below it. The table then gets a **Folder** column with each item's folder. Point at a folder there to see its full path; a click opens it. All actions work on the items found, and 📝 Ren keeps an item in its own folder. Typing in the filter again, 🧹 Clear or opening a folder ends the search.
  - In a git project, the search follows `.gitignore`: ignored files are not found. To skip a folder only on your Mac, add it to `.git/info/exclude`.
  - The setting **Search: skip folders** (in `/config`) lists folder names the search always skips. The default is `.git, .svn, .hg, node_modules, bower_components`. Add others, for example `.venv` or `dist`.
  - The search shows at most 500 results and stops after 5 seconds. If it hits a limit, a yellow warning says so.
  - Skipped and ignored items are still in the table when you open their folder.
- Click **Name** or **Size** in the header to sort by that column. Click again to change between ascending (▲) and descending (▼). Folders always come first; when sorting by size, they stay in name order.
- The list shows 4 items per page. Use **◀** and **▶** after the filter to change the page; "2/3 (#9)" means page 2 of 3, 9 items. Ticked items stay ticked on other pages.
- Each row has five actions:
  - **↗️ Open:** opens a file in its default macOS app, a folder in Finder.
  - **📌 Finder:** opens Finder at the item's folder with the item selected. From there you can drag it.
  - **💬 Ask:** see below.
  - **📝 Ren:** renames the item.
  - **📋 Copy:** puts the item on the clipboard as a file. Press Cmd+V in Finder, on the Desktop, in Mail or in Slack to paste it.
- **💬 Ask** puts `@path` (relative to the project) at the cursor in the prompt, so you can ask Claude about the item. A path with a space is quoted: `@"docs/My File.pdf"`.
- Tick files or folders (☐, on the desktop ⬜). The tick box in the header ticks all items that match the filter, on all pages; a second click unticks them.
- With items ticked, a row under the table offers:
  - **❌ Delete:** moves them to the Trash. A folder goes to the Trash with all its contents.
  - **💬 Ask:** puts all of them into the prompt.
  - **📋 Copy:** puts them on the clipboard as files. Press Cmd+V in Finder, on the Desktop, in Mail or in Slack to paste them. This replaces drag and drop, which the mod cannot offer.

### Clock

The In Finder row shows the local date, time and time zone, for example `13.10.2026 14:32 CEST`. It changes on each full minute. The mod reads the time zone from macOS and checks it again each hour, so the change to and from summer time is shown. On the desktop, the version of the mod follows the clock after a middle dot. It is a link to this README.

### What Claude is told

After each copy, delete, rename or new folder, the mod adds a short note to the conversation, for example:

> FYI from the file-copy-macos mod: the user copied 1 file(s) into the folder /Users/me/Projects/my-app/docs: report.pdf. This is information only. Do not open, read or change these files ...

The note does not start a turn. Claude reads it with your next message and does not act on it unless you ask.

## Safety

- **Nothing is deleted outright.** Delete and Overwrite move items to the macOS Trash, so you can restore them.
- **Every delete asks first.** Overwrite asks in its own question.
- **Rename never overwrites.** A name that exists is refused.
- **Files stay inside the project.** The target cannot go above the project root, and folder names with `..` are refused.
- **Everything stays on your Mac.** The mod copies files on disk. It sends nothing to a server and does not attach files to the prompt.

## Limits

- **No drag and drop.** The mod API has no drag events, in either direction. To bring files in, use paste (Option+Cmd+C) or the pickers. To take files out, use **📋 Copy** or **📌 Finder**.
- **Buttons use the app's own style.** A mod cannot change their color or font size.
- **Folder sizes are not shown.** Reading every file in a big folder would be slow.
- **The search finds names, not file contents.** It does not look inside files.

## Development

### Load the mod from your clone in every session

This is the setup for working on the mod. The mod loads from your clone in every new session, in the terminal and in the desktop app, and reloads by itself when you save a file.

Add this to `~/.claude/settings.json`, with the absolute path of your clone:

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "/path/to/file-copy-macos",
    "CLAUDE_CODE_PLUGIN_DIR_WATCH": "1"
  }
}
```

- `CLAUDE_CODE_PLUGIN_DIRS` loads the mod from that folder in every new session.
- `CLAUDE_CODE_PLUGIN_DIR_WATCH` makes desktop app sessions reload the mod when a file changes. Terminal sessions do this without it.
- The setting is read when a session starts, so start a new session after you add it.

**Keep one copy only.** Do not also install the mod with `claude plugin install` while this setting is active, or you will see two bars. Make all changes in the clone.

Clone the repository with:

```bash
git clone git@github.com:olafrv/file-copy-macos.git
```

The clone folder is `file-copy-macos`. Use its absolute path in `CLAUDE_CODE_PLUGIN_DIRS`.

To load the clone for one terminal session only, without the setting, run this inside the clone folder:

```bash
claude --plugin-dir .
```

### Check and test

```bash
claude plugin validate .
```

```bash
claude plugin test .
```

### Release a new version

1. Raise `"version"` in `.claude-plugin/plugin.json` and in the bar sketch at the top of this README, for example `1.11.0` to `1.12.0`.
2. Add a section for the new version at the top of [CHANGELOG.md](CHANGELOG.md).
3. Run the check and the tests.
4. Commit and push.
5. Tag the release with its changelog section as the message, and push the tag:

   ```bash
   git tag -a v1.12.0 -m "Release 1.12.0" -m "<the changelog section>"
   ```

   ```bash
   git push origin v1.12.0
   ```

Users then get the new version with `claude plugin update file-copy-macos` (see [Update](#update)).

### Files

| Path | Content |
| --- | --- |
| `.claude-plugin/plugin.json` | The mod's manifest |
| `CHANGELOG.md` | What changed in each version |
| `.claude-plugin/marketplace.json` | Makes this repository a marketplace |
| `hooks/register.tsx` | The bar and all actions |
| `hooks/paths.ts` | Path parsing and size formatting |
| `types/index.d.ts` | The type contract for the mod's saved state |
| `tests/file-copy-macos.test.tsx` | Tests, run by `claude plugin test` |

## License

[MIT](LICENSE)
