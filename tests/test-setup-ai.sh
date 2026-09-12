#!/bin/bash
# Smoke tests for setup-ai.sh, run against a fake toolchain (no network, no
# real build). Scenario 1 is the original happy path; scenarios 2 and 3 are
# regressions for bugs found reviewing PR #12.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PASSED=0

# Real ggml-medium.bin is ~1.5 GB. Shrink the floor so the fake toolchain can
# exercise both sides of the truncation check without moving a gigabyte.
export MODEL_MIN_BYTES=16

# Builds an isolated sandbox with a fake git/cmake/ffmpeg/ffprobe on PATH.
# $1 = sandbox dir. The caller supplies its own fakebin/curl.
make_sandbox() {
  local dir="$1"
  mkdir -p "$dir/fakebin" "$dir/fake-whisper-src"
  cp "$ROOT_DIR/setup-ai.sh" "$dir/setup-ai.sh"
  cp "$ROOT_DIR/.env.example" "$dir/.env.example"
  : > "$dir/fake-whisper-src/CMakeLists.txt"

  cat > "$dir/fakebin/git" <<'EOF'
#!/bin/bash
set -euo pipefail
if [ "${1:-}" = "clone" ]; then
  target="${@: -1}"
  src="${FAKE_WHISPER_SRC:?}"
  rm -rf "$target"; mkdir -p "$target"; cp -R "$src"/. "$target"/
  exit 0
fi
command git "$@"
EOF

  cat > "$dir/fakebin/cmake" <<'EOF'
#!/bin/bash
set -euo pipefail
if [ "${1:-}" = "-S" ]; then
  builddir=""
  while [ "$#" -gt 0 ]; do
    case "$1" in
      -B) builddir="$2"; shift 2 ;;
      *) shift ;;
    esac
  done
  mkdir -p "$builddir/bin"
  printf '#!/bin/sh\nexit 0\n' > "$builddir/bin/whisper-cli"
  chmod +x "$builddir/bin/whisper-cli"
fi
exit 0
EOF

  printf '#!/bin/sh\nexit 0\n' > "$dir/fakebin/ffmpeg"
  printf '#!/bin/sh\nexit 0\n' > "$dir/fakebin/ffprobe"
  chmod +x "$dir/fakebin/"*
}

# A curl stub. $1 = sandbox, $2 = payload to write, $3 = exit code.
fake_curl() {
  local dir="$1" payload="$2" code="$3"
  cat > "$dir/fakebin/curl" <<EOF
#!/bin/bash
out=""
while [ "\$#" -gt 0 ]; do
  case "\$1" in
    -o) out="\$2"; shift 2 ;;
    *) shift ;;
  esac
done
[ -n "\$out" ] || exit 1
mkdir -p "\$(dirname "\$out")"
printf '%s' '$payload' > "\$out"
exit $code
EOF
  chmod +x "$dir/fakebin/curl"
}

run_setup() {
  local dir="$1" choice="$2"
  ( cd "$dir" && PATH="$dir/fakebin:$PATH" FAKE_WHISPER_SRC="$dir/fake-whisper-src" \
      bash ./setup-ai.sh <<< "$choice" )
}

pass() { PASSED=$((PASSED + 1)); echo "  PASS: $1"; }
die()  { echo "  FAIL: $1" >&2; exit 1; }

# --- Scenario 1: happy path, Ollama selected -------------------------------
echo "[1] happy path writes provider config and lands both artifacts"
S1="$(mktemp -d)"; trap 'rm -rf "$S1"' EXIT
make_sandbox "$S1"
fake_curl "$S1" "MODEL-PAYLOAD-LONG-ENOUGH" 0
run_setup "$S1" "2" > "$S1/out.log" 2>&1 || die "setup-ai.sh exited nonzero"

grep -q '^LLM_BASE_URL=http://localhost:11434/v1$' "$S1/.env" || die "LLM_BASE_URL not written"
grep -q '^LLM_MODEL=llama3.3$' "$S1/.env"                     || die "LLM_MODEL not written"
grep -q '^LLM_API_KEY=$' "$S1/.env"                           || die "LLM_API_KEY not blanked"
[ -x "$S1/whisper.cpp/build/bin/whisper-cli" ]                || die "whisper-cli missing"
[ -f "$S1/models/ggml-medium.bin" ]                           || die "model missing"
pass "provider config, whisper-cli, and model all present"

# --- Scenario 2: interrupted download must not be cached as success --------
# Regression: writing straight to the final path left a truncated file that
# later runs accepted, and capabilities.js only checks existence -- so the UI
# would un-gate Transcribe over a corrupt model.
echo "[2] interrupted download is discarded, then recovers on retry"
S2="$(mktemp -d)"; trap 'rm -rf "$S1" "$S2"' EXIT
make_sandbox "$S2"
fake_curl "$S2" "TRUNC" 18   # curl(18): transfer closed early
if run_setup "$S2" "1" > "$S2/fail.log" 2>&1; then
  die "setup-ai.sh reported success despite a failed download"
fi
[ ! -f "$S2/models/ggml-medium.bin" ] || die "truncated model left on disk"
[ ! -f "$S2/models/ggml-medium.bin.part" ] || die ".part file left on disk"
pass "truncated transfer left no model behind"

fake_curl "$S2" "MODEL-PAYLOAD-LONG-ENOUGH" 0
run_setup "$S2" "1" > "$S2/retry.log" 2>&1 || die "retry after failed download did not succeed"
[ -f "$S2/models/ggml-medium.bin" ] || die "retry did not produce a model"
pass "retry downloaded the model cleanly"

# --- Scenario 3: .env holding real secrets must not break the script -------
# Regression: load_env sourced .env as shell, so a secret containing $ aborted
# under `set -u` and a value with spaces ran as a command.
echo "[3] .env with shell-hostile secrets is read, not executed"
S3="$(mktemp -d)"; trap 'rm -rf "$S1" "$S2" "$S3"' EXIT
make_sandbox "$S3"
fake_curl "$S3" "MODEL-PAYLOAD-LONG-ENOUGH" 0
cat > "$S3/.env" <<'EOF'
JWT_SECRET=k7$Rm2pQ9wZx
STATION_NAME=Pirate Radio One
ICECAST_SOURCE_PASSWORD=a;b`c`
LLM_BASE_URL=http://localhost:1234/v1
LLM_MODEL=qwen3.5-35b
LLM_API_KEY=
EOF
run_setup "$S3" "2" > "$S3/out.log" 2>&1 || die "setup-ai.sh choked on a realistic .env"
grep -q '^JWT_SECRET=k7\$Rm2pQ9wZx$' "$S3/.env"        || die "JWT_SECRET was mangled"
grep -q '^STATION_NAME=Pirate Radio One$' "$S3/.env"   || die "STATION_NAME was mangled"
grep -q '^LLM_BASE_URL=http://localhost:11434/v1$' "$S3/.env" || die "LLM_BASE_URL not updated"
pass "unrelated secrets preserved verbatim, LLM keys updated"

echo ""
echo "setup-ai.sh test passed ($PASSED checks)"
