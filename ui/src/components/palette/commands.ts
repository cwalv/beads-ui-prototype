export interface PaletteCommand {
  icon: string;
  title: string;
  description: string;
  cli?: string;
  kbd?: string;
  group: string;
  action: 'navigate' | 'copy-cli';
  target?: string; // route for navigate; cli text for copy
}

export const PALETTE_COMMANDS: PaletteCommand[] = [
  // ── Ready queue ──────────────────────────────────────────────────────────────
  {
    group: 'Ready queue', icon: '○', title: 'bd ready',
    description: 'list issues with no open blockers',
    cli: 'bd ready --json', action: 'copy-cli', kbd: 'R',
  },
  {
    group: 'Ready queue', icon: '◐', title: 'bd claim next',
    description: 'claim highest-priority ready issue',
    cli: 'bd update <id> --status in_progress', action: 'copy-cli', kbd: '⇧R',
  },
  {
    group: 'Ready queue', icon: '❄', title: 'bd ready --include-deferred',
    description: 'include future-deferred issues',
    cli: 'bd ready --include-deferred --json', action: 'copy-cli',
  },

  // ── Issues ────────────────────────────────────────────────────────────────
  {
    group: 'Issues', icon: '+', title: 'bd create',
    description: 'new issue (type, priority, dep, due/defer)',
    cli: 'bd create "…" -t feature -p 1 --due=+2d', action: 'copy-cli', kbd: 'C',
  },
  {
    group: 'Issues', icon: '▦', title: 'bd show',
    description: 'issue detail (metadata, events, deps)',
    cli: 'bd show <id> --json', action: 'copy-cli',
  },
  {
    group: 'Issues', icon: '⇢', title: 'bd dep add … --type discovered-from',
    description: 'link discovery to parent work',
    cli: 'bd dep add <new> <parent> --type discovered-from', action: 'copy-cli',
  },
  {
    group: 'Issues', icon: '✓', title: 'bd close',
    description: 'mark done with reason',
    cli: 'bd close <id> --reason "…"', action: 'copy-cli',
  },

  // ── Formulas / molecules ───────────────────────────────────────────────────
  {
    group: 'Formulas / molecules', icon: '⚗', title: 'bd formula list',
    description: 'formulas across all search paths',
    cli: 'bd formula list', action: 'copy-cli',
  },
  {
    group: 'Formulas / molecules', icon: '⟐', title: 'bd pour',
    description: 'pour formula into a new molecule',
    cli: 'bd pour <formula> --var issue=fo-…', action: 'copy-cli', kbd: 'P',
  },
  {
    group: 'Formulas / molecules', icon: '☗', title: 'bd pour --dry-run',
    description: 'preview proto without committing',
    cli: 'bd pour <formula> --var issue=fo-… --dry-run', action: 'copy-cli',
  },
  {
    group: 'Formulas / molecules', icon: '◈', title: 'bd squash',
    description: 'digest: squash molecule into permanent record',
    cli: 'bd squash <mol-id>', action: 'copy-cli',
  },

  // ── Graph ────────────────────────────────────────────────────────────────
  {
    group: 'Graph', icon: '⇵', title: 'bd dep tree',
    description: 'render dependency tree',
    cli: 'bd dep tree <id>', action: 'copy-cli',
  },
  {
    group: 'Graph', icon: '⌀', title: 'bd list --overdue',
    description: 'due date in past (not closed)',
    cli: 'bd list --overdue', action: 'copy-cli',
  },

  // ── Navigate ─────────────────────────────────────────────────────────────
  {
    group: 'Navigate', icon: '→', title: 'Open Author',
    description: 'formula browser & editor',
    action: 'navigate', target: '/author', kbd: '1',
  },
  {
    group: 'Navigate', icon: '→', title: 'Open Observe',
    description: 'fleet, molecule graph, timeline',
    action: 'navigate', target: '/observe', kbd: '2',
  },
  {
    group: 'Navigate', icon: '→', title: 'Open Capture',
    description: 'add work',
    action: 'navigate', target: '/capture', kbd: '3',
  },
  {
    group: 'Navigate', icon: '→', title: 'Open Docs',
    description: 'browse the full reference docs',
    action: 'navigate', target: '/docs', kbd: '4',
  },
];
