# Gastown conventions deep-dive

Parallel to the gascity metadata deep-dive at
[gascity-metadata-deep-dive.md](gascity-metadata-deep-dive.md). Same methodology
— per-key writer/reader/purpose audit, comparison against
[handbook/reference/metadata-conventions.md](handbook/reference/metadata-conventions.md),
concrete additions for the handbook. All file citations are workspace-relative,
rooted at `github/gastownhall/gastown/...`.

The material is organized differently from gascity because gastown's
conventions live in three layers, not one:

1. **Labels** (`gt:*` and other prefixes) — bead-type discriminators plus
   orthogonal indices for mail, channels, queues, escalations, convoy
   workflow state.
2. **Description fields** (`key: value` lines inside `bead.description`) —
   gastown's functional equivalent of gascity's `gc.*` metadata. A 1,057-line
   parser in `internal/beads/fields.go` plus per-concept `beads_*.go` files.
3. **Metadata** (the JSON `metadata` column) — used for exactly one thing
   in the current tree: delegation (`metadata.delegated_from`).

That asymmetry is the headline finding. Gastown deliberately avoids the
`metadata` column for conventions — everything that would be a `gc.*` key in
gascity is a description field in gastown. When the UI renders gastown beads
it must parse the description, not show a metadata table.

## 1. Agent beads

**Label**: `gt:agent` (`beads_agent.go:238,340,633`).

**Type column**: `type=task` always. Agent beads are distinguished by the
label, not the type. See the comment at `beads_agent.go:335-336`: "Agent
beads use type=task (a valid built-in type) and are identified by the
gt:agent label, not by type." Legacy beads may still have `type=agent` —
`IsAgentBead` at `beads.go:239-249` accepts either.

**Description substrate** (`AgentFields` at `beads_agent.go:38-59`):

| Key | Purpose | Writer | Reader |
|---|---|---|---|
| `role_type` | `polecat`, `witness`, `refinery`, `deacon`, `mayor`, `crew`, `dog` | `FormatAgentDescription` `beads_agent.go:77`; dog path `beads_dog.go:110` | `ParseAgentFields` `beads_agent.go:162`; mail router address resolution `internal/mail/router.go:443-444,560-561` |
| `rig` | Rig name, or `null` for town-level agents like `mayor`/`deacon` | `beads_agent.go:80-83` | `beads_agent.go:164`, `internal/mail/router.go:445-446,562-563,669,684` |
| `agent_state` | Lifecycle: `spawning`, `working`, `done`, `stuck`, `escalated`, `idle`, `running`, `nuked` | `FormatAgentDescription` `beads_agent.go:85`; `UpdateAgentState` `beads_agent.go:416-424` | `ParseAgentFields` `beads_agent.go:166`; daemon polecat-health `internal/daemon/polecat_health_test.go:42` |
| `hook_bead` | Currently pinned work bead ID (or `null`) | `beads_agent.go:87-91`; cleared in `ResetAgentBeadForReuse` `beads_agent.go:386-387` | `beads_agent.go:168` |
| `cleanup_status` | Polecat self-reports git state: `clean`, `has_uncommitted`, `has_stash`, `has_unpushed` | `UpdateAgentCleanupStatus` `beads_agent.go:524-526` | `beads_agent.go:170` |
| `active_mr` | Currently active merge-request bead ID (traceability) | `UpdateAgentActiveMR` `beads_agent.go:531-533` | `beads_agent.go:172` |
| `notification_level` | DND mode: `verbose`, `normal`, `muted` (constants at `beads_agent.go:62-66`) | `UpdateAgentNotificationLevel` `beads_agent.go:538-540` | `GetAgentNotificationLevel` `beads_agent.go:588-600` |
| `mode` | Execution mode: `""` (normal) or `ralph` (Ralph Wiggum loop) | `FormatAgentDescription` `beads_agent.go:113-115`; `AgentFieldUpdates.Mode` `beads_agent.go:439` | `beads_agent.go:176`; stuck detection `internal/tui/feed/stuck_test.go:719` |

**Completion metadata** (also on the agent bead, written by `gt done` —
see `beads_agent.go:50-58`, written via `UpdateAgentCompletion` at
`beads_agent.go:558-569`):

| Key | Purpose |
|---|---|
| `exit_type` | `COMPLETED`, `ESCALATED`, `DEFERRED`, `PHASE_COMPLETE` |
| `mr_id` | MR bead ID created by `gt done` (if any) |
| `branch` | Polecat working branch name |
| `mr_failed` | `true` if MR creation was attempted but failed |
| `push_failed` | `true` if branch push to origin failed (gas-556) |
| `completion_time` | RFC 3339 timestamp |

`ClearAgentCompletion` at `beads_agent.go:573-584` wipes all six when the
polecat is re-slung with new work.

**Dead fields**: none in `AgentFields` — every field has both a writer and a
reader in the current tree (the removed `role_bead` field noted at
`beads_agent.go:47-48,92-93` is fully purged).

**Deprecated / history**:

- `role_bead` — comment at `beads_agent.go:46-48` notes the field was
  removed when role definitions moved to config. Historical hazard for
  code still reading old agent-bead descriptions.
- `hook_bead` slot (vs. the description field) — removed in bd 0.62 per
  notes at `beads_agent.go:346-347,426-428`. Current authority is "work
  bead status=hooked and assignee=<agent>". The description field is
  still written so readers can find the hook via the description.

**Handbook coverage**: The handbook's `gt:*` table
(`metadata-conventions.md:217`) mentions `gt:agent` but says nothing
about the eleven description keys that constitute agent identity. Every
one of them is missing from the handbook.

## 2. Dog agent beads

**Labels** (`beads_dog.go:16-21`): `gt:agent`, `role_type:dog`, `rig:town`,
`location:<path>`.

**Description fields** (`formatDogDescription` `beads_dog.go:106-113`):

| Key | Purpose |
|---|---|
| `role_type` | Always `dog` |
| `rig` | Always `town` |
| `location` | Where the dog runs — read by mail router `internal/mail/router.go:558-559` |

Dogs are found by title prefix (`Dog: <name>`) plus the `role_type:dog`
label (`FindDogAgentBead` `beads_dog.go:66-79`).

**Handbook coverage**: `role_type:dog` is noted, `location:` label is not.
The handbook treats `role_type` as a label in one place and as a
description field in another — `beads_dog.go` uses it as a **label** for
filtering (`beads_dog.go:18,72`), while the generic agent path uses it as
a **description field** (`beads_agent.go:77`, `internal/mail/router.go:443`).
Both code paths are live. Flag this to the handbook as a dual-representation
case.

## 3. Channel beads

**Label**: `gt:channel` (`beads_channel.go:159,194,213,331`).
**Type**: `task`.
**ID pattern**: `hq-channel-<name>` — channels are town-level
(`ChannelBeadID` `beads_channel.go:131-134`).

**Description fields** (`ChannelFields` `beads_channel.go:16-24`):

