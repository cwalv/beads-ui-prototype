import type { FleetMolecule } from '../../client/fleet';

export type GroupBy = 'formula' | 'workspace' | 'status';

interface Props {
  molecules: FleetMolecule[];
  groupBy: GroupBy;
  onGroupByChange: (g: GroupBy) => void;
}

const GROUP_OPTIONS: GroupBy[] = ['formula', 'workspace', 'status'];

export function FleetSummary({ molecules, groupBy, onGroupByChange }: Props) {
  const inProgress = molecules.filter(m => m.agg.statusRollup === 'running').length;
  const retrying   = molecules.filter(m => m.agg.statusRollup === 'retry').length;
  const atGate     = molecules.filter(m => m.agg.statusRollup === 'at-gate').length;
  const blocked    = molecules.filter(m => m.agg.statusRollup === 'blocked').length;

  const counts = [
    { label: 'in progress', value: inProgress, color: 'var(--accent)' },
    { label: 'retrying',    value: retrying,   color: 'var(--warn)'   },
    { label: 'at gate',     value: atGate,     color: 'var(--warn)'   },
    { label: 'blocked',     value: blocked,    color: 'var(--danger)' },
  ];

  return (
    <div style={{
      padding: '10px 20px',
      borderBottom: '1px solid var(--rule)',
      background: 'var(--bg)',
      display: 'flex',
      gap: 20,
      alignItems: 'center',
      flexShrink: 0,
    }}>
      {counts.map(c => (
        <div key={c.label} style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{
            fontSize: 18,
            fontWeight: 600,
            color: c.color,
            fontFamily: 'var(--font-mono)',
          }}>
            {c.value}
          </span>
          <span style={{
            fontSize: 11,
            color: 'var(--mute)',
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.04em',
          }}>
            {c.label}
          </span>
        </div>
      ))}

      <span style={{ flex: 1 }} />

      <div style={{
        display: 'flex',
        gap: 4,
        alignItems: 'center',
        fontSize: 11,
        color: 'var(--mute)',
        fontFamily: 'var(--font-mono)',
      }}>
        group by
        {GROUP_OPTIONS.map(g => (
          <button
            key={g}
            aria-pressed={groupBy === g}
            onClick={() => onGroupByChange(g)}
            style={{
              fontSize: 10.5,
              padding: '2px 8px',
              border: '1px solid',
              borderColor: groupBy === g ? 'var(--ink)' : 'var(--rule)',
              borderRadius: 2,
              background: groupBy === g ? 'var(--ink)' : 'var(--bg)',
              color: groupBy === g ? '#fff' : 'var(--mute)',
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {g}
          </button>
        ))}
      </div>
    </div>
  );
}
