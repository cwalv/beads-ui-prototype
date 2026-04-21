// Artboards 2 & 3: DAG detail (step-card variants + edge types + error states)
// and Cook preview (vars → proto structure).

function StepVariants() {
  return (
    <div className="wf" style={{ width: 1200, height: 820 }}>
      <TopChrome path={["wireframe", "DAG pane — detail"]} actions={<><button className="btn">Back</button></>} />
      <div style={{ flex: 1, padding: 32, background: "var(--bg-2)", overflow: "auto" }}>

        <div className="section-h" style={{ marginBottom: 10 }}>Step card states</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 260px)", gap: 20, marginBottom: 40 }}>
          <div style={{ position: "relative", height: 180 }}>
            <StepCard step={{ idx: 1, id: "load-context", title: "Load bead, resolve repo path", retry: "3 · hard_fail", meta: ["gc.continuation_group"] }} style={{ position: "static" }} />
            <div style={{ marginTop: 8, fontSize: 11, color: "var(--mute)", fontFamily: "var(--font-mono)" }}>default</div>
          </div>
          <div style={{ position: "relative", height: 180 }}>
            <StepCard step={{ idx: 4, id: "run-tests", title: "Regression-tier check + make check", retry: "1 · hard_fail", meta: ["gc.session_affinity"], needs: ["rebuild-integration"] }} style={{ position: "static" }} state="active" />
            <div style={{ marginTop: 8, fontSize: 11, color: "var(--mute)", fontFamily: "var(--font-mono)" }}>active (selected)</div>
          </div>
          <div style={{ position: "relative", height: 180 }}>
            <StepCard step={{ idx: 6, id: "open-pr", title: "Open PR (skip if one already exists)", retry: "3 · hard_fail", idem: true, needs: ["push"] }} style={{ position: "static" }} />
            <div style={{ marginTop: 8, fontSize: 11, color: "var(--mute)", fontFamily: "var(--font-mono)" }}>idempotency hinge</div>
          </div>
          <div style={{ position: "relative", height: 180 }}>
            <StepCard step={{ idx: 3, id: "rebuild-integration", title: "Rebuild cwalv:integration + test-ref", retry: "1 · hard_fail (exhausted)", needs: ["validate-worktree"] }} style={{ position: "static" }} state="error" />
            <div style={{ marginTop: 8, fontSize: 11, color: "var(--danger)", fontFamily: "var(--font-mono)" }}>error · mailroom escalated</div>
          </div>
        </div>

        <div className="section-h" style={{ marginBottom: 10 }}>Edge types</div>
        <div className="card" style={{ padding: 20, marginBottom: 40 }}>
          <svg width="1100" height="160" style={{ display: "block" }}>
            <defs>
              <marker id="ah2" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#b6bbc1" /></marker>
              <marker id="ah2-w" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#c36a1d" /></marker>
              <marker id="ah2-d" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#b23a3a" /></marker>
            </defs>
            {/* 4 rows of edges: needs · waits-for · conditional-on-fail · cycle detected */}
            <g>
              <text x="10" y="22" fontSize="10.5" fill="#8a9099" fontFamily="var(--font-mono)">needs</text>
              <path d="M 130 20 C 240 20, 240 20, 330 20" fill="none" stroke="#b6bbc1" strokeWidth="1.25" markerEnd="url(#ah2)" />
              <text x="350" y="24" fontSize="11" fill="#4a5159">sequential dependency (blocks downstream)</text>
            </g>
            <g>
              <text x="10" y="62" fontSize="10.5" fill="#8a9099" fontFamily="var(--font-mono)">waits-for</text>
              <path d="M 130 60 C 200 60, 200 60, 330 60" fill="none" stroke="#b6bbc1" strokeWidth="1.25" strokeDasharray="2 3" markerEnd="url(#ah2)" />
              <text x="350" y="64" fontSize="11" fill="#4a5159">fanout gate (waits for all children)</text>
            </g>
            <g>
              <text x="10" y="102" fontSize="10.5" fill="#8a9099" fontFamily="var(--font-mono)">idem</text>
              <path d="M 130 100 C 240 100, 240 100, 330 100" fill="none" stroke="#c36a1d" strokeWidth="1.3" strokeDasharray="4 3" markerEnd="url(#ah2-w)" />
              <text x="350" y="104" fontSize="11" fill="#4a5159">idempotency hinge — downstream re-entry safe</text>
            </g>
            <g>
              <text x="10" y="142" fontSize="10.5" fill="#8a9099" fontFamily="var(--font-mono)">cycle</text>
              <path d="M 130 140 C 240 140, 240 140, 330 140" fill="none" stroke="#b23a3a" strokeWidth="1.4" markerEnd="url(#ah2-d)" />
              <text x="350" y="144" fontSize="11" fill="#b23a3a">cycle detected · blocks save until resolved</text>
            </g>
          </svg>
        </div>

        <div className="section-h" style={{ marginBottom: 10 }}>Inline authoring affordances</div>
        <div className="card" style={{ padding: 20, display: "flex", gap: 40, fontSize: 12 }}>
          <div>
            <div style={{ color: "var(--mute)", fontFamily: "var(--font-mono)", fontSize: 10.5, marginBottom: 6 }}>click step id</div>
            <div style={{ fontSize: 12 }}>Rename step id inline · propagates across all <span style={{ fontFamily: "var(--font-mono)", color: "var(--accent)" }}>needs=[…]</span> references</div>
          </div>
          <div>
            <div style={{ color: "var(--mute)", fontFamily: "var(--font-mono)", fontSize: 10.5, marginBottom: 6 }}>drag edge from card edge</div>
            <div style={{ fontSize: 12 }}>Create a new <span style={{ fontFamily: "var(--font-mono)", color: "var(--accent)" }}>needs</span> edge · TOML updates in place</div>
          </div>
          <div>
            <div style={{ color: "var(--mute)", fontFamily: "var(--font-mono)", fontSize: 10.5, marginBottom: 6 }}>hover gap between cards</div>
            <div style={{ fontSize: 12 }}>Insert a step between two existing ones · needs rewritten on both sides</div>
          </div>
        </div>
      </div>
    </div>
  );
}
window.StepVariants = StepVariants;