| Key | Purpose | Writer | Reader |
|---|---|---|---|
| `name` | Unique channel name | `FormatChannelDescription` `beads_channel.go:41` | `ParseChannelFields` `beads_channel.go:98` |
| `subscribers` | Comma-separated addresses | `beads_channel.go:45` | `beads_channel.go:100-109` |
| `status` | `active`, `closed` (constants `beads_channel.go:28-30`) | `beads_channel.go:51` | `beads_channel.go:110` |
| `retention_count` | Message retention limit (0 = unlimited) | `beads_channel.go:56` | `beads_channel.go:112-115` |
| `retention_hours` | Time-based retention | `beads_channel.go:57` | `beads_channel.go:116-119` |
| `created_by` | Actor that created the channel | `beads_channel.go:59-63` | `beads_channel.go:120` |
| `created_at` | RFC 3339 timestamp | `beads_channel.go:65-69` | `beads_channel.go:122` |

**Companion label**: `channel:<name>` on message beads to associate them
with a channel (`internal/mail/types.go:356-357`,
`internal/mail/router.go:1431`). Readable via `bd list --label=channel:X`.
Retention enforcement at `beads_channel.go:386-530` queries
`--label=gt:message --label=channel:<name>`.

**Handbook coverage**: `gt:channel` and `channel:<name>` labels are noted
but all seven description fields are missing.

## 4. Group beads

**Label**: `gt:group` (`beads_group.go:164,199,218,322`).
**Type**: `task`.
**ID pattern**: `hq-group-<name>` (`GroupBeadID` `beads_group.go:127-136`),
pluggable via `GroupBeadIDWithPrefix`.

**Description fields** (`GroupFields` `beads_group.go:41-46`):

| Key | Purpose |
|---|---|
| `name` | Unique group name (validated by `groupNameRegex` `beads_group.go:15`) |
| `members` | Comma-separated addresses, patterns, or nested group names |
| `created_by` | Actor |
| `created_at` | RFC 3339 timestamp |

Group names: lowercase alphanumeric + `[-_]`, must start alphanumeric,
max 64 chars (`ValidateGroupName` `beads_group.go:23-37`).

**Handbook coverage**: `gt:group` label noted; four description fields
missing.

## 5. Queue beads

**Label**: `gt:queue` (`beads_queue.go:183,216,275`).
**Type**: `queue` (a registered custom type — see
`constants.go:185`).
**ID pattern**: `gt-q-<name>` (rig-level) or `hq-q-<name>` (town-level)
— `QueueBeadID` `beads_queue.go:160-165`.

**Description fields** (`QueueFields` `beads_queue.go:14-26`):

| Key | Purpose |
|---|---|
| `name` | Human-readable queue name |
| `claim_pattern` | Who can claim (e.g. `gastown/polecats/*`) — default `*` |
| `status` | `active`, `paused`, `closed` (constants `beads_queue.go:29-33`) |
| `max_concurrency` | 0 = unlimited |
| `processing_order` | `fifo` or `priority` (constants `beads_queue.go:36-39`) |
| `available_count` | Runtime counter |
| `processing_count` | Runtime counter |
| `completed_count` | Runtime counter |
| `failed_count` | Runtime counter |
| `created_by` | Actor |
| `created_at` | RFC 3339 timestamp |

**Companion label**: `queue:<name>` on mail messages that target a queue
(`internal/mail/router.go:1260`, reader at `internal/cmd/mail_queue.go:178`).

**Claim-pattern matching**: `MatchClaimPattern` at `beads_queue.go:337-370`
supports `*`, exact match, and single-segment glob — `*/witness` matches
`gastown/witness` but not `gastown/foo/witness`.

**Handbook coverage**: `gt:queue` label is noted; eleven description
fields are missing. The `queue:<name>` mail-routing label is missing too.

## 6. Rig beads

**Label**: `gt:rig` (`beads_rig.go:156,194,213,253`).
**Type**: `rig` (registered via `constants.BeadsCustomTypes`
`constants.go:185`).
**ID pattern**: `<prefix>-rig-<name>` (`RigBeadIDWithPrefix`
`beads_rig.go:277-281`). Prefix defaults to `gt`.

**Description fields** (`RigFields` `beads_rig.go:32-37`):

| Key | Purpose |
|---|---|
| `repo` | Git URL for the rig's repository |
| `prefix` | Beads prefix (`gt`, `bd`, `lc` for laneassist, …) |
| `state` | `active`, `archived`, `maintenance` (constants `beads_rig.go:14-22`) |

**Orthogonal status label**: `status:docked` — constant
`RigDockedLabel` at `internal/cmd/rig_dock.go:23`, added by
`rig dock` and read by doctor (`internal/doctor/rig_config_sync_check.go:441`).
Also `status:parked` (`internal/cmd/rig_park.go:191`,
`internal/cmd/rig_helpers.go:136`).

**Handbook coverage**: `gt:rig` label is noted; the three description
fields and the `status:docked` / `status:parked` labels are all missing.

## 7. Escalation beads

**Labels**: `gt:escalation` primary (`beads_escalation.go:177,214,242,278`).
Severity companion: `severity:<level>` added at create
(`beads_escalation.go:182`). State labels: `acked` after
`AckEscalation` (`beads_escalation.go:228`), `resolved` after
`CloseEscalation` (`beads_escalation.go:257`), `reescalated` after
`ReescalateEscalation` (`beads_escalation.go:420`).

**Type**: `task` with `--ephemeral --wisp-type=escalation`
(`beads_escalation.go:175-176`).

**Description fields** (`EscalationFields` `beads_escalation.go:15-30`):

| Key | Purpose |
|---|---|
| `severity` | `critical`, `high`, `medium`, `low` |
| `reason` | Why this was escalated |
| `source` | Source identifier (e.g. `plugin:rebuild-gt`, `patrol:deacon`) |
| `escalated_by` | Agent address that escalated |
| `escalated_at` | RFC 3339 timestamp |
| `acked_by` | Agent that acknowledged (or `null`) |
| `acked_at` | Ack timestamp (or `null`) |
| `closed_by` | Agent that closed the escalation |
| `closed_reason` | Resolution reason |
| `related_bead` | Optional related bead ID |
| `original_severity` | Severity before any re-escalation |
| `reescalation_count` | Integer counter |
| `last_reescalated_at` | Last re-escalation timestamp |
| `last_reescalated_by` | Last re-escalator |

**Severity bumping**: `bumpSeverity` at `beads_escalation.go:431-442`
follows `low → medium → high → critical`. Once at `critical` the next
re-escalation is a no-op (`ReescalationResult.Skipped = true`,
`beads_escalation.go:392-397`).

**Listing filters**: `--label=gt:escalation --status=open`
(`beads_escalation.go:288`); severity filter
`--label=severity:<sev>` (`beads_escalation.go:306`).

**Stale detection**: `ListStaleEscalations` at `beads_escalation.go:323-351`
skips already-acked escalations via `HasLabel(issue, "acked")`.

