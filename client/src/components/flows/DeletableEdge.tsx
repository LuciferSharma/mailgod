import { useState } from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, useReactFlow, type EdgeProps } from '@xyflow/react';
import { X } from 'lucide-react';

export default function DeletableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  selected,
}: EdgeProps) {
  const { deleteElements } = useReactFlow();
  const [hovered, setHovered] = useState(false);
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const onDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    deleteElements({ edges: [{ id }] });
  };

  const isActive = selected || hovered;

  return (
    <>
      {/* Invisible wider path for easier hover/click targeting */}
      <path
        d={edgePath}
        fill="none"
        strokeWidth={24}
        stroke="transparent"
        className="react-flow__edge-interaction"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      />
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: isActive ? '#60a5fa' : '#52525b',
          strokeWidth: isActive ? 2.5 : 1.5,
          filter: isActive ? 'drop-shadow(0 0 4px rgba(96, 165, 250, 0.4))' : undefined,
          transition: 'stroke 0.2s, stroke-width 0.2s, filter 0.2s',
        }}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
          }}
          className="nodrag nopan"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          <div
            className={`transition-all duration-150 ${isActive ? 'opacity-100 scale-100' : 'opacity-0 scale-75 pointer-events-none'}`}
          >
            <button
              onClick={onDelete}
              className="w-6 h-6 bg-zinc-800 border border-zinc-600 rounded-full flex items-center justify-center hover:bg-red-500 hover:border-red-400 transition-all shadow-lg shadow-black/30 group"
              title="Remove connection"
            >
              <X className="w-3 h-3 text-zinc-400 group-hover:text-white transition-colors" />
            </button>
          </div>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
