import { layoutDAG, edgePath } from '../../lib/dag-layout';
import type { Step, ParseError } from '../../lib/formula-parse';
import type { DAGLayout } from '../../lib/dag-layout';

interface Props {
  steps: Step[];
  layout: DAGLayout;
  selected: string | null;
  onSelect: (id: string) => void;
  errors: ParseError[];
}

export function DAG({ steps, layout, selected, onSelect, errors }: Props) {
  const cycleIds = new Set<string>();
  errors.forEach(e => e.cycle && e.cycle.forEach(id => cycleIds.add(id)));

  const selDepSet = new Set<string>();
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
                className={isSel ? 'sel' : ''}
                d={edgePath(from, to)}
                markerEnd={isSel ? 'url(#ah-sel)' : 'url(#ah)'}
              />
            );
          })}
        </svg>

        {steps.map((s, i) => {
          const n = layout.nodes[s.id ?? ''];
          if (!n) return null;
          const isSel = s.id === selected;
          const isCyc = s.id ? cycleIds.has(s.id) : false;
          const mdKeys = s.metadata ? Object.keys(s.metadata) : [];
          const gcKeys = mdKeys.filter(k => k.startsWith('gc.'));
          return (
            <div
              key={s.id ?? i}
              className={`ed-node ${isSel ? 'sel' : ''} ${isCyc ? 'cyc' : ''}`}
              style={{ left: n.x, top: n.y, width: n.w }}
              onClick={() => s.id && onSelect(s.id)}
            >
              <div className="nh">
                <span className="idx">{i + 1}</span>
                <span className="id">{s.id || '(no id)'}</span>
              </div>
              <div className="nt">{s.title || <em style={{ color: 'var(--mute)' }}>(no title)</em>}</div>
              {(s.retry || gcKeys.length > 0) && (
                <div className="nb">
                  {s.retry && (
                    <span className="badge" title={`on_exhausted = ${s.retry.on_exhausted}`}>
                      ↻ {s.retry.max_attempts}× {s.retry.on_exhausted === 'hard_fail' ? '→ fail' : ''}
                    </span>
                  )}
                  {gcKeys.includes('gc.continuation_group') && (
                    <span className="badge" title={String(s.metadata['gc.continuation_group'])}>
                      ⎇ {String(s.metadata['gc.continuation_group'])}
                    </span>
                  )}
                  {s.metadata['gc.session_affinity'] === 'require' && (
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

export { layoutDAG };