**Handbook coverage**: `gt:escalation` label noted, `severity:*` noted in
role-discriminator section. The fourteen description fields are missing.
The state labels `acked`, `resolved`, `reescalated` are missing too.

## 8. Merge-slot bead

**Label**: `gt:merge-slot` (singular — one bead per rig).
Creators: `MergeSlotCreate` `beads_merge_slot.go:76`.

**Description format**: JSON (not key:value). The description is a single
JSON object — see the package doc at `beads_merge_slot.go:1-11`:

```
{"holder": "<actor>", "waiters": ["<actor1>", ...]}
```

`parseMergeSlotData` at `beads_merge_slot.go:35-42` `json.Unmarshal`s the
full description. Readers/writers never touch individual "key: value"
lines. This is a deliberate design choice — the comment at `:9-11` notes
"the bd merge-slot command was removed in v0.62; this implementation
uses standard bead CRUD operations".

**Lifecycle**: `MergeSlotAcquire` `beads_merge_slot.go:103-163`,
`MergeSlotRelease` `beads_merge_slot.go:167-202`. When holder is cleared,
the first waiter is promoted to holder (`:185-191`).

**Handbook coverage**: `gt:merge-slot` label noted; the JSON-description
substrate is not documented as distinct from the key:value substrate of
other bead kinds.

## 9. Merge-request beads

**Labels**: `gt:merge-request` primary
(`internal/cmd/done.go:1049`, `internal/cmd/mq_submit.go:272`,
`internal/refinery/manager.go:345`, `internal/refinery/engineer.go:1605`,
etc.). Opt-out label `gt:owned-direct` observed only as a reader at
`internal/refinery/engineer.go:1628` — **writer not present in the
current tree.** Flag for handbook as unverified/incomplete.

**Type**: `merge-request` (registered via `constants.BeadsCustomTypes`).

**Description fields** (`MRFields` `internal/beads/fields.go:571-597`):

| Key | Purpose | Writer | Reader |
|---|---|---|---|
| `branch` | Source branch name (e.g. `polecat/Nux/gt-xyz`) | `FormatMRFields` `fields.go:709`; `internal/cmd/mq_submit.go:243`; `internal/cmd/done.go:1016` | `ParseMRFields` `fields.go:630`; `FindMRForBranch` `beads_mr.go:11-13` |
| `target` | Target branch (`main` or `integration/gt-epic`) | `fields.go:711` | `fields.go:633` |
| `source_issue` | Work item being merged (e.g. `gt-xyz`) | `fields.go:714` | `fields.go:636-637`; `MatchesMRSourceIssue` `beads_mr.go:115-118` |
| `worker` | Polecat who did the work | `fields.go:717` | `fields.go:639` |
| `rig` | Rig name | `fields.go:720` | `fields.go:642` |
| `commit_sha` | HEAD SHA at submission — dedup key per GH#3032 | `fields.go:723` | `fields.go:645`; `FindMRForBranchAndSHA` `beads_mr.go:49-56` |
| `merge_commit` | Merge commit SHA (set on close) | `fields.go:726` | `fields.go:648` |
| `close_reason` | `merged`, `rejected`, `conflict`, `superseded` | `fields.go:729` | `fields.go:651` |
| `agent_bead` | Agent bead that created the MR (traceability) | `fields.go:732` | `fields.go:654` |
| `retry_count` | Conflict-resolution cycle counter | `fields.go:735-737` | `fields.go:657-661` |
| `last_conflict_sha` | Main-branch SHA when conflict happened | `fields.go:738` | `fields.go:662` |
| `conflict_task_id` | Link to conflict-resolution task | `fields.go:741` | `fields.go:665` |
| `convoy_id` | Parent convoy ID (accepts also `convoy-id`, `convoy`) | `fields.go:744` | `fields.go:668` |
| `convoy_created_at` | Convoy creation time for starvation prevention | `fields.go:747` | `fields.go:671` |
| `pre_verified` | Polecat ran full gates after rebasing (`true`/`false`) | `fields.go:750-752` | `fields.go:674` |
| `pre_verified_at` | When verification completed | `fields.go:753` | `fields.go:677` |
| `pre_verified_base` | Target-branch SHA at verification time | `fields.go:756` | `fields.go:680` |

**Key-alias tolerance**: most fields accept three spellings
(`commit_sha`, `commit-sha`, `commitsha`) — see the switch blocks at
`fields.go:629-683`. The `SetMRFields` round-trip
(`fields.go:766-862`) removes all three spellings before re-emitting
the canonical `snake_case` form.

**Handbook coverage**: `gt:merge-request` noted; the seventeen MR
description fields are missing. `gt:owned-direct` reader is undocumented
and has no writer — flag as gap.

## 10. Convoy beads and convoy labels

**Labels**: `gt:convoy` observed only as a reader
(`internal/cmd/sling_schedule.go:393`, `internal/web/fetcher.go:1708`)
— **writer not present in the current tree**; the canonical marker is
the `type=convoy` column. Opt-out label `gt:owned` — writers at
`internal/cmd/convoy.go:705`, `internal/cmd/sling_convoy.go:335,400`;
readers at `internal/cmd/convoy.go:1182,1793,1932,2030,2071`,
`internal/cmd/sling_convoy.go:185`.

**Type**: `convoy` (registered via `constants.BeadsCustomTypes`).

**Orthogonal workflow labels** — the "mountain" workflow layered onto
convoys (`internal/cmd/mountain.go`, `internal/witness/mountain.go`):

| Label | Purpose | Writer | Reader |
|---|---|---|---|
| `mountain` | Convoy participates in the mountain workflow | `internal/cmd/mountain.go:214` | `mountain.go:402`, `internal/witness/mountain.go:95` |
| `mountain:paused` | Mountain is paused | `internal/cmd/mountain.go:655` | `mountain.go:704` |
| `mountain:failures:<N>` | Failure-count label, swapped each retry | `internal/witness/mountain.go:210-212` | `internal/witness/mountain.go:196` |
| `mountain:skipped` | Mountain bead permanently skipped after max failures | `internal/witness/mountain.go:222` | `internal/cmd/mountain.go:434` |

**Description fields** (`ConvoyFields` `internal/beads/fields.go:257-265`):

| Key | Purpose | Notes |
|---|---|---|
| `Owner` | Convoy owner address (e.g. `mayor/`) | Title-cased on format (`fields.go:453`) |
| `Notify` | Additional notification address | `fields.go:456` |
| `Molecule` | Associated molecule / swarm ID | `fields.go:462` |
| `Merge` | Merge strategy (`direct`, `mr`, `local`) | `fields.go:459` |
| `base_branch` | Target branch for polecats | `fields.go:465` |
| `Watchers` | Comma-separated mail watchers | `fields.go:468` |
| `nudge_watchers` | Comma-separated nudge watchers | `fields.go:471` |

