// Artboard 1: Formula editor — the two-pane hero.
// Left rail: catalog · Center: DAG (Mapbox Studio energy, card-heavy) · Right: TOML source · Far right: var palette

function StepCard({ step, style, state }) {
  return (
    <div className={`step ${state || ""}`} style={style}>
      <div className="step-head">
        <span className="step-idx">{step.idx}</span>
        <span className="step-id">{step.id}</span>
        <span style={{ flex: 1 }} />
        {step.idem && <span className="badge warn" title="Idempotency hinge"><span className="k">⇲</span>idem</span>}
      </div>
      <div className="step-title">{step.title}</div>
      {(step.retry || step.meta || step.needs) && (
        <div className="step-badges">
          {step.retry && <span className="badge"><span className="k">retry</span> {step.retry}</span>}
          {step.meta?.map((m) => (
            <span key={m} className="badge"><span className="k">{m.split("=")[0]}</span>{m.includes("=") ? `=${m.split("=")[1]}` : ""}</span>
          ))}
        </div>
      )}
      {step.needs && step.needs.length > 0 && (
        <div className="step-foot">
          <span style={{ opacity: 0.65 }}>needs</span>
          <div className="chips">
            {step.needs.map((n) => <span key={n} className="chip">{n}</span>)}
          </div>
        </div>
      )}
    </div>
  );
}

// gastownhall-upstream — 8 steps in a left-to-right waterfall
const UP_STEPS = [
  { idx: 1, id: "load-context",       title: "Load bead, resolve repo path, prime tooling", retry: "3 · hard_fail", meta: ["gc.continuation_group"], idem: true, col: 0, row: 0 },
  { idx: 2, id: "validate-worktree",  title: "Validate repo state (clean, ahead of base)",   retry: "1 · hard_fail", meta: ["gc.session_affinity"], col: 1, row: 0, needs: ["load-context"] },
  { idx: 3, id: "rebuild-integration",title: "Rebuild cwalv:integration + test-ref",         retry: "1 · hard_fail", meta: ["gc.session_affinity"], col: 2, row: 0, needs: ["validate-worktree"] },
  { idx: 4, id: "run-tests",          title: "Regression-tier check + make check",           retry: "1 · hard_fail", meta: ["gc.continuation_group"], col: 3, row: 0, needs: ["rebuild-integration"] },
  { idx: 5, id: "push",               title: "Push branch to fork (idempotent)",             retry: "3 · hard_fail", idem: true, col: 4, row: 0, needs: ["run-tests"] },
  { idx: 6, id: "open-pr",            title: "Open PR (skip if one already exists)",         retry: "3 · hard_fail", idem: true, col: 5, row: 0, needs: ["push"] },
  { idx: 7, id: "label-and-record",   title: "Label pending-upstream, record PR metadata",   retry: "3 · hard_fail", col: 6, row: 0, needs: ["open-pr"] },
  { idx: 8, id: "drain",              title: "Signal completion (bead stays open)",          retry: "1 · hard_fail", col: 7, row: 0, needs: ["label-and-record"] },
];

// Layout constants
const COL_W = 300; // step width + gap
const STEP_W = 260;
const STEP_H = 132;
const PAD_X = 40;
const PAD_Y = 80;

function posOf(step) {
  return { x: PAD_X + step.col * COL_W, y: PAD_Y + step.row * 160 };
}

