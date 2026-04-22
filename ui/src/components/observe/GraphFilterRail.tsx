import type { LayoutNode, BeadStatus } from '../../types';

interface Props {
  nodes: LayoutNode[];
  hiddenStatuses: Set<BeadStatus>;
  hiddenTypes: Set<string>;
  onToggleStatus: (s: BeadStatus) => void;
  onToggleType: (t: string) => void;
}

const ALL_STATUSES: BeadStatus[] = ['open', 'in_progress', 'blocked', 'deferred', 'closed'];

const STATUS_COLOR: Record<BeadStatus, string> = {
  open: 'var(--mute)',
  in_progress: 'var(--accent)',
  blocked: 'var(--danger)',
  deferred: 'var(--ink-3)',
  closed: 'var(--mute-2)',
};

const STATUS_LABEL: Record<BeadStatus, string> = {
  open: 'open',
  in_progress: 'in progress',
  blocked: 'blocked',
  deferred: 'deferred',
  closed: 'closed',
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: 'var(--font-mono)',
      fontSize: 9.5,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      color: 'var(--mute)',
      padding: '10px 12px 4px',
      fontWeight: 600,
    }}>
      {children}
    </div>
  );
}

export function GraphFilterRail({ nodes, hiddenStatuses, hiddenTypes, onToggleStatus, onToggleType }: Props) {
  const statusCounts = new Map<BeadStatus, number>();
  const typesPresent = new Set<string>();

  for (const node of nodes) {
    statusCounts.set(node.bead.status, (statusCounts.get(node.bead.status) ?? 0) + 1);
    if (node.bead.type) typesPresent.add(node.bead.type);
  }

  const sortedTypes = [...typesPresent].sort();

  return (
    <aside style={{
      width: 220,
      background: 'var(--bg-2)',
      borderRight: '1px solid var(--rule)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      overflowY: 'auto',
    }}>
      <SectionLabel>Status</SectionLabel>
      {ALL_STATUSES.map(s => {
        const count = statusCounts.get(s) ?? 0;
        const hidden = hiddenStatuses.has(s);
        return (
          <div
            key={s}
            role="button"
            tabIndex={0}
            onClick={() => onToggleStatus(s)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onToggleStatus(s); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '4px 12px',
              cursor: 'pointer',
              opacity: hidden ? 0.4 : 1,
              fontSize: 12,
              color: 'var(--ink-2)',
            }}
          >
            <span style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: STATUS_COLOR[s],
              flexShrink: 0,
            }} />
            <span style={{ flex: 1 }}>{STATUS_LABEL[s]}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--mute)' }}>
              {count}
            </span>
          </div>
        );
      })}

      <SectionLabel>Type</SectionLabel>
      {sortedTypes.length === 0 && (
        <div style={{ padding: '4px 12px', fontSize: 11, color: 'var(--mute)' }}>—</div>
      )}
      {sortedTypes.map(t => {
        const hidden = hiddenTypes.has(t);
        return (
          <label
            key={t}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '4px 12px',
              cursor: 'pointer',
              fontSize: 12,
              color: 'var(--ink-2)',
            }}
          >
            <input
              type="checkbox"
              checked={!hidden}
              onChange={() => onToggleType(t)}
              style={{ margin: 0 }}
            />
            <span>{t}</span>
          </label>
        );
      })}

      <SectionLabel>Priority</SectionLabel>
      <div style={{ padding: '4px 12px 10px', fontSize: 11, color: 'var(--ink-3)', lineHeight: 1.6 }}>
        <div>0 — critical</div>
        <div>1 — high</div>
        <div>2 — medium</div>
        <div>3 — low</div>
        <div>4 — backlog</div>
      </div>
    </aside>
  );
}
