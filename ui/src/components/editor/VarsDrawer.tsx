import type { VarDef } from '../../lib/formula-parse';

interface Props {
  vars: Record<string, VarDef>;
  onChange: (name: string, value: string) => void;
}

const WIRED = new Set(['kind', 'regression_required', 'upstream_owner', 'upstream_repo']);

const VAR_ORDER = [
  'issue', 'title', 'branch', 'kind', 'scope', 'body',
  'upstream_owner', 'upstream_repo', 'base_branch', 'fork_remote',
  'regression_required', 'integration_remote', 'integration_branch',
];

export function VarsDrawer({ vars, onChange }: Props) {
  const ordered = VAR_ORDER.map(k => vars[k]).filter(Boolean) as VarDef[];
  const rest = Object.values(vars).filter(v => !VAR_ORDER.includes(v.name));
  const list = [...ordered, ...rest];

  return (
    <div className="ed-vars">
      <div className="ed-vars-head">
        <span className="lbl">Vars</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--mute)' }}>
          {list.length} · {list.filter(v => v.required).length} required
        </span>
      </div>
      <div className="ed-vars-body">
        {list.map(v => (
          <VarField key={v.name} v={v} wired={WIRED.has(v.name)} onChange={onChange} />
        ))}
      </div>
    </div>
  );
}

interface FieldProps {
  v: VarDef;
  wired: boolean;
  onChange: (name: string, value: string) => void;
}

function VarField({ v, wired, onChange }: FieldProps) {
  const cur = v.default != null ? String(v.default) : '';

  if (v.name === 'kind' && wired) {
    return (
      <div className="ed-var wired">
        <div className="row">
          <span className="name">{v.name}</span>
          {v.required && <span className="req">required</span>}
          <span className="pill">wired</span>
        </div>
        <div className="desc">{v.description}</div>
        <div className="ed-seg">
          <button className={cur === 'feat' ? 'on' : ''} onClick={() => onChange('kind', 'feat')}>feat</button>
          <button className={cur === 'fix' ? 'on' : ''} onClick={() => onChange('kind', 'fix')}>fix</button>
          <button className={cur === '' ? 'on' : ''} onClick={() => onChange('kind', '')}>—</button>
        </div>
      </div>
    );
  }

  if (v.name === 'regression_required' && wired) {
    const on = cur === 'true';
    return (
      <div className="ed-var wired">
        <div className="row">
          <span className="name">{v.name}</span>
          <span className="pill">wired</span>
        </div>
        <div className="desc">{v.description}</div>
        <label className="ed-check">
          <input type="checkbox" checked={on}
            onChange={e => onChange('regression_required', e.target.checked ? 'true' : 'false')} />
          {on ? 'true (block docs-only)' : 'false (allow docs-only)'}
        </label>
      </div>
    );
  }

  return (
    <div className={`ed-var ${wired ? 'wired' : ''}`}>
      <div className="row">
        <span className="name">{v.name}</span>
        {v.required && <span className="req">required</span>}
        <span className="pill">{wired ? 'wired' : 'read-only'}</span>
      </div>
      <div className="desc">{v.description}</div>
      <input
        type="text"
        value={cur}
        readOnly={!wired}
        placeholder={v.required ? 'required' : ''}
        onChange={e => wired && onChange(v.name, e.target.value)}
      />
    </div>
  );
}
