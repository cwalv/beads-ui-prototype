// Author · Edit — main shell. Tabs, sync plumbing, vars drawer.

const { useState, useEffect, useMemo, useRef, useCallback } = React;

function EditorApp({ initialSrc }) {
  const [tab, setTab] = useState("source"); // source | cook | instances
  const [src, setSrc] = useState(initialSrc);
  const [selected, setSelected] = useState(null);
  const [cookVars, setCookVars] = useState({
    issue: "fo-mhb6v-hooks-sync",
    title: "add hooks-sync idempotency check",
    branch: "feat/fo-mhb6v-hooks-sync",
    kind: "feat",
    scope: "",
    upstream_owner: "gastownhall",
    upstream_repo: "gascity",
    base_branch: "main",
    fork_remote: "cwalv",
    regression_required: "true",
    integration_remote: "cwalv",
    integration_branch: "integration",
  });

  const parsed = useMemo(() => parseFormula(src), [src]);
  const layout = useMemo(() => layoutDAG(parsed.steps), [parsed.steps]);
  const highlighted = useMemo(() => highlightLines(src), [src]);
  const srcLines = useMemo(() => src.split("\n"), [src]);

  const textareaRef = useRef(null);
  const overlayRef = useRef(null);
  const scrollRef = useRef(null);

  // Scroll to step when selected
  useEffect(() => {
    if (!selected || !textareaRef.current) return;
    const range = parsed.stepRanges.find(r => r.id === selected);
    if (!range) return;
    const lineHeight = 18;
    const top = range.startLine * lineHeight;
    textareaRef.current.scrollTop = Math.max(0, top - 60);
  }, [selected]);

  // Sync overlay scroll with textarea
  const onTextareaScroll = useCallback(() => {
    if (overlayRef.current && textareaRef.current) {
      overlayRef.current.scrollTop = textareaRef.current.scrollTop;
      overlayRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
    if (scrollRef.current && textareaRef.current) {
      scrollRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }, []);

  const onVarChange = useCallback((name, value) => {
    setSrc(prev => writeVarDefault(prev, name, value));
  }, []);

  // Var definitions the drawer exposes. Wired = 4 real, rest read-only.
  const WIRED = new Set(["kind", "regression_required", "upstream_owner", "upstream_repo"]);

  return (
    <div className="ed-root">
      {/* Chrome — minimal replica of the surface tabs */}
      <header style={{
        height: 44, display: "flex", alignItems: "center", gap: 14,
        padding: "0 16px", borderBottom: "1px solid var(--rule)",
        background: "var(--bg)", flexShrink: 0,
      }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--mute)" }}>
          beads · <span style={{ color: "var(--ink)" }}>author</span>
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--mute-2)" }}>·</div>
        <div style={{ fontSize: 12.5, fontWeight: 500 }}>{parsed.header.formula || "formula"}</div>
        <div style={{
          fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--mute)",
          padding: "1px 6px", background: "var(--bg-3)", borderRadius: 2
        }}>v{parsed.header.version}</div>
        <div style={{ flex: 1 }} />
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--mute)" }}>
          .beads/formulas/gastownhall-upstream.formula.toml
        </div>
      </header>

      {/* Tabs */}
      <div className="ed-tabs">
        <div className={`tab ${tab === "source" ? "active" : ""}`} onClick={() => setTab("source")}>
          Source <span className="ct">{parsed.steps.length} steps</span>
        </div>
        <div className={`tab ${tab === "cook" ? "active" : ""}`} onClick={() => setTab("cook")}>
          Cook <span className="ct">preview</span>
        </div>
        <div className={`tab ${tab === "instances" ? "active" : ""}`} onClick={() => setTab("instances")}>
          Instances <span className="ct">3</span>
        </div>
      </div>

      {tab === "source" && (
        <div className="ed-body">
          {/* DAG */}
          <div className="ed-dag-pane">
            <div className="ed-dag-head">
              <span className="lbl">DAG</span>
              <span className="meta">{parsed.steps.length} steps · {layout.edges.length} edges</span>
              {parsed.errors.length > 0 && (
                <span className="meta err" style={{ marginLeft: "auto" }}>
                  {parsed.errors.length} error{parsed.errors.length > 1 ? "s" : ""}
                </span>
              )}
            </div>
            <DAG
              steps={parsed.steps}
              layout={layout}
              selected={selected}
              onSelect={setSelected}
              errors={parsed.errors}
            />
          </div>

          {/* TOML */}
          <div className="ed-src-pane">
            <div className="ed-src-head">
              <span className="lbl">TOML</span>
              <span className="meta">{parsed.lineCount} lines</span>
              {selected && <span className="meta" style={{ marginLeft: "auto" }}>
                selected: {selected}
              </span>}
            </div>
            <SourcePane
              src={src}
              setSrc={setSrc}
              highlighted={highlighted}
              srcLines={srcLines}
              selected={selected}
              stepRanges={parsed.stepRanges}
              errors={parsed.errors}
              textareaRef={textareaRef}
              overlayRef={overlayRef}
              scrollRef={scrollRef}
              onTextareaScroll={onTextareaScroll}
            />
          </div>

          {/* Vars drawer */}
          <VarsDrawer vars={parsed.vars} wired={WIRED} onChange={onVarChange} />
        </div>
      )}

      {tab === "cook" && (
        <CookView
          formula={parsed.header.formula}
          steps={parsed.steps}
          vars={parsed.vars}
          cookVars={cookVars}
          setCookVars={setCookVars}
        />
      )}

      {tab === "instances" && <InstancesView />}
    </div>
  );
}

