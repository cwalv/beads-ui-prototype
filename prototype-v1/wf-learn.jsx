// Artboards 8 & 9: command palette + ready queue deep-dive w/ hints.

// ── Shared popover primitive (static positioning for wireframe) ──
function Popover({ title, kbd, body, cli, docHref = "docs/CLI_REFERENCE.md", style }) {
  return (
    <div className="popover" style={style}>
      <div className="pop-head">
        <span className="title">{title}</span>
        {kbd && <span className="kbd">{kbd}</span>}
      </div>
      <div className="pop-body">
        {body.map((p, i) => <p key={i}>{p}</p>)}
        {cli && <div className="cli" dangerouslySetInnerHTML={{ __html: cli }} />}
      </div>
      <div className="doc-link">↗ {docHref}</div>
    </div>
  );
}
window.Popover = Popover;

// ── Command palette artboard (shows ⌘K as it would appear overlaid) ──
function CommandPalette() {
  const groups = [
    {
      h: "Ready queue",
      items: [
        { ic: "○", t: "bd ready", d: "— list issues with no open blockers", cli: "bd ready --json", kb: "R" },
        { ic: "◐", t: "bd claim next", d: "— claim highest-priority ready issue", cli: "bd update <id> --status in_progress", kb: "⇧R" },
        { ic: "❄", t: "bd ready --include-deferred", d: "— include future-deferred issues", cli: "bd ready --include-deferred --json" },
      ],
    },
    {
      h: "Issues",
      items: [
        { ic: "+", t: "bd create", d: "— new issue (type, priority, dep, due/defer)", cli: "bd create \"…\" -t feature -p 1 --due=+2d", kb: "C" },
        { ic: "▦", t: "bd show", d: "— issue detail (metadata, events, deps)", cli: "bd show <id> --json" },
        { ic: "⇢", t: "bd dep add … --type discovered-from", d: "— link discovery to parent work", cli: "bd dep add <new> <parent> --type discovered-from" },
        { ic: "✓", t: "bd close", d: "— mark done with reason", cli: "bd close <id> --reason \"…\"" },
      ],
    },
    {
      h: "Formulas / molecules",
      items: [
        { ic: "⚗", t: "bd formula list", d: "— formulas across all search paths", cli: "bd formula list" },
        { ic: "⟐", t: "bd pour gastownhall-upstream", d: "— pour formula into a new molecule", cli: "bd pour gastownhall-upstream --var issue=fo-…", kb: "P" },
        { ic: "☗", t: "bd pour --dry-run", d: "— preview proto without committing", cli: "bd pour … --dry-run" },
        { ic: "◈", t: "bd squash <mol>", d: "— digest: squash molecule into permanent record", cli: "bd squash <mol-id>" },
      ],
    },
    {
      h: "Graph",
      items: [
        { ic: "⇵", t: "bd dep tree <id>", d: "— render dependency tree", cli: "bd dep tree <id>" },
        { ic: "⌀", t: "bd list --overdue", d: "— due date in past (not closed)", cli: "bd list --overdue" },
      ],
    },
    {
      h: "Navigate",
      items: [
        { ic: "→", t: "Open Editor", d: "— P0 two-pane formula editor", kb: "1" },
        { ic: "→", t: "Open Catalog", d: "— browse all formulas", kb: "2" },
        { ic: "→", t: "Open Work Graph", d: "— issue DAG", kb: "3" },
        { ic: "→", t: "Open Queue", d: "— bd ready", kb: "4" },
      ],
    },
  ];

  return (
    <div className="wf" style={{ width: 1200, height: 820 }}>
      <TopChrome path={["beads-ui", "help", "command palette"]} actions={<><button className="btn">Keyboard cheatsheet</button><button className="btn primary">Open docs</button></>} />

      {/* Behind: faint simulation of the app underneath */}
      <div style={{ flex: 1, position: "relative", background: "var(--bg-2)", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background:
          "repeating-linear-gradient(0deg, transparent 0 29px, rgba(0,0,0,0.035) 29px 30px)," +
          "repeating-linear-gradient(90deg, transparent 0 99px, rgba(0,0,0,0.035) 99px 100px)",
          opacity: 0.9
        }} />
        <div style={{ position: "absolute", inset: 0, background: "rgba(14,17,20,0.15)", backdropFilter: "blur(0.5px)" }} />

        {/* Palette + hover popover side-by-side to show the hint layer */}
        <div style={{ position: "absolute", top: 70, left: 50, zIndex: 2 }}>
          <div className="kbar">
            <div className="kbar-input">
              <span className="prompt">&gt;</span>
              <span className="q">pour<span className="caret" /></span>
              <span className="kbd" style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--mute)", padding: "1px 5px", background: "var(--bg-3)", border: "1px solid var(--rule-2)", borderRadius: 2 }}>⌘K</span>
            </div>
            <div className="kbar-groups">
              {groups.map((g) => (
                <React.Fragment key={g.h}>
                  <div className="kbar-group-h">{g.h}</div>
                  {g.items.map((it, i) => (
                    <div key={it.t} className={`kbar-item ${g.h === "Formulas / molecules" && it.t.startsWith("bd pour gastownhall") ? "active" : ""}`}>
                      <span className="icon">{it.ic}</span>
                      <span><span className="title">{it.t}</span><span className="desc">{it.d}</span></span>
                      {it.cli && <span className="cli">{it.cli}</span>}
                      {it.kb && <span className="kb">{it.kb}</span>}
                    </div>
                  ))}
                </React.Fragment>
              ))}
            </div>
            <div className="kbar-foot">
              <span>↑↓ navigate</span>
              <span>↵ run</span>
              <span>⌘↵ copy as CLI</span>
              <span className="sp" />
              <span>? doc mode</span>
              <span>esc close</span>
            </div>
          </div>
        </div>

        {/* Side-by-side: a tooltip/popover anchored to an in-UI control */}
        <div style={{ position: "absolute", top: 90, left: 720, zIndex: 2 }}>
          <div style={{ fontSize: 11, color: "var(--mute)", fontFamily: "var(--font-mono)", marginBottom: 6, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600 }}>
            hover a button anywhere →
          </div>

          {/* Simulated target button with a hint dot */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <button className="btn primary" style={{ padding: "6px 14px", fontSize: 12 }}>Pour to mol…</button>
            <span className="hint-dot">?</span>
            <span style={{ fontSize: 11, color: "var(--mute)", fontFamily: "var(--font-mono)" }}>hint dot · always visible for beginners</span>
          </div>

          <Popover
            title="Pour formula → molecule"
            kbd="⌘P"
            body={[
              "Commits the cooked proto structure as a live molecule. The molecule syncs to Dolt and becomes visible to collaborators.",
              "The variables you've filled in the palette are baked into the poured bead tree — defaults that weren't overridden stay as-is.",
            ]}
            cli={`<span class="c-com"># preview first</span>\nbd pour gastownhall-upstream \\\n  <span class="c-flag">--var</span> issue=<span class="c-str">fo-mhb6v-42</span> \\\n  <span class="c-flag">--dry-run</span>\n\n<span class="c-com"># commit</span>\nbd pour gastownhall-upstream \\\n  <span class="c-flag">--var</span> issue=<span class="c-str">fo-mhb6v-42</span>`}
            docHref="docs/formulas.md#using-formulas"
          />

          <div style={{ marginTop: 18, fontSize: 11, color: "var(--mute)", fontFamily: "var(--font-mono)" }}>
            ? key → switches all hints to "doc mode" (every affordance gets a pinned annotation)
          </div>
        </div>
      </div>

      <FootBar left="⌘K · palette · 47 commands · fuzzy match" right="docs indexed · 9 files · 287 anchors" />
    </div>
  );
}
window.CommandPalette = CommandPalette;

