import { useMemo, useRef, useState } from 'react';

import { Icon } from '@/components/ui/Icon';
import { t } from '@/i18n';
import type { LayoutNode } from './layout';

interface CanvasMinimapProps {
  nodes: LayoutNode[];
  layoutWidth: number;
  layoutHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  panX: number;
  panY: number;
  zoom: number;
  onPanTo: (panX: number, panY: number) => void;
}

interface MinimapPoint {
  x: number;
  y: number;
}

interface MinimapDrag {
  pointerId: number;
  offsetX: number;
  offsetY: number;
}

const WIDTH = 196;
const HEIGHT = 116;
const PADDING = 5;

export function CanvasMinimap({
  nodes,
  layoutWidth,
  layoutHeight,
  viewportWidth,
  viewportHeight,
  panX,
  panY,
  zoom,
  onPanTo,
}: CanvasMinimapProps) {
  const [open, setOpen] = useState(true);
  const [dragging, setDragging] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<MinimapDrag | null>(null);

  const scale = Math.min(
    (WIDTH - PADDING * 2) / layoutWidth,
    (HEIGHT - PADDING * 2) / layoutHeight,
    1,
  );
  const offsetX = (WIDTH - layoutWidth * scale) / 2;
  const offsetY = (HEIGHT - layoutHeight * scale) / 2;
  const nodeRects = useMemo(
    () =>
      nodes.map((node) => ({
        x: offsetX + node.x * scale,
        y: offsetY + node.y * scale,
        width: Math.max(1, node.width * scale),
        height: Math.max(1, node.height * scale),
      })),
    [nodes, offsetX, offsetY, scale],
  );

  if (layoutWidth <= 0 || layoutHeight <= 0) return null;

  const viewWidth = (viewportWidth / zoom) * scale;
  const viewHeight = (viewportHeight / zoom) * scale;
  const viewX = offsetX + (-panX / zoom) * scale;
  const viewY = offsetY + (-panY / zoom) * scale;

  const pointFromEvent = (event: React.PointerEvent<SVGSVGElement>): MinimapPoint => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * HEIGHT,
    };
  };

  const panForPoint = (point: MinimapPoint, drag: MinimapDrag) => {
    const worldCenterX = (point.x - drag.offsetX - offsetX) / scale + viewportWidth / zoom / 2;
    const worldCenterY = (point.y - drag.offsetY - offsetY) / scale + viewportHeight / zoom / 2;
    onPanTo(viewportWidth / 2 - worldCenterX * zoom, viewportHeight / 2 - worldCenterY * zoom);
  };

  const onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const point = pointFromEvent(event);
    const target = event.target instanceof SVGElement ? event.target : null;
    const isViewport = target?.dataset.minimapViewport === 'true';
    const drag = {
      pointerId: event.pointerId,
      offsetX: isViewport ? point.x - viewX : viewWidth / 2,
      offsetY: isViewport ? point.y - viewY : viewHeight / 2,
    };
    dragRef.current = drag;
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    panForPoint(point, drag);
  };

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    panForPoint(pointFromEvent(event), drag);
  };

  const endPointer = (event: React.PointerEvent<SVGSVGElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // já liberado
    }
  };

  return (
    <div
      role="group"
      aria-label={t('canvas.minimapa')}
      className="absolute right-3 bottom-3 z-40 overflow-hidden rounded-[var(--radius-lg)] border border-border bg-material-strong p-1.5 shadow-[var(--shadow)] backdrop-blur-xl"
      data-testid="minimap-panel"
    >
      <div className={`flex h-6 items-center ${open ? 'justify-between' : 'justify-end'} px-1`}>
        {open ? <span className="text-[11px] font-semibold tracking-[0.02em] text-muted uppercase">{t('canvas.minimapa')}</span> : null}
        <button
          type="button"
          aria-label={t(open ? 'canvas.recolherMinimapa' : 'canvas.expandirMinimapa')}
          onClick={() => setOpen((current) => !current)}
          className="flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] text-muted hover:bg-bg-hover hover:text-text"
        >
          <Icon name={open ? 'x' : 'map'} size={13} />
        </button>
      </div>
      {open ? (
        <svg
          ref={svgRef}
          role="group"
          aria-label={t('canvas.arrastarViewportMinimapa')}
          tabIndex={0}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          width={WIDTH}
          height={HEIGHT}
          className={`block touch-none rounded-sm ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
          onKeyDown={(event) => {
            const step = Math.max(24, 64 / scale) * zoom;
            if (event.key === 'ArrowLeft') onPanTo(panX + step, panY);
            else if (event.key === 'ArrowRight') onPanTo(panX - step, panY);
            else if (event.key === 'ArrowUp') onPanTo(panX, panY + step);
            else if (event.key === 'ArrowDown') onPanTo(panX, panY - step);
            else return;
            event.preventDefault();
          }}
          data-testid="minimap"
        >
          <defs>
            <clipPath id="minimap-clip">
              <rect x={PADDING} y={PADDING} width={WIDTH - PADDING * 2} height={HEIGHT - PADDING * 2} />
            </clipPath>
          </defs>
          <rect width={WIDTH} height={HEIGHT} rx="4" fill="var(--bg-app)" />
          <g clipPath="url(#minimap-clip)" fill="currentColor" opacity="0.45" className="text-muted">
            {nodeRects.map((rect, index) => (
              <rect
                key={nodes[index]?.id ?? index}
                x={rect.x}
                y={rect.y}
                width={rect.width}
                height={rect.height}
                rx={Math.min(3, rect.height / 2)}
              />
            ))}
          </g>
          <rect
            data-minimap-viewport="true"
            data-testid="minimap-viewport"
            x={viewX}
            y={viewY}
            width={viewWidth}
            height={viewHeight}
            rx={4}
            fill="var(--accent-soft)"
            stroke="var(--accent)"
            strokeWidth="1.5"
            clipPath="url(#minimap-clip)"
          />
        </svg>
      ) : null}
    </div>
  );
}