function SourcePane({ src, setSrc, highlighted, srcLines, selected, stepRanges, errors, textareaRef, overlayRef, scrollRef, onTextareaScroll }) {
  const lineHeight = 18;
  const range = selected ? stepRanges.find(r => r.id === selected) : null;
  const errLines = new Set();
  (errors || []).forEach(e => { if (e.line !== undefined) errLines.add(e.line); });

  return (
    <div className="ed-src-wrap">
      {/* Gutter scroll-sync container */}
      <div className="ed-src-scroll" ref={scrollRef} style={{ pointerEvents: "none" }}>
        <div className="ed-src-grid">
          <div className="ed-src-gutter" style={{ minHeight: srcLines.length * lineHeight }}>
            {srcLines.map((_, i) => (
              <div key={i} className={errLines.has(i) ? "g-err" : ""} style={{ height: lineHeight, lineHeight: `${lineHeight}px` }}>
                {errLines.has(i) ? "●" : (i + 1)}
              </div>
            ))}
          </div>
          <div />
        </div>
      </div>

      {/* Highlighted overlay */}
      <div className="ed-src-overlay" ref={overlayRef}>
        {/* Selection highlight (behind text) */}
        {range && (
          <div className="ed-src-hl range" style={{
            top: range.startLine * lineHeight,
            height: (range.endLine - range.startLine + 1) * lineHeight,
          }} />
        )}
        {highlighted.map((segs, i) => (
          <div key={i} style={{ height: lineHeight, position: "relative" }}>
            {segs.map((s, j) => (
              <span key={j} className={s.cls}>{s.text || " "}</span>
            ))}
          </div>
        ))}
      </div>

      {/* Actual editable textarea on top */}
      <textarea
        ref={textareaRef}
        className="ed-src-textarea"
        spellCheck={false}
        value={src}
        onChange={(e) => setSrc(e.target.value)}
        onScroll={onTextareaScroll}
      />
    </div>
  );
}

function VarsDrawer({ vars, wired, onChange }) {
  const order = ["issue","title","branch","kind","scope","body","upstream_owner","upstream_repo","base_branch","fork_remote","regression_required","integration_remote","integration_branch"];
  const list = order.map(k => vars[k]).filter(Boolean);

  return (
    <div className="ed-vars">
      <div className="ed-vars-head">
        <span className="lbl">Vars</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--mute)" }}>
          {list.length} · {list.filter(v => v.required).length} required
        </span>
      </div>
      <div className="ed-vars-body">
        {list.map(v => (
          <VarField key={v.name} v={v} wired={wired.has(v.name)} onChange={onChange} />
        ))}
      </div>
    </div>
  );
}

function VarField({ v, wired, onChange }) {
  const cur = v.default ?? "";
  if (v.name === "kind" && wired) {
    return (
      <div className="ed-var wired">
        <div className="row">
          <span className="name">{v.name}</span>
          {v.required && <span className="req">required</span>}
          <span className="pill">wired</span>
        </div>
        <div className="desc">{v.description}</div>
        <div className="ed-seg">
          <button className={cur === "feat" ? "on" : ""} onClick={() => onChange("kind", "feat")}>feat</button>
          <button className={cur === "fix" ? "on" : ""} onClick={() => onChange("kind", "fix")}>fix</button>
          <button className={cur === "" ? "on" : ""} onClick={() => onChange("kind", "")}>—</button>
        </div>
      </div>
    );
  }
  if (v.name === "regression_required" && wired) {
    const on = cur === "true" || cur === true;
    return (
      <div className="ed-var wired">
        <div className="row">
          <span className="name">{v.name}</span>
          <span className="pill">wired</span>
        </div>
        <div className="desc">{v.description}</div>
        <label className="ed-check">
          <input type="checkbox" checked={on}
            onChange={(e) => onChange("regression_required", e.target.checked ? "true" : "false")} />
          {on ? "true (block docs-only)" : "false (allow docs-only)"}
        </label>
      </div>
    );
  }
  return (
    <div className={`ed-var ${wired ? "wired" : ""}`}>
      <div className="row">
        <span className="name">{v.name}</span>
        {v.required && <span className="req">required</span>}
        <span className="pill">{wired ? "wired" : "read-only"}</span>
      </div>
      <div className="desc">{v.description}</div>
      <input
        type="text"
        value={cur}
        readOnly={!wired}
        placeholder={v.required ? "required" : ""}
        onChange={(e) => wired && onChange(v.name, e.target.value)}
      />
    </div>
  );
}

