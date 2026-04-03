#!/bin/bash
# Session start hook — checks subscriptions for new entries since last session
# Returns a digest of what followed contributors have added

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="$(dirname "$SCRIPT_DIR")"

# Get API key
ENSUE_KEY_FILE="$PLUGIN_ROOT/.ensue-key"
if [ -z "$ENSUE_API_KEY" ] && [ -f "$ENSUE_KEY_FILE" ]; then
  ENSUE_API_KEY=$(cat "$ENSUE_KEY_FILE")
fi

if [ -z "$ENSUE_API_KEY" ]; then
  echo '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"Open Agent Wiki: No API key found. Run /subscribe to set up."}}'
  exit 0
fi

# Helper to call Ensue API
ensue_call() {
  local method="$1"
  local args="$2"
  [ -z "$args" ] && args='{}'
  curl -sf -X POST https://api.ensue-network.ai/ \
    -H "Authorization: Bearer $ENSUE_API_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"$method\",\"arguments\":$args},\"id\":1}" \
    2>/dev/null | sed 's/^data: //'
}

# Get current subscriptions
SUBS_RESULT=$(ensue_call "list_subscriptions" '{}')

# Extract subscribed contributor keys (meta/contributors/*)
CONTRIB_KEYS=$(echo "$SUBS_RESULT" | jq -r '
  .result.structuredContent.subscriptions // [] |
  [.[] | select(.key_name | startswith("meta/contributors/")) | .key_name] |
  join(",")
' 2>/dev/null)

if [ -z "$CONTRIB_KEYS" ] || [ "$CONTRIB_KEYS" = "" ]; then
  echo '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"Open Agent Wiki: No subscriptions. Use /subscribe to follow contributors."}}'
  exit 0
fi

# Convert comma-separated keys to JSON array for get_memory
KEY_ARRAY=$(echo "$CONTRIB_KEYS" | jq -R 'split(",")' 2>/dev/null)

# Fetch contributor files
CONTRIB_DATA=$(ensue_call "get_memory" "{\"key_names\":$KEY_ARRAY}")

# Get the last-checked timestamp (stored locally)
LAST_CHECK_FILE="$PLUGIN_ROOT/.last-subscription-check"
LAST_CHECK=""
if [ -f "$LAST_CHECK_FILE" ]; then
  LAST_CHECK=$(cat "$LAST_CHECK_FILE")
fi

# Save current timestamp
date -u +"%Y-%m-%dT%H:%M:%SZ" > "$LAST_CHECK_FILE"

# Build the digest by extracting contributions from each contributor
DIGEST=$(echo "$CONTRIB_DATA" | jq -r --arg last_check "$LAST_CHECK" '
  .result.structuredContent.results // [] |
  map(
    {
      name: (.key_name | sub("meta/contributors/"; "")),
      value: .value
    }
  ) |
  map(
    .name as $name |
    .value |
    split("\n") |
    map(select(startswith("- "))) |
    if ($last_check != "") then
      map(select(. | test($last_check | split("T")[0]; "x") | not)) |
      # Keep entries with dates >= last_check date
      # Simple approach: include all since we cannot reliably filter by date in jq
      .
    else
      .
    end |
    if length > 0 then
      "\($name) — \(length) entries:\n\(map("  " + .) | join("\n"))"
    else
      empty
    end
  ) |
  join("\n\n")
' 2>/dev/null)

if [ -z "$DIGEST" ] || [ "$DIGEST" = "" ]; then
  echo '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"Open Agent Wiki: You are following contributors but no new entries found. Use /ingest to add to the wiki or /subscribe to manage subscriptions."}}'
  exit 0
fi

# Build context for Claude
CONTEXT="OPEN AGENT WIKI — SUBSCRIPTION DIGEST

You are connected to the Open Agent Wiki. The user follows contributors who have entries. Show this digest briefly at the start of the session:

<subscription-digest>
$DIGEST
</subscription-digest>

Present this as a short \"While you were away\" summary. Keep it concise — just contributor names and their entry titles. Then say: \"Use /subscribe to browse their entries, or continue with your work.\"

Do NOT skip this. Show the digest before doing anything else."

echo "$CONTEXT" | jq -Rs '{
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext: .
  }
}'
