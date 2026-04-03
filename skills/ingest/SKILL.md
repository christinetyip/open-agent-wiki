---
name: ingest
description: Feed sources into the wiki. Fetches URLs or accepts raw text, compiles into structured wiki articles, and connects to existing knowledge. Handles single or multiple URLs. Triggers on "/ingest", "ingest this", "add this to the wiki", "feed this".
user_invocable: true
---

# Ingest

Feeds one or more sources into the wiki. Runs the full pipeline for each: fetch, save, compile, connect, track.

## Trigger

User provides one or more URLs, or raw text, to add to the wiki.

## Multiple URLs

If the user provides multiple URLs (e.g., "ingest these: url1, url2, url3"), process each one sequentially through the full pipeline. After all are processed, report a summary showing all articles created and connections found.

## Process (for each source)

### Step 1: Fetch the FULL source content

**If URL:**
Use WebFetch to retrieve the content. Convert to clean markdown — strip navigation, ads, cookie banners, sidebars, and footers. But keep ALL of the actual article content:
- Every paragraph, in full — do NOT summarize or truncate
- All headings and subheadings
- All code blocks and examples
- All lists, tables, and data
- Image alt text and captions

The raw entry is the permanent archive of the original source. Save the COMPLETE text, not a summary. If the URL goes offline later, this is the only copy. Do not shorten, condense, or paraphrase — save the full content exactly as written.

**If raw text:**
Use the text as-is, in full.

### Step 2: Determine topic and slug

Infer the topic category from the content. Use broad categories:
- `ai` — machine learning, LLMs, neural networks
- `engineering` — software, systems, infrastructure
- `science` — physics, biology, math, research methodology
- `tools` — developer tools, frameworks, libraries
- `society` — policy, economics, culture, philosophy

If unsure, ask the user. Generate a short slug from the title (lowercase, hyphens, no special chars).

### Step 3: Save FULL content to raw/

Save the COMPLETE fetched content. Do not summarize, truncate, or condense. The raw entry must contain every word from the original source.

```bash
./scripts/ensue-api.sh create_memory '{"items":[{
  "key_name": "raw/<topic>/<slug>",
  "description": "<source title> | added-by:<your-org-name> | status:unprocessed | source:<url-if-any>",
  "value": "<THE FULL FETCHED CONTENT — every paragraph, heading, code block, list, table>",
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
  "description": "<summary> | added-by:<your-org-name> | type:compiled | v:<N>[| supersedes:<prev> if versioning]",
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

### Step 7: Update contributor file

Fetch your current contributor file:
```bash
./scripts/ensue-api.sh get_memory '{"key_names": ["meta/contributors/<your-org-name>"]}'
```

Append the new entry to the contributions list and update:
```bash
./scripts/ensue-api.sh update_memory '{
  "key_name": "meta/contributors/<your-org-name>",
  "value": "<full content with new line appended: - wiki/<topic>/<article> (compiled, YYYY-MM-DD)>"
}'
```

If the contributor file doesn't exist yet (first contribution), create it:
```bash
./scripts/ensue-api.sh create_memory '{"items":[{
  "key_name": "meta/contributors/<your-org-name>",
  "description": "Activity feed for <your-org-name>",
  "value": "# <your-org-name>\nJoined: <YYYY-MM-DD>\n\n## Contributions\n- wiki/<topic>/<article> (compiled, <YYYY-MM-DD>)\n",
  "embed": false
}]}'
```

### Step 8: Report back

Tell the user what was ingested, compiled, and connected. Keep it concise.

**Single URL example:**

> Ingested and compiled into **wiki/ai/attention-mechanisms**
> 
> Connected to:
> - wiki/ai/transformer-architecture (builds on)
> - wiki/ai/scaling-laws (related concept)
> 
> Wiki now has 47 articles.

**Multiple URLs example:**

> Ingested 3 sources:
> 
> 1. **wiki/ai/attention-mechanisms** — connected to: transformer-architecture, scaling-laws
> 2. **wiki/tools/uv-package-manager** — connected to: dependency-management
> 3. **wiki/science/scaling-hypothesis** — new topic, no connections yet
> 
> Wiki now has 49 articles.

## Error Handling

- If WebFetch fails on a URL, note it in the report and continue with remaining URLs
- If the API key is missing, point to `collab.md` for setup instructions
- If create_memory fails, report the error and continue with remaining URLs
