# Sync beads ↔ GitHub Issues

Beads ships bidirectional sync with GitHub Issues (and jira, linear,
gitlab, ado, notion). Each tracker has the same shape — use
`bd github` as a template; the others are variants.

## Setup

### 1. Credentials

GitHub token with `repo` scope:

```bash
bd config set github.token "ghp_xxxxxxxx"
# or via env: GITHUB_TOKEN
```

### 2. Target

```bash
bd config set github.owner "myorg"
bd config set github.repo "myproject"
```

Or via env: `GITHUB_OWNER`, `GITHUB_REPO`, or `GITHUB_REPOSITORY`
(owner/repo shorthand).

### 3. (Optional) Custom API URL for GHES

```bash
bd config set github.api_url "https://ghe.internal/api/v3"
```

Or `GITHUB_API_URL`.

### 4. Test

```bash
bd github status
```

Should report `authenticated` + token scopes.

## Pulling existing issues

```bash
bd github sync --pull
```

Imports matching issues from GitHub to beads. Each gets
`external_ref = "gh-<number>"` and `source_system = "github"`.

With `--dry-run` to preview.

Filters (per-tracker; check `bd github --help`):

```bash
bd github sync --pull --state=open --assignee=alice
```

## Pushing local beads

Push a single bead:

```bash
bd github push bd-tutorial-abc123
```

First time: creates a new GitHub Issue. Subsequent times: updates it.
The `external_ref` column links them.

Push all local, unpushed beads:

```bash
bd github sync --push
```

Or both directions:

```bash
bd github sync
```

Default conflict resolution: timestamp-based. Override with:

```bash
bd github sync --prefer-local
bd github sync --prefer-github
```

## Pulling one issue

If you know the GitHub number:

```bash
bd github pull gh-42
```

Creates / updates a local bead linked to GitHub issue #42.

## Field mapping

Per-tracker `FieldMapper` in `internal/github/`:

| beads field | GitHub field |
|---|---|
| `title` | title |
| `description` | body |
| `status` | closed? open/closed |
| `priority` | label `priority:P0`…`P4` (or free-form) |
| `labels` | labels |
| `assignee` | single assignee (GitHub limitation) |

GitHub has no native priority; the mapper uses label conventions.

## Labels

When pushing:

- Labels on the beads side become GitHub labels (created on push if
  missing).
- Priority → a `priority:P0`-style label on GitHub.

Conversely, pulling imports label strings verbatim.

## Closing

Closing a bead locally and pushing closes the GitHub issue. Closing
on GitHub and pulling marks the bead closed. `close_reason` does
not round-trip (GitHub has no equivalent field).

## Typical workflow

```bash
# Initial: import existing GitHub work
bd github sync --pull --state=open

# Daily sync
bd github sync

# Or bi-directional + auto-resolve toward local
bd github sync --prefer-local
```

## Scripting

Get beads without external_ref (unpushed):

```bash
bd list --status open --json | jq -r '.[] | select(.external_ref == "") | .id' | \
    xargs -I{} bd github push {}
```

## Trackers that work the same way

| Tracker | Command | Env |
|---|---|---|
| Jira | `bd jira` | `JIRA_API_TOKEN`, `JIRA_USERNAME`, `JIRA_PROJECTS` |
| Linear | `bd linear` | `LINEAR_API_KEY`, `LINEAR_TEAM_ID`/`LINEAR_TEAM_IDS` |
| GitLab | `bd gitlab` | `GITLAB_URL`, `GITLAB_TOKEN`, `GITLAB_PROJECT_ID` |
| Azure DevOps | `bd ado` | `AZURE_DEVOPS_ORG`, `AZURE_DEVOPS_PAT` |
| Notion | `bd notion` | (integration token, via `bd notion init`) |

Each has a `push/pull/sync/status` surface plus tracker-specific
extras (Linear's `--parent`, ADO's `--area-path`, etc.).

## Gotchas

- **Rate limits.** GitHub rate-limits aggressively. `bd github sync
  --pull` on a large repo can saturate. Use `--since` to incremental-sync.
- **One assignee per bead on GitHub.** Beads doesn't support multiple
  assignees natively (just the `assignee` column).
- **Comments don't sync.** Beads comments stay local; GitHub comments
  stay on GitHub. Description-level text is the only bidirectional
  channel.
- **Labels can proliferate.** Every beads label becomes a GitHub
  label on push. Review before a bulk push.

## Automating via hooks

Auto-push on every bead update:

`.beads/hooks/on_update`:

```bash
#!/bin/bash
issue_json=$(cat)
id="$1"
external_ref=$(echo "$issue_json" | jq -r '.external_ref // ""')

# Only sync beads that are already linked
if [[ -n "$external_ref" && "$external_ref" == gh-* ]]; then
    bd github push "$id" &  # background; don't hang the hook
fi
```

Background push means the hook returns fast; the external sync runs
async.

## See also

- [../reference/bd-commands.md#sync-and-data](../reference/bd-commands.md#sync-and-data)
  — all tracker + sync commands.
- [../explanation/canonical-vs-vestigial.md](../explanation/canonical-vs-vestigial.md)
  — trackers are optional beads features neither orchestrator uses
  by default.
