# Changelog

## 1.26.0

- New row **🧰 Tools** after 🎯 Target: 📸 Shot, 💾 Chat, ✴️ Claude, **📅 Calendar** (moved from the clock) and the new **🧮 Calculator**. 🎯 Target keeps the path, Open, Locate and New folder.
- The table header shows the six actions instead of the word "Actions". They act on the ticked items (Ren and Locate on one), so the row under the table keeps only ❌ Delete.
- The page control sits under the table, at the right.
- Below 100 columns the table actions show their icons alone, on both surfaces.
- Every button that shows only its icon has a tip while ✅ Tips is on.
- Desktop: fixes for the larger buttons of Claude Code 2.1.309. More space between the rows, rows that wrap instead of being cut off, table rows as high as their buttons, column lines through every row, and a Name column that takes the free room and cuts itself with "…".
- README: new screenshots.

## 1.25.0

- New button **💾 Chat** on the 🎯 Target row: one click saves the conversation as Markdown in the target, named like a screenshot (`2026-10-24_101530 - Session.md`). Each message is under "👤 You" or "🤖 Claude"; each tool call is one short line, without its output.
- The delete and 📅 Date questions show their buttons on the same line.
- The table header "Actions" is no longer bold.

## 1.24.6

- **📋 Paste** moved to the 🏷️ Filter row, after 🔍 Find, so the 📎 Source row is shorter.
- 🎯 Target row: ↗️ Open, 📌 Locate, 📁 New folder, 📸 Shot, ✴️ Claude.
- The pickers are now **📄 File** and **🗂️ Folder** (they still accept several items).
- ✴️ Claude: when Terminal was not running, Claude Code starts in Terminal's first window instead of a second one.
- README: new screenshots.

## 1.24.5

- A name cut with "…" in the table shows whole while the pointer is over it.

## 1.24.4

- README: Requirements says that the VS Code extension and the mobile app are not supported.

## 1.24.3

- README: new screenshots with 📅 and the even spacing in the 💡 Finder row.

## 1.24.2

- New **📅** button before the clock: opens the Calendar app.
- In a terminal narrower than 100 columns, the clock shows only the time (`22:30`). A click still copies the full `2026-10-21_223015 - `.
- Even spacing around 💤 Tips, 📅, the clock and the version on the desktop.

## 1.24.1

- 📸 Shot and pasted images use the same date format as 📅 Date and the clock: `2026-10-21_222903 - Screenshot.png` and `2026-10-21_222903 - Pasted.png`. 📅 Date sees them as dated already.

## 1.24.0

- New row action **📅 Date**, after 📝 Ren: it opens the rename field with the time of the click before the name (`2026-10-21_221537 - report.pdf`). Enter renames, ⏹️ Cancel keeps the name. For ticked items it asks first, then gives all of them the same time; names that already have such a date stay as they are.
- A click on the clock copies the time as the start of a file name: `2026-10-21_221537 - `.
- Folders show their number of items in the Size column (`3 items`, `1 item`, `Empty`), counted as Finder does.
- Desktop: the table has thin lines between the columns and under the header, like the terminal.
- ✴️ Claude opens the Terminal window at 110 columns and 35 rows, so the bar has room.
- Desktop: ⏹️ Cancel sits right after the rename and new-folder fields.
- README: new screenshots.

## 1.23.1

- The **💤 Tips** switch is back, after the 💡 Finder tip. It turns the help tips of 📋 Paste, 🧲 Desktop, 🧲 Downloads and the 💡 Finder tip on (**✅ Tips**) and off. Off by default; the mod remembers your choice.
- README: new screenshots of the 🏷️ Filter row and the new button order.

## 1.23.0

- **📋 Paste** also pastes an image. With no files on the clipboard, it saves a copied image (for example a screenshot taken with Ctrl+Cmd+Shift+4, or "Copy Image" in a browser) into the target as a PNG, named by the local time: `YYYY-MM-DD - HHMMSS - Pasted.png`. Claude gets a note, as after every copy.
- With nothing usable on the clipboard, a toast says so.

## 1.22.3

