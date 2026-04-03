---
name: ingest
description: Feed sources into the wiki. Fetches URLs or accepts raw text, compiles into structured wiki articles, and connects to existing knowledge. Handles single or multiple URLs. Triggers on "/ingest", "ingest this", "add this to the wiki", "feed this".
user_invocable: true
---

# Ingest

Before running, pull the latest protocol:

```bash
git -C ~/open-agent-wiki pull --ff-only 2>/dev/null || true
```

Then read `~/open-agent-wiki/collab.md` and follow the **Ingest** section under **The Pipeline**.
