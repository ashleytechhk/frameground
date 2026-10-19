#!/usr/bin/env bash
set -euo pipefail

demo_root="$(cd "$(dirname "$0")/.." && pwd)"
flutter_root="$demo_root/flutter"
set +u
flutter_bin="$FLUTTER_BIN"
set -u
if [[ -z "$flutter_bin" ]]; then
  flutter_bin=flutter
fi
state_root="${TMPDIR:-/tmp}/frameground-flutter-sample"
port="${FRAMEGROUND_FLUTTER_PORT:-7357}"

if ! "$flutter_bin" --version >/dev/null 2>&1; then
  echo "Flutter SDK is required but '$flutter_bin' is not executable." >&2
  exit 127
fi

mkdir -p "$state_root"

if [[ -s "$state_root/runner.pid" ]] && kill -0 "$(cat "$state_root/runner.pid")" 2>/dev/null; then
  echo "A Frameground Flutter sample runner is already alive (pid $(cat "$state_root/runner.pid"))." >&2
  echo "URL: $(cat "$state_root/runner.url")" >&2
  exit 0
fi

rm -f "$state_root/runner.pid" "$state_root/runner.url"
nohup sh -c '
  cd "$1"
  "$2" pub get
  exec "$2" run -d web-server --web-hostname 127.0.0.1 --web-port "$3"
' frameground-flutter-sample "$flutter_root" "$flutter_bin" "$port" \
  >"$state_root/runner.log" 2>&1 < /dev/null &

runner_pid="$!"
printf '%s\n' "$runner_pid" >"$state_root/runner.pid"
printf 'http://127.0.0.1:%s\n' "$port" >"$state_root/runner.url"

for _ in $(seq 1 40); do
  if curl --silent --fail "http://127.0.0.1:$port/?fg_screen=welcome" >/dev/null 2>&1; then
    echo "Flutter sample ready: http://127.0.0.1:$port/?fg_screen=welcome"
    exit 0
  fi
  if ! kill -0 "$runner_pid" 2>/dev/null; then
    echo "Flutter demo exited before becoming ready; see $state_root/runner.log" >&2
    exit 1
  fi
  sleep 1
done

echo "Flutter sample did not become ready; see $state_root/runner.log" >&2
exit 1
