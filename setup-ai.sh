#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

ENV_FILE=".env"
WHISPER_DIR="whisper.cpp"
WHISPER_BIN="$WHISPER_DIR/build/bin/whisper-cli"
MODEL_DIR="models"
MODEL_FILE="$MODEL_DIR/ggml-medium.bin"
WHISPER_REPO="https://github.com/ggerganov/whisper.cpp.git"
MODEL_URL="https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin"
# ggml-medium.bin is ~1.5 GB; anything under 1 GB is a truncated transfer.
# Overridable so tests can exercise the truncation path without moving a real GB.
MODEL_MIN_BYTES="${MODEL_MIN_BYTES:-1000000000}"

info() { printf '%s\n' "$*"; }
ok() { printf 'OK: %s\n' "$*"; }
warn() { printf 'WARN: %s\n' "$*" >&2; }
fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

cpu_jobs() {
  if command -v nproc >/dev/null 2>&1; then
    nproc
  elif command -v sysctl >/dev/null 2>&1; then
    sysctl -n hw.ncpu
  else
    echo 4
  fi
}

download_file() {
  local url="$1"
  local output="$2"

  if command -v curl >/dev/null 2>&1; then
    curl -L --fail --progress-bar --show-error "$url" -o "$output"
  elif command -v wget >/dev/null 2>&1; then
    wget --show-progress -q "$url" -O "$output"
  else
    fail "Need curl or wget to download the Whisper model"
  fi
}

ensure_env_file() {
  if [ ! -f "$ENV_FILE" ]; then
    [ -f .env.example ] || fail "Missing .env.example"
    cp .env.example "$ENV_FILE"
    ok "Created .env from .env.example"
  fi
}

# Read a single key out of .env without sourcing it. Sourcing runs the file as
# shell, so a secret containing $, spaces, or ; either mangles the value, aborts
# under `set -u`, or executes. We only need the three LLM_* keys.
read_env_value() {
  local key="$1"
  [ -f "$ENV_FILE" ] || return 0
  sed -n "s/^[[:space:]]*${key}=//p" "$ENV_FILE" | tail -n 1
}

load_env() {
  LLM_BASE_URL="$(read_env_value LLM_BASE_URL)"
  LLM_MODEL="$(read_env_value LLM_MODEL)"
  LLM_API_KEY="$(read_env_value LLM_API_KEY)"
}

set_env_value() {
  local key="$1"
  local value="$2"
  local tmp
  tmp="$(mktemp)"

  awk -v key="$key" -v value="$value" '
    BEGIN { found = 0 }
    $0 ~ "^" key "=" { print key "=" value; found = 1; next }
    { print }
    END { if (!found) print key "=" value }
  ' "$ENV_FILE" > "$tmp"

  mv "$tmp" "$ENV_FILE"
}

prompt_default() {
  local prompt="$1"
  local default_value="$2"
  local reply

  printf '%s [%s]: ' "$prompt" "$default_value" >&2
  read -r reply
  printf '%s\n' "${reply:-$default_value}"
}

