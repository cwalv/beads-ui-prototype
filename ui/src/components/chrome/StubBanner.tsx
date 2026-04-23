// fo-zz4pz: shared stub banner for all Coming Soon surfaces
interface Props {
  title: string;
  description?: string;
  bead?: string;
  prototypeRef?: string;
}

export function StubBanner({ title, description, bead = 'fo-zz4pz', prototypeRef }: Props) {
  return (
    <div className="stub-banner">
      <div className="stub-banner__card">
        <span className="stub-banner__tag">Coming soon</span>
        <h2 className="stub-banner__title">{title}</h2>
        {description && <p className="stub-banner__description">{description}</p>}
        <div className="stub-banner__links">
          {bead && (
            <span>tracking: <a href={`/bead/${bead}`}>{bead}</a></span>
          )}
          {prototypeRef && (
            <span>design ref: <span style={{ color: 'var(--ink-3)' }}>{prototypeRef}</span></span>
          )}
        </div>
      </div>
    </div>
  );
}
