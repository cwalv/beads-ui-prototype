import type { SaveState } from '../../hooks/useFormulaSource';

interface Props {
  state: SaveState;
  error: string | null;
  dirty: boolean;
  onSave: () => void;
}

export function SaveBanner({ state, error, dirty, onSave }: Props) {
  if (state === 'saving') return (
    <div className="ed-save-banner">
      <span className="sb-saving">saving…</span>
    </div>
  );
  if (state === 'saved') return (
    <div className="ed-save-banner">
      <span className="sb-saved">✓ saved</span>
    </div>
  );
  if (state === 'error') return (
    <div className="ed-save-banner">
      <span className="sb-error">{error ?? 'save failed'}</span>
      <button onClick={onSave}>Try again</button>
    </div>
  );
  if (state === 'conflict') return (
    <div className="ed-save-banner">
      <span className="sb-error">conflict — file changed on disk</span>
    </div>
  );
  if (dirty) return (
    <div className="ed-save-banner">
      <span className="sb-dirty">unsaved changes</span>
      <button onClick={onSave}>Save</button>
    </div>
  );
  return null;
}
