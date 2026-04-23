// Observe layout sub-nav — Fleet / Graph / Queue / Timeline (fo-zz4pz)
import { NavLink, useSearchParams } from 'react-router-dom';

export type ObserveLayout = 'fleet' | 'graph' | 'queue' | 'timeline';

interface NavEntry {
  id: ObserveLayout;
  label: string;
  to: string | null;
}

interface Props {
  active: ObserveLayout;
  moleculeId?: string;
}

const tabStyle = (isActive: boolean): React.CSSProperties => ({
  padding: '4px 10px',
  fontSize: 11.5,
  fontFamily: 'var(--font-mono)',
  textDecoration: 'none',
  borderRadius: 2,
  color: isActive ? 'var(--ink)' : 'var(--mute)',
  background: isActive ? 'var(--bg-3)' : 'transparent',
  fontWeight: isActive ? 600 : 400,
  cursor: isActive ? 'default' : 'pointer',
});

export function ObserveNav({ active, moleculeId }: Props) {
  const [searchParams] = useSearchParams();
  const search = searchParams.toString();
  const qs = search ? `?${search}` : '';

  const layouts: NavEntry[] = [
    { id: 'fleet',    label: 'Fleet',    to: `/observe/fleet${qs}` },
    { id: 'queue',    label: 'Queue',    to: `/observe/queue${qs}` },
    { id: 'graph',    label: 'Graph',    to: moleculeId ? `/observe/graph/${moleculeId}${qs}` : null },
    { id: 'timeline', label: 'Timeline', to: moleculeId ? `/observe/timeline/${moleculeId}${qs}` : null },
  ];

  return (
    <div style={{
      height: 36,
      display: 'flex',
      alignItems: 'center',
      gap: 2,
      padding: '0 14px',
      borderBottom: '1px solid var(--rule)',
      background: 'var(--bg-2)',
      flexShrink: 0,
    }}>
      {layouts.map(({ id, label, to }) => {
        const isActive = active === id;
        if (to && !isActive) {
          return (
            <NavLink key={id} to={to} style={tabStyle(false)}>
              {label}
            </NavLink>
          );
        }
        return (
          <span key={id} style={tabStyle(isActive)}>
            {label}
          </span>
        );
      })}
    </div>
  );
}
