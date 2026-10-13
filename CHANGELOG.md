# Changelog

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
