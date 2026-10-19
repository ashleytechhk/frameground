#!/usr/bin/env bash
set -euo pipefail

state_root="${TMPDIR:-/tmp}/frameground-flutter-sample"
pid_file="$state_root/runner.pid"

if [[ ! -s "$pid_file" ]]; then
  echo "No Frameground Flutter sample PID file exists."
  exit 0
fi

runner_pid="$(cat "$pid_file")"
if kill -0 "$runner_pid" 2>/dev/null; then
  kill "$runner_pid"
  echo "Stopped Frameground Flutter sample runner $runner_pid."
else
  echo "Recorded runner $runner_pid is already stopped."
fi

rm -f "$state_root/runner.pid" "$state_root/runner.url"
