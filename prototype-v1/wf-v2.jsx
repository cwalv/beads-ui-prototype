// V2 surfaces: Author / Observe / Capture + workspace switcher + peek drawer.
// Builds on wf-shared.jsx primitives + existing wf-formula-editor / wf-dag-cook / wf-views / wf-learn.

// ══════════════════════════════════════════════════════════════════════════
// Architecture overview artboard
// ══════════════════════════════════════════════════════════════════════════
function ArchOverview() {
  return (
    <div className="wf" style={{ width: 1200, height: 720, background: "var(--bg)" }}>
      <TopChromeV2 workspace="fo-beads-ui" destination="author" breadcrumb={["author", "browse"]} />
      <div style={{ flex: 1, padding: "32px 48px", overflow: "auto" }}>
        <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--mute)", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600 }}>v2 architecture</div>
        <h1 style={{ fontSize: 28, margin: "8px 0 6px", letterSpacing: "-0.01em" }}>Three destinations, one peek drawer, one workspace switcher</h1>
        <div style={{ fontSize: 13, color: "var(--ink-3)", maxWidth: 820, lineHeight: 1.55 }}>
          The P0/P1 split was a shipping order, not an architecture. The real axes are <b>tempo</b> and <b>data backend</b>: formulas are slow, filesystem-shaped edits; molecules + beads are fast, Dolt-shaped observables; capture is a quick-in/quick-out write path. Everything else — issue detail, catalog, cook, timeline — is a mode, a layout, or a peek.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginTop: 28 }}>
          {[
            { k: "Author", q: "What should happen?", d: "Formula authoring. Two modes: Browse (catalog) · Edit (two-pane TOML↔DAG). Three tabs inside Edit: Source · Cook · Instances.", t: "slow · filesystem · edit-heavy", acc: "#2f6fe8" },
            { k: "Observe", q: "What's happening?", d: "Molecules + beads state. Three projections of one node set: Graph · Queue · Timeline. Shared filter rail.", t: "real-time · Dolt · read-heavy", acc: "#2d7a4a" },
            { k: "Capture", q: "Here's a new bead.", d: "A single-bead form. Title · description · type · priority · a couple of deps. No DSL, no batch import, no epic templates — just the fastest path to one bead existing. Reachable anywhere via ⌘N.", t: "fast · single write", acc: "#c36a1d" },
          ].map(c => (
            <div key={c.k} style={{ border: "1px solid var(--rule)", borderRadius: 3, padding: 18, background: "var(--bg-2)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ width: 4, height: 18, background: c.acc, borderRadius: 1 }} />
                <span style={{ fontSize: 15, fontWeight: 700 }}>{c.k}</span>
              </div>
              <div style={{ fontSize: 12.5, color: "var(--ink-2)", fontStyle: "italic", marginBottom: 10 }}>"{c.q}"</div>
              <div style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.55, marginBottom: 10 }}>{c.d}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--mute)", letterSpacing: "0.03em" }}>{c.t}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 20 }}>
          <div style={{ border: "1px solid var(--rule)", borderRadius: 3, padding: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Peek drawer</div>
            <div style={{ fontSize: 12, color: "var(--ink-3)", lineHeight: 1.55 }}>
              Shared right-side overlay. Summoned from anywhere to edit a bead or molecule's full schema. Pinnable → split panel for long sessions. <code style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>/bead/fo-abc</code> deep-link opens current page with drawer pre-open — no standalone issue route.
            </div>
          </div>
          <div style={{ border: "1px solid var(--rule)", borderRadius: 3, padding: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Workspace switcher</div>
            <div style={{ fontSize: 12, color: "var(--ink-3)", lineHeight: 1.55 }}>
              Top-left pill. Switch <code style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>.beads/</code> databases. <b>Consolidated view toggle</b> merges bead/molecule queries across selected workspaces; each result row gets a workspace-colored left bar. Formulas stay per-workspace (search paths differ).
            </div>
          </div>
        </div>

        <div style={{ marginTop: 24, fontSize: 11, color: "var(--mute)", fontFamily: "var(--font-mono)" }}>
          Command palette (⌘K) stays as accelerator, not replacement. "Hide chrome" collapses tabs for power-user mode.
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// Author · Browse — catalog with preview pane
// ══════════════════════════════════════════════════════════════════════════
function AuthorBrowse() {
  const formulas = [
    { name: "gastownhall-upstream", v: 3, steps: 8, instances: 3, path: "fo-beads-ui/.beads/formulas/", tag: "workflow", active: true },
    { name: "gascity-upstream-status", v: 2, steps: 4, instances: 12, path: "fo-beads-ui/.beads/formulas/", tag: "workflow" },
    { name: "mol-polecat-work", v: 5, steps: 6, instances: 24, path: "~/.beads/formulas/", tag: "workflow" },
    { name: "mol-weave-work", v: 2, steps: 3, instances: 7, path: "~/.beads/formulas/", tag: "workflow", extends: "mol-polecat-work" },
    { name: "mol-do-work", v: 1, steps: 2, instances: 41, path: "builtin", tag: "workflow" },
    { name: "security-scan", v: 1, steps: 0, instances: null, path: "builtin", tag: "aspect", advice: "*.deploy" },
    { name: "release", v: 1, steps: 6, instances: 2, path: "fo-beads-ui/.beads/formulas/", tag: "workflow" },
  ];
  const steps = ["load-context", "validate-worktree", "rebuild-integration", "run-tests", "push", "open-pr", "label-and-record", "drain"];

  return (
    <div className="wf" style={{ width: 1640, height: 960 }}>
      <TopChromeV2 workspace="fo-beads-ui" destination="author" breadcrumb={["author", "browse"]}
        actions={<><button className="btn">New formula</button><button className="btn primary">Edit →</button></>} />

      <div className="mode-bar">
        <div className="mode active">Browse <span className="ct">47</span></div>
        <div className="mode">Edit</div>
        <div className="sp" />
        <div className="slice">Search paths · <span className="chip">.beads/formulas/</span><span className="chip">~/.beads/formulas/</span><span className="chip">builtin</span></div>
      </div>

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* Catalog list */}
        <div style={{ width: 680, borderRight: "1px solid var(--rule)", overflow: "auto" }}>
          <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--rule)", background: "var(--bg-2)", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--mute)" }}>⌕</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--ink-3)" }}>Filter by name, extends, or aspect target…</span>
            <span style={{ flex: 1 }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--mute-2)" }}>bd formula list --json</span>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--rule)" }}>
                {["formula", "v", "type", "steps", "instances", "path"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "6px 12px", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--mute)", fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {formulas.map(f => (
                <tr key={f.name} style={{ borderBottom: "1px solid var(--rule-2)", background: f.active ? "var(--accent-soft)" : "var(--bg)" }}>
                  <td style={{ padding: "9px 12px", fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--ink)", fontWeight: f.active ? 600 : 400 }}>
                    {f.name}
                    {f.extends && <div style={{ fontSize: 10, color: "var(--mute)" }}>extends {f.extends}</div>}
                  </td>
                  <td style={{ padding: "9px 12px", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--mute)" }}>v{f.v}</td>
                  <td style={{ padding: "9px 12px", fontFamily: "var(--font-mono)", fontSize: 11, color: f.tag === "aspect" ? "var(--warn)" : "var(--ink-3)" }}>
                    {f.tag}{f.advice ? ` · ${f.advice}` : ""}
                  </td>
                  <td style={{ padding: "9px 12px", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-3)" }}>{f.steps || "—"}</td>
                  <td style={{ padding: "9px 12px", fontFamily: "var(--font-mono)", fontSize: 11, color: f.instances ? "var(--accent)" : "var(--mute-2)" }}>{f.instances ?? "—"}</td>
                  <td style={{ padding: "9px 12px", fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--mute)" }}>{f.path}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Preview pane */}
        <div style={{ flex: 1, overflow: "auto", background: "var(--bg-2)" }}>
          <div style={{ padding: "16px 20px", background: "var(--bg)", borderBottom: "1px solid var(--rule)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 600 }}>gastownhall-upstream</div>
              <span className="chip">v3</span>
              <span className="chip" style={{ background: "var(--accent-soft)", color: "var(--accent)", borderColor: "transparent" }}>3 instances live</span>
            </div>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 8, lineHeight: 1.55, maxWidth: 680 }}>
              Upstream-submission lifecycle for external contributions. Validates tree, runs <code style={{ fontFamily: "var(--font-mono)" }}>make check</code>, pushes to fork, opens a PR, labels <code style={{ fontFamily: "var(--font-mono)" }}>pending-upstream</code>. The bead is <b>not</b> closed; a sibling watcher handles merge.
            </div>
          </div>

          {/* DAG thumbnail */}
          <div style={{ padding: "18px 20px" }}>
            <div className="section-h" style={{ marginBottom: 10 }}>Step DAG</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              {steps.map((s, i) => (
                <React.Fragment key={s}>
                  <div style={{ padding: "6px 10px", border: "1px solid var(--rule)", background: "var(--bg)", borderRadius: 2, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-2)" }}>
                    {s}
                  </div>
                  {i < steps.length - 1 && <span style={{ color: "var(--mute-2)", fontSize: 14 }}>→</span>}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Vars */}
          <div style={{ padding: "8px 20px 18px" }}>
            <div className="section-h" style={{ marginBottom: 10 }}>Variables · 13 total · 4 required</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {[
                ["issue", true, "—"], ["title", true, "—"], ["branch", true, "—"], ["kind", true, "feat|fix"],
                ["upstream_owner", false, "gastownhall"], ["upstream_repo", false, "gascity"], ["base_branch", false, "main"], ["regression_required", false, "true"],
              ].map(([n, req, def]) => (
                <div key={n} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 8px", background: "var(--bg)", border: "1px solid var(--rule-2)", borderRadius: 2, fontFamily: "var(--font-mono)", fontSize: 11 }}>
                  <span style={{ color: req ? "var(--danger)" : "var(--mute-2)", fontSize: 9 }}>●</span>
                  <span style={{ color: "var(--ink)" }}>{n}</span>
                  <span style={{ flex: 1 }} />
                  <span style={{ color: "var(--mute)", fontSize: 10.5 }}>{def}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Instance bridge */}
          <div style={{ padding: "8px 20px 22px" }}>
            <div className="section-h" style={{ marginBottom: 10 }}>Live instances <span style={{ color: "var(--accent)", marginLeft: 6 }}>→ Observe · Timeline</span></div>
            {[
              { id: "mol-8h2k", issue: "fo-mhb6v-42", step: "run-tests", st: "in_progress" },
              { id: "mol-7g1j", issue: "fo-c3d4-11", step: "open-pr", st: "in_progress" },
              { id: "mol-6f9i", issue: "fo-a1b2-08", step: "drain", st: "closed" },
            ].map(m => (
              <div key={m.id} style={{ display: "grid", gridTemplateColumns: "90px 100px 1fr 100px", padding: "6px 10px", borderBottom: "1px solid var(--rule-2)", fontFamily: "var(--font-mono)", fontSize: 11, alignItems: "center" }}>
                <span style={{ color: "var(--ink-2)" }}>{m.id}</span>
                <span style={{ color: "var(--mute)" }}>{m.issue}</span>
                <span style={{ color: "var(--ink-3)" }}>at · {m.step}</span>
                <span className={`st-icon ${m.st === "closed" ? "st-closed" : "st-prog"}`}>{m.st === "closed" ? "✓ closed" : "◐ " + m.st}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <FootBar left="7 formulas · 3 search paths · 1 aspect" right="Author · Browse" />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// Observe · Timeline — Temporal-style molecule chronology
// ══════════════════════════════════════════════════════════════════════════
function ObserveTimeline() {
  const steps = [
    { id: "load-context", needs: [], bars: [{ x: 0, w: 3, cls: "done", t: "1.2s" }] },
    { id: "validate-worktree", needs: ["load-context"], bars: [{ x: 3, w: 2, cls: "done", t: "0.8s" }] },
    { id: "rebuild-integration", needs: ["validate-worktree"], bars: [{ x: 5, w: 8, cls: "done", t: "12s · cherry-pick" }] },
    { id: "run-tests", needs: ["rebuild-integration"], retry: true, bars: [
      { x: 13, w: 9, cls: "retry", t: "attempt 1 · make check failed" },
      { x: 22, w: 2, cls: "wait", t: "backoff" },
      { x: 24, w: 14, cls: "prog", t: "attempt 2 · make check (running)" },
    ] },
    { id: "push", needs: ["run-tests"], bars: [] },
    { id: "open-pr", needs: ["push"], gate: "idempotency: skip if PR exists", bars: [] },
    { id: "label-and-record", needs: ["open-pr"], bars: [] },
    { id: "drain", needs: ["label-and-record"], bars: [] },
  ];
  const ticks = ["0s", "10s", "20s", "30s", "40s", "50s", "now"];

  return (
    <div className="wf" style={{ width: 1640, height: 960 }}>
      <TopChromeV2 workspace="fo-beads-ui" destination="observe" breadcrumb={["observe", "mol-8h2k", "timeline"]} />

      <div className="mode-bar">
        <div className="mode">Graph <span className="ct">47</span></div>
        <div className="mode">Queue <span className="ct">12</span></div>
        <div className="mode active">Timeline</div>
        <div className="sp" />
        <div className="slice">molecule · <span className="chip" style={{ background: "var(--accent-soft)", color: "var(--accent)", borderColor: "transparent" }}>mol-8h2k</span> poured from <span style={{ color: "var(--accent)" }}>gastownhall-upstream@v3</span></div>
      </div>

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <div style={{ flex: 1, overflow: "auto", background: "var(--bg)" }}>
          {/* Timeline */}
          <div className="timeline" style={{ height: "100%" }}>
            <div className="tl-head">
              <div className="tl-lbl">step</div>
              <div className="tl-track">
                {ticks.map(t => <div key={t} className="tl-tick">{t}</div>)}
              </div>
            </div>
            {steps.map(s => {
              const pct = x => `${(x / 60) * 100}%`;
              return (
                <div key={s.id} className={`tl-row ${s.gate ? "gate" : ""}`}>
                  <div className="tl-lbl">
                    {s.bars.some(b => b.cls === "prog") ? <span className="st-icon st-prog">◐</span> :
                     s.bars.some(b => b.cls === "done") ? <span className="st-icon st-closed">✓</span> :
                     <span className="st-icon st-open">○</span>}
                    <span>{s.id}</span>
                    {s.retry && <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--warn)", background: "var(--warn-soft)", padding: "0 4px", borderRadius: 2 }}>retry×3</span>}
                  </div>
                  <div className="tl-track">
                    {s.bars.map((b, i) => (
                      <div key={i} className={`tl-bar ${b.cls}`} style={{ left: pct(b.x), width: pct(b.w) }}>
                        {b.t}
                      </div>
                    ))}
                    {s.gate && <div style={{ position: "absolute", left: 8, top: 9, fontSize: 10.5, color: "var(--warn)", fontFamily: "var(--font-mono)" }}>⦿ {s.gate}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Peek drawer (this molecule) */}
        <PeekDrawer kind="mol" id="mol-8h2k" status="in_progress"
          title="Upstream submit: hooks sync regression guard"
          extras={
            <div style={{ padding: "8px 14px 16px" }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                <span className="chip">P1</span>
                <span className="chip">feature</span>
                <span className="chip">upstream</span>
                <span className="chip">@cwalv</span>
              </div>
              <div className="section-h" style={{ marginBottom: 6 }}>Poured from</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--accent)", marginBottom: 4, cursor: "default" }}>→ gastownhall-upstream@v3</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--mute)", marginBottom: 14 }}>poured 18m ago · by @cwalv</div>

              <div className="section-h" style={{ marginBottom: 6 }}>Vars</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, lineHeight: 1.6, marginBottom: 14 }}>
                <div><span style={{ color: "var(--mute)" }}>issue</span> = <span style={{ color: "var(--ink)" }}>fo-mhb6v-42</span></div>
                <div><span style={{ color: "var(--mute)" }}>title</span> = <span style={{ color: "var(--ink)" }}>"hooks sync regression guard"</span></div>
                <div><span style={{ color: "var(--mute)" }}>kind</span> = <span style={{ color: "var(--ink)" }}>feat</span></div>
                <div><span style={{ color: "var(--mute)" }}>branch</span> = <span style={{ color: "var(--ink)" }}>feat/fo-mhb6v-hooks-sync</span></div>
                <div style={{ color: "var(--mute-2)" }}>+ 9 defaults</div>
              </div>

              <div className="section-h" style={{ marginBottom: 6 }}>Events</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, lineHeight: 1.7, color: "var(--ink-3)" }}>
                <div><span style={{ color: "var(--mute)" }}>18m</span> · poured</div>
                <div><span style={{ color: "var(--mute)" }}>18m</span> · load-context ✓</div>
                <div><span style={{ color: "var(--mute)" }}>17m</span> · validate-worktree ✓</div>
                <div><span style={{ color: "var(--mute)" }}>17m</span> · rebuild-integration ✓</div>
                <div><span style={{ color: "var(--warn)" }}>5m</span> · run-tests ✗ attempt 1</div>
                <div><span style={{ color: "var(--accent)" }}>1m</span> · run-tests ◐ attempt 2</div>
              </div>
            </div>
          }
        />
      </div>

      <FootBar left="mol-8h2k · 8 steps · 1 retry · 0 gates tripped" right="Observe · Timeline · tick: 100ms" />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// Capture — single-bead form. Title · description · type · priority · deps. No DSL.
// ══════════════════════════════════════════════════════════════════════════
function CaptureSurface() {
  return (
    <div className="wf" style={{ width: 1200, height: 820 }}>
      <TopChromeV2 workspace="fo-beads-ui" destination="capture" breadcrumb={["capture"]}
        actions={<><button className="btn">Save & new (⌘↵)</button><button className="btn primary">Create bead</button></>} />

      <div className="mode-bar">
        <div className="mode active">New bead <span className="ct" style={{ marginLeft: 4 }}>⌘N</span></div>
        <div className="sp" />
        <div className="slice">dest · <span className="chip" style={{ background: "var(--accent-soft)", color: "var(--accent)", borderColor: "transparent" }}>fo-beads-ui/.beads</span></div>
      </div>

      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 320px", minHeight: 0 }}>
        {/* Main form */}
        <div style={{ padding: "24px 36px", overflow: "auto" }}>
          <div style={{ maxWidth: 680 }}>
            <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--mute)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>title</div>
            <input readOnly
              style={{ width: "100%", padding: "10px 0", fontSize: 22, fontWeight: 500, border: "none", borderBottom: "1px solid var(--rule)", outline: "none", background: "transparent", color: "var(--ink)", fontFamily: "var(--font-sans)" }}
              defaultValue="hooks sync regression guard on gascity"
            />

            <div style={{ marginTop: 22 }}>
              <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--mute)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>description</div>
              <textarea readOnly
                style={{ width: "100%", minHeight: 130, padding: 10, fontSize: 13, lineHeight: 1.55, border: "1px solid var(--rule)", borderRadius: 2, background: "var(--bg)", outline: "none", resize: "vertical", fontFamily: "var(--font-sans)", color: "var(--ink)" }}
                defaultValue={`When submitting upstream fixes from fo-*, verify that the feature branch includes a regression test before opening the PR. Hard-fail on docs-only diffs unless regression_required=false is passed. See TESTING.md for tier selection rules.`}
              />
              <div style={{ fontSize: 10.5, color: "var(--mute)", marginTop: 4, fontFamily: "var(--font-mono)" }}>markdown · supports {"{bead-id}"} links</div>
            </div>

            {/* Design / acceptance criteria — collapsible */}
            <div style={{ marginTop: 18, border: "1px solid var(--rule)", borderRadius: 2 }}>
              {["design", "acceptance_criteria", "notes"].map((k, i) => (
                <div key={k} style={{ padding: "10px 14px", borderBottom: i < 2 ? "1px solid var(--rule-2)" : "none", display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ color: "var(--mute-2)", fontFamily: "var(--font-mono)", fontSize: 11 }}>+</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--ink-3)" }}>{k}</span>
                  <span style={{ flex: 1 }} />
                  <span style={{ fontSize: 10.5, color: "var(--mute)", fontFamily: "var(--font-mono)" }}>optional · add later</span>
                </div>
              ))}
            </div>

            {/* Dependencies */}
            <div style={{ marginTop: 22 }}>
              <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--mute)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>dependencies</div>
              {[
                { t: "blocks", tgt: "fo-mhb6v-42", title: "Upstream hooks sync epic", style: "danger" },
                { t: "discovered-from", tgt: "fo-a1b2-08", title: "make check: hooks drift caught in CI", style: "accent" },
              ].map((d, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "130px 120px 1fr 20px", gap: 10, alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--rule-2)" }}>
                  <span className="chip" style={{ background: d.style === "danger" ? "var(--danger-soft)" : "var(--accent-soft)", color: d.style === "danger" ? "var(--danger)" : "var(--accent)", borderColor: "transparent", width: "fit-content" }}>{d.t}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink)" }}>{d.tgt}</span>
                  <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{d.title}</span>
                  <span style={{ color: "var(--mute-2)", cursor: "default" }}>×</span>
                </div>
              ))}
              <div style={{ padding: "10px 0", display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--mute)" }}>+ add dep ·</span>
                <span className="chip" style={{ cursor: "default" }}>blocks</span>
                <span className="chip" style={{ cursor: "default" }}>parent-of</span>
                <span className="chip" style={{ cursor: "default" }}>waits-for</span>
                <span className="chip" style={{ cursor: "default" }}>related</span>
                <span className="chip" style={{ cursor: "default" }}>discovered-from</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right rail: type / priority / assignee / labels */}
        <div style={{ borderLeft: "1px solid var(--rule)", background: "var(--bg-2)", padding: "18px 20px", overflow: "auto" }}>
          <div className="section-h" style={{ marginBottom: 8 }}>Type</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 18 }}>
            {["bug", "feature", "task", "chore", "epic", "message"].map(t => (
              <span key={t} className="chip" style={{
                background: t === "feature" ? "var(--ink)" : "var(--bg)",
                color: t === "feature" ? "#fff" : "var(--ink-3)",
                borderColor: t === "feature" ? "var(--ink)" : "var(--rule)",
                cursor: "default"
              }}>{t}</span>
            ))}
          </div>

          <div className="section-h" style={{ marginBottom: 8 }}>Priority</div>
          <div style={{ display: "flex", gap: 4, marginBottom: 18 }}>
            {[0,1,2,3,4].map(p => (
              <span key={p} className="chip" style={{
                background: p === 1 ? "var(--ink)" : "var(--bg)",
                color: p === 1 ? "#fff" : "var(--ink-3)",
                borderColor: p === 1 ? "var(--ink)" : "var(--rule)",
                cursor: "default", fontFamily: "var(--font-mono)"
              }}>P{p}</span>
            ))}
          </div>

          <div className="section-h" style={{ marginBottom: 8 }}>Assignee</div>
          <div style={{ padding: "6px 10px", background: "var(--bg)", border: "1px solid var(--rule)", borderRadius: 2, fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--ink-3)", marginBottom: 18 }}>
            @cwalv <span style={{ color: "var(--mute-2)", marginLeft: 6 }}>(you)</span>
          </div>

          <div className="section-h" style={{ marginBottom: 8 }}>Labels</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 18 }}>
            <span className="chip" style={{ background: "var(--accent-soft)", color: "var(--accent)", borderColor: "transparent" }}>upstream</span>
            <span className="chip" style={{ background: "var(--accent-soft)", color: "var(--accent)", borderColor: "transparent" }}>testing</span>
            <span className="chip" style={{ color: "var(--mute)", cursor: "default" }}>+ add</span>
          </div>

          <div className="section-h" style={{ marginBottom: 8 }}>External ref</div>
          <div style={{ padding: "6px 10px", background: "var(--bg)", border: "1px solid var(--rule)", borderRadius: 2, fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--mute)", marginBottom: 18 }}>
            optional · issue URL / PR / doc
          </div>

          <div style={{ fontSize: 10.5, color: "var(--mute)", lineHeight: 1.55, fontFamily: "var(--font-mono)", paddingTop: 12, borderTop: "1px solid var(--rule-2)" }}>
            creates a single bead. if this work needs phases, a formula will later be poured to turn it into a molecule.
          </div>
        </div>
      </div>

      <FootBar left="1 bead pending · ⌘↵ save & new · esc to discard" right="Capture · single bead" />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// Observe · Fleet — every live molecule across workspaces
// ══════════════════════════════════════════════════════════════════════════
function ObserveFleet() {
  const mols = [
    { ws: "#2f6fe8", wsName: "fo-beads-ui", id: "mol-8h2k", formula: "gastownhall-upstream", issue: "fo-mhb6v-42", title: "hooks sync regression guard", phase: "run-tests", st: "retry", age: "18m", progress: 0.48 },
    { ws: "#2f6fe8", wsName: "fo-beads-ui", id: "mol-7g1j", formula: "gastownhall-upstream", issue: "fo-c3d4-11", title: "darwin make check cover=false", phase: "open-pr", st: "prog", age: "42m", progress: 0.72 },
    { ws: "#2d7a4a", wsName: "gc-city",     id: "mol-5k3p", formula: "mol-polecat-work",    issue: "gc-9k2l-11", title: "rebuild integration-refs.toml", phase: "implement", st: "prog", age: "1h", progress: 0.34 },
    { ws: "#c36a1d", wsName: "gastownhall", id: "mol-4j9n", formula: "gastownhall-upstream", issue: "gh-4412",    title: "PR #4412: integration branch selector", phase: "label-and-record", st: "prog", age: "2h", progress: 0.88 },
    { ws: "#2d7a4a", wsName: "gc-city",     id: "mol-3f7m", formula: "release",              issue: "gc-rel-0.9", title: "release 0.9.3 — hotfix window", phase: "tag", st: "gate", age: "3h", progress: 0.60 },
    { ws: "#2f6fe8", wsName: "fo-beads-ui", id: "mol-2e5l", formula: "mol-weave-work",       issue: "fo-wv-03",   title: "weave-work stabilization experiment", phase: "—", st: "blocked", age: "1d", progress: 0.20 },
    { ws: "#2f6fe8", wsName: "fo-beads-ui", id: "mol-1d4k", formula: "mol-do-work",          issue: "fo-dw-22",   title: "doc pass on CLI_REFERENCE", phase: "do-work", st: "prog", age: "4h", progress: 0.55 },
  ];
  const counts = { total: 7, prog: 4, retry: 1, gate: 1, blocked: 1 };

  return (
    <div className="wf" style={{ width: 1640, height: 960 }}>
      <TopChromeV2 workspace="fo-beads-ui + 2" multi="consolidated" destination="observe" breadcrumb={["observe", "fleet"]} />

      <div className="mode-bar">
        <div className="mode">Graph <span className="ct">47</span></div>
        <div className="mode">Queue <span className="ct">12</span></div>
        <div className="mode active">Fleet <span className="ct">{counts.total}</span></div>
        <div className="sp" />
        <div className="slice">
          <span className="chip">all workspaces</span>
          <span className="chip">formula: any</span>
          <span className="chip">status: active</span>
          <span className="chip" style={{ color: "var(--mute)" }}>+ filter</span>
        </div>
      </div>

      {/* Summary strip */}
      <div style={{ padding: "10px 20px", borderBottom: "1px solid var(--rule)", background: "var(--bg)", display: "flex", gap: 20, alignItems: "center" }}>
        {[
          { k: "in progress", v: counts.prog, c: "var(--accent)" },
          { k: "retrying", v: counts.retry, c: "var(--warn)" },
          { k: "at gate", v: counts.gate, c: "var(--warn)" },
          { k: "blocked", v: counts.blocked, c: "var(--danger)" },
        ].map(c => (
          <div key={c.k} style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontSize: 18, fontWeight: 600, color: c.c, fontFamily: "var(--font-mono)" }}>{c.v}</span>
            <span style={{ fontSize: 11, color: "var(--mute)", fontFamily: "var(--font-mono)", letterSpacing: "0.04em" }}>{c.k}</span>
          </div>
        ))}
        <span style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 2, alignItems: "center", fontSize: 11, color: "var(--mute)", fontFamily: "var(--font-mono)" }}>
          group by · <span className="chip" style={{ background: "var(--ink)", color: "#fff", borderColor: "var(--ink)" }}>formula</span>
          <span className="chip">workspace</span><span className="chip">status</span>
        </div>
      </div>

      {/* Grouped rows */}
      <div style={{ flex: 1, overflow: "auto", background: "var(--bg)" }}>
        {[
          { name: "gastownhall-upstream", v: "v3", rows: mols.filter(m => m.formula === "gastownhall-upstream") },
          { name: "mol-polecat-work", v: "v5", rows: mols.filter(m => m.formula === "mol-polecat-work") },
          { name: "mol-weave-work", v: "v2", rows: mols.filter(m => m.formula === "mol-weave-work") },
          { name: "mol-do-work", v: "v1", rows: mols.filter(m => m.formula === "mol-do-work") },
          { name: "release", v: "v1", rows: mols.filter(m => m.formula === "release") },
        ].map(group => (
          <div key={group.name}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 20px", background: "var(--bg-2)", borderBottom: "1px solid var(--rule-2)", borderTop: "1px solid var(--rule-2)" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, fontWeight: 600, color: "var(--ink)" }}>{group.name}</span>
              <span className="chip">{group.v}</span>
              <span style={{ fontSize: 10.5, color: "var(--mute)", fontFamily: "var(--font-mono)" }}>{group.rows.length} live</span>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 10.5, color: "var(--accent)", fontFamily: "var(--font-mono)", cursor: "default" }}>→ Author · Edit</span>
            </div>
            {group.rows.map(m => (
              <div key={m.id} style={{ display: "grid", gridTemplateColumns: "4px 120px 100px 130px 1fr 200px 90px 60px", alignItems: "center", borderBottom: "1px solid var(--rule-2)", fontSize: 11.5 }}>
                <div style={{ background: m.ws, alignSelf: "stretch" }} />
                <div style={{ padding: "10px 12px", fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--mute)" }}>{m.wsName}</div>
                <div style={{ padding: "10px 12px", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-2)" }}>{m.id}</div>
                <div style={{ padding: "10px 12px", fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--mute)" }}>{m.issue}</div>
                <div style={{ padding: "10px 12px", color: "var(--ink)" }}>{m.title}</div>
                {/* Progress bar with phase */}
                <div style={{ padding: "10px 12px" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--ink-3)", marginBottom: 3 }}>at · {m.phase}</div>
                  <div style={{ height: 4, background: "var(--bg-3)", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${m.progress * 100}%`, background: m.st === "retry" ? "var(--warn)" : m.st === "blocked" ? "var(--danger)" : m.st === "gate" ? "var(--warn)" : "var(--accent)" }} />
                  </div>
                </div>
                <div style={{ padding: "10px 12px", fontFamily: "var(--font-mono)", fontSize: 11, color:
                  m.st === "retry" ? "var(--warn)" :
                  m.st === "blocked" ? "var(--danger)" :
                  m.st === "gate" ? "var(--warn)" :
                  "var(--accent)"
                }}>
                  {m.st === "retry" ? "↻ retry 2/3" : m.st === "blocked" ? "⊘ blocked" : m.st === "gate" ? "⦿ at gate" : "◐ running"}
                </div>
                <div style={{ padding: "10px 12px", fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--mute)", textAlign: "right" }}>{m.age}</div>
              </div>
            ))}
          </div>
        ))}
      </div>

      <FootBar left={`${counts.total} molecules · 3 workspaces · click row → Timeline`} right="Observe · Fleet · tick 2s" />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// Workspace switcher popover (shown as its own artboard so the pattern is legible)
// ══════════════════════════════════════════════════════════════════════════
function WorkspaceSwitcher() {
  const wss = [
    { color: "#2f6fe8", name: "fo-beads-ui", desc: "Current · this project", meta: "127 beads · 3 molecules live · 7 formulas", active: true, checked: true },
    { color: "#2d7a4a", name: "gc-city-foundations", desc: "Gas City rig config", meta: "412 beads · 1 molecule live · 12 formulas", checked: true },
    { color: "#c36a1d", name: "gastownhall-beads", desc: "Upstream beads mainline", meta: "1,203 beads · read-only mirror", checked: true },
    { color: "#6f42c1", name: "dunbar-scraper", desc: "Experimental", meta: "34 beads · stale 3d", checked: false },
    { color: "#b23a3a", name: "project-foundations", desc: "Archive", meta: "8,441 beads · closed", checked: false },
  ];
  return (
    <div className="wf" style={{ width: 1200, height: 720, background: "var(--bg)" }}>
      <TopChromeV2 workspace="fo-beads-ui + 2" multi="consolidated" destination="observe" breadcrumb={["observe", "queue"]} />

      <div style={{ flex: 1, position: "relative", background: "var(--bg-2)", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "rgba(14,17,20,0.08)" }} />

        <div style={{ position: "absolute", left: 108, top: 48, zIndex: 2 }}>
          <div className="popover ws-popover" style={{ width: 420 }}>
            <div className="pop-head">
              <span className="title">Workspace</span>
              <span className="kbd">⌘,</span>
            </div>
            <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--rule-2)", background: "var(--bg-2)", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 11, color: "var(--mute)" }}>Consolidated view</span>
              <span style={{ flex: 1 }} />
              <span style={{ display: "inline-block", width: 28, height: 14, background: "var(--accent)", borderRadius: 7, position: "relative" }}>
                <span style={{ position: "absolute", right: 1, top: 1, width: 12, height: 12, background: "#fff", borderRadius: "50%" }} />
              </span>
            </div>
            <div>
              {wss.map(w => (
                <div key={w.name} className={`ws-row ${w.active ? "active" : ""}`}>
                  <span className="swatch" style={{ background: w.color }} />
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <span className="name">{w.name}</span>
                      {w.active && <span className="chip" style={{ background: "var(--accent-soft)", color: "var(--accent)", borderColor: "transparent" }}>primary</span>}
                    </div>
                    <span className="meta">{w.desc} · {w.meta}</span>
                  </div>
                  <input type="checkbox" defaultChecked={w.checked} readOnly style={{ margin: 0 }} />
                </div>
              ))}
            </div>
            <div className="doc-link">+ Add workspace · point at a .beads/ directory</div>
          </div>
        </div>

        {/* Illustrate consolidated result rows (workspace color bars) */}
        <div style={{ position: "absolute", right: 36, top: 48, width: 600, zIndex: 2 }}>
          <div style={{ fontSize: 11, color: "var(--mute)", fontFamily: "var(--font-mono)", marginBottom: 6, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600 }}>
            consolidated result rows →
          </div>
          <div style={{ background: "var(--bg)", border: "1px solid var(--rule)", borderRadius: 3, overflow: "hidden" }}>
            {[
              { c: "#2f6fe8", ws: "fo-beads-ui", id: "fo-mhb6v-42", t: "hooks sync regression guard", st: "in_progress" },
              { c: "#2d7a4a", ws: "gc-city", id: "gc-9k2l-11", t: "rebuild integration-refs.toml", st: "open" },
              { c: "#c36a1d", ws: "gastownhall", id: "gh-upstream-4412", t: "PR #4412: integration branch selector", st: "in_progress" },
              { c: "#2f6fe8", ws: "fo-beads-ui", id: "fo-c3d4-11", t: "make check failure: cover=false on darwin", st: "open" },
              { c: "#2d7a4a", ws: "gc-city", id: "gc-8h3m-02", t: "trim merged refs from integration-refs.toml", st: "open" },
            ].map((r, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "4px 110px 130px 1fr 100px", borderBottom: "1px solid var(--rule-2)", alignItems: "stretch", fontSize: 11.5 }}>
                <div style={{ background: r.c }} />
                <div style={{ padding: "10px 12px", fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--mute)" }}>{r.ws}</div>
                <div style={{ padding: "10px 12px", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-2)" }}>{r.id}</div>
                <div style={{ padding: "10px 12px", color: "var(--ink)" }}>{r.t}</div>
                <div style={{ padding: "10px 12px", fontFamily: "var(--font-mono)", fontSize: 11, color: r.st === "in_progress" ? "var(--accent)" : "var(--mute)" }}>
                  {r.st === "in_progress" ? "◐ " : "○ "}{r.st}
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "var(--mute)", marginTop: 8, fontFamily: "var(--font-mono)" }}>
            left-edge color bar = source workspace · click to scope back to single
          </div>
        </div>
      </div>

      <FootBar left="3 workspaces active · consolidated" right="⌘, · workspace switcher" />
    </div>
  );
}

Object.assign(window, { ArchOverview, AuthorBrowse, ObserveTimeline, ObserveFleet, CaptureSurface, WorkspaceSwitcher });
