#!/usr/bin/env bash
# Start the HandwritingRemover Frameground workspace, then show it in Chrome.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECTS_ROOT="/Volumes/MyPassport/quick_app_ssd/013_HandwritingRemover/frameground"
HOST="127.0.0.1"
PORT="5174"
URL="http://${HOST}:${PORT}"
LOG_FILE="/tmp/frameground-dev.log"

is_frameground_running() {
  # The API is more specific than a successful Vite HTML response: it proves
  # that this port is serving Frameground rather than another local app.
  local projects
  projects="$(curl --noproxy '*' --silent --show-error --fail --max-time 2 \
    "${URL}/api/projects" 2>/dev/null || true)"
  printf '%s' "$projects" | grep -Eq '"projects"[[:space:]]*:'
}

port_is_listening() {
  lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN -t >/dev/null 2>&1
}

if is_frameground_running; then
  echo "Frameground is already running at ${URL}."
elif port_is_listening; then
  echo "Port ${PORT} is already being used by a process that is not Frameground." >&2
  echo "Stop that process or use its own URL; this script will not start a duplicate server." >&2
  exit 1
else
  echo "Starting Frameground; logs: ${LOG_FILE}"
  (
    cd "${SCRIPT_DIR}"
    exec env PROJECTS_ROOT="${PROJECTS_ROOT}" npm run dev -- --host "${HOST}" --port "${PORT}"
  ) >>"${LOG_FILE}" 2>&1 &
fi

echo "Waiting for ${URL} ..."
ready=0
for _ in {1..80}; do
  if curl --noproxy '*' --silent --show-error --fail --max-time 2 \
      "${URL}/" >/dev/null 2>&1 && is_frameground_running; then
    ready=1
    break
  fi
  sleep 0.25
done

if [[ "$ready" -ne 1 ]]; then
  echo "Frameground did not become ready. Check ${LOG_FILE}" >&2
  exit 1
fi

echo "Frameground is ready at ${URL}."
if [[ "${FRAMEGROUND_OPEN_BROWSER:-1}" != "0" ]]; then
  open -a "Google Chrome" "${URL}"
fi
