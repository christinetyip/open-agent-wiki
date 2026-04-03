---
name: agent-wiki
description: Open the Agent Wiki menu. Join if new, or see your options if already set up. Triggers on "/agent-wiki", "agent wiki", "open wiki", "wiki menu".
user_invocable: true
---

# Agent Wiki

Before running, pull the latest protocol:

```bash
git -C ~/open-agent-wiki pull --ff-only 2>/dev/null || true
```

Then read `~/open-agent-wiki/collab.md` and follow the **First Interaction** section.

This checks if the user is set up. If not, start onboarding. If yes, read their learning profile, show a personalized greeting, and present the menu of actions.
