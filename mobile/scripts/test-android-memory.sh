#!/usr/bin/env bash
set -euo pipefail

APP_ID="${TRAILBOOK_MEMORY_APP_ID:-com.slavisacicovic.trailbook.local.encrypted}"
TRIP_TITLE="${TRAILBOOK_MEMORY_TRIP_TITLE:-Test}"
CYCLES="${TRAILBOOK_MEMORY_CYCLES:-3}"
SETTLE_SECONDS="${TRAILBOOK_MEMORY_SETTLE_SECONDS:-15}"
MAX_GRAPHICS_MB="${TRAILBOOK_MEMORY_MAX_GRAPHICS_MB:-180}"
MAX_GRAPHICS_GROWTH_MB="${TRAILBOOK_MEMORY_MAX_GRAPHICS_GROWTH_MB:-80}"
MAX_BACKGROUND_RSS_MB="${TRAILBOOK_MEMORY_MAX_BACKGROUND_RSS_MB:-900}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOBILE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
RESULTS_DIR="$MOBILE_DIR/test-results"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)"
REPORT="$RESULTS_DIR/android-memory-$RUN_ID.csv"
MAESTRO_BIN="${TRAILBOOK_MAESTRO_BIN:-}"

if [[ -z "$MAESTRO_BIN" ]]; then
  MAESTRO_BIN="$(command -v maestro || true)"
fi
if [[ -z "$MAESTRO_BIN" && -x /home/slavisa/.maestro/bin/maestro ]]; then
  MAESTRO_BIN=/home/slavisa/.maestro/bin/maestro
fi

if [[ -x /usr/lib/jvm/java-21-openjdk/bin/java ]]; then
  export JAVA_HOME=/usr/lib/jvm/java-21-openjdk
  export PATH="$JAVA_HOME/bin:$PATH"
elif [[ -x /usr/lib/jvm/java-17-openjdk/bin/java ]]; then
  export JAVA_HOME=/usr/lib/jvm/java-17-openjdk
  export PATH="$JAVA_HOME/bin:$PATH"
fi

for command in adb awk; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Required command is not installed: $command" >&2
    exit 2
  fi
done

if [[ -z "$MAESTRO_BIN" || ! -x "$MAESTRO_BIN" ]]; then
  echo "Required command is not installed: maestro" >&2
  exit 2
fi

if ! [[ "$CYCLES" =~ ^[1-9][0-9]*$ ]]; then
  echo "TRAILBOOK_MEMORY_CYCLES must be a positive integer." >&2
  exit 2
fi

adb get-state >/dev/null

ensure_local_reverse() {
  adb reverse tcp:3001 tcp:3001 >/dev/null
  adb reverse tcp:9000 tcp:9000 >/dev/null
}

# Android drops reverse rules when the ADB transport reconnects. Keep the
# local API and MinIO reachable during the flow and after manual testing resumes.
trap ensure_local_reverse EXIT
ensure_local_reverse

if ! adb shell pm path "$APP_ID" >/dev/null 2>&1; then
  echo "App is not installed: $APP_ID" >&2
  exit 2
fi

mkdir -p "$RESULTS_DIR"
printf 'cycle,pid,pss_kb,rss_kb,native_heap_kb,graphics_kb,gl_kb,swap_pss_kb\n' > "$REPORT"

metric_after_label() {
  local input="$1"
  local label="$2"
  awk -v label="$label" '
    index($0, label) {
      rest = substr($0, index($0, label) + length(label));
      sub(/^[[:space:]]+/, "", rest);
      split(rest, fields, /[[:space:]]+/);
      print fields[1];
      exit;
    }
  ' <<< "$input"
}

