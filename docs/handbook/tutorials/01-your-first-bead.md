# Tutorial 1: Your first bead

Goal: create a bead, list it, show it, close it. Understand the basic
CRUD loop.

## Prereqs

- `bd` binary on your `PATH`. If you don't have it:

  ```
  go install github.com/gastownhall/beads/cmd/bd@latest
  ```

  (Or download from GitHub releases.)

## Step 1: initialize a workspace

In a scratch directory:

```
$ mkdir bd-tutorial && cd bd-tutorial
$ git init
$ bd init
```

`bd init` creates `.beads/` and starts a local Dolt SQL server. Output
ends with something like:

```
✓ Initialized beads in .beads/
  Prefix: bd-tutorial
  Database: bd-tutorial
```

The prefix becomes the first segment of every bead ID in this project
(e.g., `bd-tutorial-abc123`). You can override it with `--prefix
<name>` on init. To bootstrap from an existing Dolt remote in one
step, pass `--remote <url>` (the workspace clones the remote rather
than initializing empty).

Verify:

```
$ bd context
beads_dir: /path/to/bd-tutorial/.beads
project_id: <uuid>
backend: dolt
dolt_mode: server
database: bd-tutorial
server_host: 127.0.0.1
server_port: 48732    # whatever the OS gave
bd_version: 1.0.0
```

## Step 2: create a bead

```
$ bd create "Write the tutorial" --type task --priority 2
✓ Created bd-tutorial-abc123
```

Flags:

- `--type <t>` — default `task`. Other work types: `bug`,
  `feature`, `epic`, `chore`, `decision`, `story`, `milestone`,
  `spike`. (`gate`, `molecule`, and `message` are also built-in
  but typically created by tooling — see tutorial 2 for `gate`.)
- `--priority <0-4>` or `-p P2` — 0 is critical, 4 is backlog,
  2 is default.
- `-d "<description>"` — issue body.

With fuller args:

```
$ bd create "Draft the intro section" \
    --type task \
    --priority 2 \
    --description "Cover what bd is and what problem it solves." \
    --labels docs,tutorial
✓ Created bd-tutorial-def456
```

## Step 3: list beads

```
$ bd list
○ bd-tutorial-abc123 · Write the tutorial      [P2 · OPEN]
○ bd-tutorial-def456 · Draft the intro section [P2 · OPEN]
```

The `○` icon is status; `P2` is priority.

Filter:

```
$ bd list --label docs               # beads with label "docs"
$ bd list --exclude-label wip        # beads without label "wip"
$ bd list --status in_progress       # beads in progress
$ bd list --limit 5                  # just 5
```

JSON output:

```
$ bd list --json
[
  {"id":"bd-tutorial-abc123","title":"Write the tutorial","status":"open",...},
  ...
]
```

## Step 4: show a bead

```
$ bd show bd-tutorial-abc123
bd-tutorial-abc123 · Write the tutorial      [P2 · OPEN]
Type: task
Created: 2026-04-23 15:04:05

DESCRIPTION
Cover what bd is and what problem it solves.
```

Or JSON (always an array):

```
$ bd show bd-tutorial-abc123 --json
[{"id":"bd-tutorial-abc123","title":"...","description":"...",...}]
```

## Step 5: update a bead

```
$ bd update bd-tutorial-abc123 --description "Updated body"
✓ Updated bd-tutorial-abc123
```

Or claim it (sets assignee + status=in_progress atomically):

```
$ bd update bd-tutorial-abc123 --claim
✓ Claimed bd-tutorial-abc123
```

## Step 6: ready work

```
$ bd ready
○ bd-tutorial-def456 · Draft the intro section [P2 · OPEN]
```

`bd ready` shows unblocked, open beads. It excludes `in_progress`
beads and beads with unsatisfied `blocks` dependencies. Our claimed
bead (now in_progress) is no longer in the ready set.

## Step 7: close a bead

```
$ bd close bd-tutorial-abc123 --reason "Wrote the tutorial"
✓ Closed bd-tutorial-abc123
```

Or close multiple with `--suggest-next` to see what just became
unblocked:

```
$ bd close bd-tutorial-abc123 --suggest-next
✓ Closed bd-tutorial-abc123
No newly-unblocked issues.
```

## Step 8: see the history

Every change committed to Dolt. View the log:

```
$ cd .beads/dolt/bd-tutorial
$ dolt log --oneline
a1b2c3d bd: close bd-tutorial-abc123
e4f5g6h bd: update bd-tutorial-abc123
i7j8k9l bd: claim bd-tutorial-abc123
m0n1o2p bd: create bd-tutorial-abc123
```

Each bead CRUD becomes a commit.

## What you've done

- Initialized a bead workspace backed by Dolt.
- Created, updated, listed, shown, claimed, and closed a bead.
- Seen how each operation commits to Dolt history.

## Next up

- [Tutorial 2: dependencies](02-working-with-dependencies.md) — make
  one bead block another; watch `bd ready` respond.

## See also

- [../reference/bead-schema.md](../reference/bead-schema.md) — all the
  columns you can set on a bead.
- [../reference/bd-commands.md](../reference/bd-commands.md) — full
  command catalog.
- [../explanation/why-beads.md](../explanation/why-beads.md) — why bd
  exists and what it's shaped around.
