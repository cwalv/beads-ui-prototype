import { useState } from 'react';

interface Props {
  command: string;
}

export function CliMirror({ command }: Props) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard?.writeText(command).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  }

  return (
    <div
      role="region"
      aria-label="cli mirror"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '6px 20px',
        borderTop: '1px solid var(--rule-2)',
        background: 'var(--bg-2)',
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        color: 'var(--ink-2)',
        flexShrink: 0,
      }}
    >
      <span style={{ color: 'var(--mute)' }}>cli mirror</span>
      <code style={{
        flex: 1,
        padding: '2px 8px',
        background: 'var(--bg)',
        border: '1px solid var(--rule-2)',
        borderRadius: 2,
        overflow: 'auto',
        whiteSpace: 'nowrap',
      }}>
        {command}
      </code>
      <button
        type="button"
        onClick={copy}
        style={{
          fontSize: 10.5,
          padding: '2px 10px',
          border: '1px solid var(--rule)',
          borderRadius: 2,
          background: 'var(--bg)',
          color: copied ? 'var(--ok)' : 'var(--ink-3)',
          cursor: 'pointer',
          fontFamily: 'var(--font-mono)',
        }}
      >
        {copied ? 'copied' : 'copy'}
      </button>
    </div>
  );
}
