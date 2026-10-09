# file-copy-macos

A [Claude Code](https://claude.com/claude-code) mod for macOS. It adds a bar above the prompt where you can copy files and folders from anywhere on your Mac into your project. After each change, Claude gets a short note about it.

```
📎 Source(s):  [Paste paths -> Enter]  📄 Files...  📂 Folder...
🎯 Target:     ~/Projects/my-app/docs
📋 Contents:   🙈 Hide files   ❇️ New folder...
               ⤴️ my-app/
               📁 2026/        ↗️ Open
               ☐ 📄 report.pdf  13 KB   ↗️ Open   📝 Rename
⌨ Shortcuts:  Option+Cmd+C in Finder copies paths · Enter copies   file-copy-macos v1.1.0
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

- macOS 15 or later. The mod uses `/usr/bin/trash`, `osascript` and `open`.
- Claude Code with mod (function hook) support.

## What it does

### Copy files and folders

- **Paste paths** into the field and press Enter. In Finder, Option+Cmd+C copies the paths of the selected items. In a terminal you can also drag files into the field.
- **📄 Files...** and **📂 Folder...** open the macOS picker. You can select several items.
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

- **🎯 Target** is the project root at the start.
- In **📋 Contents**, click a 📁 folder to open it. It becomes the target. ⤴️ goes up one level. You cannot leave the project.
- **❇️ New folder...** creates a folder in the target and opens it.
- Each file shows its size, a **↗️ Open** button (default macOS app) and a **📝 Rename** button. Folders have **↗️ Open** (Finder).
- Tick files or folders (☐ in front of 📁) and use **❌ Delete selected** to move them to the Trash. A folder goes to the Trash with all its contents.

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

- **No real drag and drop on desktop.** The mod API has no event for files dropped from Finder. Use paste (Option+Cmd+C) or the pickers.
- **Buttons use the app's own style.** A mod cannot change their color or font size.
- **Folder sizes are not shown.** Reading every file in a big folder would be slow.

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

1. Raise `"version"` in `.claude-plugin/plugin.json`, for example `0.1.0` to `0.2.0`.
2. Run the check and the tests.
3. Commit and push.

Users then get the new version with `claude plugin update file-copy-macos` (see [Update](#update)).

### Files

| Path | Content |
| --- | --- |
| `.claude-plugin/plugin.json` | The mod's manifest |
| `.claude-plugin/marketplace.json` | Makes this repository a marketplace |
| `hooks/register.tsx` | The bar and all actions |
| `hooks/paths.ts` | Path parsing and size formatting |
| `types/index.d.ts` | The type contract for the mod's saved state |
| `tests/file-copy-macos.test.tsx` | Tests, run by `claude plugin test` |

## License

[MIT](LICENSE)
