#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

cp "$ROOT_DIR/setup-ai.sh" "$TMPDIR/setup-ai.sh"
cp "$ROOT_DIR/.env.example" "$TMPDIR/.env.example"
mkdir -p "$TMPDIR/fakebin" "$TMPDIR/fake-whisper-src"
: > "$TMPDIR/fake-whisper-src/CMakeLists.txt"

cat > "$TMPDIR/fakebin/git" <<'EOF'
#!/bin/bash
set -euo pipefail

if [ "${1:-}" = "clone" ]; then
  target="${@: -1}"
  src="${FAKE_WHISPER_SRC:?}"
  rm -rf "$target"
  mkdir -p "$target"
  cp -R "$src"/. "$target"/
  exit 0
fi

command git "$@"
EOF

cat > "$TMPDIR/fakebin/cmake" <<'EOF'
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
  cat > "$builddir/bin/whisper-cli" <<'EOB'
#!/bin/sh
exit 0
EOB
  chmod +x "$builddir/bin/whisper-cli"
  exit 0
fi

exit 0
EOF

cat > "$TMPDIR/fakebin/curl" <<'EOF'
#!/bin/bash
set -euo pipefail

out=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    -o) out="$2"; shift 2 ;;
    *) shift ;;
  esac
done

[ -n "$out" ] || exit 1
mkdir -p "$(dirname "$out")"
printf 'model' > "$out"
EOF

cat > "$TMPDIR/fakebin/ffmpeg" <<'EOF'
#!/bin/sh
exit 0
EOF

cat > "$TMPDIR/fakebin/ffprobe" <<'EOF'
#!/bin/sh
exit 0
EOF

chmod +x "$TMPDIR/fakebin/"*

(
  cd "$TMPDIR"
  PATH="$TMPDIR/fakebin:$PATH" FAKE_WHISPER_SRC="$TMPDIR/fake-whisper-src" \
    bash ./setup-ai.sh <<'EOF'
2
EOF
)

grep -q '^LLM_BASE_URL=http://localhost:11434/v1$' "$TMPDIR/.env"
grep -q '^LLM_MODEL=llama3.3$' "$TMPDIR/.env"
grep -q '^LLM_API_KEY=$' "$TMPDIR/.env"
[ -x "$TMPDIR/whisper.cpp/build/bin/whisper-cli" ]
[ -f "$TMPDIR/models/ggml-medium.bin" ]

echo "setup-ai.sh test passed"
