// Shared UI primitives for the beads wireframe artboards.
// Everything is wireframe-grade: grayscale + single accent, Mapbox-Studio energy.

function TopChrome({ path = ["beads-ui", "formulas", "gastownhall-upstream.formula.toml"], dirty = false, actions = null }) {
  return (
    <div className="wf-top">
      <div className="mark"><span className="dot" /> beads</div>
      <div className="path">
        {path.map((seg, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span className="sep">/</span>}
            <span className={i === path.length - 1 ? "seg-current" : ""}>{seg}</span>
          </React.Fragment>
        ))}
        {dirty && <span className="sep" style={{ color: "var(--warn)", marginLeft: 4 }}>●</span>}
      </div>
      <div className="spacer" />
      <div className="pill"><span className="sw" /> bd synced · 2s ago</div>
      {actions ?? (
        <>
          <button className="btn">Validate</button>
          <button className="btn">Dry-run cook</button>
          <button className="btn primary">Save</button>
        </>
      )}
    </div>
  );
}

function Tabs({ items, active }) {
  return (
    <div className="wf-tabs">
      {items.map((t) => (
        <div key={t.id} className={`tab ${t.id === active ? "active" : ""}`}>
          {t.label}
          {t.count != null && <span className="count">{t.count}</span>}
        </div>
      ))}
    </div>
  );
}

function Rail({ groups }) {
  return (
    <div className="wf-rail">
      <div className="rail-head">Formulas</div>
      <div className="rail-search">⌕  Search formulas…</div>
      {groups.map((g) => (
        <div key={g.title} className="rail-group">
          <div className="rail-group-head">
            <span>{g.title}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--mute-2)" }}>{g.count}</span>
          </div>
          {g.items.map((it) => (
            <div key={it.name} className={`rail-item ${it.active ? "active" : ""}`}>
              <span className="chev">›</span>
              <span>{it.name}</span>
              {it.badge && <span className="badge">{it.badge}</span>}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function PaneHead({ label, info, tools = true }) {
  return (
    <div className="wf-pane-head">
      <span className="lbl">{label}</span>
      <span style={{ color: "var(--mute)" }}>{info}</span>
      {tools && (
        <div className="tools">
          <button title="Fit">◈</button>
          <button title="Zoom in">+</button>
          <button title="Zoom out">−</button>
          <button title="Layout">⋮</button>
        </div>
      )}
    </div>
  );
}

function FootBar({ left = "✓ 8 steps · 13 vars · 0 cycles", right = "valid TOML · last parse 34ms" }) {
  return (
    <div className="wf-foot">
      <span className="ok">{left}</span>
      <span style={{ flex: 1 }} />
      <span>{right}</span>
    </div>
  );
}

// ── v2 chrome: workspace-aware top bar + three-destination nav ──
function TopChromeV2({ workspace = "fo-beads-ui", multi = null, destination = "author", dirty = false, breadcrumb = [], actions = null, palette = "⌘K" }) {
  const dests = [
    { id: "author",  label: "Author",  hint: "formulas · workflow" },
    { id: "observe", label: "Observe", hint: "molecules · beads" },
    { id: "capture", label: "Capture", hint: "add work" },
  ];
  return (
    <div className="wf-top" style={{ gap: 14 }}>
      <div className="mark"><span className="dot" /> beads</div>

      {/* Workspace pill (switcher) */}
      <div className="ws-pill" title="Switch workspace (⌘,)">
        <span className="ws-bar" style={{ background: "var(--accent)" }} />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--ink)" }}>{workspace}</span>
        {multi && <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--mute)" }}>+ {multi}</span>}
        <span style={{ color: "var(--mute-2)", fontSize: 10 }}>▾</span>
      </div>

      {/* Destination tabs — training wheels on by default */}
      <div className="dest-tabs">
        {dests.map(d => (
          <div key={d.id} className={`dest-tab ${d.id === destination ? "active" : ""}`}>
            <span className="lbl">{d.label}</span>
            <span className="hint">{d.hint}</span>
          </div>
        ))}
      </div>

      {/* Breadcrumb inside current destination */}
      {breadcrumb.length > 0 && (
        <div className="path" style={{ marginLeft: 8 }}>
          {breadcrumb.map((seg, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span className="sep">/</span>}
              <span className={i === breadcrumb.length - 1 ? "seg-current" : ""}>{seg}</span>
            </React.Fragment>
          ))}
          {dirty && <span className="sep" style={{ color: "var(--warn)", marginLeft: 4 }}>●</span>}
        </div>
      )}

      <div className="spacer" />

      <div className="pill" title="Press to open command palette">
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5 }}>⌕</span>
        <span style={{ fontSize: 11 }}>Search or run command</span>
        <span className="kbd-inline">{palette}</span>
      </div>

      {actions}
    </div>
  );
}

// ── Peek drawer: shared overlay summoned from any surface ──
function PeekDrawer({ kind = "bead", id = "fo-mhb6v-42", title, status = "in_progress", extras = null, style }) {
  return (
    <aside className="peek" style={style}>
      <div className="peek-head">
        <span className="peek-kind">{kind === "mol" ? "molecule" : kind}</span>
        <span className="peek-id">{id}</span>
        <span className={`st-icon ${status === "open" ? "st-open" : status === "in_progress" ? "st-prog" : status === "blocked" ? "st-blocked" : status === "deferred" ? "st-deferred" : "st-closed"}`}>
          {status === "open" ? "○" : status === "in_progress" ? "◐" : status === "blocked" ? "●" : status === "deferred" ? "❄" : "✓"}
        </span>
        <span style={{ flex: 1 }} />
        <button className="btn" title="Pin drawer as split panel">⚲</button>
        <button className="btn" title="Copy deep link">⎘</button>
        <button className="btn" title="Close">✕</button>
      </div>
      <div className="peek-title">{title}</div>
      {extras}
    </aside>
  );
}

Object.assign(window, { TopChrome, TopChromeV2, PeekDrawer, Tabs, Rail, PaneHead, FootBar });
