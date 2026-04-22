interface Props {
  kind: 'workspaces';
  onRetry?: () => void;
}

const MESSAGES: Record<Props['kind'], string> = {
  workspaces: 'Could not load workspaces — bd-server may be unavailable.',
};

export function LoadingFailedBanner({ kind, onRetry }: Props) {
  return (
    <div className="loading-failed-banner" role="alert">
      <span>{MESSAGES[kind]}</span>
      {onRetry && <button onClick={onRetry}>Retry</button>}
    </div>
  );
}
