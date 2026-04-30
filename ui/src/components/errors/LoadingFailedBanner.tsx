interface Props {
  kind: 'workspaces' | 'molecule-graph' | 'fleet' | 'formula-source' | 'formula-list' | 'queue';
  onRetry?: () => void;
  moleculeId?: string;
  formulaName?: string;
}

const MESSAGES: Record<Props['kind'], string | ((props: Props) => string)> = {
  workspaces: 'Could not load workspaces — bd-server may be unavailable.',
  'molecule-graph': (p: Props) =>
    `Could not load molecule graph${p.moleculeId ? ` for "${p.moleculeId}"` : ''} — bd-server may be unavailable.`,
  fleet: 'Could not load live molecules — bd-server may be unavailable.',
  queue: 'Could not load the work queue — bd-server may be unavailable.',
  'formula-source': (p: Props) =>
    `Could not load formula${p.formulaName ? ` "${p.formulaName}"` : ''} — bd-server may be unavailable.`,
  'formula-list': 'Could not load formula catalog — bd-server may be unavailable.',
};

export function LoadingFailedBanner({ kind, onRetry, moleculeId, formulaName }: Props) {
  const msg = MESSAGES[kind];
  const text = typeof msg === 'function' ? msg({ kind, onRetry, moleculeId, formulaName }) : msg;
  return (
    <div className="loading-failed-banner" role="alert">
      <span>{text}</span>
      {onRetry && <button onClick={onRetry}>Retry</button>}
    </div>
  );
}