Unusual capitalization — `ConvoyFields` formats `Owner:`, `Notify:`,
`Merge:`, `Molecule:`, `Watchers:` title-cased (`fields.go:453-474`) but
the parser at `fields.go:294-316` matches case-insensitively. The
`base_branch` and `nudge_watchers` keys use snake_case both ways. Record
this inconsistency for the handbook.

**Handbook coverage**: `gt:owned` noted. `gt:convoy` (reader-only),
mountain labels, seven ConvoyFields keys all missing.

## 11. Attachment substrate (pinned beads)

The attachment substrate is *not* a bead kind — it's a set of
description fields written onto pinned beads (e.g. handoff beads) when
sling attaches a molecule. See `AttachMolecule` at
`internal/beads/handoff.go:206-241` and `DetachMoleculeWithAudit` at
`internal/beads/audit.go:32-81`.

**Description fields** (`AttachmentFields`
`internal/beads/fields.go:15-29`):

| Key | Purpose |
|---|---|
| `attached_molecule` | Root issue ID of the attached molecule |
| `attached_formula` | Formula name (e.g. `mol-polecat-work`) for inline step display |
| `attached_at` | RFC 3339 timestamp |
| `attached_args` | Natural-language args passed via `gt sling --args` (no-tmux mode) |
| `attached_vars` | JSON array of formula `--var` values |
| `dispatched_by` | Agent ID that dispatched (for completion notification) |
| `no_merge` | `true` if `gt done` should skip the merge queue |
| `review_only` | `true` for evaluate-and-report-back dispatches |
| `mode` | `ralph` for Ralph-Wiggum retry loop |
| `convoy_id` | Convoy bead ID tracking this issue |
| `merge_strategy` | `direct`, `mr`, `local` |
| `convoy_owned` | `true` if convoy has `gt:owned` (caller-managed lifecycle) |
| `formula_vars` | Newline-separated `key=value` pairs for template substitution |

**Key-alias tolerance**: every key accepts three forms (e.g.
`attached_molecule` / `attached-molecule` / `attachedmolecule`). See the
switch at `fields.go:60-100` and the `attachmentKeys` map at
`fields.go:166-205` used by `SetAttachmentFields` to strip old forms.

**Audit trail**: detach writes JSONL entries to
`<beads-dir>/audit.log` via `LogDetachAudit` `audit.go:86-115`.
Entries include `operation` (detach/burn/squash), `detached_molecule`,
`detached_by`, `reason`, `previous_state`, timestamp.

**Handbook coverage**: handbook does not mention attachment fields at
all. All thirteen keys need handbook coverage because they drive the
dispatch / hook / done contract.

## 12. Sling-context bead

**Label**: `gt:sling-context` — constant
`capacity.LabelSlingContext` at
`internal/scheduler/capacity/pipeline.go:40-41`.
**Type**: `task` with `--ephemeral` (`beads_sling_context.go:43-47`).

**Description substrate**: pure JSON (no key:value overlay) — see
`FormatSlingContextDescription` at `beads_sling_context.go:14-20`:

```go
func FormatSlingContextDescription(fields *capacity.SlingContextFields) string {
    b, err := json.Marshal(fields)
    ...
}
```

The comment at `:11-13` explains why: "the context bead description is
entirely scheduler-owned, so we use JSON instead of key-value lines — no
user content collision, no delimiter."

**Fields** (`capacity.SlingContextFields`
`internal/scheduler/capacity/pipeline.go:16-38`):

| Key | Purpose |
|---|---|
| `version` | Schema version (int) |
| `work_bead_id` | The actual work bead this context tracks |
| `target_rig` | Rig the work is destined for |
| `formula` | Formula name, optional |
| `args` | Natural-language args |
| `vars` | `--var` values |
| `enqueued_at` | When sling enqueued this |
| `merge` | Merge strategy |
| `convoy` | Convoy ID |
| `base_branch` | Target branch |
| `no_merge` | Skip merge queue |
| `review_only` | Report-only mode |
| `account` | Account to bill |
| `agent` | Specific agent binding |
| `hook_raw_bead` | Dispatch raw bead directly |
| `owned` | Caller-managed lifecycle |
| `mode` | Execution mode |
| `dispatch_failures` | Runtime failure counter |
| `last_failure` | Last failure description |

**Tracks dependency**: on create, a `tracks` dep is wired
context-bead → work-bead (`beads_sling_context.go:65-70`). This is how
the context finds its work.

**Handbook coverage**: `gt:sling-context` noted; the 19 JSON fields are
not catalogued. Because this bead's description is JSON (not key:value)
the handbook should call out the distinction — this is a second
"description is JSON" case alongside merge-slot.

## 13. Delegation (the only metadata-column convention)

**Label**: none. Delegation is unique among gastown conventions: it uses
the JSON `metadata` column, not the description field.

**Metadata key**: `delegated_from` — written by `AddDelegation`
(`beads_delegation.go:55-85`) via `bd update --set-metadata`, read by
`GetDelegation` (`beads_delegation.go:111-119`) and
`parseDelegationFromMetadata` (`beads_delegation.go:123-149`).

**Value shape** — `Delegation` struct
`beads_delegation.go:17-35`:

```json
{
  "parent": "<work-unit-id>",
  "child":  "<work-unit-id>",
  "delegated_by":  "<hop:// uri or actor>",
  "delegated_to":  "<hop:// uri or actor>",
  "terms": {
    "portion": "...",
    "deadline": "...",
    "acceptance_criteria": "...",
    "credit_share": 50
  },
  "created_at": "..."
}
```

**Side effect**: `AddDelegation` also adds a bd dependency (child blocks
parent) so the parent can't close until the child is done
(`beads_delegation.go:79-82`).

**Provenance note** at `beads_delegation.go:52-54`: "The bd slot command
was removed in v0.62; metadata is the replacement storage." — delegation
is the *only* convention that had to move off `bd slot` and landed on
metadata rather than description fields.

**Handbook coverage**: missing entirely from the handbook gastown
section. The handbook says "Gastown uses labels (not metadata) for most
orchestration hints" (`metadata-conventions.md:211-213`); that's true
but incomplete — `metadata.delegated_from` is the one exception and it
should be documented.

## 14. Mail message beads and mail labels

**Label**: `gt:message` — writer
`internal/mail/router.go:237,1258,1343,1429`; reader
`internal/mail/mailbox.go:165,211` (used as `--label=gt:message` list
filter).

**Label families written to every message** — `buildLabels`
`internal/mail/router.go:235-255`:

| Label | Purpose | Writer line |
|---|---|---|
| `gt:message` | Always | `router.go:237` |
| `gt:escalation` | If `msg.Type == TypeEscalation` | `router.go:239` |
| `from:<address>` | Sender (mirrors `bm.sender`) | `router.go:241` |
| `msg-type:<type>` | `user`, `nudge`, `escalation`, `reply`, `task`, … | `router.go:242` |
| `thread:<id>` | Mail thread id (optional) | `router.go:245` |
| `reply-to:<id>` | Reply target (optional) | `router.go:248` |
| `cc:<identity>` | Per CC recipient | `router.go:252` |
| `delivery:pending` | Phase-1 delivery marker | `internal/mail/delivery.go:21,29` (`DeliveryLabelPending`) |