function DagPane({ active = "run-tests" }) {
  const stepById = Object.fromEntries(UP_STEPS.map((s) => [s.id, s]));
  // Build edges from needs
  const edges = [];
  UP_STEPS.forEach((s) => (s.needs || []).forEach((n) => edges.push([stepById[n], s])));

  return (
    <div style={{ position: "relative", flex: 1, minHeight: 0, overflow: "auto" }}>
      {/* Composition tree strip above the DAG */}
      <div style={{
        position: "sticky", top: 0, zIndex: 2,
        background: "var(--bg-2)", borderBottom: "1px solid var(--rule-2)",
        padding: "8px 14px", display: "flex", alignItems: "center", gap: 10,
        fontSize: 11.5, color: "var(--ink-3)", fontFamily: "var(--font-mono)",
      }}>
        <span className="section-h" style={{ color: "var(--mute)" }}>composition</span>
        <span className="chip">extends: <b style={{ color: "var(--ink)" }}>gc-base-step</b></span>
        <span style={{ color: "var(--mute-2)" }}>›</span>
        <span className="chip">compose: <b style={{ color: "var(--ink)" }}>gc-mail-escalate</b></span>
        <span style={{ flex: 1 }} />
        <span style={{ color: "var(--mute)" }}>8 local · 2 inherited</span>
      </div>

      <div style={{ position: "relative", minWidth: PAD_X * 2 + COL_W * 8, height: PAD_Y + STEP_H + 120 }}>
        {/* Swim label */}
        <div style={{ position: "absolute", left: PAD_X, top: 30, fontSize: 10.5, color: "var(--mute)", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600 }}>
          upstream-submit · continuation group
        </div>

        {/* Edges */}
        <svg className="dag-svg" style={{ width: PAD_X * 2 + COL_W * 8, height: PAD_Y + STEP_H + 120 }}>
          <defs>
            <marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M0,0 L10,5 L0,10 z" className="head" />
            </marker>
            <marker id="ah-active" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M0,0 L10,5 L0,10 z" className="head active" />
            </marker>
          </defs>
          {edges.map(([a, b], i) => {
            const pa = posOf(a), pb = posOf(b);
            const ax = pa.x + STEP_W, ay = pa.y + STEP_H / 2;
            const bx = pb.x, by = pb.y + STEP_H / 2;
            const mid = (ax + bx) / 2;
            const d = `M ${ax} ${ay} C ${mid} ${ay}, ${mid} ${by}, ${bx - 4} ${by}`;
            const onActive = b.id === active || a.id === active;
            return <path key={i} d={d} className={onActive ? "active" : ""} markerEnd={onActive ? "url(#ah-active)" : "url(#ah)"} />;
          })}
        </svg>

        {/* Step cards */}
        {UP_STEPS.map((s) => {
          const p = posOf(s);
          return (
            <StepCard key={s.id} step={s} style={{ left: p.x, top: p.y, width: STEP_W, height: STEP_H }} state={s.id === active ? "active" : ""} />
          );
        })}

        {/* Inline authoring affordance — "+ step" button on hover gap */}
        <div style={{
          position: "absolute", left: PAD_X + COL_W * 4 - 20, top: PAD_Y + STEP_H + 20,
          fontSize: 11, color: "var(--mute)", fontFamily: "var(--font-mono)",
          display: "flex", alignItems: "center", gap: 8
        }}>
          <span style={{ display: "inline-block", width: 16, height: 16, borderRadius: 2, border: "1px dashed var(--mute-2)", textAlign: "center", lineHeight: "14px" }}>+</span>
          <span>insert step after <b style={{ color: "var(--ink-3)" }}>run-tests</b></span>
        </div>
      </div>
    </div>
  );
}