function CookPreview() {
  return (
    <div className="wf" style={{ width: 1200, height: 820 }}>
      <TopChrome path={["wireframe", "Cook preview"]} actions={<><button className="btn">Reset vars</button><button className="btn primary">Pour to mol</button></>} />
      <div style={{ flex: 1, display: "flex", minHeight: 0, background: "var(--bg-2)" }}>
        {/* Var fill form */}
        <div style={{ width: 360, background: "var(--bg)", borderRight: "1px solid var(--rule)", display: "flex", flexDirection: "column" }}>
          <PaneHead label="Cook · vars" info="4 required · 9 optional" tools={false} />
          <div style={{ padding: 14, overflow: "auto", flex: 1 }}>
            {[
              { k: "issue", val: "fo-mhb6v-42", req: true },
              { k: "title", val: "hooks sync regression guard", req: true },
              { k: "branch", val: "feat/fo-mhb6v-hooks-sync", req: true },
              { k: "kind", val: "feat", req: true, enum: true },
              { k: "scope", val: "gc", def: true },
              { k: "upstream_owner", val: "gastownhall", def: true },
              { k: "upstream_repo", val: "gascity", def: true },
              { k: "base_branch", val: "main", def: true },
              { k: "regression_required", val: "true", def: true },
            ].map((v) => (
              <div key={v.k} style={{ marginBottom: 12 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink)", marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
                  {v.k}{v.req && <span style={{ color: "var(--danger)" }}>*</span>}
                  {v.enum && <span style={{ marginLeft: "auto", color: "var(--mute)", fontSize: 10 }}>feat | fix</span>}
                </div>
                <div className={`ctl ${v.def ? "default" : ""}`} style={{
                  height: 26, border: "1px solid var(--rule)", padding: "0 8px",
                  fontFamily: "var(--font-mono)", fontSize: 11.5,
                  background: v.def ? "var(--bg-2)" : "var(--bg)",
                  color: v.def ? "var(--ink-3)" : "var(--ink-2)",
                  display: "flex", alignItems: "center", borderRadius: 2
                }}>{v.val}{v.def && <span style={{ marginLeft: "auto", color: "var(--mute-2)", fontSize: 10 }}>default</span>}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Proto preview — structured */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <PaneHead label="Proto preview" info="bd cook → ephemeral (not committed)" tools={false} />
          <div style={{ padding: 20, overflow: "auto", flex: 1 }}>
            <div className="card" style={{ padding: 16, marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <span className="badge accent">proto</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600 }}>bd-cook-preview:fo-mhb6v-42</span>
                <span style={{ marginLeft: "auto", color: "var(--mute)", fontSize: 11 }}>type: molecule · 8 wisps</span>
              </div>
              <div style={{ fontSize: 13, color: "var(--ink-2)" }}>Upstream submission · <i>hooks sync regression guard</i></div>
            </div>

            {UP_STEPS.map((s, i) => (
              <div key={s.id} style={{
                display: "grid", gridTemplateColumns: "36px 1fr", columnGap: 12,
                padding: "10px 4px", borderBottom: i < UP_STEPS.length - 1 ? "1px solid var(--rule-2)" : "none"
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 2, background: "var(--bg-3)",
                  color: "var(--ink-3)", display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600
                }}>{s.idx}</div>
                <div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--ink)" }}>wisp · bd-cook-preview:fo-mhb6v-42.{s.id}</div>
                  <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 2 }}>{s.title}</div>
                  <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                    {s.retry && <span className="badge">retry {s.retry}</span>}
                    {s.needs?.map((n) => <span key={n} className="chip needs">{n}</span>)}
                    {s.idem && <span className="badge warn">idem</span>}
                  </div>
                </div>
              </div>
            ))}

            <div style={{ marginTop: 14, padding: "10px 12px", background: "#fffdf0", border: "1px solid #e6dfa6", borderRadius: 2, fontSize: 11.5, color: "#5a4a2a", fontFamily: "var(--font-mono)" }}>
              <b>preview only</b> — no beads were written. <span style={{ color: "#8a7a4a" }}>Pour to mol</span> to commit this proto to .beads/.
            </div>
          </div>
        </div>
      </div>
      <FootBar left="✓ all required vars bound" right="cook ready · simulation" />
    </div>
  );
}
window.CookPreview = CookPreview;
