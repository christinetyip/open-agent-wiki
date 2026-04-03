---
name: compile
description: Batch-compile unprocessed raw sources into structured wiki articles. Triggers on "/compile", "compile the wiki", "process raw entries", "compile unprocessed".
user_invocable: true
---

# Compile

Batch-processes raw sources that haven't been compiled yet. Useful for catching up on sources that others have contributed.

## Process

### Step 1: Find uncompiled raw entries

List all raw entries:
```bash
./scripts/ensue-api.sh list_keys '{"prefix": "raw/", "limit": 100}'
```

For each raw entry (excluding `::done` keys), check if a companion `::done` key exists. Collect all entries that don't have a `::done` companion — these are uncompiled.

If everything is compiled, tell the user:

> All raw sources are compiled. Nothing to process.

### Step 2: Compile each uncompiled entry

For each uncompiled raw entry:

1. Fetch its content:
```bash
./scripts/ensue-api.sh get_memory '{"key_names": ["raw/<topic>/<slug>"]}'
```

2. Search for related existing wiki articles:
```bash
./scripts/ensue-api.sh discover_memories '{"query": "<topic keywords from content>", "limit": 5}'
```

3. Read related articles to understand context.

4. Write a structured wiki article (same format as the ingest skill):

```markdown
# <Article Title>

## Summary
<2-3 sentences>

## Content
<Structured explanation, building on existing wiki knowledge>

## Sources
- raw/<topic>/<slug> — <source title>

## Connections
- wiki/<x>/<y> — <relationship>

## Metadata
Compiled by: <your-org-name>
Date: <YYYY-MM-DD>
```

5. Check for existing versions and create appropriately (new key or `::N` version).

6. Create the `::done` companion key.

### Step 3: Update hypergraph

After all entries are compiled, run a hypergraph update for each topic that had new compilations:

```bash
./scripts/ensue-api.sh build_hypergraph '{
  "query": "<topic>",
  "limit": 30,
  "output_key": "wiki/_graph/<topic>"
}'
```

### Step 4: Report summary

Tell the user what was compiled. Example:

> Compiled 4 raw sources:
> 
> 1. raw/ai/gpt4-paper → **wiki/ai/gpt4-architecture**
>    Connected to: wiki/ai/scaling-laws, wiki/ai/transformer-architecture
> 
> 2. raw/tools/uv-package-manager → **wiki/tools/uv**
>    Connected to: wiki/tools/pip, wiki/engineering/dependency-management
> 
> 3. raw/ai/rlhf-overview → **wiki/ai/rlhf**
>    Connected to: wiki/ai/reward-modeling, wiki/ai/alignment
> 
> 4. raw/science/scaling-hypothesis → **wiki/science/scaling-hypothesis**
>    New topic — no existing connections yet.
> 
> Wiki now has 51 articles.

## Batch Size

If there are more than 10 uncompiled entries, process them in batches of 10. After each batch, report progress and continue.

## Quality Standards

- Every article must have a Summary, Content, Sources, and Connections section
- Connections should reference actual existing wiki entries (check they exist)
- Don't create shallow stub articles — if the raw source is too thin, note it in the report and skip
- Build on existing wiki knowledge — reference and link related articles