- The "📚 Content:" label is gone. The row below 🎯 Target is now **🏷️ Filter:**, with the filter field first, then ♻️ Refresh, 🫣 Hide and 👻 .files.
- 🎯 Target row: ↗️ Open, 📁 New folder, 📸 Shot, ✴️ Claude, 📌 Locate (the most used first).
- Row actions in the table: ↗️ Open, 📝 Ren, 💬 Ask, 📋 Copy, 📌 Locate.
- Terminal: the label column is 1 cell narrower.
- README: the descriptions follow the new order.

## 1.22.2

- The bar shows only in the terminal and in the desktop app. It no longer appears in the VS Code extension, whose panel is too narrow for it, or on any other surface.

## 1.22.1

- README: new screenshots that show 🧲 Downloads and "Filter: Name".

## 1.22.0

- New button **✴️ Claude** on the 🎯 Target row: opens a new Terminal window in the target and starts Claude Code there. It looks for the `claude` program in the usual install folders; if there is none, a toast says so. macOS asks once for the Automation permission.
- **📁 New folder** and **📸 Shot** moved to the 🎯 Target row, because both create something in the target. New folder is now a framed button with its own icon, 📁 (🗂️ is only Folders).
- 📎 Source: the field's placeholder is now `Paths ↵`. On the desktop the buttons follow the field directly, without a gap.
- Row labels never break onto two lines, and the desktop label column is 1 character narrower.
- **🧲 Download** is now **🧲 Downloads**, like the folder. The tooltips are shorter ("Copy newest item of ~/Downloads").
- 📸 Shot: the permission toast names the right app, "Claude" on the desktop and "your terminal app" in a terminal.
- Terminal: a space after "Filter:".
- README: new screenshots. The sample project script and the screenshot steps are removed.

## 1.21.0

- New button **📸 Shot**, between 📋 Paste and 🧲 Desktop: take a screenshot (drag an area, or Space and click a window) and save it straight into the target as `YYYY-MM-DD - HHMMSS - Screenshot.png`.
- It needs the macOS Screen Recording permission for the app that runs Claude Code. Without it, a toast says where to allow it.

## 1.20.2

- New green button **♻️ Refresh** before 🫣 Hide / 👁️ Show: it reads the list again, for changes made outside the bar. During a search, it runs the search again.
- README: new screenshots, and the terminal screenshot is taken at the standard size, 80×24.

## 1.20.1

- README: screenshots of the bar in the desktop app and in a terminal.
- README: a terminal needs at least 80 columns and 35 rows; in a shorter window the bar scrolls and hides the file list.
- README: several descriptions brought up to date.

## 1.20.0

- Narrow terminals (under 100 columns, including the standard 80×24): the row labels and the 📎 Source and 📚 Content buttons show only their icons (🧲🖥️ is Desktop, 🧲⬇️ is Download), and the 💡 tip becomes a short icon line, so the rows stay on one line.
- The 💡 Finder tip groups the ways that end in 🧲 Add: "Drag or ⌥⌘C ⌘V into 📎 > 🧲 Add · ⌘C > 📋 Paste".
- The terminal shows the version after the clock again.

## 1.19.1

- The 🎯 Target path starts at the project folder (`…/demo / docs`). Point at it to see the full path.
- Fixed: in the terminal, a long Target path could push 📌 Locate off the row, because the bracketed buttons are wider than counted.
- README: a real screenshot of the bar replaces the hand-made text sketch. `scripts/demo-project.sh` creates a neutral sample project for screenshots.

## 1.19.0

- "📎 Src:" is "📎 Source:" again, and the 💡 Finder tip says "in Source".
- "📂 Folder" is now "🗂️ Folders", because the picker accepts several folders (hold Cmd and click each one).
- New icons: 📋 Paste, 🧲 Add, 👁️ Show and 🫣 Hide.

## 1.18.0

- New button **🧲 Desktop**, before 🧲 Download: it copies the newest file or folder on your Desktop into the target, for example the screenshot you just took.

## 1.17.3

- 📚 Content shows the file list from the start of each session. 🙈 Hide still closes it.

## 1.17.2

- Fewer tips: only 📥 Paste, 🧲 Download and the 💡 Finder tip show a help text, always on. The 💤 Tips switch is gone, and moving the pointer across the table no longer shows tips.
- 📌 Finder is now 📌 Locate, on the Target row and in each table row.

## 1.17.1