ensure_whisper_cpp() {
  local has_build_files=0

  if [ -f "$WHISPER_DIR/CMakeLists.txt" ] || [ -f "$WHISPER_DIR/Makefile" ]; then
    has_build_files=1
  fi

  if [ -d "$WHISPER_DIR" ] && [ "$has_build_files" -eq 0 ]; then
    if [ -z "$(find "$WHISPER_DIR" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]; then
      warn "Found empty whisper.cpp/ directory; replacing it with a fresh clone"
    else
      warn "Found whisper.cpp/ without build files; replacing it with a fresh clone"
    fi
    rm -rf "$WHISPER_DIR"
  fi

  if [ ! -d "$WHISPER_DIR" ]; then
    info "Cloning whisper.cpp..."
    git clone --depth 1 --recursive "$WHISPER_REPO" "$WHISPER_DIR"
  elif [ "$has_build_files" -eq 1 ]; then
    ok "Found whisper.cpp"
  fi
}

build_whisper_cpp() {
  if [ -x "$WHISPER_BIN" ]; then
    ok "whisper.cpp already built"
    return
  fi

  local jobs
  jobs="$(cpu_jobs)"

  if [ -f "$WHISPER_DIR/CMakeLists.txt" ]; then
    require_cmd cmake
    info "Configuring whisper.cpp with CMake..."
    cmake -S "$WHISPER_DIR" -B "$WHISPER_DIR/build" \
      -DWHISPER_BUILD_TESTS=OFF \
      -DWHISPER_BUILD_EXAMPLES=ON \
      -DWHISPER_BUILD_SERVER=OFF

    info "Building whisper.cpp..."
    cmake --build "$WHISPER_DIR/build" --config Release --target whisper-cli -j"$jobs"
  elif [ -f "$WHISPER_DIR/Makefile" ]; then
    require_cmd make
    info "Building whisper.cpp..."
    (cd "$WHISPER_DIR" && make -j"$jobs")
  else
    fail "whisper.cpp is missing supported build files"
  fi

  [ -x "$WHISPER_BIN" ] || fail "whisper.cpp build finished but $WHISPER_BIN is missing"
  ok "Built whisper.cpp"
}

file_size() {
  wc -c < "$1" | tr -d '[:space:]'
}

ensure_model() {
  mkdir -p "$MODEL_DIR"

  local partial="$MODEL_FILE.part"

  if [ -f "$MODEL_FILE" ]; then
    if [ "$(file_size "$MODEL_FILE")" -lt "$MODEL_MIN_BYTES" ]; then
      warn "Existing model is only $(file_size "$MODEL_FILE") bytes — truncated, re-downloading"
      rm -f "$MODEL_FILE"
    else
      ok "Whisper model already present"
      return
    fi
  fi

  # Download to .part and rename only on success. Writing straight to the final
  # path means an interrupted transfer leaves a truncated file that every later
  # run accepts as valid -- and capabilities.js detects the model with a bare
  # existsSync, so the UI would un-gate Transcribe over a corrupt model.
  rm -f "$partial"
  info "Downloading Whisper model (~1.5 GB, this takes a while)..."
  if ! download_file "$MODEL_URL" "$partial"; then
    rm -f "$partial"
    fail "Model download failed. Re-run ./setup-ai.sh to retry."
  fi

  if [ ! -f "$partial" ] || [ "$(file_size "$partial")" -lt "$MODEL_MIN_BYTES" ]; then
    local got="0"
    [ -f "$partial" ] && got="$(file_size "$partial")"
    rm -f "$partial"
    fail "Model download truncated (got ${got} bytes, expected at least ${MODEL_MIN_BYTES}). Re-run ./setup-ai.sh to retry."
  fi

  mv "$partial" "$MODEL_FILE"
  ok "Downloaded Whisper model"
}

configure_llm() {
  local current_base_url="${LLM_BASE_URL:-http://localhost:1234/v1}"
  local current_model="${LLM_MODEL:-qwen3.5-35b}"
  local current_api_key="${LLM_API_KEY:-}"
  local choice
  local provider_label
  local base_url
  local model
  local api_key

  info ""
  info "Choose an LLM provider for show notes:"
  info "  1) LM Studio (default)"
  info "  2) Ollama"
  info "  3) OpenAI"
  info "  4) Together AI"
  info "  5) Groq"
  info "  6) Custom OpenAI-compatible / shim"
  printf 'Provider [1]: '
  read -r choice
  choice="${choice:-1}"

  case "$choice" in
    1)
      provider_label="LM Studio"
      base_url="http://localhost:1234/v1"
      model="qwen3.5-35b"
      api_key=""
      ;;
    2)
      provider_label="Ollama"
      base_url="http://localhost:11434/v1"
      model="llama3.3"
      api_key=""
      ;;
    3)
      provider_label="OpenAI"
      base_url="https://api.openai.com/v1"
      model="gpt-4o-mini"
      printf 'Model [gpt-4o-mini]: '
      read -r model
      model="${model:-gpt-4o-mini}"
      printf 'API key: '
      read -r -s api_key
      printf '\n'
      ;;
    4)
      provider_label="Together AI"
      base_url="https://api.together.xyz/v1"
      model="meta-llama/Llama-3.3-70B-Instruct-Turbo"
      printf 'Model [meta-llama/Llama-3.3-70B-Instruct-Turbo]: '
      read -r model
      model="${model:-meta-llama/Llama-3.3-70B-Instruct-Turbo}"
      printf 'API key: '
      read -r -s api_key
      printf '\n'
      ;;
    5)
      provider_label="Groq"
      base_url="https://api.groq.com/openai/v1"
      model="llama-3.3-70b-versatile"
      printf 'Model [llama-3.3-70b-versatile]: '
      read -r model
      model="${model:-llama-3.3-70b-versatile}"
      printf 'API key: '
      read -r -s api_key
      printf '\n'
      ;;
    6)
      provider_label="Custom"
      base_url="$(prompt_default 'Base URL' "$current_base_url")"
      model="$(prompt_default 'Model' "$current_model")"
      printf 'API key [leave blank if none]: '
      read -r -s api_key
      printf '\n'
      api_key="${api_key:-$current_api_key}"
      ;;
    *)
      warn "Unknown choice, using LM Studio defaults"
      provider_label="LM Studio"
      base_url="http://localhost:1234/v1"
      model="qwen3.5-35b"
      api_key=""
      ;;
  esac

  set_env_value "LLM_BASE_URL" "$base_url"
  set_env_value "LLM_MODEL" "$model"
  set_env_value "LLM_API_KEY" "$api_key"

  ok "Configured LLM provider: $provider_label"
}

main() {
  require_cmd git
  require_cmd awk

  # ffmpeg/ffprobe are needed by the cleaning and export pipeline at runtime, but
  # not to clone whisper.cpp, build it, or fetch the model. Don't block the whole
  # bootstrap on them -- warn and let the user finish the parts that do work.
  local missing_ffmpeg=0
  command -v ffmpeg >/dev/null 2>&1 || missing_ffmpeg=1
  command -v ffprobe >/dev/null 2>&1 || missing_ffmpeg=1

  if [ "$missing_ffmpeg" -eq 1 ]; then
    warn "ffmpeg/ffprobe not found. Transcribe and export stay gated until you install them:"
    warn "  macOS: brew install ffmpeg    Debian/Ubuntu: sudo apt install ffmpeg"
  fi

  ensure_env_file
  load_env

  ensure_whisper_cpp
  build_whisper_cpp
  ensure_model
  configure_llm

  info ""
  ok "AI pipeline setup complete"
  info "Next steps:"
  info "  1) Start OpenStudio: npm start"
  info "  2) Or run the dev workflow: ./dev.sh start"
  info "  3) Reload the studio UI so /api/capabilities picks up the new tools"
}

main "$@"
