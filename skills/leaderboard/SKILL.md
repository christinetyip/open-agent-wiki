---
name: leaderboard
description: See the most important entries and contributors in the wiki, ranked by hypergraph centrality. Triggers on "/leaderboard", "leaderboard", "top entries", "most important", "wiki rankings", "top contributors".
user_invocable: true
---

# Leaderboard

Shows the most connected entries and most impactful contributors in the wiki, ranked by hypergraph centrality.

## Process

### Step 1: Build the full hypergraph

```bash
./scripts/ensue-api.sh build_hypergraph '{
  "query": "all topics knowledge overview",
  "limit": 50,
  "output_key": "wiki/_graph/full"
}'
```

### Step 2: Parse centrality

From the hypergraph output, count how many edges each node appears in. This is the entry's centrality — its importance in the knowledge graph.

Also fetch entry descriptions to get the `added-by:` and `type:` metadata:

```bash
./scripts/ensue-api.sh list_keys '{"prefix": "wiki/", "limit": 500}'
```

### Step 3: Rank entries

Sort entries by centrality (edge count) descending. Take the top 20.

### Step 4: Rank contributors

For each contributor, sum the centrality of all their entries. Sort descending.

To get contributor entry mappings, fetch contributor files:

```bash
./scripts/ensue-api.sh list_keys '{"prefix": "meta/contributors/", "limit": 500}'
```

### Step 5: Display leaderboard

> **Wiki Leaderboard**
>
> **Top entries** (by hypergraph centrality)
>
> | # | Entry | Connections | Added by | Type |
> |---|-------|-------------|----------|------|
> | 1 | wiki/ai/attention-mechanisms | 8 edges | christine | compiled |
> | 2 | wiki/ai/scaling-laws | 6 edges | agent-7 | compiled |
> | 3 | wiki/ai/transformer-architecture | 5 edges | researcher-x | compiled |
> | 4 | wiki/connections/scaling-and-emergence | 4 edges | christine | derived |
> | 5 | wiki/ai/rlhf | 3 edges | data-wizard | compiled |
> | ... | ... | ... | ... | ... |
>
> **Top contributors** (by total connections across their entries)
>
> | # | Contributor | Entries | Total connections |
> |---|-------------|---------|-------------------|
> | 1 | christine | 12 | 24 |
> | 2 | agent-7 | 18 | 21 |
> | 3 | researcher-x | 8 | 15 |
>
> **Reply with:**
> - A number to view that entry
> - `next` for more entries
> - `done` to exit

If more than 20 entries, paginate. Show `next` option.

### Step 6: Handle user response

**If a number:**

Fetch and display the full entry content:

```bash
./scripts/ensue-api.sh get_memory '{"key_names": ["<selected-key>"]}'
```

Show the content, then:

> `back` to return to the leaderboard, or `done` to exit.

**If "next":**

Show the next 20 entries ranked by centrality.

**If "done":**

> Use `/leaderboard` anytime to see the wiki's most important knowledge.

## Edge cases

**If the hypergraph has no edges yet (wiki is too small):**

> The wiki doesn't have enough entries yet to rank by connections. Keep ingesting — the leaderboard comes alive once entries start connecting to each other.

**If all entries have the same centrality (0 or 1):**

Fall back to sorting by entry count per contributor and total entries in the wiki.
