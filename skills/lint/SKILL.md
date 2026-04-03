---
name: lint
description: Review your own entries for quality and fill knowledge gaps. Checks your articles for missing sections, weak connections, and topics you referenced but don't exist yet — then offers to create them. Triggers on "/lint", "lint my entries", "check my entries", "improve my entries".
user_invocable: true
---

# Lint

Review your own wiki entries for quality issues and fill knowledge gaps by deriving new entries.

## Process

### Step 1: Fetch your entries

Get your contributor file:

```bash
./scripts/ensue-api.sh get_memory '{"key_names": ["meta/contributors/<your-org-name>"]}'
```

Parse the contributions list. If empty:

> You haven't contributed anything yet. Use `/ingest` to add your first entry!

### Step 2: Fetch your entry content

Fetch all your entries in batches:

```bash
./scripts/ensue-api.sh get_memory '{"key_names": ["wiki/topic/article-1", "wiki/topic/article-2", ...]}'
```

### Step 3: Check each entry for quality issues

For each entry, check:

**Missing sections:**
- No `## Summary` → flag
- No `## Sources` → flag
- No `## Connections` → flag
- No `## Content` or content is very short (< 100 words) → flag as shallow

**Weak connections:**
- Connections section is empty or says "no connections yet"
- Connections reference entries that don't exist (check with `list_keys`)

**Referenced but missing topics:**
- Scan the content for mentions of topics/concepts that could be wiki articles
- Check if those articles exist in the wiki (`discover_memories` or `list_keys`)
- Collect any that don't exist yet — these are knowledge gaps you can fill

### Step 4: Show findings

> **Lint report for your entries** (12 checked)
>
> **Quality issues (3):**
> | # | Entry | Issue |
> |---|-------|-------|
> | 1 | wiki/ai/attention-mechanisms | Missing Connections section |
> | 2 | wiki/ai/rlhf | Shallow content (68 words) |
> | 3 | wiki/tools/uv | References wiki/tools/pip which doesn't exist |
>
> **Knowledge gaps you could fill (2):**
> | # | Topic | Referenced by |
> |---|-------|---------------|
> | 4 | Reward modeling | wiki/ai/rlhf mentions it but no article exists |
> | 5 | pip (package manager) | wiki/tools/uv references it |
>
> **Reply with:**
> - A number to fix that issue (improve your entry or create the missing article)
> - `fix all` to fix quality issues and fill all gaps automatically
> - `done` to exit

If no issues found:

> All 12 entries look good! No quality issues or knowledge gaps found.

### Step 5: Handle fixes

#### If a quality issue number (e.g., "1")

Fetch the entry, identify the issue, and create an improved version:

1. Read the current entry
2. Fix the specific issue (add missing section, expand content, add connections)
3. Search wiki for related entries to build proper connections
4. Create a new version with `::N` suffix
5. Update your contributor file

> Fixed: Created **wiki/ai/attention-mechanisms::2** with Connections section added.
>
> Connected to:
> - wiki/ai/transformer-architecture
> - wiki/ai/self-attention
>
> Pick another number, `fix all`, or `done`.

#### If a knowledge gap number (e.g., "4")

Derive a new article from your existing entries that reference the missing topic:

1. Fetch the entries that reference this topic
2. Search the wiki for any related content
3. If no existing article covers it, synthesize a new one from your entries
4. Create as `wiki/<topic>/<article>` with `type:derived`
5. Include reasoning trace via hypergraph
6. Update your contributor file

> Created **wiki/ai/reward-modeling** (derived from wiki/ai/rlhf)
>
> Connected to:
> - wiki/ai/rlhf (source)
> - wiki/ai/alignment (related)
>
> Pick another number, `fix all`, or `done`.

#### If "fix all"

Process all issues and gaps automatically:

1. Fix all quality issues (create new versions of your entries)
2. Fill all knowledge gaps (derive new articles for missing topics)
3. Run hypergraph update for affected topics
4. Update contributor file with all new entries

Report summary:

> **Fixed 3 quality issues:**
> - wiki/ai/attention-mechanisms::2 — added Connections
> - wiki/ai/rlhf::2 — expanded content
> - wiki/tools/uv::2 — fixed broken reference
>
> **Filled 2 knowledge gaps:**
> - wiki/ai/reward-modeling (derived from wiki/ai/rlhf)
> - wiki/tools/pip (derived from wiki/tools/uv)
>
> Your entries are in good shape!

### Quality checks summary

| Check | What it catches |
|-------|----------------|
| Missing Summary | Entry has no overview |
| Missing Sources | No provenance for the content |
| Missing Connections | Entry is isolated from the wiki |
| Shallow content | Less than 100 words of actual content |
| Broken references | Connections point to entries that don't exist |
| Knowledge gaps | Content mentions topics with no wiki article |
