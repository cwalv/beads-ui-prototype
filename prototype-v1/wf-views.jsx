// Artboards 4, 5, 6, 7: Catalog · Work graph · Issue detail · Work queue

function Catalog() {
  const rows = [
    { name: "gastownhall-upstream", v: "v3", extends: "gc-base-step", composes: ["gc-mail-escalate"], steps: 8, vars: 13, src: ".beads/formulas/" },
    { name: "gc-base-step", v: "v2", extends: null, composes: [], steps: 1, vars: 0, src: ".beads/formulas/" },
    { name: "gc-mail-escalate", v: "v1", extends: null, composes: [], steps: 2, vars: 3, src: ".beads/formulas/" },
    { name: "mol-polecat-work", v: "v4", extends: "gc-base-step", composes: [], steps: 6, vars: 5, src: ".beads/formulas/" },
    { name: "mol-do-work", v: "v1", extends: null, composes: [], steps: 2, vars: 1, src: "~/.beads/formulas/" },
    { name: "mol-weave-work", v: "v2", extends: null, composes: ["mol-do-work"], steps: 4, vars: 2, src: "~/.beads/formulas/" },
    { name: "patrol-worker", v: "v1", extends: null, composes: [], steps: 5, vars: 3, src: ".beads/formulas/" },
    { name: "release", v: "v2", extends: null, composes: [], steps: 6, vars: 1, src: ".beads/formulas/" },
    { name: "security-scan", v: "v1", extends: null, composes: [], steps: 0, vars: 0, src: "built-in", aspect: true },
  ];

  return (
    <div className="wf" style={{ width: 1200, height: 820 }}>
      <TopChrome path={["beads-ui", "formulas", "catalog"]} actions={<><button className="btn">Import</button><button className="btn primary">New formula</button></>} />
      <Tabs active="catalog" items={[
        { id: "editor", label: "Editor" },
        { id: "catalog", label: "Catalog", count: 47 },
        { id: "graph", label: "Work graph" },
        { id: "queue", label: "Queue", count: 12 },
      ]} />
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* filters rail */}
        <div style={{ width: 200, background: "var(--bg-2)", borderRight: "1px solid var(--rule)", padding: "12px 0" }}>
          <div style={{ padding: "4px 14px", fontSize: 10.5, color: "var(--mute)", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600 }}>Search paths</div>
          {[".beads/formulas/ (23)", "~/.beads/formulas/ (11)", "built-in (13)"].map((s, i) => (
            <div key={s} style={{ padding: "5px 18px", fontSize: 12, color: i === 0 ? "var(--ink)" : "var(--ink-2)", fontWeight: i === 0 ? 500 : 400, fontFamily: "var(--font-mono)", display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" defaultChecked readOnly style={{ margin: 0 }} />
              {s}
            </div>
          ))}
          <div style={{ padding: "14px 14px 4px", fontSize: 10.5, color: "var(--mute)", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600 }}>Type</div>
          {["workflow (41)", "expansion (3)", "aspect (3)"].map((s, i) => (
            <div key={s} style={{ padding: "5px 18px", fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--ink-2)", display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" defaultChecked={i === 0} readOnly style={{ margin: 0 }} /> {s}
            </div>
          ))}
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: "var(--bg)" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--rule)", display: "flex", gap: 10, alignItems: "center" }}>
            <div className="rail-search" style={{ margin: 0, flex: 1, height: 28 }}>⌕  Filter formulas · name, var, step id…</div>
            <span style={{ fontSize: 11, color: "var(--mute)", fontFamily: "var(--font-mono)" }}>47 results</span>
          </div>
          <div style={{ flex: 1, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "var(--bg-2)", borderBottom: "1px solid var(--rule)" }}>
                  {["Formula", "Extends", "Composes", "Steps", "Vars", "Source"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "8px 14px", fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--mute)", fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.name} style={{ borderBottom: "1px solid var(--rule-2)", background: i === 0 ? "var(--bg-2)" : "var(--bg)" }}>
                    <td style={{ padding: "10px 14px" }}>
                      <div style={{ fontFamily: "var(--font-mono)", color: "var(--ink)", fontWeight: i === 0 ? 600 : 500 }}>{r.name}</div>
                      <div style={{ display: "flex", gap: 6, marginTop: 3 }}>
                        <span className="badge">{r.v}</span>
                        {r.aspect && <span className="badge accent">aspect</span>}
                      </div>
                    </td>
                    <td style={{ padding: "10px 14px", fontFamily: "var(--font-mono)", fontSize: 11.5, color: r.extends ? "var(--accent)" : "var(--mute-2)" }}>{r.extends || "—"}</td>
                    <td style={{ padding: "10px 14px", fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--ink-2)" }}>{r.composes.length ? r.composes.join(", ") : <span style={{ color: "var(--mute-2)" }}>—</span>}</td>
                    <td style={{ padding: "10px 14px", fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--ink-2)" }}>{r.steps}</td>
                    <td style={{ padding: "10px 14px", fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--ink-2)" }}>{r.vars}</td>
                    <td style={{ padding: "10px 14px", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--mute)" }}>{r.src}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <FootBar left="3 search paths · 47 formulas" right="bd formula list · 41ms" />
    </div>
  );
}
window.Catalog = Catalog;

function WorkGraph() {
  // Simple nodes with status colors
  const nodes = [
    { id: "fo-a1b2", t: "Upstream submit hooks sync", s: "in_progress", p: 1, ph: "mol", x: 60, y: 80 },
    { id: "fo-c3d4", t: "hooks sync regression guard", s: "in_progress", p: 1, ph: "wisp", x: 300, y: 40 },
    { id: "fo-e5f6", t: "integration-refs audit", s: "open", p: 2, ph: "wisp", x: 300, y: 130 },
    { id: "fo-g7h8", t: "rebuild-integration conflict", s: "blocked", p: 0, ph: "wisp", x: 540, y: 80 },
    { id: "fo-i9j0", t: "make check failure: cover=false", s: "open", p: 2, ph: "mol", x: 540, y: 200 },
    { id: "fo-k1l2", t: "upstream PR #4412 watch", s: "open", p: 3, ph: "mol", x: 780, y: 80 },
    { id: "fo-m3n4", t: "digest: hooks-sync shipped", s: "closed", p: 3, ph: "digest", x: 780, y: 200 },
    { id: "fo-o5p6", t: "gascity sync patrol", s: "deferred", p: 4, ph: "wisp", x: 60, y: 220 },
  ];
  const edges = [
    ["fo-a1b2","fo-c3d4"], ["fo-a1b2","fo-e5f6"],
    ["fo-c3d4","fo-g7h8"], ["fo-e5f6","fo-g7h8"],
    ["fo-g7h8","fo-k1l2"],
    ["fo-e5f6","fo-i9j0"],
    ["fo-k1l2","fo-m3n4"],
  ];
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const statusColor = { open: "#8a9099", in_progress: "#2f6fe8", blocked: "#b23a3a", closed: "#2d7a4a", deferred: "#b6bbc1" };
  const phaseBadge = { proto: ["proto", "accent"], mol: ["mol", ""], wisp: ["wisp", "warn"], digest: ["digest", "ok"] };

  return (
    <div className="wf" style={{ width: 1200, height: 820 }}>
      <TopChrome path={["beads-ui", "work graph"]} actions={<><button className="btn">Ready only</button><button className="btn">Export</button><button className="btn primary">Claim next</button></>} />
      <Tabs active="graph" items={[
        { id: "editor", label: "Editor" },
        { id: "catalog", label: "Catalog", count: 47 },
        { id: "graph", label: "Work graph" },
        { id: "queue", label: "Queue", count: 12 },
      ]} />

      <div style={{ flex: 1, display: "flex", minHeight: 0, background: "var(--bg-2)" }}>
        {/* left filter rail */}
        <div style={{ width: 220, background: "var(--bg-2)", borderRight: "1px solid var(--rule)", padding: "14px 0", fontSize: 12 }}>
          <div style={{ padding: "0 14px 4px", fontSize: 10.5, color: "var(--mute)", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600 }}>Status</div>
          {Object.entries(statusColor).map(([s, c]) => (
            <div key={s} style={{ padding: "4px 18px", color: "var(--ink-2)", display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--font-mono)", fontSize: 11.5 }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: c }} /> {s}
              <span style={{ marginLeft: "auto", color: "var(--mute)", fontSize: 10.5 }}>{nodes.filter(n=>n.s===s).length}</span>
            </div>
          ))}
          <div style={{ padding: "12px 14px 4px", fontSize: 10.5, color: "var(--mute)", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600 }}>Phase</div>
          {["proto","mol","wisp","digest"].map((ph) => (
            <div key={ph} style={{ padding: "4px 18px", fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--ink-2)", display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" defaultChecked readOnly style={{ margin: 0 }} /> {ph}
            </div>
          ))}
          <div style={{ padding: "12px 14px 4px", fontSize: 10.5, color: "var(--mute)", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600 }}>Priority</div>
          <div style={{ padding: "4px 18px", fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--ink-2)" }}>0 (critical) — 4 (backlog)</div>
        </div>

        {/* graph canvas */}
        <div style={{ flex: 1, position: "relative", overflow: "auto", minWidth: 0 }}>
          <div style={{ position: "relative", width: 1000, height: 340, padding: 20 }}>
            <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
              <defs>
                <marker id="ah3" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#b6bbc1" /></marker>
              </defs>
              {edges.map(([a,b], i) => {
                const A = byId[a], B = byId[b];
                const ax = A.x + 190, ay = A.y + 32, bx = B.x, by = B.y + 32;
                const mid = (ax + bx) / 2;
                return <path key={i} d={`M ${ax} ${ay} C ${mid} ${ay}, ${mid} ${by}, ${bx - 4} ${by}`} fill="none" stroke="#b6bbc1" strokeWidth="1.25" markerEnd="url(#ah3)" />;
              })}
            </svg>
            {nodes.map((n) => {
              const [ph, cls] = phaseBadge[n.ph];
              return (
                <div key={n.id} style={{ position: "absolute", left: n.x, top: n.y, width: 190, background: "var(--bg)", border: `1px solid ${n.s === "in_progress" ? "var(--ink)" : "var(--rule)"}`, borderRadius: 3, padding: 8, boxShadow: n.s === "in_progress" ? "0 0 0 1px var(--ink)" : "0 1px 0 rgba(0,0,0,0.02)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor[n.s] }} />
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--mute)" }}>{n.id}</span>
                    <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--mute)" }}>p{n.p}</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--ink)", marginBottom: 6, lineHeight: 1.35 }}>{n.t}</div>
                  <span className={`badge ${cls}`}>{ph}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <FootBar left="8 issues · 1 blocked · 2 in progress · 1 closed" right="bd ready · 34 total in store" />
    </div>
  );
}
window.WorkGraph = WorkGraph;

function IssueDetail() {
  return (
    <div className="wf" style={{ width: 1200, height: 820 }}>
      <TopChrome path={["beads-ui", "issue", "fo-c3d4"]} actions={<><button className="btn">Close</button><button className="btn">Block</button><button className="btn primary">Claim</button></>} />

      <div style={{ flex: 1, display: "flex", minHeight: 0, background: "var(--bg-2)" }}>
        <div style={{ flex: 1, overflow: "auto", padding: 32, minWidth: 0 }}>
          {/* header */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--mute)" }}>fo-c3d4</span>
            <span className="badge">wisp</span>
            <span className="badge accent">in_progress</span>
            <span className="badge">p1</span>
            <span className="badge">feature</span>
            <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--mute)", fontFamily: "var(--font-mono)" }}>gh-4412 · synced 2m ago</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em", color: "var(--ink)", marginBottom: 6 }}>
            hooks sync regression guard
          </div>
          <div style={{ fontSize: 12, color: "var(--mute)", marginBottom: 22, fontFamily: "var(--font-mono)" }}>assignee: cwalv · created 2d ago · 3 comments · 7 events</div>

          {/* field sections */}
          {[
            { h: "Description", body: "Add a regression-tier check in mol-gascity-sync that hard-fails if the diverging commits don't touch a test file. Picking the tier is the triage-phase job; this gate is \"is there any test?\"." },
            { h: "Design", body: "Surfaces TESTING.md first (do not improvise alternate commands). Regression check runs on the feature branch before switching to the throwaway upstream-test-ref for make check." },
            { h: "Acceptance criteria", body: "• TESTING.md is read and logged before any test command fires.\n• Hard-fail with a mayor mail when no test file is modified and regression_required=true.\n• Feature branch HEAD must match FEATURE_SHA after tests complete." },
            { h: "Notes", body: "Escalation template at .beads/templates/upstream-blocked.txt · mayor inbox watched by gascity-upstream-status." },
          ].map((s) => (
            <div key={s.h} style={{ marginBottom: 20 }}>
              <div className="section-h" style={{ marginBottom: 6 }}>{s.h}</div>
              <div className="card" style={{ padding: 14, fontSize: 13, color: "var(--ink-2)", whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{s.body}</div>
            </div>
          ))}

          {/* deps */}
          <div style={{ marginBottom: 20 }}>
            <div className="section-h" style={{ marginBottom: 6 }}>Dependencies</div>
            <div className="card" style={{ padding: 0 }}>
              {[
                ["blocks", "fo-g7h8", "rebuild-integration conflict", "blocked"],
                ["waits-for", "fo-e5f6", "integration-refs audit", "open"],
                ["related", "fo-m3n4", "digest: hooks-sync shipped", "closed"],
                ["discovered-from", "fo-a1b2", "Upstream submit hooks sync", "in_progress"],
              ].map((r, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "130px 100px 1fr 100px", padding: "8px 14px", borderBottom: i < 3 ? "1px solid var(--rule-2)" : "none", alignItems: "center", fontSize: 12 }}>
                  <span className={`badge ${r[0] === "blocks" || r[0] === "waits-for" ? "warn" : ""}`}>{r[0]}</span>
                  <span style={{ fontFamily: "var(--font-mono)", color: "var(--accent)", fontSize: 11.5 }}>{r[1]}</span>
                  <span style={{ color: "var(--ink-2)" }}>{r[2]}</span>
                  <span style={{ textAlign: "right", color: "var(--mute)", fontFamily: "var(--font-mono)", fontSize: 11 }}>{r[3]}</span>
                </div>
              ))}
            </div>
          </div>

          {/* comments + events */}
          <div className="section-h" style={{ marginBottom: 6 }}>Activity</div>
          <div className="card" style={{ padding: 0 }}>
            {[
              { k: "comment", who: "cwalv", when: "2h", t: "Pushing feat/fo-mhb6v-hooks-sync to fork now. integration-refs has 2 outstanding entries." },
              { k: "event", who: "mol-polecat", when: "5h", t: "status: open → in_progress (claim)" },
              { k: "event", who: "mol-polecat", when: "5h", t: "labels += pending-upstream" },
              { k: "comment", who: "mayor", when: "9h", t: "Escalated: rebuild-integration cherry-pick conflict in integration-refs entry `cwalv/cutler-fix`. Trim the merged ref before retrying." },
              { k: "event", who: "bd", when: "2d", t: "created from fo-a1b2 via discovered-from" },
            ].map((e, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "80px 1fr 70px", padding: "10px 14px", borderBottom: i < 4 ? "1px solid var(--rule-2)" : "none", alignItems: "start", fontSize: 12 }}>
                <span className={`badge ${e.k === "comment" ? "accent" : ""}`}>{e.k}</span>
                <div style={{ color: "var(--ink-2)" }}>
                  <span style={{ fontFamily: "var(--font-mono)", color: "var(--ink)", fontWeight: 500 }}>{e.who}</span> · {e.t}
                </div>
                <span style={{ textAlign: "right", color: "var(--mute)", fontFamily: "var(--font-mono)", fontSize: 11 }}>{e.when}</span>
              </div>
            ))}
          </div>
        </div>

        {/* right metadata drawer */}
        <div style={{ width: 280, background: "var(--bg)", borderLeft: "1px solid var(--rule)", padding: 18, overflow: "auto" }}>
          <div className="section-h" style={{ marginBottom: 10 }}>Metadata</div>
          <div className="kv" style={{ marginBottom: 16 }}>
            {[
              ["status", "in_progress"], ["priority", "1"], ["type", "feature"],
              ["assignee", "cwalv"], ["phase", "wisp"],
              ["pr_url", "github.com/gastownhall/gascity/pull/4412"], ["pr_number", "4412"], ["pr_repo", "gastownhall/gascity"],
              ["pr_head_branch", "feat/fo-mhb6v-hooks-sync"], ["pr_base_branch", "main"],
              ["external_ref", "gh-4412"], ["estimated_minutes", "45"],
              ["created_by", "cwalv"], ["created_at", "2026-04-18 14:32"], ["updated_at", "2026-04-20 11:04"],
            ].map(([k, v]) => (<React.Fragment key={k}><span className="k">{k}</span><span className="v" style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, wordBreak: "break-all" }}>{v}</span></React.Fragment>))}
          </div>
          <div className="section-h" style={{ marginBottom: 6 }}>Labels</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {["pending-upstream", "regression-tier", "area:sync", "rig-scoped"].map((l) => <span key={l} className="badge">{l}</span>)}
            <span className="badge" style={{ background: "var(--bg)", border: "1px dashed var(--rule)", color: "var(--mute)" }}>+ add</span>
          </div>
        </div>
      </div>
      <FootBar left="cell-level merge ready · no conflicts" right="fo-c3d4 · content hash a1b2c3d4" />
    </div>
  );
}
window.IssueDetail = IssueDetail;

function WorkQueue() {
  const cards = [
    { id: "fo-g7h8", p: 0, t: "rebuild-integration conflict", st: "blocked", ph: "wisp", a: "mol-polecat", labels: ["blocker", "mayor-escalated"] },
    { id: "fo-a1b2", p: 1, t: "Upstream submit hooks sync", st: "in_progress", ph: "mol", a: "cwalv", labels: ["upstream"] },
    { id: "fo-c3d4", p: 1, t: "hooks sync regression guard", st: "in_progress", ph: "wisp", a: "cwalv", labels: ["pending-upstream"] },
    { id: "fo-i9j0", p: 2, t: "make check failure: cover=false", st: "open", ph: "mol", a: null, labels: ["bug", "tests"] },
    { id: "fo-e5f6", p: 2, t: "integration-refs audit", st: "open", ph: "wisp", a: null, labels: ["chore"] },
    { id: "fo-q1r2", p: 2, t: "Trim merged refs from integration-refs.toml", st: "open", ph: "wisp", a: null, labels: ["chore"] },
    { id: "fo-s3t4", p: 3, t: "Document TESTING.md tier-selection rules", st: "open", ph: "mol", a: null, labels: ["docs"] },
    { id: "fo-k1l2", p: 3, t: "upstream PR #4412 watch", st: "open", ph: "mol", a: "gascity-upstream-status", labels: ["pending-upstream"] },
  ];
  const byP = [0,1,2,3,4].map((p) => ({ p, items: cards.filter((c) => c.p === p) }));

  return (
    <div className="wf" style={{ width: 1200, height: 820 }}>
      <TopChrome path={["beads-ui", "queue", "bd ready"]} actions={<><button className="btn">Group: priority</button><button className="btn">Filters · 2</button><button className="btn primary">Claim next</button></>} />
      <Tabs active="queue" items={[
        { id: "editor", label: "Editor" },
        { id: "catalog", label: "Catalog", count: 47 },
        { id: "graph", label: "Work graph" },
        { id: "queue", label: "Queue", count: 12 },
      ]} />

      <div style={{ flex: 1, display: "flex", minHeight: 0, background: "var(--bg-2)", padding: "16px 14px", overflow: "auto", gap: 14 }}>
        {byP.map((col) => (
          <div key={col.p} style={{ width: 260, display: "flex", flexDirection: "column", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
              <span className="section-h">{["critical","high","medium","normal","backlog"][col.p]}</span>
              <span style={{ marginLeft: 8, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--mute)" }}>p{col.p} · {col.items.length}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {col.items.map((c) => (
                <div key={c.id} className="card" style={{ padding: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--mute)" }}>{c.id}</span>
                    <span style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                      <span className={`badge ${c.ph === "wisp" ? "warn" : c.ph === "digest" ? "ok" : ""}`}>{c.ph}</span>
                      <span className={`badge ${c.st === "blocked" ? "danger" : c.st === "in_progress" ? "accent" : ""}`}>{c.st}</span>
                    </span>
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--ink)", lineHeight: 1.35, marginBottom: 6 }}>{c.t}</div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6 }}>
                    {c.labels.map((l) => <span key={l} className="chip">{l}</span>)}
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--mute)", fontFamily: "var(--font-mono)" }}>
                    {c.a ? `@${c.a}` : "unclaimed"}
                  </div>
                </div>
              ))}
              {col.items.length === 0 && (
                <div style={{ fontSize: 11, color: "var(--mute-2)", fontFamily: "var(--font-mono)", padding: "18px 0", textAlign: "center" }}>nothing</div>
              )}
            </div>
          </div>
        ))}
      </div>
      <FootBar left="12 ready · 1 blocked excluded" right="bd ready --json · 21ms" />
    </div>
  );
}
window.WorkQueue = WorkQueue;