**Phase-2 delivery ack labels** (`internal/mail/delivery.go:21-77`):

| Label | Purpose |
|---|---|
| `delivery:acked` | Recipient acknowledged |
| `delivery-acked-by:<identity>` | Per-recipient ack |
| `delivery-acked-at:<RFC3339>` | Ack timestamp |

`DeliveryAckLabelSequence` `:35-41` and the idempotent variant at
`:54-77` write these atomically. Reader at `:143-150`.

**Additional mail labels** by path:

| Label | Purpose | Writer | Reader |
|---|---|---|---|
| `channel:<name>` | Channel-scoped message | `router.go:1431` | `internal/mail/types.go:356-357`; channel retention `beads_channel.go:404,477` |
| `queue:<name>` | Queue-scoped message | `router.go:1260`; `internal/cmd/mail_queue.go:178` | `internal/cmd/mail_queue.go:234` |
| `announce:<name>` | Announce-board message | `router.go:1345`; list at `:1525-1527` | routing `router.go:105-110` |
| `list:<name>` | Mailing-list expansion | routing prefix `router.go:83-90` | `internal/mail/resolve.go:85` |
| `read` | Mail marked read | `internal/mail/mailbox.go:622`; store path `internal/mail/store.go:141` | `internal/mail/types.go:424`; mailbox filter `mailbox.go:445,606` |
| `claimed-by:<identity>` | Queue item claimed | ? (no explicit writer found in non-test paths — suggests intended write path via `bd update`) | `internal/mail/types.go:358-359`, `internal/cmd/mail_queue.go:233-234` |

**Priority**: mail uses `bead.Priority` (the column), not a `priority:*`
label. The `priority:*` string observed in the broader-repo search is
present only in test fixtures — verified by grepping for
`"priority:<level>"` in non-test paths (no hits). Contrast with the
handbook's gascity table which lists a `priority:<0-9>` label — gastown
has **no such label convention**. Flag for handbook.

**Handbook coverage**: partial. Handbook lists `gt:message`,
`severity:*`, `channel:<name>`; misses `from:*`, `msg-type:*`,
`thread:*`, `reply-to:*`, `cc:*`, `read`, `announce:*`, `list:*`,
`claimed-by:*`, all five `delivery:*` / `delivery-acked-*` variants.

## 15. Protected / lifecycle labels

From `IsProtectedBead` at `internal/beads/beads.go:254-265`:

| Label | Purpose |
|---|---|
| `gt:standing-orders` | Persistent orders for an agent — reader-only in current tree (no writer); mentioned at `beads.go:260`, reaper `internal/reaper/reaper.go:603` |
| `gt:keep` | Wisp preservation flag — constant `KeepLabel` at `internal/wisp/promotion.go:10`; reader `compact.go:463`, `promotion.go:46-51` |
| `gt:role` | Role bead (historical: label added at creation per CHANGELOG #383) — reader-only in current non-test tree; writer presumably in removed/external code |
| `gt:rig` | Rig identity bead (cross-ref §6) |

`IsProtectedBead` is called by AutoClose / polecat-removal cleanup to
avoid destroying pinned identity beads.

**Handbook coverage**: `gt:standing-orders`, `gt:keep` are noted in
the handbook (implicitly via the metadata-conventions table). But the
fact that `IsProtectedBead` is the single gating function should be
documented so UIs don't unilaterally hide/close protected beads.

## 16. Role, molecule, and task labels

**`gt:role`**: historically applied to role beads; only readers present
in the current tree. Per `CHANGELOG.md:1133` — "gt:role label on role
beads - Role beads now properly labeled during creation (#383)". Writer
presumably moved / removed. `internal/cmd/ready.go:421` and
`internal/doctor/integration_test.go` confirm the reader contract.

**`gt:standing-orders`**: same — reader-only in the current tree. Flag
for handbook as possible vestigial-writer case.

**`gt:task`**: generic task label — writers at
`internal/beads/handoff.go:82`, `internal/beads/molecule.go:418`,
`internal/cmd/molecule_lifecycle.go:285`. Also produced dynamically at
`beads.go:1061` — `"gt:" + issueType` so any issue type N gets a
`gt:N` label.

**`gt:molecule`**: same dynamic mechanism
(`beads.go:1066`, `molecule.go:324` — `"gt:" + stepType`). Readers at
`internal/web/fetcher.go:1703-1708`.

**`gt:wisp`**: reader-only (`internal/web/fetcher.go:1708`). The
dynamic-label path `"gt:" + stepType` at `molecule.go:324` is the most
likely writer for `stepType="wisp"`.

**`gt:bug`, `gt:epic`**: dynamic-label path at `beads.go:1061-1066`
(`"gt:" + issueType`). Also hard-coded `Label: "gt:bug"` at
`beads.go:1367`.

**RoleConfig description fields** (on role beads,
`fields.go:864-915`):

| Key | Purpose |
|---|---|
| `session_pattern` | Tmux session-name template with `{rig}/{name}/{role}` placeholders |
| `work_dir_pattern` | Working-directory template with `{town}/{rig}/{name}/{role}` placeholders |
| `needs_pre_sync` | Agent needs `git sync` before start |
| `start_command` | Launch command (default `exec claude --dangerously-skip-permissions`) |
| `env_var` | `KEY=VALUE` env entries (repeatable) |
| `ping_timeout` | Health-check response timeout |
| `consecutive_failures` | Failed health checks before force-kill |
| `kill_cooldown` | Minimum time between force-kills |
| `stuck_threshold` | Wisp in-progress timeout |
| `wisp_ttl_<type>` | Per-wisp-type TTL override (e.g. `wisp_ttl_patrol: 48h`) |

**Provenance fields on instantiated molecule steps**
(`molecule.go:315,410-413`):

| Key | Purpose |
|---|---|
| `instantiated_from` | Molecule ID that was instantiated |
| `template_step` | Template step ID (new-format molecules) |
| `step` | Step ref (old-format markdown molecules) |
| `tier` | Optional LLM-tier hint (`haiku` / `sonnet` / `opus`) |

**Molecule-definition description fields** (read by
`ParseMoleculeSteps` `molecule.go:71-156`):

| Key | Purpose |
|---|---|
| `## Step: <ref>` | Step header |
| `Needs:` | Inter-step dependencies |
| `Tier:` | `haiku` / `sonnet` / `opus` |
| `Type:` | `task` (default) or `wait` |
| `Backoff:` | `base=30s, multiplier=2, max=10m` for wait-type steps |
| `WaitsFor:` | Dynamic wait (e.g. `all-children`) |

These live on the molecule-template bead's description; UIs for
browsing molecules need to parse this markdown-ish format.

**Handbook coverage**: `gt:task`, `gt:bug`, `gt:epic`, `gt:molecule`,
`gt:wisp` dynamic label construction is missing. `RoleConfig` fields
are missing. Molecule-definition fields are missing. Molecule-step
provenance fields (`instantiated_from`, `step`, `tier`) are missing.

## 17. Witness / polecat labels

| Label | Purpose | Writer | Reader |
|---|---|---|---|
| `polecat:<name>` | Identifies which polecat the bead is for | `internal/witness/handlers.go:571`; `internal/witness/protocol.go:579` | `internal/witness/handlers.go:800` |
| `state:merge-requested` | Polecat state flag | `internal/witness/handlers.go:571` | — |
| `done-intent:<type>:<unix-ts>` | Written on the agent bead by `gt done` to signal witness | `internal/cmd/done.go:1342` | `internal/witness/handlers.go:2551` |

**Handbook coverage**: all three are missing.

## 18. Location, rig, from labels

From `internal/plugin/recording.go:60-64`:

| Label | Purpose |
|---|---|
| `rig:<name>` | Associates a plugin-run bead with its rig |
| `plugin:<name>` | Plugin identifier |

From dog path `internal/beads/beads_dog.go:19-20`:

| Label | Purpose |
|---|---|
| `rig:town` | Marks the bead as town-level (dogs run at town scope) |
| `location:<path>` | Dog working directory / location |

## 19. Per-label summary table

| Label | On what bead | Writer | Reader |
|---|---|---|---|
| `gt:agent` | agent identity | `beads_agent.go:238`; `beads_dog.go:17`; doctor fixups | `IsAgentBead` `beads.go:246-248`; mail router; list filter |
| `gt:bug` | bug issue | `beads.go:1367`; dynamic from type `beads.go:1061` | `ListBugs` |
| `gt:channel` | channel bead | `beads_channel.go:159` | `beads_channel.go:194,213,331`; mail router |
| `gt:convoy` | convoy bead | no writer found in tree | `sling_schedule.go:393`; `web/fetcher.go:1708` |
| `gt:epic` | epic issue | dynamic from type `beads.go:1061` | — |
| `gt:escalation` | escalation bead | `beads_escalation.go:177`; mail router `router.go:239` | `beads_escalation.go:214,242,278,288` |
| `gt:group` | mail group bead | `beads_group.go:164` | `beads_group.go:199,218,322` |
| `gt:keep` | wisp-preserve flag | no direct write site found; added by hand or from external tool | `wisp/promotion.go:46-51`; `compact.go:463` |
| `gt:merge-request` | MR bead | `done.go:1049`; `mq_submit.go:272`; refinery | list filters; refinery engineer; MR lookup |
| `gt:merge-slot` | merge-slot bead (JSON desc) | `beads_merge_slot.go:76` | `beads_merge_slot.go:58` |
| `gt:message` | mail message | `mail/router.go:237,1258,1343,1429`; `mail/store.go:76`; `mailbox.go:165,211` | mailbox listing; channel retention; extensively |
| `gt:molecule` | molecule or molecule step | dynamic `"gt:" + stepType` `molecule.go:324` | `web/fetcher.go:1708` |
| `gt:owned` | convoy opt-out from auto-close | `convoy.go:705`; `sling_convoy.go:335,400` | `convoy.go:1182,1793,1932,2030,2071`; `sling_convoy.go:185` |
| `gt:owned-direct` | MR opt-out from refinery | no writer found | `refinery/engineer.go:1628` |
| `gt:queue` | queue bead | `beads_queue.go:183` | `beads_queue.go:216,275` |
| `gt:rig` | rig identity bead | `beads_rig.go:156` | `beads_rig.go:194,213,253`; `done.go:1549` |
| `gt:role` | role bead | no writer in current non-test tree (see §16) | `ready.go:421`; doctor tests |
| `gt:sling-context` | scheduler context bead | constant `LabelSlingContext` via `beads_sling_context.go:47` | `beads_sling_context.go:96` |
| `gt:standing-orders` | persistent orders bead | no writer in current tree | `beads.go:260`; `reaper.go:603` |
| `gt:task` | generic work bead | `handoff.go:82`; `molecule.go:418`; `molecule_lifecycle.go:285`; dynamic | ubiquitous |
| `gt:wisp` | wisp bead (typed) | dynamic from stepType | `web/fetcher.go:1708` |
| `role_type:dog` | dog discriminator | `beads_dog.go:18` | `beads_dog.go:72` |
| `role_type:*` (as **label** for dogs) | only `dog` writes this as a label | as above | dog lookup |
| `severity:critical`/`high`/`medium`/`low` | escalation severity index | `beads_escalation.go:182,420` | `beads_escalation.go:306`; `internal/web/fetcher.go:1298-1299`; `escalate_impl.go:151` |
| `channel:<name>` | message↔channel join | `mail/router.go:1431` | `mail/types.go:356-357`; retention `beads_channel.go:404,477` |
| `queue:<name>` | message↔queue join | `mail/router.go:1260`; `mail_queue.go:178` | `mail_queue.go:234` |
| `announce:<name>` | announce-board join | `mail/router.go:1345,1527` | routing `router.go:105-110` |
| `from:<address>` | message sender | `mail/router.go:241,1259,1344,1430` | `mail/types.go:344-345` |
| `msg-type:<type>` | message kind | `mail/router.go:242` | `mail/types.go:350-351` |
| `thread:<id>` | mail thread | `mail/router.go:245` | `mail/types.go:346-347`; `web/api.go:433` |
| `reply-to:<id>` | reply target | `mail/router.go:248` | `mail/types.go:348-349` |
| `cc:<identity>` | CC recipient | `mail/router.go:252`; `mailbox.go:209` | `mail/types.go:352-353`; `mailbox.go:311` |
| `read` | mail read state | `mailbox.go:622`; `store.go:141` | `types.go:424`; `mailbox.go:445,606` |
| `claimed-by:<identity>` | queue-item claimant | no explicit writer found | `types.go:358-359`; `mail_queue.go:233` |
| `delivery:pending` | mail phase-1 | `delivery.go:29` | `delivery.go:143` |
| `delivery:acked` | mail phase-2 | `delivery.go:40,76` | `delivery.go:145` |
| `delivery-acked-by:<identity>` | per-recipient ack | `delivery.go:38,74` | `delivery.go:147-148` |
| `delivery-acked-at:<RFC3339>` | ack timestamp | `delivery.go:39,75` | `delivery.go:149-150` |
| `acked` | escalation acknowledged | `beads_escalation.go:228` | `beads_escalation.go:335`; `escalate_impl.go:297` |
| `resolved` | escalation resolved | `beads_escalation.go:257` | — |
| `reescalated` | escalation bumped | `beads_escalation.go:420` | — |
| `mountain` | convoy in mountain workflow | `mountain.go:214` | `mountain.go:402`; `witness/mountain.go:95` |
| `mountain:paused` | mountain paused | `mountain.go:655` | `mountain.go:704` |
| `mountain:failures:<N>` | failure count | `witness/mountain.go:210-212` | `witness/mountain.go:196` |
| `mountain:skipped` | permanently skipped | `witness/mountain.go:222` | `mountain.go:434` |
| `status:docked` | rig docked | `rig_dock.go:166` (constant `RigDockedLabel` `:23`) | `rig_dock.go:232`; `rig_helpers.go:139`; `rig.go:2384` |
| `status:parked` | rig parked | — (external trigger) | `rig_park.go:191`; `rig_helpers.go:136` |
| `rig:town` | dog town-scope marker | `beads_dog.go:19,111` | dog lookup |
| `rig:<name>` | plugin-recording rig link | `plugin/recording.go:60-64` | formula overlay `formula_overlay_show.go:71` |
| `plugin:<name>` | plugin-run identifier | `plugin/recording.go:60,143` | `dog/session_manager.go:107` |
| `location:<path>` | dog location | `beads_dog.go:20,112` | mail router `router.go:558-559` |
| `polecat:<name>` | polecat identity | `witness/handlers.go:571`; `witness/protocol.go:579` | `witness/handlers.go:800` |
| `state:merge-requested` | polecat state | `witness/handlers.go:571` | — |
| `done-intent:<type>:<unix-ts>` | witness hand-off signal | `cmd/done.go:1342` | `witness/handlers.go:2551` |
| `digest` | molecule digest (patrol output) | `molecule_lifecycle.go:296` | patrol / cost analysis |

## 20. Per-description-field summary table

Grouped by owning concept. "On what bead" uses the label column for
the type.

### Agent beads (`gt:agent`)
`role_type`, `rig`, `agent_state`, `hook_bead`, `cleanup_status`,
`active_mr`, `notification_level`, `mode`, `exit_type`, `mr_id`,
`branch`, `mr_failed`, `push_failed`, `completion_time`.

### Dog beads (`gt:agent` + `role_type:dog`)
`role_type`, `rig`, `location`.

### Channel beads (`gt:channel`)
`name`, `subscribers`, `status`, `retention_count`,
`retention_hours`, `created_by`, `created_at`.

### Group beads (`gt:group`)
`name`, `members`, `created_by`, `created_at`.

### Queue beads (`gt:queue`)
`name`, `claim_pattern`, `status`, `max_concurrency`,
`processing_order`, `available_count`, `processing_count`,
`completed_count`, `failed_count`, `created_by`, `created_at`.

### Rig beads (`gt:rig`)
`repo`, `prefix`, `state`.

### Escalation beads (`gt:escalation`)
`severity`, `reason`, `source`, `escalated_by`, `escalated_at`,
`acked_by`, `acked_at`, `closed_by`, `closed_reason`,
`related_bead`, `original_severity`, `reescalation_count`,
`last_reescalated_at`, `last_reescalated_by`.

### Merge-request beads (`gt:merge-request`)
`branch`, `target`, `source_issue`, `worker`, `rig`, `commit_sha`,
`merge_commit`, `close_reason`, `agent_bead`, `retry_count`,
`last_conflict_sha`, `conflict_task_id`, `convoy_id`,
`convoy_created_at`, `pre_verified`, `pre_verified_at`,
`pre_verified_base`.

### Convoy beads (`type=convoy`)
`Owner`, `Notify`, `Molecule`, `Merge`, `base_branch`, `Watchers`,
`nudge_watchers`.

### Attachments on pinned beads (e.g. handoff)
`attached_molecule`, `attached_formula`, `attached_at`,
`attached_args`, `attached_vars`, `dispatched_by`, `no_merge`,
`review_only`, `mode`, `convoy_id`, `merge_strategy`,
`convoy_owned`, `formula_vars`.

### Role beads (`gt:role`)
`session_pattern`, `work_dir_pattern`, `needs_pre_sync`,
`start_command`, `env_var`, `ping_timeout`,
`consecutive_failures`, `kill_cooldown`, `stuck_threshold`,
`wisp_ttl_<type>`.

### Molecule-definition beads (markdown-ish)
`## Step: <ref>`, `Needs:`, `Tier:`, `Type:`, `Backoff:`,
`WaitsFor:`.

### Molecule-step provenance (instantiated children)
`instantiated_from`, `template_step`, `step`, `tier`.

### JSON-description beads (no key:value overlay)
- `gt:merge-slot` — `{"holder": "...", "waiters": [...]}`
- `gt:sling-context` — 19-field `SlingContextFields` JSON
- `gt:escalation` uses key:value, not JSON, despite being a
  scheduler-owned bead — distinct case worth noting.

## 21. Metadata-key summary table

A single entry: `delegated_from`. No namespace prefix. Value is a
JSON object matching the `Delegation` struct.

| Key | Purpose | Writer | Reader |
|---|---|---|---|
| `delegated_from` | Parent → child work-unit delegation record | `beads_delegation.go:72` (`--set-metadata=delegated_from=...`) | `beads_delegation.go:111-119,133` |

That's the whole list. There is no `gt.*` metadata namespace in the
current tree. No `sling.*`, no `convoy.*`, no `mountain.*`. The handbook
can say "gastown's metadata column has exactly one convention:
`delegated_from`" and be accurate.

## 22. Gaps flagged for handbook update

Concrete additions for `handbook/reference/metadata-conventions.md`
(or, given the volume, a new page specifically for gastown description
fields).

### 22.1 Reframe the gastown section

The handbook's `gt:*` table
(`metadata-conventions.md:215-225`) documents the labels but not the
substrate. The real gastown story is **three substrates**:

1. Labels (handbook's current scope).
2. Description fields — the bulk of the conventional data.
3. One metadata key (`delegated_from`).

Add an intro paragraph to §`gt:*` that names the three substrates and
points at the description-field table that should follow.

### 22.2 Add a description-field catalog

Mirroring this doc's §20 — a per-concept list of keys with pointers to
the Go struct definitions in `beads_*.go` / `fields.go`. For a UI this
is the primary need: rendering a gastown bead means parsing its
description.

### 22.3 Document the one metadata key

Add a row to the handbook's "metadata column conventions" section:

```
| Key | Owner | Purpose |
|---|---|---|
| `delegated_from` | gastown | JSON `Delegation` record. See
  gastown-conventions-deep-dive §13. |
```

### 22.4 Add missing labels

Additions to the handbook's gastown labels table (in current
`metadata-conventions.md:215-238` style):

| Label | On what bead | Notes |
|---|---|---|
| `gt:convoy` | convoy bead | Reader-only — canonical discriminator is `type=convoy` |
| `gt:owned` | convoy bead | Caller-managed lifecycle opt-out |
| `gt:owned-direct` | MR bead | Refinery-skip — **no writer in current tree, flag as vestigial** |
| `gt:keep` | wisp | Explicit preservation flag (`wisp/promotion.go:10`) |
| `gt:standing-orders` | pinned bead | Protected — no current writer; possibly vestigial |
| `gt:task` | any work bead | Also produced dynamically via `"gt:" + issueType` |
| `gt:molecule`, `gt:wisp`, `gt:bug`, `gt:epic` | type-derived | Dynamic `"gt:" + type` pattern at `beads.go:1061` |
| `msg-type:<type>` | message | `user`, `nudge`, `escalation`, `reply`, `task`, … |
| `thread:<id>` | message | Mail thread |
| `reply-to:<id>` | message | Reply target |
| `cc:<identity>` | message | Per CC recipient |
| `from:<address>` | message | Sender |
| `read` | message | Read state (unread = absence of label) |
| `queue:<name>` | message | Queue assignment |
| `announce:<name>` | message | Announce-board scope |
| `list:<name>` | routing prefix | Not bead-level — list-expansion address |
| `claimed-by:<identity>` | queue-item | Assignment; **writer not located in non-test paths** |
| `delivery:pending` / `delivery:acked` | message | Two-phase delivery state |
| `delivery-acked-by:<identity>`, `delivery-acked-at:<RFC3339>` | message | Per-recipient ack |
| `acked`, `resolved`, `reescalated` | escalation | State transitions |
| `mountain`, `mountain:paused`, `mountain:skipped`, `mountain:failures:<N>` | convoy | Mountain-workflow state |
| `status:docked`, `status:parked` | rig bead | Rig lifecycle state |
| `rig:<name>` | plugin-run bead | Plugin-recording rig link |
| `rig:town` | dog bead | Dog town-scope marker |
| `plugin:<name>` | plugin-run bead | Plugin identifier |
| `location:<path>` | dog bead | Working directory |
| `polecat:<name>` | witness-tracked bead | Polecat identity |
| `state:merge-requested` | polecat-tracked bead | Polecat state |
| `done-intent:<type>:<unix-ts>` | agent bead | Witness hand-off signal |
| `digest` | molecule | Digest wisp marker |

### 22.5 Clarify `role_type` duality

`role_type` is both a **label** (`role_type:dog` on dog beads) and a
**description field** (`role_type: polecat` on polecat beads). The
handbook should call this out. UIs need to check both the labels list
and the parsed description to render an agent's role.

### 22.6 Drop the priority label claim

The current handbook's gascity section has a `priority:<0-9>` label
(`metadata-conventions.md:286`). For **gastown** that label does not
exist — mail priority is the `bead.Priority` column (`0=urgent, 1=high,
2=normal, 3=low`, see `internal/mail/types.go:304`). If the handbook
adds a gastown mail section, make the distinction explicit.

### 22.7 JSON-in-description substrate

The handbook doesn't distinguish between beads whose description is
`key: value` lines and beads whose description is pure JSON
(`gt:merge-slot`, `gt:sling-context`). Add a callout — a UI that blindly
parses key:value will fail on JSON descriptions.

### 22.8 Protected-bead set

`IsProtectedBead` (`beads.go:254-265`) gates automated status changes
against four labels: `gt:standing-orders`, `gt:keep`, `gt:role`,
`gt:rig`. Add this as a named "protected label" group in the handbook —
UIs should treat these as "do not auto-close" flags.

## 23. Deprecated / vestigial

- `role_bead` description field — removed; referenced only in
  purge-notes at `beads_agent.go:46-48,92-93`. No current write site.
- bd `slot` command + its agent-bead role/hook slots — removed in
  v0.62 per `beads_agent.go:346-347,426-428` and `beads_delegation.go:52-54`.
  The description-field `hook_bead` is the replacement for the hook slot;
  role definitions moved to `internal/config/roles/*.toml`.
- `gt:standing-orders`, `gt:role`, `gt:owned-direct` — readers
  present, writers absent in current tree. Either external callers
  write these, the writers were removed, or they were never wired.
  Flag and decide per-label.
- `claimed-by:<identity>` mail label — same: reader in
  `internal/mail/types.go:358-359` and `internal/cmd/mail_queue.go:233`
  but no explicit write site found in the non-test tree.

## 24. Not conventions (disambiguation)

- **`metadata.json`** files under `.beads/` and per-rig — not bead
  metadata. These are bd configuration files
  (`dolt_mode`, `dolt_database`, `server_port`). See
  `internal/doltserver/doltserver.go:709-724`.
- **`.beads/redirect`** file — redirect substrate for crew/polecat
  worktrees, documented at
  `internal/beads/beads_redirect.go:26-70`. Not a bead-level convention.
- **`.beads/audit.log`** — detach/burn/squash JSONL audit stream
  (`internal/beads/audit.go:86-115`). Not a label or metadata key.
- **Role / role-type / agent state constants** in
  `internal/constants/constants.go:237-259,286-322` — these are Go
  constants naming agent roles and molecule formulas. They become
  **values** inside description fields and labels (e.g.
  `role_type: polecat`, `polecat:<name>`) but the constants themselves
  aren't conventions.
- **OTel / telemetry keys** — `internal/telemetry/recorder.go` defines
  many metric names prefixed with `gt.` or `gt_` — similar to the
  gascity `gc.*` OTel names, not bead metadata.
- **Formula / molecule TOML keys** — role configuration under
  `internal/config/roles/*.toml` has keys like `session_pattern`,
  `work_dir_pattern`. These *match* the description-field keys in
  `RoleConfig` (that's intentional — the role bead is derived from the
  TOML) but the TOML files are not beads.
- **`created_at` metadata on migration backups** (`cmd/dolt.go:1296`) —
  reads `b.Metadata["created_at"]` where `b` is a migration backup
  struct, not a bead.
- **Groups / lists / announces** (`@rig/...`, `@town`, `@witnesses` and
  so on at `internal/mail/router.go:299-341`) — mail-address syntax,
  not labels.

## 25. Summary — how gastown differs from gascity

Worth stating plainly for the handbook reader:

- **Gascity** puts orchestration data in a `metadata` JSON column (`gc.*`
  keys) plus a small label set. ~60 metadata keys, ~25 labels.
- **Gastown** puts orchestration data in the description field as
  `key: value` lines (or as JSON for two special bead kinds) plus a
  much larger label set. One metadata key (`delegated_from`). ~65
  distinct description-field keys, ~60 label patterns.

If you're building a "convention pack" abstraction (per the UI review
§2), the gastown pack needs:

- A description-field parser (`fields.go` style) as the primary
  extractor.
- A per-bead-kind field catalog (matching this doc's §20).
- A label catalog (matching §19).
- A single metadata-key entry (`delegated_from`).
- Knowledge of which bead kinds use JSON descriptions rather than
  key:value (merge-slot, sling-context).

The gascity pack, by contrast, primarily needs a metadata-key catalog
and a much smaller label catalog.

## 26. See also

- [04-gastown-integration.md](04-gastown-integration.md) §6 — the
  broader description-field substrate discussion.
- [gascity-metadata-deep-dive.md](gascity-metadata-deep-dive.md) —
  methodology and structural template.
- [handbook/reference/metadata-conventions.md](handbook/reference/metadata-conventions.md) —
  target for handbook updates.
- [ui-review.md](ui-review.md) §2 — convention-pack model that this
  audit feeds.
