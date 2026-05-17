# Tutorial 4: Exchanging mail

Goal: wire `bd mail` to a minimal delegate; send and read a message.

## Context

`bd mail` in beads is a **delegate protocol** — it shells out to
whatever you configure. Without a delegate, `bd mail` prints setup
instructions and exits 1.

Both gastown and gascity provide their own `gt mail` / `gc mail`
implementations (storing messages as beads of `type=message`). This
tutorial uses a minimal shell script as the delegate to show the
mechanism.

## Prereqs

- Completed [tutorial 1](01-your-first-bead.md).

## Step 1: see the delegate requirement

```
$ bd mail
Error: no mail delegate configured.
Set one of:
  - BEADS_MAIL_DELEGATE env var
  - BD_MAIL_DELEGATE env var
  - bd config set mail.delegate "<command>"
```

## Step 2: implement a delegate

Use the fact that `type=message` is a built-in type and write messages
as beads directly.

```
$ cat > /tmp/bd-mail-delegate.sh <<'EOF'
#!/bin/bash
# Minimal beads-backed mail delegate.
# Usage:
#   bd mail send <to> [subject] [-m body | --message body]
#   bd mail inbox [--assignee <me>]
#   bd mail read <id>

set -e

sub="$1"; shift

case "$sub" in
  send)
    to="$1"; shift
    subject=""
    body=""
    while [[ $# -gt 0 ]]; do
      case "$1" in
        -s|--subject) subject="$2"; shift 2 ;;
        -m|--message) body="$2"; shift 2 ;;
        --notify) shift ;;  # ignore orchestrator flags
        *) subject="${subject:-$1}"; shift ;;
      esac
    done
    title="${subject:-${body:0:80}}"
    bd create "$title" \
      --type message \
      -d "$body" \
      --assignee "$to" \
      --labels "thread:$(openssl rand -hex 4)"
    ;;
  inbox)
    assignee="$(whoami)"
    [[ "$2" == "--assignee" ]] && assignee="$3"
    bd list --type message --assignee "$assignee" --status open
    ;;
  read)
    id="$1"
    bd show "$id"
    bd label "$id" --add read
    ;;
  *)
    echo "usage: bd mail {send,inbox,read}" >&2
    exit 1
    ;;
esac
EOF
$ chmod +x /tmp/bd-mail-delegate.sh
```

Key conventions this delegate uses (matches gastown/gascity):

- Messages are beads with `type="message"`.
- Sender encoded in `sender` column (left empty here; real delegates
  set it).
- Recipient is `assignee`.
- Read state is the `read` label.
- Thread is the `thread:<id>` label.

## Step 3: configure bd to use the delegate

```
$ bd config set mail.delegate "/tmp/bd-mail-delegate.sh"
```

Verify:

```
$ bd config get mail.delegate
/tmp/bd-mail-delegate.sh
```

## Step 4: send a message

```
$ bd mail send alice --subject "Hi" -m "First mail via bd!"
✓ Created bd-tutorial-msg-abc (via delegate)
```

Look at the bead:

```
$ bd list --type message
○ bd-tutorial-msg-abc · Hi [P2 · OPEN]
```

```
$ bd show bd-tutorial-msg-abc
bd-tutorial-msg-abc · Hi    [P2 · OPEN]
Type: message
Assignee: alice
Labels: thread:3f4a5b6c

DESCRIPTION
First mail via bd!
```

## Step 5: read the inbox

Playing alice:

```
$ bd mail inbox --assignee alice
○ bd-tutorial-msg-abc · Hi [P2 · OPEN] thread:3f4a5b6c
```

Read it (marks it as read):

```
$ bd mail read bd-tutorial-msg-abc
bd-tutorial-msg-abc · Hi    [P2 · OPEN]
...
✓ added label: read
```

Now the inbox filter can exclude read messages:

```
$ bd list --type message --assignee alice --status open --label-pattern "^(?!read$).*" --no-labels
(empty — only message was read)
```

## Step 6: see how this maps to orchestrators

**Gastown** (`gt mail`): same data shape. Adds `gt:message` label,
richer from/to routing via groups and channels. `internal/mail/beadmail/beadmail.go:30-57`.

**Gascity** (`gc mail`): same data shape; label-based threading
(same as here), `read` label for state. `internal/mail/beadmail/beadmail.go:30-57`.

Both use the Store interface directly rather than shelling out to
`bd mail`. The delegate pattern is the exposed contract for tools
that don't write bd in-process.

## Step 7: close (archive) the message

```
$ bd close bd-tutorial-msg-abc --reason archived
✓ Closed bd-tutorial-msg-abc
```

## Gotchas

- **No threading via `DepRepliesTo`.** Beads schema supports it; no
  orchestrator uses it. Stick with labels. See
  [gaps-audit §A3](../../gaps-audit.md).
- **`bd mail` flags pass through verbatim** (`DisableFlagParsing` at
  `cmd/bd/mail.go:38`). Your delegate gets full control of argv.
- **No aggregate operations.** The bd side just dispatches; your
  delegate implements send/read/inbox/archive/thread.
- **Gastown and gascity re-invent some mail semantics.** E.g.,
  gastown has channels (named pub/sub streams) and groups
  (distribution lists) that aren't in bd. A generic beads-ui shows
  plain messages; orchestrator-specific UIs show channels and groups.

## Next up

- [Tutorial 5: memory and context](05-memory-and-context.md) — use
  `bd remember` + `bd prime` for persistent context.

## See also

- [../reference/bd-commands.md#collaboration-primitives](../reference/bd-commands.md#collaboration-primitives)
  — mail / memory / human command catalog.
- [../explanation/agent-coordination.md](../explanation/agent-coordination.md) — mail in context.
