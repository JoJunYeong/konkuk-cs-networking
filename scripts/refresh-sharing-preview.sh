#!/bin/bash
set -euo pipefail

source_commit="${1:-}"
if [[ ! "$source_commit" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Usage: bash scripts/refresh-sharing-preview.sh <published source commit>" >&2
  exit 1
fi

project_root="$(cd "$(dirname "$0")/.." && pwd)"
repository="https://github.com/JoJunYeong/konkuk-cs-networking.git"
export GIT_TERMINAL_PROMPT=0 GH_PROMPT_DISABLED=1
work_dir="$(mktemp -d "${TMPDIR:-/tmp}/ku-sharing-preview.XXXXXXXX")"
trap 'rm -rf -- "$work_dir"' EXIT
published="$work_dir/published"
generated="$work_dir/generated"

git -c http.lowSpeedLimit=100 -c http.lowSpeedTime=30 clone --quiet \
  --depth 1 --single-branch --branch gh-pages "$repository" "$published"
read -r published_source published_digest < "$published/build-version.txt"
if [[ "$published_source" != "$source_commit" ]]; then
  echo "Skipping refresh for a different published source commit"
  exit 0
fi

index_digest() {
  shasum -a 256 "$1" | cut -d ' ' -f 1
}

if [[ "$(index_digest "$published/index.html")" != "$published_digest" ]]; then
  echo "The published index does not match build-version.txt" >&2
  exit 1
fi

preview_status="$(node "$project_root/scripts/build-sharing-preview.mjs" "$generated")"

# Keep the approved page content and older images used by cached share cards.
without_preview() {
  sed '/<!-- sharing-preview:start -->/,/<!-- sharing-preview:end -->/d' "$1"
}
if ! cmp -s <(without_preview "$published/index.html") <(without_preview "$generated/index.html"); then
  echo "The published index contains changes outside its sharing metadata" >&2
  exit 1
fi

for image in "$generated"/assets/share-preview-*.png; do
  [[ -f "$image" ]] || continue
  target="assets/${image##*/}"
  if [[ -e "$published/$target" ]]; then
    cmp "$image" "$published/$target"
  else
    cp "$image" "$published/$target"
    git -C "$published" add -- "$target"
  fi
done

cp "$generated/index.html" "$published/index.html"
printf '%s %s\n' "$source_commit" "$(index_digest "$published/index.html")" > "$published/build-version.txt"
git -C "$published" add -- index.html build-version.txt
if git -C "$published" diff --cached --quiet; then
  exit 0
fi

git -C "$published" -c user.name="KU meet Pages" -c user.email="ku-meet-pages@users.noreply.github.com" \
  commit --quiet -m "Refresh networking share preview"
git -C "$published" -c http.lowSpeedLimit=100 -c http.lowSpeedTime=30 push --quiet origin HEAD:refs/heads/gh-pages
printf '%s %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$preview_status"
