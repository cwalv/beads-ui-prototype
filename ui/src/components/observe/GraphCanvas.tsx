import { useEffect, useRef } from 'react';
import Panzoom from '@panzoom/panzoom';
import type { MoleculeGraph, LayoutNode } from '../../types';
import { GraphNode } from './GraphNode';
import { useSmoothZoom } from '../../hooks/useSmoothZoom';

type PanzoomInstance = ReturnType<typeof Panzoom>;

interface Props {
  graph: MoleculeGraph;
  selectedId: string | null;
  onNodeClick: (id: string) => void;
}

const GROUP_PALETTE = ['#e4ecfb', '#dfeee4', '#f6e8d6', '#f3dada', '#eef0f2'];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function groupColor(name: string): string {
  return GROUP_PALETTE[hashStr(name) % GROUP_PALETTE.length];
}

function groupBounds(nodes: LayoutNode[]) {
  const pad = 8;
  const minX = Math.min(...nodes.map(n => n.x)) - pad;
  const minY = Math.min(...nodes.map(n => n.y)) - pad;
  const maxX = Math.max(...nodes.map(n => n.x + n.w)) + pad;
  const maxY = Math.max(...nodes.map(n => n.y + n.h)) + pad;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

const MIN_SCALE = 0.3;
const MAX_SCALE = 3;

export function GraphCanvas({ graph, selectedId, onNodeClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const pzRef = useRef<PanzoomInstance | null>(null);
  const lastPointRef = useRef<{ clientX: number; clientY: number } | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const pz = Panzoom(containerRef.current, {
      maxScale: MAX_SCALE,
      minScale: MIN_SCALE,
      contain: 'outside',
    });
    pzRef.current = pz;
    return () => {
      pz.destroy();
      pzRef.current = null;
    };
  }, []);

  useSmoothZoom(wrapperRef, {
    minScale: MIN_SCALE,
    maxScale: MAX_SCALE,
    getScale: () => pzRef.current?.getScale() ?? 1,
    onWheelEvent: (event) => {
      lastPointRef.current = { clientX: event.clientX, clientY: event.clientY };
    },
    applyScale: (scale) => {
      const pz = pzRef.current;
      const p = lastPointRef.current;
      if (pz && p) pz.zoomToPoint(scale, p);
    },
  });

  const continuationGroups = new Map<string, LayoutNode[]>();
  for (const node of graph.nodes) {
    if (node.continuationGroup) {
      const arr = continuationGroups.get(node.continuationGroup) ?? [];
      arr.push(node);
      continuationGroups.set(node.continuationGroup, arr);
    }
  }

  const edgeTypeColor = (type: string): string => {
    switch (type) {
      case 'blocks': return 'var(--danger)';
      case 'conditional-blocks': return 'var(--warn)';
      case 'tracks': return 'var(--accent)';
      case 'parent-child': return 'var(--ink-2)';
      default: return 'var(--mute-2)';
    }
  };

  return (
    <div
      ref={wrapperRef}
      style={{ flex: 1, overflow: 'hidden', position: 'relative', background: 'var(--bg-2)' }}
    >
      <div
        ref={containerRef}
        style={{ position: 'relative', width: graph.totalW, height: graph.totalH }}
      >
        <svg
          style={{
            position: 'absolute',
            inset: 0,
            width: graph.totalW,
            height: graph.totalH,
            pointerEvents: 'none',
            overflow: 'visible',
          }}
        >
          <defs>
            <marker
              id="arrow"
              markerWidth="8"
              markerHeight="8"
              refX="4"
              refY="2"
              orient="auto"
            >
              <path d="M 0 0 L 0 4 L 6 2 z" fill="var(--mute-2)" />
            </marker>
          </defs>
          {[...continuationGroups.entries()].map(([group, nodes]) => {
            const b = groupBounds(nodes);
            return (
              <rect
                key={group}
                x={b.x}
                y={b.y}
                width={b.w}
                height={b.h}
                fill={groupColor(group)}
                rx={6}
                opacity={0.45}
              />
            );
          })}
          {graph.edges.map((edge, i) => (
            <path
              key={i}
              d={edge.path}
              fill="none"
              stroke={edgeTypeColor(edge.type)}
              strokeWidth={1.5}
              strokeOpacity={0.7}
              markerEnd="url(#arrow)"
            />
          ))}
        </svg>
        {graph.nodes.map(node => (
          <GraphNode
            key={node.id}
            node={node}
            selected={node.id === selectedId}
            onSelect={() => onNodeClick(node.id)}
          />
        ))}
      </div>
    </div>
  );
}
