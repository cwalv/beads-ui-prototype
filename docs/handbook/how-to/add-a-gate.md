# Add a gate

A gate is a bead that blocks downstream work until a condition
resolves. Gate types (`await_type`): `gh:run`, `gh:pr`, `timer`,
`human`, `mail`. (`bead` is also accepted but its `bd gate check`
path is dead — see below.)

`gate` is a built-in issue type (see `internal/types/types.go`
`IsValid`) — no `bd config set types.custom` registration needed on
a fresh install.

## Pattern 1: GitHub workflow run

Block "publish release" on "release.yml" completing successfully.

```bash
# Create the work bead
publish=$(bd create "Publish release" --type task -p 1 --json | jq -r .id)

# Create the gate
gate=$(bd create "gh:run release.yml" \
    --type gate \
    --await-type "gh:run" \
    --await-id "release.yml" \
    --json | jq -r .id)

# Wire: publish is blocked by the gate
bd dep add "$publish" "$gate"

# Check: publish should be blocked
bd ready | grep publish    # not in the list
```

Now run `bd gate check` periodically (via cron, patrol loop, or the
orchestrator):

```bash
bd gate check --type gh:run
```

This invokes `gh run view <id>`. When status=completed and
conclusion is `success` or `skipped`, the gate closes. `publish`
unblocks.

`await_id` can be a numeric run ID OR a workflow name. If a workflow
name, beads queries `gh run list --workflow` to find the latest run
and writes its ID back into the gate.

## Pattern 2: GitHub pull request merged

```bash
gate=$(bd create "gh:pr 42" \
    --type gate \
    --await-type "gh:pr" \
    --await-id "42" \
    --json | jq -r .id)

bd dep add "$some-work" "$gate"
```

`bd gate check` queries `gh pr view --json state,merged`. Closes the
gate when `state=MERGED`.

## Pattern 3: Timer (wall-clock wait)

```bash
gate=$(bd create "wait 30m" \
    --type gate \
    --await-type timer \
    --timeout "30m" \
    --json | jq -r .id)

bd dep add "$some-work" "$gate"
```

`bd gate check --type timer` closes when `created_at + timeout` has
passed. Timers never escalate.

## Pattern 4: Human approval

```bash
gate=$(bd create "wait: approve migration" \
    --type gate \
    --await-type human \
    --description "Approve the auth migration before we proceed." \
    --json | jq -r .id)

bd dep add "$migration" "$gate"
```

Humans resolve manually:

```bash
bd gate resolve "$gate" --reason "approved by alice"
```

`bd gate check --type human` does nothing — human gates don't
auto-close.

## Pattern 5: In a formula

Put the gate on a step:

```toml
[[steps]]
id    = "publish"
title = "Publish release"
gate  = { type = "gh:run", id = "release.yml", timeout = "30m" }
```

Cook creates the gate bead and wires it as a blocker on `publish`.
Same resolution: `bd gate check`.

## Managing gates

List open gates:

```bash
bd gate list
```

All gates (including closed):

```bash
bd gate list --all
```

Show details:

```bash
bd gate show <gate-id>
```

Add a waiter (agent notified when gate closes):

```bash
bd gate add-waiter <gate-id> alice@example.com
```

Manually resolve:

```bash
bd gate resolve <gate-id> --reason "manual override"
```

Auto-check all gates:

```bash
bd gate check
```

Filter by type:

```bash
bd gate check --type gh:run
```

## Escalation

On `bd gate check --escalate`, timed-out non-timer gates trigger
`gt escalate` (or equivalent). Beads delegates escalation to the
orchestrator. Timers never escalate regardless.

## Gotchas

- **`bead` gate type is dead.** `bd gate check` for `await_type=bead`
  always returns false ("cross-rig bead gate cannot be checked" —
  multi-rig routing was removed). Don't use. See
  [../../gaps-audit.md](../../gaps-audit.md) §V6.
- **Gate and blocked bead are separate.** The gate bead has its own
  status; the blocked bead is blocked via a `blocks` dep to the gate.
  Closing the gate bead is what unblocks the downstream.
- **Gates accept labels too.** You can label a gate bead `human` for
  visibility in `bd human list`; that's a separate discoverability
  mechanism from the `await_type=human` semantics.

## Automating gate check

A simple cron job:

```bash
# /etc/cron.d/bd-gate-check
*/5 * * * * cd /path/to/project && bd gate check --type gh:run,gh:pr,timer >> /var/log/bd-gate.log 2>&1
```

Or build into a patrol formula with a `gate-check` step.

## See also

- [../reference/bead-schema.md#gate-fields-async-coordination](../reference/bead-schema.md#gate-fields-async-coordination)
  — gate columns.
- [../reference/bd-commands.md#maintenance](../reference/bd-commands.md#maintenance)
  — `bd gate` family.
- [../explanation/agent-coordination.md#gates](../explanation/agent-coordination.md#gates)
  — gates in context.
