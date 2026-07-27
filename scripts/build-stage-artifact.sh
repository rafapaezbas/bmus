#!/usr/bin/env bash
set -euo pipefail

ARTIFACTS_DIR="${1:-out/artifacts}"
OUTPUT_DIR="${2:-out/bmus-stage}"
PACKAGE_JSON_PATH="${PACKAGE_JSON_PATH:-package.json}"

rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR/by-arch"

count=0
while IFS= read -r artifact; do
  dir_name="$(basename "$(dirname "$artifact")")"
  case "$dir_name" in
  bmus-linux-x64)
    arch="linux-x64"
    bin="bmus"
    ;;
  bmus-linux-arm64)
    arch="linux-arm64"
    bin="bmus"
    ;;
  bmus-darwin-arm64)
    arch="darwin-arm64"
    bin="bmus"
    ;;
  bmus-darwin-x64)
    arch="darwin-x64"
    bin="bmus"
    ;;
  bmus-win32-x64)
    arch="win32-x64"
    bin="bmus.exe"
    ;;
  *)
    echo "Unknown artifact: $dir_name, skipping" >&2
    continue
    ;;
  esac

  target="$OUTPUT_DIR/by-arch/$arch/app/$bin"

  mkdir -p "$(dirname "$target")"
  cp "$artifact" "$target"
  chmod +x "$target"
  count=$((count + 1))
done < <(find "$ARTIFACTS_DIR" -maxdepth 2 -type f \( -name 'bmus' -o -name 'bmus.exe' \) | sort)

if [ "$count" -eq 0 ]; then
  echo "No bmus artifacts found in $ARTIFACTS_DIR" >&2
  exit 1
fi

(
  cd "$OUTPUT_DIR"
  find by-arch -type f \( -name 'bmus' -o -name 'bmus.exe' \) -print0 | sort -z | xargs -0 sha256sum >checksums.sha256
)

if [ ! -f "$PACKAGE_JSON_PATH" ]; then
  echo "Package metadata not found: $PACKAGE_JSON_PATH" >&2
  exit 1
fi

cp "$PACKAGE_JSON_PATH" "$OUTPUT_DIR/package.json"

echo "wrote $count artifact(s) to $OUTPUT_DIR"
