interface Props {
  onReload: () => void;
  onForceOverwrite: () => void;
}

export function ConflictBanner({ onReload, onForceOverwrite }: Props) {
  return (
    <div className="ed-conflict-banner" role="alert">
      <span>The file changed on disk since you loaded it.</span>
      <button onClick={onReload}>Reload (lose your edits)</button>
      <button onClick={onForceOverwrite}>Save anyway (overwrite)</button>
    </div>
  );
}