- Fainter row stripes, now on both surfaces. The desktop uses a see-through gray that works in light and dark mode, and still lights up the row under the pointer.
- The table header stands out: Name, Folder and Size are brighter, and "Actions" is bold.
- Fixed: in a narrow terminal the clock was cut ("19:18 CE…"). It now keeps its room, and only the 💡 Finder tip wraps.

## 1.17.0

- Table rows are easier to tell apart: in the terminal every other row is striped; on the desktop the row under the pointer lights up. Both use the theme's soft gray, in light and dark mode.

## 1.16.0

- Hidden names (starting with ".", for example `.env` or `.claude`) are now hidden by default, as in Finder, in the list and in search results.
- New switch **👻 Show .files** / **👻 Hide .files** in the 📚 Content row. The mod remembers your choice.

## 1.15.0

- The file list shows 4 to 10 items per page: as many as fit without scrolling the bar. A larger terminal window shows more items. The desktop app gives the bar less room, so it usually shows 4.

## 1.14.2

- A long 🎯 Target path is shortened to fit its row instead of being cut off: first the part above the project becomes "…/", then the folders in the middle become "…". The project folder and the current folder always stay visible.

## 1.14.1

- README: a new Settings section explains how to change "Search: skip folders", with `/config` in a terminal or in `~/.claude/settings.json` (the Code tab of Claude Desktop has no screen for plugin settings).

## 1.14.0

- New help tips: point at a button to see what it does. Turn them on with **💤 Tips** in the 💡 Finder row (it becomes **✅ Tips**). They are off by default, because the app shows them at once, without a delay. The mod remembers your choice.
- The 💡 Finder tip is shorter, with the Mac key symbols: "⌘C > 📥 Paste or ⌥⌘C > ⌘V in Src > 📥 Add". With tips on, pointing at it explains it in words.
- The clock and the version stay on one line. Only the tip wraps in a narrow window.

## 1.13.6

- Shorter labels: "📚 Contents:" is now "📚 Content:", and "💡 In Finder:" is now "💡 Finder:".
- The label column is only as wide as the longest label, so less space is lost after the labels (11 cells in the terminal, 10 on the desktop).

## 1.13.5

- Shorter buttons: 📄 Files, 📂 Folder and 🗂️ New folder lose their "...".
- ⬇️ Latest download is now 🧲 Download: it pulls the newest item of `~/Downloads` into the target (it still copies).
- The clock shows `13.10.2026 14:32 CEST`, without the weekday.

## 1.13.4

- The 💡 In Finder tip is shorter and clearer: "Cmd+C > 📥 Paste or Opt+Cmd+C > Cmd+V in Src > 📥 Add". ">" separates the steps and "or" the ways. The terminal tip starts with "Drag into Src > 📥 Add or".

## 1.13.3

- The 💡 In Finder tip names the 📥 Add step: "Opt+Cmd+C -> Cmd+V in Src field -> 📥 Add". The terminal tip also says "Drag into Src field -> 📥 Add".

## 1.13.2

- The 🎯 Target path is clickable: each folder from the project root down is a button that makes it the target. The part above the project stays plain text.

## 1.13.1

- README: the Requirements section lists every macOS command the mod uses, with the features that use it.

## 1.13.0

- The mod now uses Claude Code's own file access (`$.fs`) to list folders, read sizes and check names, instead of the commands `ls`, `stat`, `test` and `find`. File names arrive exactly as they are, so no name can be misread.
- Latest download and pasted folders also use it.
- The search runs git directly. Outside git, the mod walks the folders itself, shallow folders first, with the same limits and skipped folders.
- Fewer processes per action: the shell scripts for listing, Latest download and search are gone.

## 1.12.1

- Security: a search in a repository with a hostile `.git/config` (`core.fsmonitor`) could start a program. Git now runs with that setting off.
- Security: a file name with a line break could show up as a fake `..` entry, and Delete would then move the parent folder to the Trash. Such names can no longer split, and every entry is checked before it is shown.
- Fixed: a file name starting with "-" (for example `-L`) showed a wrong size.
- Fixed: names with umlauts (for example `Bär.txt`) were escaped in search results. The search now also matches umlauts in any case.
- 🧹 Clear goes back to page 1.

## 1.12.0

