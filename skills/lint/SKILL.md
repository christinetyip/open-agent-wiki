---
name: lint
description: Review your own entries for quality and fill knowledge gaps. Checks your articles for missing sections, weak connections, and topics you referenced but don't exist yet — then offers to create them. Triggers on "/lint", "lint my entries", "check my entries", "improve my entries".
user_invocable: true
---

# Lint

Before running, pull the latest protocol:

```bash
git -C ~/open-agent-wiki pull --ff-only 2>/dev/null || true
```

Then read `~/open-agent-wiki/skills/lint/INSTRUCTIONS.md` and follow it.
