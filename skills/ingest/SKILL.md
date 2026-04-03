---
name: ingest
description: Feed a source into the wiki. Fetches URL or accepts raw text, compiles into a structured wiki article, and connects it to existing knowledge. Triggers on "/ingest", "ingest this", "add this to the wiki", "feed this".
user_invocable: true
---

# Ingest

Feeds a source into the wiki and runs the full pipeline: fetch, save, compile, connect.

## Trigger

User provides a URL or raw text to add to the wiki.

## Process

### Step 1: Fetch the source

**If URL:**
Use WebFetch to retrieve the content. Convert to clean markdown — strip nav, ads, boilerplate. Keep the core content, headings, code blocks, and images.

**If raw text:**
Use the text as-is.

### Step 2: Determine topic and slug

Infer the topic category from the content. Use broad categories:
- `ai` — machine learning, LLMs, neural networks
- `engineering` — software, systems, infrastructure
- `science` — physics, biology, math, research methodology
- `tools` — developer tools, frameworks, libraries
- `society` — policy, economics, culture, philosophy

If unsure, ask the user. Generate a short slug from the title (lowercase, hyphens, no special chars).

### Step 3: Save to raw/

```bash
./scripts/ensue-api.sh create_memory '{"items":[{
  "key_name": "raw/<topic>/<slug>",
  "description": "<source title> | by:<your-org-name> | status:unprocessed | source:<url-if-any>",
  "value": "<fetched markdown content>",
  "embed": true
}]}'
```

### Step 4: Compile into wiki article

Search for related existing articles:
```bash
./scripts/ensue-api.sh discover_memories '{"query": "<topic keywords>", "limit": 5}'
```

Read the top results to understand what the wiki already knows.

Write a structured wiki article:

```markdown
# <Article Title>

## Summary
<2-3 sentences — what this is and why it matters>

## Content
<Structured explanation. Use sections, bullet points, ASCII diagrams where helpful.
Reference and build on existing wiki articles where relevant.>

## Sources
- raw/<topic>/<slug> — <source title>

## Connections
- wiki/<x>/<y> — <how this article relates>
- wiki/<a>/<b> — <another connection>

## Metadata
Compiled by: <your-org-name>
Date: <YYYY-MM-DD>
```

Check if a wiki article on this topic already exists:
```bash
./scripts/ensue-api.sh list_keys '{"prefix": "wiki/<topic>/<likely-slug>", "limit": 5}'
```

If it exists, create a new version with `::N` suffix. Otherwise create the first version.

```bash
./scripts/ensue-api.sh create_memory '{"items":[{
  "key_name": "wiki/<topic>/<article>[::N if versioning]",
  "description": "<summary> | by:<your-org-name> | type:compiled | v:<N>[| supersedes:<prev> if versioning]",
  "value": "<structured article content>",
  "embed": true
}]}'
```

### Step 5: Mark raw as compiled

```bash
./scripts/ensue-api.sh create_memory '{"items":[{
  "key_name": "raw/<topic>/<slug>::done",
  "description": "Compiled to wiki/<topic>/<article> by <your-org-name>",
  "value": "wiki/<topic>/<article>",
  "embed": false
}]}'
```

### Step 6: Update hypergraph

```bash
./scripts/ensue-api.sh build_hypergraph '{
  "query": "<article topic keywords>",
  "limit": 30,
  "output_key": "wiki/_graph/<topic>"
}'
```

### Step 7: Report back

Tell the user:
- What was ingested and where it was saved
- What wiki article was created
- What connections were found to existing articles
- How many entries are now in the wiki (run `list_keys` with prefix `wiki/` to count)

Keep it concise. Example:

> Ingested and compiled into **wiki/ai/attention-mechanisms**
> 
> Connected to:
> - wiki/ai/transformer-architecture (builds on)
> - wiki/ai/scaling-laws (related concept)
> 
> Wiki now has 47 articles.

## Error Handling

- If WebFetch fails, ask the user to paste the content directly
- If the API key is missing, point to `collab.md` for setup instructions
- If create_memory fails, report the error and suggest retrying
