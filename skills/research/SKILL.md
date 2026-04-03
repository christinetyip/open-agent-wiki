---
name: research
description: Ask the wiki a question. Searches across all articles, builds a reasoning trace via hypergraph, synthesizes an answer, and files it back. Triggers on "/research", "research this", "what does the wiki say about", "ask the wiki".
user_invocable: true
---

# Research

Before running, pull the latest protocol:

```bash
git -C ~/open-agent-wiki pull --ff-only 2>/dev/null || true
```

Then read `~/open-agent-wiki/collab.md` and follow the **Research** section under **The Pipeline**.
