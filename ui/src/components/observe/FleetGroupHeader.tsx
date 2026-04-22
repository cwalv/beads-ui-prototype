interface Props {
  formula: string;
  count: number;
}

export function FleetGroupHeader({ formula, count }: Props) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 20px',
      background: 'var(--bg-2)',
      borderBottom: '1px solid var(--rule-2)',
      borderTop: '1px solid var(--rule-2)',
    }}>
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 11.5,
        fontWeight: 600,
        color: 'var(--ink)',
      }}>
        {formula}
      </span>
      <span style={{
        fontSize: 10.5,
        color: 'var(--mute)',
        fontFamily: 'var(--font-mono)',
      }}>
        {count} live
      </span>
    </div>
  );
}