- 🔍 Find (or Enter) now searches the target folder and all folders below it. Typing still filters the current folder only.
  - In a git project, the search follows `.gitignore`. Elsewhere, it skips the folders of the new setting **Search: skip folders** (default: `.git, .svn, .hg, node_modules, bower_components`).
  - At most 500 results and 5 seconds. A yellow warning says when a limit was hit.
- During a search, the table has a **Folder** column: sortable, a click opens the folder, and pointing at it shows the full path.
- 📝 Ren keeps a found item in its own folder, and 💬 Ask writes its full path.
- The table uses the whole width of the bar.
- New placeholders: "Paste paths (↵ add)" and "Name (↵ recursive)".
- The clock shows minutes again, so the bar redraws only once per minute.

## 1.11.1

- The In Finder tip uses "->" instead of "then": "Cmd+C -> 📥 Paste, Opt+Cmd+C -> Cmd+V in Src field".
- The In Finder row's icon is now 💡.

## 1.11.0

- The source row's label is now "Src:".
- The tip row is now "In Finder:" and shows both ways from Finder: "Cmd+C → 📥 Paste, Opt+Cmd+C → Cmd+V in Src field".
- The terminal tip also names dragging into the Src field.

## 1.10.0

- The clock shows seconds and changes every second.
- New icons: 📚 for Contents, 🗂️ for New folder.
- Target: ↗️ Open and 📌 Finder are regular buttons.
- Desktop: narrower label column, a small space between rows with buttons, and emoji tick boxes (⬜ and ✅), because "☐" was drawn cut.

## 1.9.0

- New 📥 Paste button: adds the files and folders you copied in Finder with Cmd+C. Text on the clipboard is ignored.
- The source field's button is now "📥 Add", so "Copy" always means "to the clipboard".

## 1.8.0

- New 📋 Copy action: puts items on the clipboard as files, for one row or for all ticked items. Paste them with Cmd+V in Finder, Mail or Slack.
- New 📌 Finder action: shows an item selected in Finder. Also on the Target row.
- Row actions have short labels: Open, Finder, Ask, Ren, Copy.
- The selection row shows "n selected:" with Delete, Ask and Copy.
- New icons: 🗂️ for Contents, 📌 for Finder, ⚡ for Shortcuts.

## 1.7.0

- New 💬 Mention action: puts `@path` at the cursor in the prompt, for one row or for all ticked items. A path with a space is quoted.
- The tick box in the table header ticks all items that match the filter, on all pages, and unticks them again.

## 1.6.2

- Fixed: on the desktop, the space before the middle dot after the clock was too wide.

## 1.6.1

- On the desktop, the version follows the clock as a link to the README. The GitHub logo is removed.

## 1.6.0

- New clock in the Shortcuts row: local date, time and time zone. The time zone comes from macOS and is checked every hour.
- On the desktop, a GitHub logo and link follow the clock.

## 1.5.0

- New ⬇️ Latest download button: copies the newest item in `~/Downloads`. Downloads in progress are skipped.
- New filter field: always shown. Typing opens the list and shows only matching names. 🔍 Find and 🧹 Clear next to it.
- Sort by Name or Size with a click on the table header, ascending or descending. Folders come first.
- Pages hold 4 items. A short "◀ 2/3 (#9) ▶" control follows the filter.
- New ↗️ Open button on the Target row.
- "Show files" and "Hide files" are now "Show" and "Hide".

## 1.4.1

- The version shows only on the desktop, as a link to the GitHub repository.

## 1.4.0

- The Contents table has a frame. The terminal also draws lines between the columns and under the header.

## 1.3.0

- Contents is a table: a header and the columns tick box, Name, Size and Actions.
- A click on a file name opens the file. Long names are cut with "…".

## 1.2.0

- Folders in Contents have a Rename button. Rename never overwrites.
- Contents shows 5 items per page, with Prev and Next.

## 1.1.1

- "Enter copies" is removed from the Shortcuts row.

## 1.1.0

- Folders in Contents can be ticked and deleted. They go to the Trash with all their contents.
- The version moves into the Shortcuts row.

## 1.0.0

- First release: a bar above the prompt that copies pasted or picked files and folders into the project.
- Asks before overwriting, and moves replaced items to the Trash.
- Contents list of the target folder: open, rename, create folders, delete to the Trash.
- After each change, Claude gets a short note.
