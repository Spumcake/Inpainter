#!/usr/bin/env bash
set -euo pipefail

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

copy_tree() {
  local src="$1"
  local dest="$2"
  shift 2
  mkdir -p "$dest"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a "$@" "$src"/ "$dest"/
  else
    cp -a "$src"/. "$dest"/
  fi
}

copy_missing_files() {
  local src="$1"
  local dest="$2"
  mkdir -p "$dest"
  local path rel target
  while IFS= read -r -d '' path; do
    rel="${path#"$src"/}"
    if [[ ! -s "$path" ]]; then
      continue
    fi
    target="$dest/$rel"
    if [[ -e "$target" ]]; then
      continue
    fi
    mkdir -p "$(dirname "$target")"
    cp -a "$path" "$target"
  done < <(find "$src" -type f -print0)
}

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOME_DIR="${INPAINTER_HOME:-$HOME/.inpainter}"

require_cmd node
require_cmd pnpm
require_cmd uv

echo "Installing Inpainter into $HOME_DIR"

mkdir -p "$HOME_DIR/bin" "$HOME_DIR/runtime" "$HOME_DIR/config" "$HOME_DIR/bootstrap" \
  "$HOME_DIR/installs" "$HOME_DIR/providers" "$HOME_DIR/workspaces" \
  "$HOME_DIR/cache/downloads" "$HOME_DIR/logs"

RUNTIME="$HOME_DIR/runtime"
rm -rf "$RUNTIME/core" "$RUNTIME/packages"
mkdir -p "$RUNTIME/core" "$RUNTIME/packages/policy-runtime"

copy_tree "$REPO_ROOT/core/src" "$RUNTIME/core/src"
copy_tree "$REPO_ROOT/core/policy" "$RUNTIME/core/policy" --exclude node_modules --exclude tests
copy_tree "$REPO_ROOT/core/schema" "$RUNTIME/core/schema"
copy_tree "$REPO_ROOT/core/scripts" "$RUNTIME/core/scripts"
cp "$REPO_ROOT/core/package.json" "$RUNTIME/core/package.json"
if [[ -f "$REPO_ROOT/core/pnpm-lock.yaml" ]]; then
  cp "$REPO_ROOT/core/pnpm-lock.yaml" "$RUNTIME/core/pnpm-lock.yaml"
fi
copy_tree "$REPO_ROOT/packages/policy-runtime" "$RUNTIME/packages/policy-runtime" --exclude node_modules --exclude tests

echo "Installing core runtime dependencies"
pnpm --dir "$RUNTIME/core" install

copy_tree "$REPO_ROOT/installer/setup/bootstrap" "$HOME_DIR/bootstrap" --delete --exclude .venv --exclude __pycache__
if [[ -d "$REPO_ROOT/installer/setup/installs/skills" ]]; then
  copy_missing_files "$REPO_ROOT/installer/setup/installs/skills" "$HOME_DIR/bootstrap/installs/included"
fi
copy_missing_files "$HOME_DIR/bootstrap/installs" "$HOME_DIR/installs"

OPENAI_SRC="$REPO_ROOT/installer/setup/providers/openai"
OPENAI_DEST="$HOME_DIR/providers/openai"
if [[ -d "$OPENAI_SRC" ]]; then
  mkdir -p "$OPENAI_DEST"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --exclude .venv --exclude .env --exclude __pycache__ --exclude .pytest_cache \
      --ignore-existing "$OPENAI_SRC"/ "$OPENAI_DEST"/
  else
    copy_missing_files "$OPENAI_SRC" "$OPENAI_DEST"
  fi
  echo "Installing OpenAI provider"
  (cd "$OPENAI_DEST" && uv sync)
fi

BIN="$HOME_DIR/bin/inpainter-core"
cat > "$BIN" <<EOF
#!/bin/sh
export INPAINTER_HOME="\${INPAINTER_HOME:-$HOME_DIR}"
exec "\$INPAINTER_HOME/runtime/core/node_modules/.bin/tsx" "\$INPAINTER_HOME/runtime/core/src/cli.ts" "\$@"
EOF
chmod 755 "$BIN"

echo "Initializing application home"
"$BIN" home init

echo
echo "Inpainter core is installed."
echo "Command: $BIN"
echo "To use it from a terminal session:"
echo "  export PATH=\"$HOME_DIR/bin:\$PATH\""
echo "GUI clients call that absolute path and do not need PATH."