// ── TOML source pane with a highlighted range on the active step ──
const TOML_LINES = [
  { n: 1,  t: `formula = "gastownhall-upstream"`, k: "head" },
  { n: 2,  t: `version = 3`, k: "head" },
  { n: 3,  t: ``, k: "" },
  { n: 4,  t: `[vars.issue]`, k: "sec" },
  { n: 5,  t: `description = "The bead ID being submitted upstream"`, k: "" },
  { n: 6,  t: `required = true`, k: "" },
  { n: 7,  t: ``, k: "" },
  { n: 8,  t: `[[steps]]`, k: "sec" },
  { n: 9,  t: `id = "load-context"`, k: "" },
  { n: 10, t: `title = "Load bead, resolve repo path, prime tooling"`, k: "" },
  { n: 11, t: `retry = { max_attempts = 3, on_exhausted = "hard_fail" }`, k: "" },
  { n: 12, t: ``, k: "" },
  { n: 13, t: `[[steps]]`, k: "sec" },
  { n: 14, t: `id = "validate-worktree"`, k: "" },
  { n: 15, t: `title = "Validate repo state (clean, ahead of base)"`, k: "" },
  { n: 16, t: `needs = ["load-context"]`, k: "" },
  { n: 17, t: ``, k: "" },
  { n: 18, t: `[[steps]]`, k: "sec", hl: true },
  { n: 19, t: `id = "run-tests"`, k: "", hlActive: true },
  { n: 20, t: `title = "Regression-tier check + make check"`, k: "", hl: true },
  { n: 21, t: `needs = ["rebuild-integration"]`, k: "", hl: true },
  { n: 22, t: `metadata = { "gc.continuation_group" = "upstream-submit" }`, k: "", hl: true },
  { n: 23, t: ``, k: "" },
  { n: 24, t: `[steps.retry]`, k: "sec", hl: true },
  { n: 25, t: `max_attempts = 1`, k: "", hl: true },
  { n: 26, t: `on_exhausted = "hard_fail"`, k: "", hl: true },
  { n: 27, t: ``, k: "" },
  { n: 28, t: `description = """`, k: "" },
  { n: 29, t: `Load coordinates from \`rebuild-integration\`, run the regression-tier`, k: "com" },
  { n: 30, t: `check on the feature branch, then switch to {{base_branch}}.`, k: "com" },
  { n: 31, t: `"""`, k: "" },
];