function CookView({ formula, steps, vars, cookVars, setCookVars }) {
  const resolved = steps.map((s, i) => ({
    ...s,
    resolvedTitle: renderWithHighlight(s.title || "", cookVars),
  }));

  const setCV = (k, v) => setCookVars(prev => ({ ...prev, [k]: v }));

  return (
    <div className="ed-cook">
      <div className="ed-cook-form">
        <div className="ed-vars-head">
          <span className="lbl">Cook with…</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--mute)" }}>
            {Object.values(vars).filter(v => v.required).length} required
          </span>
        </div>
        {Object.values(vars).map(v => (
          <div key={v.name} className="ed-var">
            <div className="row">
              <span className="name">{v.name}</span>
              {v.required && <span className="req">required</span>}
            </div>
            <input
              type="text"
              value={cookVars[v.name] || ""}
              onChange={(e) => setCV(v.name, e.target.value)}
              placeholder={v.default || "(empty)"}
            />
          </div>
        ))}
      </div>
      <div className="ed-cook-preview">
        <div className="ed-cook-card">
          <div className="ed-cook-card-head">
            <div className="ed-cook-card-kind">Proto · would be poured from {formula}</div>
            <div className="ed-cook-card-title">
              {cookVars.kind || "feat"}({cookVars.scope || (cookVars.kind === "feat" ? "gc" : "")}): {cookVars.title || "(title)"}
            </div>
            <div style={{ marginTop: 6, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--mute)" }}>
              {steps.length} steps · target: {cookVars.upstream_owner}/{cookVars.upstream_repo}
            </div>
          </div>
          <div className="ed-cook-card-body">
            {resolved.map((s, i) => (
              <div key={s.id || i} className="ed-cook-step">
                <span className="idx">{i + 1}</span>
                <div>
                  <div className="id">{s.id}</div>
                  <div className="t">{s.resolvedTitle}</div>
                  {s.needs.length > 0 && (
                    <div className="needs">needs: {s.needs.join(", ")}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function renderWithHighlight(str, vars) {
  const parts = String(str).split(/(\{\{\s*[A-Za-z_][A-Za-z0-9_]*\s*\}\})/);
  return parts.map((p, i) => {
    const m = p.match(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/);
    if (m) {
      const v = vars[m[1]];
      if (v !== undefined && v !== "") return <span key={i} className="resolved">{v}</span>;
      return <span key={i} style={{ color: "var(--mute-2)" }}>{p}</span>;
    }
    return p;
  });
}

function InstancesView() {
  const rows = [
    { mol: "mol-34fa1b", issue: "fo-mhb6v-hooks-sync", title: "add hooks-sync idempotency check", status: "in_progress", at: "2h ago" },
    { mol: "mol-21ed08", issue: "fo-qk3r8-retry-backoff", title: "tune retry backoff for gascity-upstream", status: "pending-upstream", at: "yesterday" },
    { mol: "mol-9c4e2a", issue: "fo-jz7x4-body-tpl", title: "fix: body template escaping in open-pr", status: "closed", at: "4d ago" },
  ];
  const color = { in_progress: "var(--accent)", "pending-upstream": "#b45309", closed: "var(--mute)" };
  return (
    <div className="ed-inst">
      <div style={{ fontSize: 11, color: "var(--mute)", marginBottom: 10, fontFamily: "var(--font-mono)" }}>
        molecules poured from this formula (3 total · all workspaces)
      </div>
      {rows.map(r => (
        <div key={r.mol} className="ed-inst-row" onClick={() => alert(`Would open timeline for ${r.mol}`)}>
          <span className="mol">{r.mol}</span>
          <span className="issue">{r.issue}</span>
          <span style={{ fontSize: 12.5, color: "var(--ink)" }}>{r.title}</span>
          <span className="st" style={{ color: color[r.status] }}>● {r.status}</span>
          <span className="at">{r.at}</span>
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { EditorApp });
