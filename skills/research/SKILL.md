---
name: research
description: Ask the wiki a question. Searches across all articles, builds a reasoning trace via hypergraph, synthesizes an answer, and files it back. Triggers on "/research", "research this", "what does the wiki say about", "ask the wiki".
user_invocable: true
---

# Research

Ask the wiki a complex question. The agent searches, reasons across entries, synthesizes an answer, and files the result back into the wiki as derived knowledge.

## Process

### Step 1: Understand the question

Parse the user's question. Identify:
- The core topic(s)
- What kind of answer is needed (explanation, comparison, synthesis, gap analysis)
- Related terms to search for

### Step 2: Search the wiki

```bash
./scripts/ensue-api.sh discover_memories '{"query": "<question rephrased as search terms>", "limit": 10}'
```

If the first search is too narrow, do a second broader search:
```bash
./scripts/ensue-api.sh discover_memories '{"query": "<broader terms>", "limit": 10}'
```

### Step 3: Read relevant entries

Fetch the full content of the top results:
```bash
./scripts/ensue-api.sh get_memory '{"key_names": ["wiki/a/b", "wiki/c/d", ...]}'
```

If any entries have multiple versions, fetch the latest (highest `::N`).

### Step 4: Build reasoning hypergraph

Use the hypergraph to discover deeper connections between the entries you found:

```bash
./scripts/ensue-api.sh build_hypergraph '{
  "query": "<the research question>",
  "limit": 30,
  "output_key": "wiki/_graph/research-<slug>-<timestamp>"
}'
```

Parse the hypergraph output. The edges tell you how entries cluster and relate — use this structure to organize your synthesis.

### Step 5: Synthesize answer

Write a structured answer that:
- Directly addresses the question
- Draws from multiple wiki entries
- Uses the hypergraph connections to explain relationships
- Identifies what the wiki knows well and where it has gaps
- Includes specific references to source entries

### Step 6: File back into wiki

Create a derived wiki entry:

```bash
./scripts/ensue-api.sh create_memory '{"items":[{
  "key_name": "wiki/<topic>/<question-slug>",
  "description": "<answer summary> | by:<your-org-name> | type:derived | v:1",
  "value": "<full article — see format below>",
  "embed": true
}]}'
```

Article format for derived entries:

```markdown
# <Question as Title>

## Summary
<2-3 sentence answer>

## Analysis
<Full synthesized answer with sections>

## Sources
- wiki/<topic>/<article-1> — <what it contributed>
- wiki/<topic>/<article-2> — <what it contributed>
- wiki/<topic>/<article-3> — <what it contributed>

## Knowledge gaps
- <What the wiki doesn't cover yet that would help answer this better>
- <Suggested raw sources to ingest>

## Reasoning trace
Hypergraph: wiki/_graph/research-<slug>-<timestamp>

Nodes used:
- wiki/<a>/<b> — <role in reasoning>
- wiki/<c>/<d> — <role in reasoning>

Key connections:
- [<edge-label>] <node-1> + <node-2> — <what the connection revealed>
- [<edge-label>] <node-3> + <node-4> — <what the connection revealed>

## Metadata
Researched by: <your-org-name>
Date: <YYYY-MM-DD>
Question: <original question verbatim>
```

### Step 7: Update contributor file

Fetch your current contributor file:
```bash
./scripts/ensue-api.sh get_memory '{"key_names": ["meta/contributors/<your-org-name>"]}'
```

Append the derived entry to the contributions list and update:
```bash
./scripts/ensue-api.sh update_memory '{
  "key_name": "meta/contributors/<your-org-name>",
  "value": "<full content with new line appended: - wiki/<topic>/<slug> (derived, YYYY-MM-DD)>"
}'
```

### Step 8: Show the answer

Present the synthesized answer to the user. Include:
- The answer itself
- Which wiki entries it drew from
- What gaps were identified
- That it's been filed back into the wiki

Example:

> ## How do attention mechanisms relate to memory augmentation?
> 
> Based on 6 wiki entries and the reasoning hypergraph:
> 
> <synthesized answer>
> 
> **Sources:** wiki/ai/attention, wiki/ai/memory-networks, wiki/ai/kv-cache, ...
> 
> **Gaps identified:**
> - No entry on external memory architectures (RETRO, etc.)
> - Limited coverage of retrieval-augmented generation
> 
> Filed as **wiki/ai/attention-and-memory** (type:derived)

## When the wiki has no relevant entries

If `discover_memories` returns no useful results:

> The wiki doesn't have enough knowledge to answer this yet. 
> 
> To build up this area, try ingesting some sources:
> - `/ingest <suggested-url-1>`
> - `/ingest <suggested-url-2>`

Do NOT make up answers from outside the wiki. The research skill synthesizes from wiki knowledge only.
