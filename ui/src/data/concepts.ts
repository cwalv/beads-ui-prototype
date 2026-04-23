export interface Concept {
  title: string;
  body: string[];
  kbd?: string;
  cli?: string;
  docHref?: string;
  seeAlso?: string[];
}

export const concepts: Record<string, Concept> = {
  // ── Authoring ──────────────────────────────────────────────────────────────

  formula: {
    title: 'Formula',
    body: [
      'A TOML file that defines a reusable workflow template: its variables, steps, and metadata. Formulas live in your repo and are versioned with your code.',
      'When you "pour" a formula you stamp its variables into a live molecule that agents execute.',
    ],
    docHref: 'docs/formulas.md',
    seeAlso: ['molecule', 'step', 'var'],
  },

  step: {
    title: 'Step',
    body: [
      'A single unit of work inside a formula. Steps declare what an agent should do, what they depend on (needs), and how to handle failures (retry, on_exhausted).',
      'Steps are executed in dependency order; independent steps may run in parallel.',
    ],
    docHref: 'docs/formulas.md#steps',
    seeAlso: ['formula', 'needs', 'retry'],
  },

  var: {
    title: 'Var',
    body: [
      'A typed variable declared at the top of a formula. Vars are substituted into step titles at pour time — e.g. {{issue}} becomes the actual issue id.',
      'Required vars must be supplied at pour time; optional vars fall back to their default value.',
    ],
    docHref: 'docs/formulas.md#variables',
    seeAlso: ['formula', 'molecule'],
  },

  kind: {
    title: 'Formula kind',
    body: [
      '"workflow" formulas run as stand-alone molecules. "aspect" formulas are mixed into other formulas via extends — they add steps or vars without being poured directly.',
      'Leaving kind unset is valid; the runner treats it as a workflow.',
    ],
    docHref: 'docs/formulas.md#formula-kinds',
    seeAlso: ['formula', 'extends'],
  },

  extends: {
    title: 'Extends',
    body: [
      'Inherit steps and vars from one or more aspect formulas. The extending formula can override individual fields and add its own steps.',
      'Useful for sharing common scaffolding (setup, teardown, review gates) across many workflows.',
    ],
    docHref: 'docs/formulas.md#extending-formulas',
    seeAlso: ['kind', 'formula'],
  },

  contract: {
    title: 'Contract',
    body: [
      'A named interface a formula declares it satisfies. Other formulas or rules can depend on a contract rather than a specific formula name.',
      'Used to allow formula substitution while keeping downstream dependencies stable.',
    ],
    docHref: 'docs/formulas.md#contracts',
    seeAlso: ['extends', 'formula'],
  },

  // ── Step semantics ──────────────────────────────────────────────────────────

  retry: {
    title: '↻ Retry',
    body: [
      'A step can be retried automatically on failure. max_attempts sets the ceiling; on each failure the agent re-runs the step from scratch.',
      'When attempts are exhausted the on_exhausted policy determines whether the molecule hard-fails or continues with the step marked as failed.',
    ],
    cli: 'retry:\n  max_attempts: 3\n  on_exhausted: soft_fail',
    docHref: 'docs/formulas.md#retry',
    seeAlso: ['on_exhausted', 'step'],
  },

  on_exhausted: {
    title: 'on_exhausted',
    body: [
      'Controls what happens when a step exhausts its retry budget. Four options:',
      '• hard_fail — the molecule stops immediately (default).\n• soft_fail — the step is marked failed but the molecule continues.\n• skip — the step is silently skipped; downstream steps still run.\n• human — execution pauses until a human resolves the step.',
    ],
    docHref: 'docs/formulas.md#on_exhausted',
    seeAlso: ['retry'],
  },

  'continuation-group': {
    title: '⎇ Continuation group',
    body: [
      'Steps in the same continuation_group resume in the same agent session across reruns. The session is kept alive (or restored) so the agent has its conversation history intact.',
      'Useful for multi-step flows where state builds up across turns — code review rounds, iterative debugging.',
    ],
    cli: 'gc.continuation_group = "review-loop"',
    docHref: 'docs/formulas.md#session-affinity',
    seeAlso: ['session-affinity'],
  },

  'session-affinity': {
    title: '📌 Session affinity',
    body: [
      'Requires this step to run in the same session as its predecessors — not a fresh agent. The runner will wait for the session rather than spawn a new one.',
      'Use when the step\'s work depends on context accumulated in earlier turns of the same conversation.',
    ],
    cli: 'gc.session_affinity = "require"',
    docHref: 'docs/formulas.md#session-affinity',
    seeAlso: ['continuation-group'],
  },

  needs: {
    title: 'Needs / dependencies',
    body: [
      'The needs list on a step declares which other steps must complete before this one starts. It drives the DAG layout and execution ordering.',
      'Steps with empty needs lists run first (in parallel if allowed); the graph is validated for cycles at formula load time.',
    ],
    docHref: 'docs/formulas.md#dependencies',
    seeAlso: ['step', 'formula'],
  },

  // ── Observability ───────────────────────────────────────────────────────────

  molecule: {
    title: 'Molecule',
    body: [
      'A live instance of a poured formula — the actual tree of beads that agents execute. Molecules are stored in Dolt and sync across collaborators.',
      'You can track molecule progress in Observe, see which steps are cooking or complete, and inspect individual step beads.',
    ],
    cli: 'bd mol current <mol-id>',
    docHref: 'docs/MOLECULES.md',
    seeAlso: ['formula', 'molecule', 'cooking'],
  },

  instance: {
    title: 'Instance',
    body: [
      'A specific run of a formula. One formula may have many instances (molecules) — e.g. the same CI workflow poured for different PRs.',
      'The Observe/Instances tab shows all instances of the currently viewed formula.',
    ],
    docHref: 'docs/MOLECULES.md#instances',
    seeAlso: ['molecule', 'formula'],
  },

  cooking: {
    title: 'Cooking / pouring',
    body: [
      '"Cooking" is the dry-run phase: the formula\'s variables are substituted and the molecule structure is previewed without being committed.',
      '"Pouring" commits the cooked structure as a live molecule in Dolt. From that point agents can claim and execute its steps.',
    ],
    cli: 'bd pour my-formula --var issue=fo-abc --dry-run',
    docHref: 'docs/MOLECULES.md#cooking-and-pouring',
    seeAlso: ['molecule', 'formula'],
  },

  // ── Glossary ────────────────────────────────────────────────────────────────

  workspace: {
    title: 'Workspace',
    body: [
      'A named Dolt database (beads store) you can switch between. Each workspace has its own issue list, molecules, and formulas.',
      'Switch workspaces with the pill in the top-left corner or with ⌘, .',
    ],
    docHref: 'docs/ARCHITECTURE.md#workspaces',
    seeAlso: ['sling'],
  },

  sling: {
    title: 'Sling',
    body: [
      'The gc command that dispatches a bead (or molecule) to a pool of agents for execution. It sets routing metadata and wakes the relevant worker pool.',
      'In the UI, pouring a formula and routing it is done via the command palette or the Cook tab.',
    ],
    cli: 'gc sling <bead-id> --to foundations/worker-sonnet',
    docHref: 'docs/formulas.md#routing',
    seeAlso: ['molecule', 'workspace'],
  },

  routed_to: {
    title: 'gc.routed_to',
    body: [
      'Metadata key that tells the gc runtime which agent pool should pick up a bead. Set automatically by gc sling; can be set manually for fine-grained routing.',
      'Workers poll their assigned pool (e.g. foundations/worker-sonnet) and only claim beads routed to them.',
    ],
    cli: 'gc sling <id> --to foundations/worker-sonnet',
    docHref: 'docs/METADATA.md',
    seeAlso: ['sling'],
  },
};

export function getConcept(key: string): Concept | null {
  return concepts[key] ?? null;
}
