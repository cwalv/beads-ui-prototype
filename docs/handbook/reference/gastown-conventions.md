# Gastown conventions

> Verified 2026-05-20 against gastown tip `b1dc37c75dbd0404e81e024385d77115b908eafe`
> (15 commits past the 2026-04-23 bootstrap tip
> `bdbe8c4b0e45f318576c838355fcc85b15e74b8f`). Sister page for gascity:
> [metadata-conventions.md](metadata-conventions.md).

Gastown organizes bead-level conventions across **three substrates**,
not one. A UI rendering a gastown bead needs to read all three:

1. **Labels** (~60 patterns) — bead-type discriminators plus
   orthogonal indices (mail, channels, queues, escalations, convoy
   workflow state).
2. **Description fields** (~65 keys across ~11 bead kinds) — gastown's
   functional equivalent of gascity's `gc.*` metadata. A 1,057-line
   parser lives in `internal/beads/fields.go`.
3. **Metadata column** — exactly one convention: `delegated_from`.

That asymmetry matters: gastown deliberately avoids the `metadata`
column for orchestration. Everything that would be a `gc.*` key in
gascity is a description field in gastown.

Full per-key writer/reader audit:
[../../gastown-conventions-deep-dive.md](../../gastown-conventions-deep-dive.md).
Paths below are workspace-relative from
`github/gastownhall/gastown/`.

**Storage note.** Per beads migration 0035, four of the bead kinds
catalogued here — `agent`, `rig`, `role`, `message` — have their
canonical row in the `wisps` table, not `issues`. UIs reading raw
storage need to query both tables for these kinds; the description-field
parsing rules are identical.

## Substrate: description fields

