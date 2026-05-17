# Tutorial 2: Dependencies

Goal: add `blocks` and `parent-child` deps between beads; watch
`bd ready` respond.

## Prereqs

- Completed [tutorial 1](01-your-first-bead.md) (or have a workspace
  set up).

## Step 1: set up three beads

```
$ bd create "Implement auth" -p 1
✓ Created bd-tutorial-auth
$ bd create "Write auth tests" -p 2
✓ Created bd-tutorial-test
$ bd create "Ship auth feature" -p 1 --type epic
✓ Created bd-tutorial-ship
```

(Your IDs will be different base36 hashes — use whatever `bd` gave
you. For the tutorial, substitute yours for `auth` / `test` / `ship`.)

## Step 2: add a blocks dep

"Write auth tests" must wait for "Implement auth." Express this as:

```
$ bd dep add bd-tutorial-test bd-tutorial-auth
✓ Added dependency: bd-tutorial-test blocks-on bd-tutorial-auth
```

Default dep type is `blocks`. The edge reads "test *depends on* auth"
— i.e. auth blocks test.

## Step 3: see the effect on `bd ready`

```
$ bd ready
○ bd-tutorial-auth · Implement auth    [P1 · OPEN]
○ bd-tutorial-ship · Ship auth feature [P1 · OPEN]
```

Auth is ready; tests aren't (blocked by auth, which is open). Ship is
ready by itself.

## Step 4: visualize the graph

```
$ bd dep tree bd-tutorial-ship
bd-tutorial-ship · Ship auth feature
```

The ship epic has no deps yet. Let's make it a parent of auth:

```
$ bd dep add bd-tutorial-auth bd-tutorial-ship --type parent-child
✓ Added dependency: bd-tutorial-auth parent-child-of bd-tutorial-ship
```

The `parent-child` convention is "child depends on parent" — here
auth is the child, ship is the parent. Gotcha: if you read "auth
depends on ship," remember that beads uses this as *auth is a child
of ship*. The parent blocks the child only in the "deferred parent
hides children" sense.

Now:

```
$ bd dep tree bd-tutorial-ship
bd-tutorial-ship · Ship auth feature
├─ bd-tutorial-auth · Implement auth
   └─ (blocks) bd-tutorial-test · Write auth tests
```

## Step 5: make auth depend on a gate

A gate blocks a bead on an async condition.

```
$ bd create "Wait for PR #42" --type gate \
    -d "Waiting for authentication refactor PR" \
    --await-type gh:pr --await-id 42
```

(If you get "unknown type: gate," you need to register `gate` as a
custom type first:)

```
$ bd config set types.custom "gate"
```

…then re-run the create. `gate` lives in the CLI but is not a
built-in — an oddity flagged in the
[gaps-audit](../../gaps-audit.md) §C3. Your orchestrator usually
configures this on your behalf.

Now block auth on the gate:

```
$ bd dep add bd-tutorial-auth <gate-id>
```

## Step 6: close auth, see test unblock

```
$ bd close bd-tutorial-auth --suggest-next
✓ Closed bd-tutorial-auth
Newly unblocked:
  bd-tutorial-test · Write auth tests
```

That `--suggest-next` flag walks the dep graph from the closed bead
and reports which beads became ready as a result. Often worth
chaining with a `--claim-next` on worker scripts.

## Step 7: `bd ready --explain`

When a bead isn't ready, find out why:

```
$ bd ready --explain bd-tutorial-test
Blocked:
  bd-tutorial-test · Write auth tests
    └─ blocked by: (none — now ready!)
Ready:
  bd-tutorial-test · Write auth tests
    (since bd-tutorial-auth closed)
```

Or JSON form:

```
$ bd ready --explain --json
{
  "ready": [...],
  "blocked": [...],
  "cycles": [],
  "summary": {"ready_count": 2, "blocked_count": 0, "cycle_count": 0}
}
```

## Step 8: remove a dep

```
$ bd dep rm bd-tutorial-test bd-tutorial-auth
✓ Removed dependency: bd-tutorial-test ↛ bd-tutorial-auth
```

## Beyond `blocks`

You've used `blocks` and `parent-child`. Beads has 18 more dep types.
Important ones:

- **`waits-for`** — fanout gate: wait for `all-children`,
  `any-children`, or `children-of(<step>)`. Used in formulas
  heavily; in general usage, hints to tooling.
- **`supersedes`** — "this bead replaces that one."
  `bd supersede` convenience wraps this + close.
- **`duplicates`** — `bd duplicate <id> --of <canonical>` adds
  this + closes.
- **`related`** — soft link; no blocking.

See [../reference/dependency-types.md](../reference/dependency-types.md)
for all 20.

## Gotcha: cycles

```
$ bd dep add bd-a bd-b         # a blocks on b
$ bd dep add bd-b bd-a         # b blocks on a → ERROR
Error: would create cycle in blocks dependencies
```

Cycle detection runs for `blocks` and `conditional-blocks` only. Other
types don't check — e.g., two `related` beads can form a cycle
without bd complaining.

## Gotcha: only `blocks` blocks `bd ready`

The `AffectsReadyWork` code helper claims four dep types affect
readiness (`blocks`, `parent-child`, `conditional-blocks`,
`waits-for`). The actual `ready_issues` SQL view only enforces
`blocks`. See [gaps-audit §C1](../../gaps-audit.md).

If you want to block `bd ready` on something, use `blocks`. Other
types are informational, not enforcing.

## Next up

- [Tutorial 3: pouring a formula](03-pouring-a-formula.md) —
  instantiate a whole workflow from a TOML template.

## See also

- [../reference/dependency-types.md](../reference/dependency-types.md) — all 20 types.
- [../reference/bd-commands.md#dependencies-and-structure](../reference/bd-commands.md#dependencies-and-structure) — `bd dep` reference.
