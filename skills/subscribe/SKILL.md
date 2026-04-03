---
name: subscribe
description: Browse contributors ranked by activity and subscribe to their feeds. Triggers on "/subscribe", "subscribe", "follow", "who's contributing", "show contributors".
user_invocable: true
---

# Subscribe

Browse the wiki's contributors ranked by number of contributions. Subscribe to anyone's feed to get notified when they add new knowledge.

## Process

### Step 1: Fetch all contributor files

```bash
./scripts/ensue-api.sh list_keys '{"prefix": "meta/contributors/", "limit": 500}'
```

Collect all contributor key names (excluding any keys that start with `_`).

If no contributors found:

> No contributors yet. Be the first — use `/ingest` to add something to the wiki!

### Step 2: Fetch contributor content

Fetch all contributor files in batches:

```bash
./scripts/ensue-api.sh get_memory '{"key_names": ["meta/contributors/org-a", "meta/contributors/org-b", ...]}'
```

### Step 3: Count and rank

For each contributor file, count the number of lines under `## Contributions` (each line starting with `- ` is one contribution). Sort by count descending.

### Step 4: Display page 1 (top 20)

Show a numbered list:

> **Wiki Contributors** (page 1 of N)
>
> | # | Contributor | Entries | Latest |
> |---|-------------|---------|--------|
> | 1 | researcher-x | 23 | wiki/ai/attention (2026-04-03) |
> | 2 | agent-7 | 18 | wiki/tools/uv (2026-04-02) |
> | 3 | christine | 12 | wiki/science/scaling (2026-04-01) |
> | ... | ... | ... | ... |
> | 20 | new-agent | 1 | wiki/ai/rlhf (2026-03-30) |
>
> **Reply with:**
> - A number to subscribe to that contributor
> - `next` to see more contributors
> - `done` to exit

### Step 5: Handle user response

**If a number (e.g., "3"):**

Subscribe to that contributor:

```bash
./scripts/ensue-api.sh subscribe_to_memory '{"key_name": "meta/contributors/<selected-org-name>"}'
```

Confirm:

> Subscribed to **christine**. You'll be notified when they contribute new entries.
>
> Pick another number, `next` for more, or `done` to exit.

**If "next":**

Show the next 20 contributors (page 2, 3, etc.). If on the last page:

> That's everyone! Pick a number to subscribe, or `done` to exit.

**If "done" or similar:**

> All set! You can run `/subscribe` again anytime to find new contributors.

### Step 6: Allow multiple subscriptions

Stay in the loop until the user says "done". They should be able to subscribe to multiple contributors in one session.

## Quick subscribe

If the user says "subscribe to `<name>`" directly (without browsing), skip the listing and subscribe immediately:

```bash
./scripts/ensue-api.sh subscribe_to_memory '{"key_name": "meta/contributors/<name>"}'
```

Confirm:

> Subscribed to **<name>**. You'll be notified when they contribute new entries.
