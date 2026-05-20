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

Reports the configured token (masked), owner, and repo, plus a
`✓ Configured` / `❌ Not configured` summary. Use
`bd github repos` to list repositories the token can see.

## Sync

The single entry point is `bd github sync`. By default it runs
bidirectionally; restrict to one direction with `--pull-only` or
`--push-only`:

```bash
bd github sync                # pull + push
bd github sync --pull-only    # only pull from GitHub
bd github sync --push-only    # only push local to GitHub
bd github sync --dry-run      # preview, no writes
```

Pulled issues land with `external_ref = "github:<number>"` (or the
full GitHub issue URL — `BuildExternalRef` prefers the URL when
present) and `source_system = "github"`. Push: first-time push for
an unlinked bead creates a new GitHub Issue and writes the
`external_ref`; subsequent pushes update the existing issue. There
is no per-bead `bd github push <id>` or `bd github pull <num>`
subcommand — selective sync goes through `bd github sync` with the
flags below.

Default conflict resolution is `--prefer-newer` (most recent
`updated_at` wins). Override with one of:

```bash
bd github sync --prefer-local       # always keep local beads version
bd github sync --prefer-github      # always use GitHub version
bd github sync --prefer-newer       # default (most recent wins)
```

The three flags are mutually exclusive.

## Selective sync

`bd github sync` accepts two scoping flags (mutually exclusive):

```bash
bd github sync --issues bd-abc,bd-def    # only these IDs
bd github sync --parent bd-epic-xyz      # this bead + its subtree (push only)
```

`--parent` is push-only — combining it with `--pull-only` errors out.

There are no `--state=` / `--assignee=` / `--since=` filters on
`bd github sync` itself. Filter on the GitHub side (e.g., scope by
repo / team) and let the engine pull what the token sees.

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
# Initial: pull existing GitHub issues into beads
bd github sync --pull-only

# Daily bidirectional sync
bd github sync

# Bidirectional with auto-resolve toward local on conflict
bd github sync --prefer-local
```

## Scripting

To push only specific unpushed beads, build the ID list with `jq`
and pass them via `--issues`:

```bash
ids=$(bd list --status open --json |
        jq -r '.[] | select(.external_ref == null or .external_ref == "") | .id' |
        paste -sd,)
bd github sync --push-only --issues "$ids"
```

For an entire epic and its descendants:

```bash
bd github sync --push-only --parent bd-epic-xyz
```

## Trackers that work the same way

| Tracker | Command | Env |
|---|---|---|
| Jira | `bd jira` | `JIRA_API_TOKEN`, `JIRA_USERNAME`, `JIRA_PROJECTS` |
| Linear | `bd linear` | `LINEAR_API_KEY`, `LINEAR_TEAM_ID`/`LINEAR_TEAM_IDS` |
| GitLab | `bd gitlab` | `GITLAB_URL`, `GITLAB_TOKEN`, `GITLAB_PROJECT_ID` |
| Azure DevOps | `bd ado` | `AZURE_DEVOPS_ORG`, `AZURE_DEVOPS_PAT` |
| Notion | `bd notion` | (integration token, via `bd notion init`) |

The shape is `bd <tracker> sync | status` plus `--issues` / `--parent`
selective-sync flags. Direction flag naming differs by tracker:
GitHub uses `--pull-only` / `--push-only`; the others (`jira`,
`linear`, `gitlab`, `ado`, `notion`) use `--pull` / `--push`.
Tracker-specific extras live on each subcommand (e.g.
`bd notion init` for the OAuth-style setup flow).

## Gotchas

- **Rate limits.** GitHub rate-limits aggressively.
  `bd github sync --pull-only` on a large repo can saturate. There's
  no native `--since` filter on `bd github sync` — narrow the scope
  with `--issues <ids>` or via the underlying GitHub token's repo
  access if you need to throttle.
- **`external_ref` is the GitHub URL or `github:<n>`, not `gh-<n>`.**
  The shorthand emitted by `BuildExternalRef` when no URL is
  available is literally `github:42`, recognized by
  `ghShorthandPattern = ^github:([1-9]\d*)$`. Older docs and
  external-tracker comments sometimes use `gh-9` as informal
  shorthand — don't rely on that exact form in scripts.
- **One assignee per bead on GitHub.** Beads doesn't support multiple
  assignees natively (just the `assignee` column).
- **Comments don't sync.** Beads comments stay local; GitHub comments
  stay on GitHub. Description-level text is the only bidirectional
  channel.
- **Labels can proliferate.** Every beads label becomes a GitHub
  label on push. Review before a bulk push.

## Automating via hooks

Auto-sync on every bead update:

`.beads/hooks/on_update`:

```bash
#!/bin/bash
issue_json=$(cat)
id="$1"
external_ref=$(echo "$issue_json" | jq -r '.external_ref // ""')

# Only sync beads that are already linked to GitHub.
if [[ -n "$external_ref" ]] && \
   [[ "$external_ref" == github:* || "$external_ref" == *github.com* ]]; then
    bd github sync --push-only --issues "$id" &  # background; don't hang the hook
fi
```

Background sync means the hook returns fast; the external sync runs
async.

## See also

- [../reference/bd-commands.md#sync-and-data](../reference/bd-commands.md#sync-and-data)
  — all tracker + sync commands.
- [../explanation/canonical-vs-vestigial.md](../explanation/canonical-vs-vestigial.md)
  — trackers are optional beads features neither orchestrator uses
  by default.
