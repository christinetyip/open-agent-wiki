#!/bin/bash
# Session start hook — loads learning profile + subscription digest
# Returns context for the agent to personalize the session

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="$(dirname "$SCRIPT_DIR")"

# Pull latest repo changes
git -C ~/open-agent-wiki pull --ff-only 2>/dev/null || true

# Get API key
ENSUE_KEY_FILE="$PLUGIN_ROOT/.ensue-key"
if [ -z "$ENSUE_API_KEY" ] && [ -f "$ENSUE_KEY_FILE" ]; then
  ENSUE_API_KEY=$(cat "$ENSUE_KEY_FILE")
fi

# Also check home directory key file
if [ -z "$ENSUE_API_KEY" ] && [ -f ~/open-agent-wiki/.ensue-key ]; then
  ENSUE_API_KEY=$(cat ~/open-agent-wiki/.ensue-key)
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

# Detect the user's org name from their contributor keys
ORG_NAME=$(ensue_call "list_keys" '{"prefix":"meta/contributors/","limit":50}' | jq -r '
  .result.structuredContent.keys // [] |
  map(.key_name) |
  map(select(endswith("/learning-profile"))) |
  first // empty |
  sub("meta/contributors/"; "") |
  sub("/learning-profile"; "")
' 2>/dev/null)

# --- LEARNING PROFILE ---
LEARNING_PROFILE=""
if [ -n "$ORG_NAME" ] && [ "$ORG_NAME" != "null" ]; then
  LP_RESULT=$(ensue_call "get_memory" "{\"key_names\":[\"@agent_wiki/meta/contributors/$ORG_NAME/learning-profile\"]}")
  LEARNING_PROFILE=$(echo "$LP_RESULT" | jq -r '.result.structuredContent.results[0].value // empty' 2>/dev/null)
fi

# --- SUBSCRIPTION DIGEST ---
SUBS_RESULT=$(ensue_call "list_subscriptions" '{}')

CONTRIB_KEYS=$(echo "$SUBS_RESULT" | jq -r '
  .result.structuredContent.subscriptions // [] |
  [.[] | select(.key_name | contains("meta/contributors/")) | .key_name] |
  join(",")
' 2>/dev/null)

DIGEST=""
if [ -n "$CONTRIB_KEYS" ] && [ "$CONTRIB_KEYS" != "" ]; then
  KEY_ARRAY=$(echo "$CONTRIB_KEYS" | jq -R 'split(",")' 2>/dev/null)
  CONTRIB_DATA=$(ensue_call "get_memory" "{\"key_names\":$KEY_ARRAY}")

  LAST_CHECK_FILE="$PLUGIN_ROOT/.last-subscription-check"
  LAST_CHECK=""
  if [ -f "$LAST_CHECK_FILE" ]; then
    LAST_CHECK=$(cat "$LAST_CHECK_FILE")
  fi

  date -u +"%Y-%m-%dT%H:%M:%SZ" > "$LAST_CHECK_FILE"

  DIGEST=$(echo "$CONTRIB_DATA" | jq -r '
    .result.structuredContent.results // [] |
    map(select(.value != null)) |
    map(
      {
        name: (.key_name | sub(".*/contributors/"; "") | sub("/contributions"; "")),
        value: .value
      }
    ) |
    map(
      .name as $name |
      .value |
      split("\n") |
      map(select(startswith("- "))) |
      if length > 0 then
        "\($name) — \(length) entries:\n\(map("  " + .) | join("\n"))"
      else
        empty
      end
    ) |
    join("\n\n")
  ' 2>/dev/null)
fi

# --- BUILD CONTEXT ---
CONTEXT="OPEN AGENT WIKI — SESSION START

You are connected to the Open Agent Wiki. Read ~/open-agent-wiki/collab.md for the full protocol."

if [ -n "$LEARNING_PROFILE" ] && [ "$LEARNING_PROFILE" != "null" ]; then
  CONTEXT="$CONTEXT

<learning-profile>
$LEARNING_PROFILE
</learning-profile>

Use this learning profile to personalize the session. Reference what the user explored before, build on their existing understanding, and prioritize their open questions. If they had a last session, greet them with context: \"Last time you were exploring X. You had an open question about Y. Want to pick up there, or start something new?\""
fi

if [ -n "$DIGEST" ] && [ "$DIGEST" != "" ]; then
  CONTEXT="$CONTEXT

<subscription-digest>
$DIGEST
</subscription-digest>

Also briefly mention what followed contributors have added since last time."
fi

if [ -z "$LEARNING_PROFILE" ] || [ "$LEARNING_PROFILE" = "null" ]; then
  if [ -z "$DIGEST" ] || [ "$DIGEST" = "" ]; then
    CONTEXT="$CONTEXT

No learning profile or subscriptions found. Greet the user and remind them they can use /ingest, /research, /my-entries, /lint, or /subscribe."
  fi
fi

CONTEXT="$CONTEXT

After your personalized greeting, ALWAYS show this menu:

**Open Agent Wiki** — What would you like to do?

1. **ingest** \`<url>\` — Feed a source into the wiki
2. **research** \`<question>\` — Ask the wiki a question
3. **my-entries** — Review your contributions and impact
4. **lint** — Check your entries and fill knowledge gaps
5. **subscribe** — Follow contributors
6. **leaderboard** — See top entries and contributors

Or just tell me what you're working on.

IMPORTANT: Update or create today's session entry at @agent_wiki/meta/contributors/$ORG_NAME/sessions/$(date -u +%Y-%m-%d) throughout this session. Update the learning profile after meaningful interactions."

echo "$CONTEXT" | jq -Rs '{
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext: .
  }
}'
