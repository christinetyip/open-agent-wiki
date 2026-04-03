---
name: lint
description: Run a health check on the wiki. Finds gaps, suggests connections, flags isolated knowledge, reports uncompiled sources. Triggers on "/lint", "lint the wiki", "health check", "check wiki quality".
user_invocable: true
---

# Lint

Runs a health check on the wiki and produces an actionable report.

## Process

### Step 1: Gather wiki state

Run these in sequence:

```bash
# Count all entries
./scripts/ensue-api.sh list_keys '{"prefix": "raw/", "limit": 500}'
./scripts/ensue-api.sh list_keys '{"prefix": "wiki/", "limit": 500}'
./scripts/ensue-api.sh list_keys '{"prefix": "meta/", "limit": 50}'
```

From the results, compute:
- Total raw entries
- Raw entries without `::done` companions (uncompiled)
- Total wiki articles (excluding `_index`, `_graph/`, and `::done` keys)
- Articles by type (compiled vs derived vs curated)
- Articles by topic
- Number of versioned articles (has `::N` variants)
- Contributors (unique `by:` values in descriptions)

### Step 2: Build full hypergraph

```bash
./scripts/ensue-api.sh build_hypergraph '{
  "query": "all topics knowledge overview",
  "limit": 50,
  "output_key": "wiki/_graph/full"
}'
```

Parse the hypergraph output. Analyze:
- **Isolated nodes**: Entries that appear in zero edges (disconnected knowledge)
- **Hub nodes**: Entries that appear in many edges (foundational knowledge)
- **Cluster count**: Number of distinct edge groups (topic clusters)
- **Bridge nodes**: Entries that connect different clusters

### Step 3: Check for issues

**Uncompiled sources:**
Raw entries without `::done` companions. List them.

**Isolated articles:**
Wiki entries not connected to any other entry in the hypergraph. These may need connections or may indicate a topic gap.

**Stale version chains:**
Articles with 3+ versions. The latest is canonical but old versions add noise to search results.

**Topic imbalance:**
Topics with many articles vs topics with very few. May indicate the wiki's knowledge is lopsided.

**Missing connections:**
Use the hypergraph edges to identify entries that are in the same cluster but don't reference each other in their Connections section. These are implicit connections that should be made explicit.

**Shallow articles:**
Fetch a sample of wiki articles and check if they have all required sections (Summary, Content, Sources, Connections). Flag any that are missing sections.

### Step 4: Generate report

Create the report and save to meta:

```bash
./scripts/ensue-api.sh create_memory '{"items":[{
  "key_name": "meta/_lint-report-<YYYY-MM-DD>",
  "description": "Wiki health check <YYYY-MM-DD> | <N> issues found | by:<your-org-name>",
  "value": "<report content>",
  "embed": false
}]}'
```

Report format:

```markdown
# Wiki Health Check — <YYYY-MM-DD>

## Stats
- Raw sources: <N> (<M> uncompiled)
- Wiki articles: <N> (compiled: <N>, derived: <N>, curated: <N>)
- Topics: <list>
- Contributors: <N>
- Hypergraph: <N> nodes, <E> edges, <C> clusters

## Issues

### Uncompiled sources (<N>)
- raw/<topic>/<slug> — <title>
- raw/<topic>/<slug> — <title>

### Isolated articles (<N>)
- wiki/<topic>/<article> — not connected to any other entry
- wiki/<topic>/<article> — not connected to any other entry

### Suggested connections
- wiki/<a>/<b> ↔ wiki/<c>/<d> — <why they should be connected>
- wiki/<e>/<f> ↔ wiki/<g>/<h> — <why they should be connected>

### Topic gaps
- <topic X> has <N> articles but nothing on <subtopic Y>
- <topic A> and <topic B> have no cross-topic connections

### Shallow articles
- wiki/<topic>/<article> — missing Connections section
- wiki/<topic>/<article> — missing Sources section

## Recommended actions
1. Run `/compile` to process <N> uncompiled sources
2. Run `/research <suggested question>` to fill <gap>
3. Run `/ingest <suggested url>` to cover <missing subtopic>
```

### Step 5: Show report to user

Present the report. Highlight the top 3 most impactful actions they can take.
