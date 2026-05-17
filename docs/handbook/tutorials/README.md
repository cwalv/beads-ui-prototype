# Tutorials

Learning-oriented walkthroughs. Each tutorial assumes a clean sandbox
and walks you through creating something end-to-end.

If you want to *understand* what's happening, read the linked
[explanation/](../explanation/README.md) docs after each tutorial. If
you want the *reference*, those live at
[reference/](../reference/README.md).

## Contents

| Tutorial | Goal | Prereqs |
|---|---|---|
| [01-your-first-bead.md](01-your-first-bead.md) | Create, list, and close a bead. Understand the CRUD loop. | `bd` installed. |
| [02-working-with-dependencies.md](02-working-with-dependencies.md) | Add `blocks` + `parent-child` deps. Watch `bd ready` respond. | Tutorial 01. |
| [03-pouring-a-formula.md](03-pouring-a-formula.md) | Write a TOML formula; cook it; pour; follow with `bd mol current`. | Tutorial 02. |
| [04-exchanging-mail.md](04-exchanging-mail.md) | Wire `bd mail` to a delegate; send and read a message. | Tutorial 01. |
| [05-memory-and-context.md](05-memory-and-context.md) | Use `bd remember` + `bd prime`. See memory flow into a session. | `bd` installed. |

## Suggested order

If you're starting from zero:

```
01 → 02 → 03 → 04 → 05
```

If you're building a UI and want to understand the primitives:

```
01 → 02 → 03 → 05 → 04
```

## What tutorials are NOT

- Not a complete reference — see [reference/](../reference/README.md).
- Not deep explanations — see [explanation/](../explanation/README.md).
- Not recipes for specific tasks — see [how-to/](../how-to/README.md).

They're the fastest path from "I have `bd` installed" to "I understand
how a bead works."