function colorize(t) {
  // extremely small tokenizer for demo purposes
  const parts = [];
  let rest = t;
  // section headers
  if (rest.startsWith("[") && rest.endsWith("]")) return [{ cls: "t-sec", v: rest }];
  // comment block lines
  if (/^[a-zA-Z`]/.test(rest) && !rest.includes("=")) return [{ cls: "t-com", v: rest }];
  const eq = rest.indexOf("=");
  if (eq > 0) {
    const k = rest.slice(0, eq).trimEnd();
    const rem = rest.slice(eq);
    parts.push({ cls: "t-key", v: k });
    // split the right side by strings/vars/numbers
    let r = rem;
    const seg = /"[^"]*"|\{\{[^}]+\}\}|\b\d+\b/g;
    let last = 0, m;
    while ((m = seg.exec(r))) {
      if (m.index > last) parts.push({ cls: "", v: r.slice(last, m.index) });
      const v = m[0];
      let cls = v.startsWith(`"`) ? "t-str" : v.startsWith("{{") ? "t-var" : "t-num";
      parts.push({ cls, v });
      last = seg.lastIndex;
    }
    if (last < r.length) parts.push({ cls: "", v: r.slice(last) });
    return parts;
  }
  return [{ cls: "", v: rest }];
}

function SourcePane() {
  return (
    <div className="wf-right">
      <div className="src-tabs">
        <div className="tab active">gastownhall-upstream.formula.toml</div>
        <div className="tab">gc-base-step.formula.toml <span style={{ marginLeft: 6, color: "var(--mute-2)" }}>(extends)</span></div>
        <div className="spacer" />
        <div className="meta">
          <span>638 lines</span>
          <span>·</span>
          <span>TOML</span>
        </div>
      </div>
      <div className="src">
        {TOML_LINES.map((ln) => (
          <div key={ln.n} className={`ln ${ln.hlActive ? "hl" : ln.hl ? "hl-range" : ""}`}>
            <div className="gutter">{ln.n}</div>
            <div className="code">
              {ln.t === "" ? " " : colorize(ln.t).map((p, i) => <span key={i} className={p.cls}>{p.v}</span>)}
            </div>
          </div>
        ))}
        <div style={{ padding: "12px 14px 20px", color: "var(--mute-2)", fontSize: 11 }}>⋯ 607 lines below ⋯</div>
      </div>
    </div>
  );
}

function VarPalette() {
  const vars = [
    { k: "issue", req: true, def: null, desc: "Bead ID being submitted upstream", val: "fo-mhb6v-42", placeholder: false },
    { k: "title", req: true, def: null, desc: "PR title summary", val: "hooks sync regression guard", placeholder: false },
    { k: "branch", req: true, def: null, desc: "Branch name on the fork", val: "feat/fo-mhb6v-hooks-sync", placeholder: false },
    { k: "kind", req: true, def: null, desc: "feat or fix — drives PR title prefix", val: "feat", placeholder: false, enum: ["feat", "fix"] },
    { k: "scope", req: false, def: '""', desc: "Commit scope; empty → no scope", val: "gc", placeholder: false },
    { k: "upstream_owner", req: false, def: "gastownhall", desc: "PR target owner", val: "gastownhall", placeholder: false, isDefault: true },
    { k: "upstream_repo", req: false, def: "gascity", desc: "PR target repo", val: "gascity", placeholder: false, isDefault: true },
    { k: "base_branch", req: false, def: "main", desc: "Upstream base branch", val: "main", placeholder: false, isDefault: true },
    { k: "fork_remote", req: false, def: "cwalv", desc: "Git remote for the fork push", val: "cwalv", placeholder: false, isDefault: true },
    { k: "regression_required", req: false, def: "true", desc: "Hard-fail if no test file in diff", val: "true", placeholder: false, isDefault: true },
  ];
  return (
    <div className="drawer">
      <div className="d-head">
        <span>vars</span>
        <span style={{ marginLeft: "auto", color: "var(--mute)", fontWeight: 400, fontSize: 10, letterSpacing: 0 }}>4 required · 9 optional</span>
      </div>
      <div className="d-body">
        {vars.map((v) => (
          <div className="field" key={v.k}>
            <div className="k">
              <span>{v.k}</span>
              {v.req && <span className="req">*</span>}
              {v.enum && <span style={{ marginLeft: "auto", color: "var(--mute)", fontFamily: "var(--font-mono)", fontSize: 10 }}>{v.enum.join(" | ")}</span>}
            </div>
            <div className="desc">{v.desc}</div>
            <div className={`ctl ${v.isDefault ? "default" : ""}`}>{v.val}{v.isDefault && <span style={{ marginLeft: "auto", color: "var(--mute-2)", fontSize: 10 }}>default</span>}</div>
          </div>
        ))}
        <div style={{ padding: "14px", borderTop: "1px solid var(--rule)", marginTop: 4, display: "flex", gap: 6 }}>
          <button className="btn" style={{ flex: 1 }}>Dry-run cook</button>
          <button className="btn primary" style={{ flex: 1 }}>Pour to mol…</button>
        </div>
      </div>
    </div>
  );
}

function FormulaEditor() {
  return (
    <div className="wf" style={{ width: 1640, height: 1040 }}>
      <TopChrome dirty />
      <Tabs
        active="editor"
        items={[
          { id: "editor", label: "Editor" },
          { id: "catalog", label: "Catalog", count: 47 },
          { id: "graph", label: "Work graph" },
          { id: "queue", label: "Queue", count: 12 },
        ]}
      />
      <div className="wf-body">
        <Rail groups={[
          { title: "Project", count: 6, items: [
            { name: "gastownhall-upstream", active: true, badge: "v3" },
            { name: "gc-base-step" },
            { name: "gc-mail-escalate" },
            { name: "mol-polecat-work" },
            { name: "patrol-worker" },
            { name: "release" },
          ]},
          { title: "User", count: 4, items: [
            { name: "mol-do-work", badge: "v1" },
            { name: "mol-weave-work" },
            { name: "feature-workflow" },
            { name: "release-hotfix" },
          ]},
          { title: "Built-in", count: 37, items: [
            { name: "bond-template" },
            { name: "squash-digest" },
            { name: "security-scan" },
          ]},
        ]} />

        <div className="wf-center">
          <PaneHead label="DAG" info="8 steps · 0 cycles · depth 8" />
          <DagPane active="run-tests" />
        </div>

        <SourcePane />
        <VarPalette />
      </div>
      <FootBar left="✓ valid · 8 steps · 4 required vars unfilled" right="ast cached · parse 34ms · save ⌘S" />
    </div>
  );
}

window.FormulaEditor = FormulaEditor;
