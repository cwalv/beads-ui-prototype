// DAG layout + SVG renderer for formula steps.

const NODE_W = 240;
const NODE_H_BASE = 72;   // approx; computed per-node based on badge count
const COL_GAP = 72;
const ROW_GAP = 24;

function layoutDAG(steps) {
  // Topological layering: node rank = longest path from a root
  const byId = Object.fromEntries(steps.filter(s => s.id).map(s => [s.id, s]));
  const rank = {};

  function getRank(id, visiting = new Set()) {
    if (rank[id] !== undefined) return rank[id];
    if (visiting.has(id)) return 0; // cycle guard
    visiting.add(id);
    const s = byId[id];
    if (!s || !s.needs.length) { rank[id] = 0; return 0; }
    const r = Math.max(...s.needs.map(n => byId[n] ? getRank(n, visiting) + 1 : 0));
    rank[id] = r;
    visiting.delete(id);
    return r;
  }
  Object.keys(byId).forEach(id => getRank(id));

  // Group by rank
  const cols = [];
  Object.entries(rank).forEach(([id, r]) => {
    cols[r] = cols[r] || [];
    cols[r].push(id);
  });

  // Preserve source order within each column
  const orderById = Object.fromEntries(steps.filter(s => s.id).map((s, i) => [s.id, i]));
  cols.forEach(c => c && c.sort((a, b) => orderById[a] - orderById[b]));

  // Node heights = base + room for badges
  function badgeCount(s) {
    let c = 0;
    if (s.retry) c++;
    if (s.metadata && Object.keys(s.metadata).length) c++;
    return c;
  }
  const heights = {};
  steps.forEach(s => {
    heights[s.id] = NODE_H_BASE + (badgeCount(s) > 0 ? 26 : 0);
  });

  // Position: x by rank, y stacked within column
  const nodes = {};
  cols.forEach((col, ci) => {
    if (!col) return;
    let y = 20;
    col.forEach(id => {
      nodes[id] = {
        x: 20 + ci * (NODE_W + COL_GAP),
        y,
        w: NODE_W,
        h: heights[id],
      };
      y += heights[id] + ROW_GAP;
    });
  });

  // Center each column vertically within the tallest column
  const colHeights = cols.map(col => {
    if (!col) return 0;
    return col.reduce((acc, id) => acc + heights[id] + ROW_GAP, 0) - ROW_GAP;
  });
  const maxColH = Math.max(...colHeights, 0);
  cols.forEach((col, ci) => {
    if (!col) return;
    const offset = Math.max(0, (maxColH - colHeights[ci]) / 2);
    col.forEach(id => { nodes[id].y += offset; });
  });

  // Edges
  const edges = [];
  steps.forEach(s => {
    if (!s.id) return;
    s.needs.forEach(n => {
      if (nodes[n] && nodes[s.id]) edges.push({ from: n, to: s.id });
    });
  });

  const totalW = (cols.length || 1) * (NODE_W + COL_GAP) + 20;
  const totalH = maxColH + 40;

  return { nodes, edges, cols, totalW, totalH };
}

function edgePath(from, to) {
  const x1 = from.x + from.w;
  const y1 = from.y + from.h / 2;
  const x2 = to.x;
  const y2 = to.y + to.h / 2;
  const dx = Math.max((x2 - x1) * 0.5, 32);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2 - 4} ${y2}`;
}

function DAG({ steps, layout, selected, onSelect, errors }) {
  const cycleIds = new Set();
  (errors || []).forEach(e => e.cycle && e.cycle.forEach(id => cycleIds.add(id)));

  const selDepSet = new Set();
  if (selected) {
    const s = steps.find(x => x.id === selected);
    if (s) s.needs.forEach(n => selDepSet.add(`${n}->${selected}`));
    steps.forEach(x => x.needs.includes(selected) && selDepSet.add(`${selected}->${x.id}`));
  }

  return (
    <div className="ed-dag-canvas">
      <div className="ed-dag-inner" style={{ width: layout.totalW, height: layout.totalH }}>
        <svg className="ed-edges" width={layout.totalW} height={layout.totalH}>
          <defs>
            <marker id="ah" viewBox="0 0 10 10" refX="8" refY="5"
                    markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" className="head" />
            </marker>
            <marker id="ah-sel" viewBox="0 0 10 10" refX="8" refY="5"
                    markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" className="head sel" />
            </marker>
          </defs>
          {layout.edges.map((e, i) => {
            const from = layout.nodes[e.from];
            const to = layout.nodes[e.to];
            if (!from || !to) return null;
            const isSel = selDepSet.has(`${e.from}->${e.to}`);
            return (
              <path key={i}
                className={isSel ? "sel" : ""}
                d={edgePath(from, to)}
                markerEnd={isSel ? "url(#ah-sel)" : "url(#ah)"}
              />
            );
          })}
        </svg>

        {steps.map((s, i) => {
          const n = layout.nodes[s.id];
          if (!n) return null;
          const isSel = s.id === selected;
          const isCyc = cycleIds.has(s.id);
          const mdKeys = s.metadata ? Object.keys(s.metadata) : [];
          const gcKeys = mdKeys.filter(k => k.startsWith("gc."));
          return (
            <div
              key={s.id || i}
              className={`ed-node ${isSel ? "sel" : ""} ${isCyc ? "cyc" : ""}`}
              style={{ left: n.x, top: n.y, width: n.w }}
              onClick={() => onSelect(s.id)}
            >
              <div className="nh">
                <span className="idx">{i + 1}</span>
                <span className="id">{s.id || "(no id)"}</span>
              </div>
              <div className="nt">{s.title || <em style={{ color: "var(--mute)" }}>(no title)</em>}</div>
              {(s.retry || gcKeys.length > 0) && (
                <div className="nb">
                  {s.retry && (
                    <span className="badge" title={`on_exhausted = ${s.retry.on_exhausted}`}>
                      ↻ {s.retry.max_attempts}× {s.retry.on_exhausted === "hard_fail" ? "→ fail" : ""}
                    </span>
                  )}
                  {gcKeys.includes("gc.continuation_group") && (
                    <span className="badge" title={s.metadata["gc.continuation_group"]}>
                      ⎇ {s.metadata["gc.continuation_group"]}
                    </span>
                  )}
                  {s.metadata["gc.session_affinity"] === "require" && (
                    <span className="badge" title="session_affinity = require">📌 session</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

Object.assign(window, { layoutDAG, DAG });
