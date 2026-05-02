interface Props {
  label: string;
  count: number;
}

export function QueueGroupHeader({ label, count }: Props) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '6px 20px',
      background: 'var(--bg-2)',
      borderBottom: '1px solid var(--rule-2)',
      borderTop: '1px solid var(--rule-2)',
    }}>
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        fontWeight: 600,
        color: 'var(--ink)',
      }}>
        {label}
      </span>
      <span style={{ fontSize: 10.5, color: 'var(--mute)', fontFamily: 'var(--font-mono)' }}>
        {count} bead{count === 1 ? '' : 's'}
      </span>
    </div>
  );
}