capture_snapshot() {
  local cycle="$1"
  local expected_pid="$2"
  local pid meminfo pss rss native_heap graphics gl swap_pss
  pid="$(adb shell pidof "$APP_ID" | tr -d '\r')"
  if [[ -z "$pid" ]]; then
    echo "App process is not running after cycle $cycle." >&2
    exit 1
  fi
  if [[ -n "$expected_pid" && "$pid" != "$expected_pid" ]]; then
    echo "PID changed from $expected_pid to $pid during cycle $cycle; result is invalid." >&2
    exit 1
  fi

  meminfo="$(adb shell dumpsys meminfo "$APP_ID")"
  pss="$(metric_after_label "$meminfo" 'TOTAL PSS:')"
  rss="$(metric_after_label "$meminfo" 'TOTAL RSS:')"
  swap_pss="$(metric_after_label "$meminfo" 'TOTAL SWAP PSS:')"
  native_heap="$(awk '/^[[:space:]]*Native Heap:/ { print $3; exit }' <<< "$meminfo")"
  graphics="$(awk '/^[[:space:]]*Graphics:/ { print $2; exit }' <<< "$meminfo")"
  gl="$(awk '/^[[:space:]]*GL mtrack/ { print $3; exit }' <<< "$meminfo")"
  gl="${gl:-0}"

  if [[ -z "$pss" || -z "$rss" || -z "$native_heap" || -z "$graphics" || -z "$swap_pss" ]]; then
    echo "Could not parse Android memory output for cycle $cycle." >&2
    exit 1
  fi
  printf '%s,%s,%s,%s,%s,%s,%s,%s\n' \
    "$cycle" "$pid" "$pss" "$rss" "$native_heap" "$graphics" "$gl" "$swap_pss" >> "$REPORT"
  printf 'cycle=%s pid=%s PSS=%sMB RSS=%sMB native=%sMB graphics=%sMB GL=%sMB swap=%sMB\n' \
    "$cycle" "$pid" "$((pss / 1024))" "$((rss / 1024))" "$((native_heap / 1024))" \
    "$((graphics / 1024))" "$((gl / 1024))" "$((swap_pss / 1024))"
  SNAPSHOT_PID="$pid"
  SNAPSHOT_GRAPHICS_KB="$graphics"
  SNAPSHOT_RSS_KB="$rss"
}

adb shell am force-stop "$APP_ID"
"$MAESTRO_BIN" test -e "TRAILBOOK_MEMORY_TRIP_TITLE=$TRIP_TITLE" "$MOBILE_DIR/.maestro/android-memory-baseline.yaml"
ensure_local_reverse
sleep "$SETTLE_SECONDS"
capture_snapshot 0 ""
baseline_pid="$SNAPSHOT_PID"
baseline_graphics_kb="$SNAPSHOT_GRAPHICS_KB"

for ((cycle = 1; cycle <= CYCLES; cycle += 1)); do
  "$MAESTRO_BIN" test -e "TRAILBOOK_MEMORY_TRIP_TITLE=$TRIP_TITLE" "$MOBILE_DIR/.maestro/android-memory-photo-cycle.yaml"
  ensure_local_reverse
  sleep "$SETTLE_SECONDS"
  capture_snapshot "$cycle" "$baseline_pid"
done

max_graphics_kb=$((MAX_GRAPHICS_MB * 1024))
max_graphics_growth_kb=$((MAX_GRAPHICS_GROWTH_MB * 1024))
max_background_rss_kb=$((MAX_BACKGROUND_RSS_MB * 1024))
graphics_growth_kb=$((SNAPSHOT_GRAPHICS_KB - baseline_graphics_kb))
failed=0

if ((SNAPSHOT_GRAPHICS_KB > max_graphics_kb)); then
  echo "FAIL: graphics memory exceeded ${MAX_GRAPHICS_MB}MB." >&2
  failed=1
fi
if ((graphics_growth_kb > max_graphics_growth_kb)); then
  echo "FAIL: graphics memory grew by more than ${MAX_GRAPHICS_GROWTH_MB}MB." >&2
  failed=1
fi
if ((SNAPSHOT_RSS_KB + 0 > max_background_rss_kb)); then
  echo "FAIL: background RSS exceeded ${MAX_BACKGROUND_RSS_MB}MB." >&2
  failed=1
fi

echo "Memory report: $REPORT"
if ((failed)); then exit 1; fi
echo "PASS: memory remained within the configured local guardrails."
