import type { LayoutNode } from '../../types';

interface Props {
  node: LayoutNode;
  selected: boolean;
  onSelect: () => void;
}

const STATUS_COLOR: Record<string, string> = {
  open: 'var(--mute)',
  in_progress: 'var(--accent)',
  blocked: 'var(--danger)',
  deferred: 'var(--ink-3)',
  closed: 'var(--mute-2)',
};

export function GraphNode({ node, selected, onSelect }: Props) {
  const { bead, isGhost, isReady } = node;
  const statusColor = STATUS_COLOR[bead.status] ?? 'var(--mute)';

  const borderStyle = isGhost
    ? '1.5px dashed var(--rule-2)'
    : isReady
    ? '2px solid var(--accent)'
    : selected
    ? '1.5px solid var(--ink-2)'
    : '1px solid var(--rule)';

  const bg = isGhost ? 'var(--bg-3)' : selected ? 'var(--accent-soft)' : 'var(--bg)';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onSelect(); }}
      style={{
        position: 'absolute',
        left: node.x,
        top: node.y,
        width: node.w,
        height: node.h,
        background: bg,
        border: borderStyle,
        borderRadius: 4,
        padding: '6px 8px',
        boxSizing: 'border-box',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: statusColor,
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--ink-3)',
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {bead.id}
        </span>
        {bead.priority !== undefined && (
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              padding: '1px 4px',
              background: 'var(--bg-3)',
              border: '1px solid var(--rule-2)',
              borderRadius: 2,
              color: 'var(--ink-3)',
              flexShrink: 0,
            }}
          >
            p{bead.priority}
          </span>
        )}
      </div>

      <div
        style={{
          fontSize: 12,
          fontWeight: 500,
          color: isGhost ? 'var(--mute)' : 'var(--ink)',
          lineHeight: 1.3,
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}
      >
        {isGhost ? '?' : bead.title}
      </div>

      {(bead.type || node.continuationGroup) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 'auto' }}>
          {bead.type && (
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                padding: '1px 4px',
                background: 'var(--bg-3)',
                border: '1px solid var(--rule-2)',
                borderRadius: 2,
                color: 'var(--mute)',
              }}
            >
              {bead.type}
            </span>
          )}
          {node.continuationGroup && (
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                color: 'var(--accent)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              ∷ {node.continuationGroup}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
