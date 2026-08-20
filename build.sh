#!/usr/bin/env bash
# Reproduce scorer.wasm from scorer.c and verify it against the registered hash.
#
# Reference toolchain: Ubuntu clang 18.1.3 / LLD 18.1.3
#
# The build runs in a temp directory. The scorer.wasm committed here is the
# registered artifact and is never written to by this script.

set -uo pipefail

REGISTERED=92aff009ec743aa28b4e88bf14803cc207a976eaa56dd8b699a7ff0ee1aa3d7d
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1
  elif command -v shasum   >/dev/null 2>&1; then shasum -a 256 "$1" | cut -d' ' -f1
  else echo "no sha256sum or shasum on PATH" >&2; exit 1
  fi
}

# A candidate is usable only if it compiles AND links a wasm32 module, which is
# what actually exercises wasm-ld. Apple's clang has neither the wasm32 target
# nor a sibling wasm-ld, so it fails here rather than half-building.
probe() {
  local cc="$1" t
  command -v "$cc" >/dev/null 2>&1 || return 1
  t="$(mktemp -d)"
  printf '__attribute__((export_name("p"))) int p(void){return 1;}\n' > "$t/probe.c"
  ( cd "$t" && "$cc" --target=wasm32 -nostdlib -O2 -fno-builtin \
      -Wl,--no-entry -Wl,--export-dynamic -o probe.wasm probe.c ) >/dev/null 2>&1
  local rc=$?
  [ $rc -eq 0 ] && [ -s "$t/probe.wasm" ]; rc=$?
  rm -rf "$t"
  return $rc
}

CC=""
for cand in /opt/homebrew/opt/llvm/bin/clang clang; do
  if probe "$cand"; then CC="$cand"; break; fi
done

if [ -z "$CC" ]; then
  cat >&2 <<'MSG'
No clang with wasm32 + wasm-ld support found.

Checked (in order):
  /opt/homebrew/opt/llvm/bin/clang
  clang (from PATH)

Apple's clang ships no wasm32 target and no wasm-ld, so it cannot build this.
Install a real LLVM toolchain:

  brew install llvm lld

Then re-run ./build.sh (it picks up /opt/homebrew/opt/llvm/bin/clang directly;
no PATH change needed).
MSG
  exit 1
fi

echo "clang:  $CC"
"$CC" --version | head -1
echo

BUILD="$(mktemp -d)"
trap 'rm -rf "$BUILD"' EXIT
cp "$REPO/scorer.c" "$REPO/test.mjs" "$REPO/adv.mjs" "$BUILD/"
cd "$BUILD" || exit 1

echo "building:"
echo "  clang --target=wasm32 -nostdlib -O2 -fno-builtin \\"
echo "    -Wl,--no-entry -Wl,--export-dynamic -Wl,--initial-memory=2097152 \\"
echo "    -o scorer.wasm scorer.c"
echo

"$CC" --target=wasm32 -nostdlib -O2 -fno-builtin \
  -Wl,--no-entry -Wl,--export-dynamic -Wl,--initial-memory=2097152 \
  -o scorer.wasm scorer.c || { echo "BUILD FAILED" >&2; exit 1; }

GOT="$(sha256 scorer.wasm)"
echo "built      $GOT"
echo "registered $REGISTERED"
if [ "$GOT" = "$REGISTERED" ]; then
  echo "REPRODUCED: byte-identical to the registered scorer.wasm."
else
  echo "NOT REPRODUCED: hash differs from the registered scorer.wasm."
  echo "  The committed scorer.wasm is unchanged and remains the registered artifact."
  echo "  Expected with a different toolchain; reference is Ubuntu clang 18.1.3 / LLD 18.1.3."
fi
echo

# Tests run against the freshly built module in this temp dir.
node test.mjs scorer.wasm && node adv.mjs
