#!/usr/bin/env bash
set -euo pipefail

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

resolve_node() {
  local bin
  bin="$(command -v node)" || {
    echo "Missing required command: node" >&2
    exit 1
  }
  if command -v readlink >/dev/null 2>&1; then
    readlink -f "$bin" 2>/dev/null && return 0
  fi
  if command -v realpath >/dev/null 2>&1; then
    realpath "$bin" 2>/dev/null && return 0
  fi
  echo "$bin"
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

write_wrapper() {
  local bin="$1"
  local home_dir="$2"
  local node="$3"
  cat > "$bin" <<EOF
#!/bin/sh
export INPAINTER_HOME="\${INPAINTER_HOME:-$home_dir}"
exec "$node" "\$INPAINTER_HOME/runtime/core/node_modules/tsx/dist/cli.mjs" "\$INPAINTER_HOME/runtime/core/src/cli.ts" "\$@"
EOF
  chmod 755 "$bin"
}

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOME_DIR="${INPAINTER_HOME:-$HOME/.inpainter}"
NODE="$(resolve_node)"

SKIP_PROVIDERS="${INPAINTER_INSTALL_SKIP_PROVIDERS:-}"

require_cmd pnpm
if [[ "$SKIP_PROVIDERS" != "1" ]]; then
  require_cmd uv
fi

echo "Installing Inpainter into $HOME_DIR"
echo "Using Node $NODE"

mkdir -p "$HOME_DIR/bin" "$HOME_DIR/config" "$HOME_DIR/bootstrap" \
  "$HOME_DIR/installs" "$HOME_DIR/providers" "$HOME_DIR/workspaces" \
  "$HOME_DIR/cache/downloads" "$HOME_DIR/logs"

STAGE="$HOME_DIR/runtime.next"
rm -rf "$STAGE"
mkdir -p "$STAGE/core" "$STAGE/packages/policy-runtime"

copy_tree "$REPO_ROOT/core/src" "$STAGE/core/src"
copy_tree "$REPO_ROOT/core/policy" "$STAGE/core/policy" --exclude node_modules --exclude tests
copy_tree "$REPO_ROOT/core/schema" "$STAGE/core/schema"
copy_tree "$REPO_ROOT/core/scripts" "$STAGE/core/scripts"
cp "$REPO_ROOT/core/package.json" "$STAGE/core/package.json"
if [[ ! -f "$REPO_ROOT/core/pnpm-lock.yaml" ]]; then
  echo "core/pnpm-lock.yaml is required for a frozen install." >&2
  exit 1
fi
cp "$REPO_ROOT/core/pnpm-lock.yaml" "$STAGE/core/pnpm-lock.yaml"
copy_tree "$REPO_ROOT/packages/policy-runtime" "$STAGE/packages/policy-runtime" --exclude node_modules --exclude tests

echo "Installing core runtime dependencies"
pnpm --dir "$STAGE/core" install --frozen-lockfile

TSX_CLI="$STAGE/core/node_modules/tsx/dist/cli.mjs"
STAGE_ENTRY="$STAGE/core/src/cli.ts"
if [[ ! -f "$TSX_CLI" || ! -f "$STAGE_ENTRY" ]]; then
  echo "Staged core is missing tsx or cli entry." >&2
  exit 1
fi
echo "Validating staged runtime"
INPAINTER_HOME="$HOME_DIR" "$NODE" "$TSX_CLI" "$STAGE_ENTRY" home status >/dev/null

if [[ -e "$HOME_DIR/runtime.prev" ]]; then
  rm -rf "$HOME_DIR/runtime.prev"
fi
if [[ -e "$HOME_DIR/runtime" ]]; then
  mv "$HOME_DIR/runtime" "$HOME_DIR/runtime.prev"
fi
if ! mv "$STAGE" "$HOME_DIR/runtime"; then
  if [[ -e "$HOME_DIR/runtime.prev" ]]; then
    mv "$HOME_DIR/runtime.prev" "$HOME_DIR/runtime"
  fi
  echo "Failed to switch staged runtime into place." >&2
  exit 1
fi
rm -rf "$HOME_DIR/runtime.prev"

BIN="$HOME_DIR/bin/inpainter-core"
write_wrapper "$BIN" "$HOME_DIR" "$NODE"

copy_tree "$REPO_ROOT/installer/setup/bootstrap" "$HOME_DIR/bootstrap" --delete --exclude .venv --exclude __pycache__
if [[ -d "$REPO_ROOT/installer/setup/installs/skills" ]]; then
  copy_missing_files "$REPO_ROOT/installer/setup/installs/skills" "$HOME_DIR/bootstrap/installs/included"
fi
copy_missing_files "$HOME_DIR/bootstrap/installs" "$HOME_DIR/installs"

if [[ "$SKIP_PROVIDERS" != "1" ]]; then
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
fi

echo "Initializing application home"
"$BIN" home init

echo
echo "Inpainter core is installed."
echo "Command: $BIN"
echo "To use it from a terminal session:"
echo "  export PATH=\"$HOME_DIR/bin:\$PATH\""
echo "GUI clients call that absolute path and do not need PATH."
