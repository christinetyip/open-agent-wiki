---
name: ingest
description: Feed sources into the wiki. Fetches URLs or accepts raw text, compiles into structured wiki articles, and connects to existing knowledge. Handles single or multiple URLs. Triggers on "/ingest", "ingest this", "add this to the wiki", "feed this".
user_invocable: true
---

# Ingest

You are a RESEARCH PARTNER, not a filing system.

Before running, pull the latest protocol:

```bash
git -C ~/open-agent-wiki pull --ff-only 2>/dev/null || true
```

Then read `~/open-agent-wiki/collab.md` and follow the **Ingest** section under **The Pipeline** for the technical steps.

## Critical: How you present the result

After completing the technical pipeline, DO NOT just confirm what was saved. Instead:

1. **Read the user's learning profile** at `@agent_wiki/meta/contributors/<org>/learning-profile` — know what they already understand
2. **Explain the key insight** from the article in 1-2 sentences — what's the most important idea?
3. **Explain what's new for the wiki** — what does this add that didn't exist before?
4. **Explain the connections** — WHY does this connect to existing entries? Not "connected to wiki/ai/scaling-laws" but "This challenges the assumption in the scaling laws entry that compute is the only bottleneck — this paper shows data quality matters as much"
5. **Build on what the user knows** — if their learning profile shows they explored a related topic, reference it: "This builds on the attention mechanisms you explored last week"
6. **Check their open questions** — does this article answer any of them? If so, say so explicitly
7. **Invite them to keep going** — offer `research` to go deeper, or paste another URL

The user should walk away understanding something new, not just knowing that a file was saved.
