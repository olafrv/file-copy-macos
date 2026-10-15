#!/bin/sh
# SPDX-License-Identifier: MIT
# Copyright (C) 2026 Olaf Reitmaier

# Creates a neutral sample project for the README screenshots, so they never
# show private names or paths. Usage: scripts/demo-project.sh [folder]
# (default: demo in this repository, which git ignores). A folder this
# script made before is replaced; any other existing folder is left alone.

set -eu

dir=${1:-$(cd "$(dirname "$0")/.." && pwd)/demo}
marker="$dir/.demo-project"

if [ -e "$dir" ] && [ ! -e "$marker" ]; then
  echo "$dir exists and was not made by this script: not touched." >&2
  exit 1
fi

rm -rf "$dir"
mkdir -p "$dir/docs/2026" "$dir/src" "$dir/assets"

# A file of the given size in KB, so the Size column shows realistic values.
make() { dd if=/dev/zero of="$dir/$1" bs=1024 count="$2" 2>/dev/null; }

make report.pdf 820
make budget.xlsx 46
make screenshot.png 312
make docs/guide.pdf 1460
make docs/2026/q3-report.pdf 530
make assets/logo.png 28
printf '# My app\n\nNotes for the next release.\n' > "$dir/notes.md"
printf '# Guide\n' > "$dir/docs/README.md"
printf 'export const app = () => "hello"\n' > "$dir/src/app.ts"
printf 'export const sum = (a: number, b: number) => a + b\n' > "$dir/src/utils.ts"
printf 'API_KEY=example\n' > "$dir/.env"
touch "$marker"

echo "Demo project ready: $dir"
