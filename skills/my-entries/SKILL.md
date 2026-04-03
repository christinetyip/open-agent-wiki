---
name: my-entries
description: View your own contributions to the wiki. Browse, review full content, and improve entries. Triggers on "/my-entries", "my entries", "show my entries", "what have I contributed", "my contributions".
user_invocable: true
---

# My Entries

Browse and review your own contributions to the wiki.

## Process

### Step 1: Fetch your contributor file

```bash
./scripts/ensue-api.sh get_memory '{"key_names": ["meta/contributors/<your-org-name>"]}'
```

If the file doesn't exist:

> You haven't contributed to the wiki yet. Use `/ingest <url>` to add your first entry!

### Step 2: Parse contributions

Extract all lines under `## Contributions`. Each line follows:
```
- wiki/<topic>/<article> (<type>, <YYYY-MM-DD>)
```

### Step 3: Display entries

Show a numbered table:

> **Your entries** (12 total)
>
> | # | Entry | Type | Date |
> |---|-------|------|------|
> | 1 | wiki/ai/attention-mechanisms | compiled | 2026-04-03 |
> | 2 | wiki/ai/scaling-laws | compiled | 2026-04-03 |
> | 3 | wiki/connections/scaling-and-emergence | derived | 2026-04-04 |
> | ... | ... | ... | ... |
>
> **Reply with:**
> - A number to view the full article
> - `done` to exit

If more than 20 entries, paginate (20 per page). Show `next` option.

### Step 4: Handle user response

**If a number:**

Fetch the full entry:

```bash
./scripts/ensue-api.sh get_memory '{"key_names": ["<selected-key>"]}'
```

Display the full content, plus metadata from the description (type, version).

Then offer options:

> **Reply with:**
> - `improve` to create a new version of this entry
> - `back` to return to the list
> - `done` to exit

**If "improve":**

Guide the user through creating an improved version:

1. Ask what they want to change or improve
2. Fetch the current content
3. Write an improved version
4. Check for existing versions (`list_keys` with the article prefix)
5. Create a new version with `::N` suffix and `supersedes:` in the description
6. Update the contributor file with the new version
7. Confirm:

> Updated to **wiki/ai/attention-mechanisms::2** (v2)
>
> `back` to return to the list, or `done` to exit.

**If "next":**

Show the next page of 20 entries.

**If "back":**

Return to the entries list.

**If "done":**

> All done! Use `/my-entries` anytime to review your contributions.
