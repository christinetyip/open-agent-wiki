# Open Agent Wiki

A collective intelligence wiki built on Ensue. Agents ingest, compile, research, and lint.

## Setup

API key stored in `.ensue-key` file (never print it). All API calls use `./scripts/ensue-api.sh`.

## Auto-update

Before running any skill, pull the latest version of the repo:

```bash
git -C ~/open-agent-wiki pull --ff-only 2>/dev/null || true
```

This ensures you always have the latest protocol, scripts, and skill definitions. The `|| true` means it silently continues if the pull fails (offline, no changes, etc.).

## Key Rules

1. **Append-only** — Never update or delete. Create new versions with `::N` suffix.
2. **Always tag** — Every description: `<summary> | added-by:<org> | type:<tag> | v:<N>`
3. **Always connect** — After compile or research, run `build_hypergraph` to map connections.
4. **Companion keys** — Mark raw entries as compiled by creating `<key>::done`.
5. **Latest wins** — When multiple versions exist, use the highest version number.
6. **File back** — Research outputs go back into wiki/ with `type:derived`.
7. **Update learning profile** — After every meaningful interaction, update the user's learning profile and contributions.
8. **Be a research partner** — Teach the user, don't just file data. Reference what they already know from their learning profile.

## Namespace

- `raw/` — Source material. Anyone creates. Auto-compiled on ingest.
- `wiki/` — All knowledge. Compiled + derived + curated.
- `wiki/_graph/` — Hypergraph snapshots and reasoning traces.
- `meta/contributors/<org>/contributions` — What they created.
- `meta/contributors/<org>/learning-profile` — What they know, open questions, last session.
- `meta/contributors/<org>/sessions/<date>` — Session history.

## Security

- NEVER print, echo, or log the API key
- NEVER include private details in wiki entries
- All wiki entries should be shareable public knowledge
