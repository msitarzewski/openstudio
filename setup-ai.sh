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
    curl -L --fail --silent --show-error "$url" -o "$output"
  elif command -v wget >/dev/null 2>&1; then
    wget -q "$url" -O "$output"
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

load_env() {
  set -a
  # shellcheck disable=SC1091
  . "./$ENV_FILE"
  set +a
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

  if [ -x "$WHISPER_BIN" ]; then
    ok "whisper.cpp already built"
    return
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

ensure_model() {
  mkdir -p "$MODEL_DIR"

  if [ -f "$MODEL_FILE" ]; then
    ok "Whisper model already present"
    return
  fi

  info "Downloading Whisper model..."
  download_file "$MODEL_URL" "$MODEL_FILE"
  [ -f "$MODEL_FILE" ] || fail "Model download failed"
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

  if ! command -v ffmpeg >/dev/null 2>&1; then
    fail "ffmpeg is required. Install it first (brew install ffmpeg or apt install ffmpeg)."
  fi

  if ! command -v ffprobe >/dev/null 2>&1; then
    fail "ffprobe is required. Install it with ffmpeg before continuing."
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