Parsed from `bead.description` as `key: value` lines (with a small set
of exceptions that use JSON — see [§JSON-description beads](#json-description-beads)).
`fields.go` is the substrate; per-concept structs live in
`beads_*.go`.

### Agent beads (`gt:agent`)

Type column is always `task`. Agents are identified by the label, not
the type. Struct: `AgentFields` at `beads_agent.go:38-59`.

| Key | Purpose |
|---|---|
| `role_type` | `polecat`, `witness`, `refinery`, `deacon`, `mayor`, `crew`, `dog` |
| `rig` | Rig name, or `null` for town-level agents |
| `agent_state` | `spawning`, `working`, `done`, `stuck`, `escalated`, `idle`, `running`, `nuked` |
| `hook_bead` | Currently pinned work bead id (or `null`). Read by witness handlers and other watchers; the external write path is gone since hq-l6mm5 (`internal/cmd/sling_helpers.go:565-573` shows `updateAgentHookBead` is now an explicit no-op — the work bead's `status=hooked` + `assignee` is the authoritative dispatch signal). |
| `cleanup_status` | Polecat git state: `clean`, `has_uncommitted`, `has_stash`, `has_unpushed` |
| `active_mr` | Currently active merge-request bead id |
| `notification_level` | `verbose`, `normal`, `muted` |
| `mode` | `""` (normal) or `ralph` (Ralph-Wiggum loop) |
| `exit_type` | `COMPLETED`, `ESCALATED`, `DEFERRED`, `PHASE_COMPLETE` |
| `mr_id` | MR bead id created by `gt done` |
| `branch` | Polecat working branch |
| `mr_failed` | `true` if MR creation failed |
| `push_failed` | `true` if push to origin failed |
| `completion_time` | RFC 3339 |

### Dog beads (`gt:agent` + `role_type:dog`)

Struct via `formatDogDescription` at `beads_dog.go:106-113`.

| Key | Purpose |
|---|---|
| `role_type` | Always `dog` |
| `rig` | Always `town` |
| `location` | Where the dog runs |

### Channel beads (`gt:channel`)

ID: `hq-channel-<name>`. Struct: `ChannelFields` at `beads_channel.go:16-24`.

| Key | Purpose |
|---|---|
| `name` | Unique channel name |
| `subscribers` | Comma-separated addresses |
| `status` | `active`, `closed` |
| `retention_count` | Retention limit (0 = unlimited) |
| `retention_hours` | Time-based retention |
| `created_by` | Actor |
| `created_at` | RFC 3339 |

### Group beads (`gt:group`)

ID: `hq-group-<name>`. Struct: `GroupFields` at `beads_group.go:41-46`.

| Key | Purpose |
|---|---|
| `name` | Unique group name |
| `members` | Comma-separated addresses / patterns / nested group names |
| `created_by` | Actor |
| `created_at` | RFC 3339 |

### Queue beads (`gt:queue`, `type=queue`)

ID: `gt-q-<name>` (rig) or `hq-q-<name>` (town). Struct:
`QueueFields` at `beads_queue.go:14-26`.

| Key | Purpose |
|---|---|
| `name` | Human-readable name |
| `claim_pattern` | Who can claim (e.g. `gastown/polecats/*`) |
| `status` | `active`, `paused`, `closed` |
| `max_concurrency` | 0 = unlimited |
| `processing_order` | `fifo` or `priority` |
| `available_count`, `processing_count`, `completed_count`, `failed_count` | Runtime counters |
| `created_by`, `created_at` | Provenance |

### Rig beads (`gt:rig`, `type=rig`)

ID: `<prefix>-rig-<name>`. Struct: `RigFields` at `beads_rig.go:32-37`.

| Key | Purpose |
|---|---|
| `repo` | Git URL |
| `prefix` | Beads prefix |
| `state` | `active`, `archived`, `maintenance` |

### Escalation beads (`gt:escalation` + ephemeral)

Created as `--ephemeral --wisp-type=escalation`. Struct:
`EscalationFields` at `beads_escalation.go:15-30`.

| Key | Purpose |
|---|---|
| `severity` | `critical`, `high`, `medium`, `low` |
| `reason` | Why |
| `source` | e.g. `plugin:rebuild-gt`, `patrol:deacon` |
| `escalated_by`, `escalated_at` | Provenance |
| `acked_by`, `acked_at` | Acknowledgement |
| `closed_by`, `closed_reason` | Resolution |
| `related_bead` | Optional link |
| `original_severity` | Pre-reescalation |
| `reescalation_count` | Integer |
| `last_reescalated_at`, `last_reescalated_by` | Most-recent bump |

Severity bumps: `low → medium → high → critical`. `critical` re-escalation is a no-op.

### Merge-request beads (`gt:merge-request`, `type=merge-request`)

Struct: `MRFields` at `fields.go:571-597`.

| Key | Purpose |
|---|---|
| `branch` | Source branch (e.g. `polecat/Nux/gt-xyz`) |
| `target` | Target branch (`main` or `integration/gt-epic`) |
| `source_issue` | Work item being merged |
| `worker` | Polecat who did the work |
| `rig` | Rig name |
| `commit_sha` | HEAD SHA at submission (dedup key per GH#3032) |
| `merge_commit` | Merge commit SHA on close |
| `close_reason` | `merged`, `rejected`, `conflict`, `superseded` |
| `agent_bead` | Agent bead that created the MR |
| `retry_count` | Conflict-resolution cycle counter |
| `last_conflict_sha` | Main-branch SHA at last conflict |
| `conflict_task_id` | Link to conflict-resolution task |
| `convoy_id` | Parent convoy |
| `convoy_created_at` | For starvation prevention |
| `pre_verified` | Polecat ran gates after rebasing (`true`/`false`) |
| `pre_verified_at` | Verification timestamp |
| `pre_verified_base` | Target-branch SHA at verification |

Key-alias tolerance: most keys accept three spellings (`commit_sha`,
`commit-sha`, `commitsha`). Canonical form is `snake_case`.

### Convoy beads (`type=convoy`)

Note: canonical discriminator is the `type` column;
`gt:convoy` exists as a label but only readers are in the current
tree. Struct: `ConvoyFields` at `fields.go:257-265`.

| Key | Purpose |
|---|---|
| `Owner` | Convoy owner address (title-cased on emit, case-insensitive parse) |
| `Notify` | Notification address |
| `Molecule` | Associated molecule / swarm id |
| `Merge` | Merge strategy (`direct`, `mr`, `local`) |
| `base_branch` | Target branch for polecats |
| `Watchers` | Comma-separated mail watchers |
| `nudge_watchers` | Comma-separated nudge watchers |

Five of the seven keys are title-cased on emit (`Owner`, `Notify`,
`Merge`, `Molecule`, `Watchers`). Parser is case-insensitive.

### Attachment fields (on pinned beads)

Attachment is not a bead kind — it's a set of fields written onto a
pinned bead when sling attaches a molecule. Struct: `AttachmentFields`
at `fields.go:15-29`.

| Key | Purpose |
|---|---|
| `attached_molecule` | Molecule root id |
| `attached_formula` | Formula name (e.g. `mol-polecat-work`) |
| `attached_at` | RFC 3339 |
| `attached_args` | Natural-language args |
| `attached_vars` | JSON array of `--var` values |
| `dispatched_by` | Agent id that dispatched (for completion notify) |
| `no_merge` | `true` = skip merge queue |
| `review_only` | `true` = evaluate-and-report-back |
| `mode` | `ralph` for Ralph-Wiggum retry loop |
| `convoy_id` | Tracking convoy |
| `merge_strategy` | `direct`, `mr`, `local` |
| `convoy_owned` | `true` if convoy has `gt:owned` label |
| `formula_vars` | Newline-separated `key=value` pairs |

Key-alias tolerance: three forms accepted.

### Role beads (`gt:role`)

Struct: `RoleConfig` at `fields.go:864-915`.

| Key | Purpose |
|---|---|
| `session_pattern` | Tmux session-name template with `{rig}`/`{name}`/`{role}` |
| `work_dir_pattern` | Working-directory template |
| `needs_pre_sync` | Agent needs `git sync` before start |
| `start_command` | Launch command (default: `exec claude --dangerously-skip-permissions`) |
| `env_var` | Repeatable `KEY=VALUE` |
| `ping_timeout` | Health-check timeout |
| `consecutive_failures` | Fails-before-force-kill |
| `kill_cooldown` | Minimum time between force-kills |
| `stuck_threshold` | Wisp in-progress timeout |
| `wisp_ttl_<type>` | Per-wisp-type TTL override (e.g. `wisp_ttl_patrol: 48h`) |

Note: `gt:role` label has no current writer in non-test paths; role
bead creation may happen outside the main tree.

### Molecule-template definitions

On molecule-template beads, parsed by `ParseMoleculeSteps` at
`molecule.go:71-156`. Markdown-ish (not strict key:value).

| Key | Purpose |
|---|---|
| `## Step: <ref>` | Step header |
| `Needs:` | Inter-step deps |
| `Tier:` | `haiku`, `sonnet`, `opus` |
| `Type:` | `task` (default), `wait` |
| `Backoff:` | `base=30s, multiplier=2, max=10m` |
| `WaitsFor:` | Dynamic wait (e.g. `all-children`) |

### Instantiated-step provenance

On a molecule's child step beads.

| Key | Purpose |
|---|---|
| `instantiated_from` | Molecule id that was instantiated |
| `template_step` | Template step id (new format) |
| `step` | Step ref (old markdown format) |
| `tier` | Optional LLM-tier hint |

### JSON-description beads

Two bead kinds deliberately use JSON (not `key: value`) for their
description:

- **`gt:merge-slot`** — one bead per rig. Description:
  `{"holder": "<actor>", "waiters": ["<actor1>", …]}`. See
  `beads_merge_slot.go:1-11`.
- **`gt:sling-context`** — scheduler-owned. Description: 19-field
  `SlingContextFields` JSON (`internal/scheduler/capacity/pipeline.go:16-38`).
  Fields: `version`, `work_bead_id`, `target_rig`, `formula`, `args`,
  `vars`, `enqueued_at`, `merge`, `convoy`, `base_branch`, `no_merge`,
  `review_only`, `account`, `agent`, `hook_raw_bead`, `owned`, `mode`,
  `dispatch_failures`, `last_failure`.

UIs that parse descriptions need to detect whether the content is JSON
or key:value before splitting.

## Substrate: labels

Full per-label summary (including writer/reader citations) at
[../../gastown-conventions-deep-dive.md §19](../../gastown-conventions-deep-dive.md).
Below is the curated set relevant to rendering.

### Bead-kind discriminators

| Label | On |
|---|---|
| `gt:agent` | Agent beads (any role) |
| `gt:channel` | Channel beads |
| `gt:group` | Group beads |
| `gt:queue` | Queue beads |
| `gt:rig` | Rig identity beads |
| `gt:escalation` | Escalation beads (also a message label family — see mail) |
| `gt:merge-request` | MR beads |
| `gt:merge-slot` | Merge-slot beads (JSON description) |
| `gt:message` | Mail message beads |
| `gt:sling-context` | Scheduler context beads |
| `role_type:dog` | Dog (on a `gt:agent` bead) |

Dynamic `gt:<type>` — produced from `"gt:" + issueType` at
`beads.go:1061-1066`. So `gt:bug`, `gt:epic`, `gt:task`, `gt:molecule`,
`gt:wisp` all exist automatically. Good for `bd list --label=gt:...`
filtering.

### Protected-bead set

`IsProtectedBead` (`beads.go:254-265`) gates automated status changes.
Four labels:

| Label | Effect |
|---|---|
| `gt:standing-orders` | Persistent orders — do not auto-close |
| `gt:keep` | Wisp preservation flag |
| `gt:role` | Role bead |
| `gt:rig` | Rig identity bead (cross-ref above) |

UIs should not offer close/auto-close actions on these.

### Mail labels

On `gt:message` beads. Built by `buildLabels` at `mail/router.go:235-255`.

| Label | Purpose |
|---|---|
| `from:<address>` | Sender |
| `msg-type:<type>` | `user`, `nudge`, `escalation`, `reply`, `task`, … |
| `thread:<id>` | Mail thread |
| `reply-to:<id>` | Reply target |
| `cc:<identity>` | Per CC recipient |
| `read` | Read state (unread = absence of label) |
| `channel:<name>` | Channel scope |
| `queue:<name>` | Queue scope |
| `announce:<name>` | Announce-board scope |
| `list:<name>` | Mailing-list expansion (routing prefix, not bead-level) |
| `claimed-by:<identity>` | Queue-item claimed — **no writer in current non-test tree; flag** |

Two-phase delivery:

| Label | Purpose |
|---|---|
| `delivery:pending` | Phase-1 — message sent, awaiting ack |
| `delivery:acked` | Phase-2 — acked by recipient |
| `delivery-acked-by:<identity>` | Per-recipient ack |
| `delivery-acked-at:<RFC3339>` | Ack timestamp |

**Priority**: gastown uses `bead.Priority` (the column), not a
`priority:<N>` label. Contrast with the label-based gascity
convention — they differ.

### Escalation state labels

On `gt:escalation` beads.

| Label | Purpose |
|---|---|
| `severity:critical`/`high`/`medium`/`low` | Severity tier |
| `acked` | Acknowledged |
| `resolved` | Closed |
| `reescalated` | Bumped severity at some point |

### Convoy / mountain workflow

On `type=convoy` beads participating in the "mountain" workflow
(`internal/cmd/mountain.go`).

| Label | Purpose |
|---|---|
| `gt:owned` | Convoy opt-out from auto-close |
| `gt:owned-direct` | MR opt-out from refinery — **reader only; no writer found; flag** |
| `mountain` | Convoy in mountain workflow |
| `mountain:paused` | Paused |
| `mountain:failures:<N>` | Failure-count (swapped each retry) |
| `mountain:skipped` | Permanently skipped after max failures |

### Rig lifecycle

On `gt:rig` beads.

| Label | Purpose |
|---|---|
| `status:docked` | Dock'd (via `gt rig dock`) |
| `status:parked` | Parked |

### Plugin / dog / witness joins

| Label | Purpose |
|---|---|
| `rig:town` | Dog town-scope marker (also on dog beads) |
| `rig:<name>` | Plugin-recording rig link |
| `plugin:<name>` | Plugin identifier |
| `location:<path>` | Dog location |
| `polecat:<name>` | Polecat identity on witness-tracked beads |
| `state:merge-requested` | Polecat state flag |
| `done-intent:<type>:<unix-ts>` | Witness hand-off signal on agent bead |
| `digest` | Molecule-digest wisp marker |

## Substrate: metadata column

Exactly one convention:

| Key | Purpose |
|---|---|
| `delegated_from` | JSON `Delegation` record on delegated-to bead. Written by `AddDelegation` (`beads_delegation.go:72`); read by `GetDelegation` / `parseDelegationFromMetadata`. |

Value shape:

```json
{
  "parent": "<work-unit-id>",
  "child":  "<work-unit-id>",
  "delegated_by": "<hop:// uri or actor>",
  "delegated_to": "<hop:// uri or actor>",
  "terms": {
    "portion": "...",
    "deadline": "...",
    "acceptance_criteria": "...",
    "credit_share": 50
  },
  "created_at": "..."
}
```

Side effect: `AddDelegation` also adds a bd dependency (child blocks
parent) so the parent can't close until the child is done.

This is the entire gastown metadata-column convention. There is no
`gt.*` metadata namespace.

## Dual-representation gotcha: `role_type`

`role_type` is both:

- A **label** on dog beads (`role_type:dog`, `beads_dog.go:18`).
- A **description field** on polecat / witness / etc. agent beads
  (`role_type: polecat`, `beads_agent.go:77`).

UIs that want "what role is this agent?" need to check both the label
list AND the parsed description.

## Vestigial / incomplete

| Item | Status |
|---|---|
| `role_bead` description field | Removed; `beads_agent.go:46-48` notes "purged" |
| bd `slot` command's agent-bead slots | Removed in v0.62; replaced by description-field `hook_bead` plus `type="hooked"` status |
| `gt:standing-orders`, `gt:role`, `gt:owned-direct` labels | Readers present, writers absent in current tree. Possibly external writers, possibly vestigial. |
| `claimed-by:<identity>` mail label | Same: reader-only. |
| `priority:<N>` label (like gascity) | **Not a gastown convention.** `bead.Priority` column is used. |

## For UI builders

A gastown convention pack needs, in priority order:

1. **A description-field parser.** `fields.go`-style key:value with
   a case-insensitive, dash-tolerant key matcher. Also a JSON-detector
   to fall through for `gt:merge-slot` and `gt:sling-context`.
2. **A per-bead-kind field catalog** — the tables above. Each kind
   has a finite set of expected keys; render them as a structured
   panel.
3. **A label catalog** — the tables above. Group by purpose
   (discriminator / mail / escalation / convoy / rig lifecycle /
   plugin / protected).
4. **A single metadata-key entry** — `delegated_from`.
5. **Protected-bead awareness** — suppress auto-close actions on
   `gt:standing-orders`, `gt:keep`, `gt:role`, `gt:rig`.

Contrast with the gascity pack (see
[metadata-conventions.md](metadata-conventions.md) and
[convergence-metadata.md](convergence-metadata.md)), which primarily
needs metadata-key catalogs and a much smaller label catalog.

## See also

- [../../gastown-conventions-deep-dive.md](../../gastown-conventions-deep-dive.md)
  — full per-key writer/reader audit with citations.
- [../../04-gastown-integration.md](../../04-gastown-integration.md) §6
  — broader description-field narrative.
- [metadata-conventions.md](metadata-conventions.md) — gascity
  `gc.*` keys and general metadata rules.
- [../../ui-review.md](../../ui-review.md) §2 — convention-pack model.