// ── Ready queue deep-dive ──
function QueueDeepDive() {
  // Richer model than the earlier wireframe queue: due, defer_until, discovered-from
  const rows = [
    { id: "fo-g7h8", pri: 0, st: "blocked", t: "rebuild-integration cherry-pick conflict", type: "bug", a: "mol-polecat", due: "today 14:00", defer: null, overdue: true, labels: ["blocker", "mayor-escalated"], from: null, blockers: ["fo-w9x0"] },
    { id: "fo-a1b2", pri: 1, st: "in_progress", t: "Upstream submit hooks sync", type: "feature", a: "cwalv", due: "+2d", defer: null, labels: ["upstream"], from: null },
    { id: "fo-c3d4", pri: 1, st: "in_progress", t: "hooks sync regression guard", type: "feature", a: "cwalv", due: "+2d", defer: null, labels: ["pending-upstream"], from: "fo-a1b2" },
    { id: "fo-i9j0", pri: 2, st: "open", t: "make check failure: cover=false on darwin", type: "bug", a: null, due: null, defer: null, labels: ["tests"], from: "fo-c3d4" },
    { id: "fo-e5f6", pri: 2, st: "open", t: "integration-refs audit (6 stale)", type: "chore", a: null, due: "+1w", defer: null, labels: ["chore"], from: null },
    { id: "fo-q1r2", pri: 2, st: "open", t: "Trim merged refs from integration-refs.toml", type: "chore", a: null, due: null, defer: null, labels: ["chore"], from: "fo-e5f6" },
    { id: "fo-s3t4", pri: 3, st: "open", t: "Document TESTING.md tier-selection rules", type: "task", a: null, due: null, defer: null, labels: ["docs"], from: null },
    { id: "fo-k1l2", pri: 3, st: "open", t: "upstream PR #4412 watch", type: "task", a: "gascity-upstream-status", due: null, defer: null, labels: ["pending-upstream"], from: null },
    { id: "fo-v6w7", pri: 2, st: "deferred", t: "Rewire rig-scoped continuation to gc.session", type: "task", a: null, due: null, defer: "next monday", labels: ["rig"], from: null },
    { id: "fo-y8z9", pri: 3, st: "deferred", t: "Migrate legacy mol-* formulas to v3 schema", type: "epic", a: null, due: null, defer: "+2w", labels: ["migration"], from: null },
  ];

  const stIcon = { open: "○", in_progress: "◐", blocked: "●", closed: "✓", deferred: "❄" };
  const stCls = { open: "st-open", in_progress: "st-prog", blocked: "st-blocked", closed: "st-closed", deferred: "st-deferred" };
  const typeCls = { bug: "#b23a3a", epic: "#6f42c1", feature: "var(--ink)", task: "var(--ink-2)", chore: "var(--ink-3)" };

  return (
    <div className="wf" style={{ width: 1640, height: 1040 }}>
      <TopChrome path={["beads-ui", "queue", "bd ready"]} actions={<><button className="btn">Group: priority</button><button className="btn">Filters · 2</button><button className="btn primary">Claim next</button></>} />
      <Tabs active="queue" items={[
        { id: "editor", label: "Editor" },
        { id: "catalog", label: "Catalog", count: 47 },
        { id: "graph", label: "Work graph" },
        { id: "queue", label: "Queue", count: 12 },
      ]} />

      <div style={{ flex: 1, display: "flex", minHeight: 0, background: "var(--bg)" }}>
        {/* Left filter rail w/ hint dots on every concept */}
        <div style={{ width: 240, background: "var(--bg-2)", borderRight: "1px solid var(--rule)", padding: "14px 0", fontSize: 12, overflow: "auto" }}>
          <div style={{ padding: "0 14px 4px", fontSize: 10.5, color: "var(--mute)", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600, display: "flex", alignItems: "center" }}>
            Ready queue <span className="hint-dot" style={{ marginLeft: 6 }}>?</span>
          </div>
          <div style={{ padding: "4px 14px", fontSize: 11, color: "var(--mute)" }}>Issues with no open blockers.</div>

          {[
            ["--ready", "default", "8"],
            ["--include-deferred", "+ future work", "10"],
            ["--overdue", "due date in past", "1"],
            ["--unclaimed", "no assignee", "6"],
          ].map(([flag, note, n], i) => (
            <div key={flag} style={{ padding: "6px 18px", fontSize: 12, color: i === 1 ? "var(--ink)" : "var(--ink-2)", fontWeight: i === 1 ? 500 : 400, fontFamily: "var(--font-mono)", display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" defaultChecked={i === 0 || i === 1} readOnly style={{ margin: 0 }} />
              <span>{flag}</span>
              <span className="hint-dot">?</span>
              <span style={{ marginLeft: "auto", color: "var(--mute-2)", fontSize: 10.5 }}>{n}</span>
            </div>
          ))}

          <div style={{ padding: "14px 14px 4px", fontSize: 10.5, color: "var(--mute)", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600 }}>Status</div>
          {Object.entries(stIcon).map(([k, ic]) => (
            <div key={k} style={{ padding: "4px 18px", fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--ink-2)", display: "flex", alignItems: "center", gap: 8 }}>
              <span className={`st-icon ${stCls[k]}`}>{ic}</span>
              <span>{k}</span>
              <span className="hint-dot" style={{ marginLeft: 4 }}>?</span>
              <span style={{ marginLeft: "auto", color: "var(--mute-2)", fontSize: 10.5 }}>{rows.filter(r=>r.st===k).length}</span>
            </div>
          ))}

          <div style={{ padding: "14px 14px 4px", fontSize: 10.5, color: "var(--mute)", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600, display: "flex", alignItems: "center" }}>
            Priority <span className="hint-dot" style={{ marginLeft: 6 }}>?</span>
          </div>
          {[
            [0, "critical"],[1, "high"],[2, "medium"],[3, "low"],[4, "backlog"],
          ].map(([p, name]) => (
            <div key={p} style={{ padding: "4px 18px", fontFamily: "var(--font-mono)", fontSize: 11.5, display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" defaultChecked={p <= 3} readOnly style={{ margin: 0 }} />
              <span className={`pri-${p}`}>● P{p}</span>
              <span style={{ color: "var(--ink-2)" }}>{name}</span>
              <span style={{ marginLeft: "auto", color: "var(--mute-2)", fontSize: 10.5 }}>{rows.filter(r=>r.pri===p).length}</span>
            </div>
          ))}

          <div style={{ padding: "14px 14px 4px", fontSize: 10.5, color: "var(--mute)", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600, display: "flex", alignItems: "center" }}>
            Time <span className="hint-dot" style={{ marginLeft: 6 }}>?</span>
          </div>
          <div style={{ padding: "0 14px", fontSize: 11, color: "var(--mute)", lineHeight: 1.5 }}>
            <code style={{ fontFamily: "var(--font-mono)" }}>--due-before</code>, <code style={{ fontFamily: "var(--font-mono)" }}>--defer-after</code>, <code style={{ fontFamily: "var(--font-mono)" }}>--overdue</code>
          </div>
        </div>

        {/* Center: the queue list with inline CLI preview */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          {/* CLI preview strip */}
          <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--rule)", background: "#0f1419", color: "#d4dae0", fontFamily: "var(--font-mono)", fontSize: 11.5, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: "#7d8590" }}>$</span>
            <span>bd ready <span style={{ color: "#79c0ff" }}>--include-deferred</span> <span style={{ color: "#79c0ff" }}>--json</span></span>
            <span style={{ marginLeft: "auto", color: "#7d8590", fontSize: 10.5 }}>↑ mirror of active filters · ⌘C to copy</span>
          </div>

          {/* Group header */}
          <div style={{ padding: "10px 16px", background: "var(--bg-2)", borderBottom: "1px solid var(--rule)", display: "flex", alignItems: "center", gap: 10 }}>
            <span className="section-h">● P0 — critical</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--mute)" }}>1 · 1 overdue · 1 blocker escalated</span>
          </div>

          <div style={{ flex: 1, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--rule)", background: "var(--bg)" }}>
                  {["", "id", "title", "type", "assignee", "due", "defer", "labels"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "6px 12px", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--mute)", fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <React.Fragment key={r.id}>
                    {/* priority group break */}
                    {i > 0 && rows[i - 1].pri !== r.pri && (
                      <tr><td colSpan={8} style={{ padding: "8px 16px", background: "var(--bg-2)", borderTop: "1px solid var(--rule-2)", borderBottom: "1px solid var(--rule-2)" }}>
                        <span className="section-h">● P{r.pri} — {["critical","high","medium","low","backlog"][r.pri]}</span>
                        <span style={{ marginLeft: 10, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--mute)" }}>{rows.filter(x => x.pri === r.pri).length}</span>
                      </td></tr>
                    )}
                    <tr style={{ borderBottom: "1px solid var(--rule-2)", background: r.st === "blocked" ? "#fff7f5" : i === 2 ? "var(--accent-soft)" : "var(--bg)" }}>
                      <td style={{ padding: "10px 12px", width: 28 }}>
                        <span className={`st-icon ${stCls[r.st]}`} style={{ fontSize: 13 }}>{stIcon[r.st]}</span>
                      </td>
                      <td style={{ padding: "10px 12px", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--mute)", whiteSpace: "nowrap" }}>{r.id}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span className={`pri-${r.pri}`} style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>P{r.pri}</span>
                          <span style={{ color: "var(--ink)", fontSize: 12.5 }}>{r.t}</span>
                          {r.from && (
                            <span className="chip" style={{ marginLeft: 4, color: "var(--accent)", background: "var(--accent-soft)" }} title="discovered-from edge">
                              ⇠ {r.from}
                              <span className="hint-dot" style={{ marginLeft: 4, width: 11, height: 11, fontSize: 8 }}>?</span>
                            </span>
                          )}
                          {r.blockers && r.blockers.map(b => (
                            <span key={b} className="chip" style={{ marginLeft: 4, color: "var(--danger)", background: "var(--danger-soft)" }}>
                              blocked by {b}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td style={{ padding: "10px 12px", fontFamily: "var(--font-mono)", fontSize: 11, color: typeCls[r.type] }}>{r.type}</td>
                      <td style={{ padding: "10px 12px", fontFamily: "var(--font-mono)", fontSize: 11, color: r.a ? "var(--ink-2)" : "var(--mute-2)" }}>{r.a ? `@${r.a}` : "—"}</td>
                      <td style={{ padding: "10px 12px", fontFamily: "var(--font-mono)", fontSize: 11, color: r.overdue ? "var(--danger)" : "var(--ink-3)" }}>
                        {r.due || <span style={{ color: "var(--mute-2)" }}>—</span>}
                        {r.overdue && <span style={{ marginLeft: 4, color: "var(--danger)", fontSize: 10 }}>overdue</span>}
                      </td>
                      <td style={{ padding: "10px 12px", fontFamily: "var(--font-mono)", fontSize: 11, color: r.defer ? "var(--accent)" : "var(--mute-2)" }}>{r.defer || "—"}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          {r.labels.map(l => <span key={l} className="chip">{l}</span>)}
                        </div>
                      </td>
                    </tr>
                  </React.Fragment>
                ))}
              </tbody>
            </table>

            {/* Deferred section break reinforcement */}
            <div style={{ padding: "10px 16px", background: "var(--bg-2)", borderTop: "1px solid var(--rule-2)", borderBottom: "1px solid var(--rule-2)", display: "flex", alignItems: "center", gap: 10 }}>
              <span className="st-icon st-deferred">❄</span>
              <span className="section-h">deferred — future ready</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--mute)" }}>2 · shown because <code>--include-deferred</code></span>
              <span className="hint-dot" style={{ marginLeft: 4 }}>?</span>
            </div>
          </div>
        </div>

        {/* Right: stacked hint popovers showing the pattern in full */}
        <div style={{ width: 360, background: "var(--bg-2)", borderLeft: "1px solid var(--rule)", padding: 16, overflow: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="section-h">Hint layer — pinned examples</div>

          <Popover
            title="● P0 — critical"
            body={[
              "Reserved for data loss, security, or broken builds. Shows in red + bold across every view.",
              "Prefer P1 for \"important bug\". P0 is an escalation, not a default.",
            ]}
            cli={`<span class="c-com"># filter</span>\nbd list <span class="c-flag">-p</span> 0 <span class="c-flag">--json</span>\n\n<span class="c-com"># escalate</span>\nbd update <span class="c-str">&lt;id&gt;</span> <span class="c-flag">-p</span> 0`}
            docHref="docs/beads-CLAUDE.md#priorities"
          />

          <Popover
            title="❄ deferred · defer_until"
            body={[
              "Hides an issue from bd ready until a timestamp. Use for \"revisit after X\" work — keeps the queue clean without losing the thread.",
              "Cleared with --defer=\"\". Ready queue re-surfaces it automatically at the deadline.",
            ]}
            cli={`<span class="c-com"># defer until next Monday</span>\nbd update <span class="c-str">&lt;id&gt;</span> <span class="c-flag">--defer</span>=<span class="c-str">"next monday"</span>\n\n<span class="c-com"># reveal in ready</span>\nbd ready <span class="c-flag">--include-deferred</span>`}
            docHref="docs/beads-CLAUDE.md#workflow"
          />

          <Popover
            title="⇠ discovered-from"
            body={[
              "Link issues found while working on a parent task. Agents stamp this automatically; humans should too.",
              "Doesn't block readiness — it's a context edge, not a dependency. Survives the digest squash as audit trail.",
            ]}
            cli={`bd dep add <span class="c-str">&lt;new&gt;</span> <span class="c-str">&lt;parent&gt;</span> \\\n  <span class="c-flag">--type</span> discovered-from`}
            docHref="docs/ARCHITECTURE.md#dependency-types"
          />
        </div>
      </div>

      <FootBar left="10 results · 1 overdue · 2 deferred shown" right="bd ready --include-deferred --json · 28ms" />
    </div>
  );
}
window.QueueDeepDive = QueueDeepDive;
