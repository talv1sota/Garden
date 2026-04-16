'use client';

import { useState, useRef, useCallback, useEffect, Dispatch, useMemo } from 'react';
import { Bed, GardenAction, Tool, getCellPlantId, GardenLayout, LayoutElement, LAYOUT_EL_INFO } from '../types';
import GardenBed from './GardenBed';

interface Props {
  beds: Bed[];
  selectedPlantId: string | null;
  tool: Tool;
  dispatch: Dispatch<GardenAction>;
  inspectedCell: { bedId: string; row: number; col: number } | null;
  ownedPlants: Record<string, number>;
  showAutoGen: string | null;
  setShowAutoGen: (id: string | null) => void;
  autoFillBed: (bedId: string, mode: 'maximize' | 'owned') => void;
  confirmDelete: string | null;
  handleDeleteBed: (bedId: string) => void;
  onAddBed: () => void;
  scale?: number;
  companionLegend?: boolean;
  layoutOverlay?: GardenLayout;
  layoutOpacity?: number;
}

const CELL_PX_DEFAULT = 60;
const PAD = 4; // padding around each bed for header + controls

function getBedRect(bed: Bed, cellPx: number) {
  return {
    left: bed.x,
    top: bed.y,
    right: bed.x + bed.width * cellPx + PAD * 2,
    bottom: bed.y + bed.height * cellPx + PAD + 80,
  };
}

function rectsOverlap(
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number },
  gap = 2
): boolean {
  return !(
    a.right + gap < b.left ||
    b.right + gap < a.left ||
    a.bottom + gap < b.top ||
    b.bottom + gap < a.top
  );
}

export default function GardenCanvas({
  beds, selectedPlantId, tool, dispatch, inspectedCell,
  ownedPlants, showAutoGen, setShowAutoGen, autoFillBed,
  confirmDelete, handleDeleteBed, onAddBed, scale, companionLegend, layoutOverlay, layoutOpacity = 30,
}: Props) {
  const CELL_PX = scale || CELL_PX_DEFAULT;
  const canvasRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 800, h: 600 });
  const [scrollPos, setScrollPos] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setContainerSize({ w: width, h: height });
    });
    obs.observe(el);
    const onScroll = () => setScrollPos({ x: el.scrollLeft, y: el.scrollTop });
    el.addEventListener('scroll', onScroll);
    return () => { obs.disconnect(); el.removeEventListener('scroll', onScroll); };
  }, []);

  const [dragging, setDragging] = useState<{
    bedId: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [dragInvalid, setDragInvalid] = useState(false);

  // Compute canvas size — fill viewport, grow with content
  const contentW = Math.max(600, ...beds.map(b => (b.x || 0) + b.width * CELL_PX + PAD * 2 + 100));
  const contentH = Math.max(400, ...beds.map(b => (b.y || 0) + b.height * CELL_PX + PAD + 140));
  const viewW = containerSize.w - 28;
  const viewH = containerSize.h - 30;
  const canvasW = Math.max(contentW, viewW);
  const canvasH = Math.max(contentH, viewH);

  const handlePointerDown = useCallback((e: React.PointerEvent, bedId: string) => {
    // Only start drag from the bed header area
    const bed = beds.find(b => b.id === bedId);
    if (!bed) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragging({
      bedId,
      startX: e.clientX,
      startY: e.clientY,
      origX: bed.x ?? 0,
      origY: bed.y ?? 0,
    });
    setDragPos({ x: bed.x ?? 0, y: bed.y ?? 0 });
    setDragInvalid(false);
  }, [beds]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    const dx = e.clientX - dragging.startX;
    const dy = e.clientY - dragging.startY;
    const newX = Math.max(0, dragging.origX + dx);
    const newY = Math.max(0, dragging.origY + dy);
    setDragPos({ x: newX, y: newY });

    // Check collision with other beds
    const movingBed = beds.find(b => b.id === dragging.bedId);
    if (!movingBed) return;
    const movingRect = getBedRect({ ...movingBed, x: newX, y: newY }, CELL_PX);
    const collides = beds.some(b => {
      if (b.id === dragging.bedId) return false;
      return rectsOverlap(movingRect, getBedRect(b, CELL_PX));
    });
    setDragInvalid(collides);
  }, [dragging, beds]);

  const handlePointerUp = useCallback(() => {
    if (!dragging || !dragPos) {
      setDragging(null);
      setDragPos(null);
      return;
    }
    if (!dragInvalid) {
      dispatch({ type: 'MOVE_BED', bedId: dragging.bedId, x: dragPos.x, y: dragPos.y });
    }
    setDragging(null);
    setDragPos(null);
    setDragInvalid(false);
  }, [dragging, dragPos, dragInvalid, dispatch]);

  return (
    <div className="flex-1 flex flex-col" style={{ borderTop: '4px solid #4a2f17' }}>
      {/* Top ruler — fixed outside scroll */}
      <div className="flex z-20" style={{ flexShrink: 0 }}>
        <div style={{ width: 28, height: 24, flexShrink: 0, backgroundColor: '#e0d8c8', borderBottom: '2px solid #b8a88a', borderRight: '2px solid #b8a88a' }}>
          <span className="text-[10px] text-stone-400 flex items-center justify-center h-full">ft</span>
        </div>
        <div className="relative overflow-hidden" style={{ height: 24, backgroundColor: '#e8e0d0', borderBottom: '2px solid #b8a88a', flex: 1 }}>
          <div className="absolute" style={{ left: -scrollPos.x, top: 0, height: 24, width: 99999 }}>
            {Array.from({ length: Math.ceil((containerSize.w + 500) / CELL_PX) + 1 }, (_, i) => (
              <span key={`rt-${i}`} className="absolute text-[10px] font-pixel select-none pointer-events-none"
                style={{ left: i * CELL_PX - 1, bottom: 2, color: i % 5 === 0 ? '#5c4033' : '#a89880', borderLeft: '1px solid #b8a88a', paddingLeft: 2, height: i % 5 === 0 ? 12 : 6 }}>
                {i % 5 === 0 ? `${i}` : ''}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden relative">
        {/* Left ruler — fixed outside scroll */}
        <div className="relative overflow-hidden z-20" style={{ width: 28, flexShrink: 0, backgroundColor: '#e8e0d0', borderRight: '2px solid #b8a88a' }}>
          <div className="absolute" style={{ top: -scrollPos.y, left: 0, width: 28, height: 99999 }}>
            {Array.from({ length: Math.ceil((containerSize.h + 500) / CELL_PX) + 1 }, (_, i) => (
              <span key={`rl-${i}`} className="absolute text-[10px] font-pixel select-none pointer-events-none"
                style={{ top: i * CELL_PX - 1, right: 3, color: i % 5 === 0 ? '#5c4033' : '#a89880', borderTop: '1px solid #b8a88a', paddingTop: 1, width: i % 5 === 0 ? 'auto' : 6 }}>
                {i % 5 === 0 ? `${i}` : ''}
              </span>
            ))}
          </div>
        </div>

        {/* Scrollable garden area */}
        <div ref={containerRef} className="absolute grass-bg" style={{
          top: 0, right: 0, bottom: 0, left: 28,
          overflow: 'auto',
          backgroundImage: `linear-gradient(rgba(0,0,0,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px)`,
          backgroundSize: `${CELL_PX}px ${CELL_PX}px`,
        }}>
        <div
          ref={canvasRef}
          className="relative"
          style={{ minWidth: canvasW, minHeight: canvasH }}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
      {/* Companion legend — top left of grid */}
      {beds.map(bed => {
        const isDragging = dragging?.bedId === bed.id;
        const posX = isDragging && dragPos ? dragPos.x : (bed.x ?? 0);
        const posY = isDragging && dragPos ? dragPos.y : (bed.y ?? 0);

        return (
          <div
            key={bed.id}
            className={`absolute ${isDragging ? 'z-50' : 'z-10'}`}
            style={{
              left: posX,
              top: posY,
              opacity: isDragging ? 0.85 : 1,
              outline: isDragging && dragInvalid ? '3px dashed #ef4444' : 'none',
              transition: isDragging ? 'none' : 'left 0.2s, top 0.2s',
            }}
          >
            {/* Drag handle — bed header */}
            <div
              className="flex items-center gap-2 mb-1 px-1 cursor-grab active:cursor-grabbing select-none"
              onPointerDown={e => handlePointerDown(e, bed.id)}
              title="Drag to move this bed"
            >
              <span className="text-[9px] text-parchment-dark opacity-50">⠿</span>
              <span className="text-[9px] text-parchment font-pixel">{bed.name}</span>
              <span className="text-[9px] text-parchment-dark opacity-75">{bed.width}×{bed.height}ft</span>
            </div>

            <GardenBed
              bed={bed}
              selectedPlantId={selectedPlantId}
              tool={tool}
              dispatch={dispatch}
              inspectedCell={inspectedCell?.bedId === bed.id ? inspectedCell : null}
              cellSize={CELL_PX}
            />

            {/* Bed controls */}
            <div className="flex gap-2 mt-2 justify-end flex-wrap">
              <button
                onClick={() => setShowAutoGen(showAutoGen === bed.id ? null : bed.id)}
                className="pixel-btn pixel-btn-small pixel-btn-primary text-[9px]"
                title="Auto-fill this bed with an optimized layout"
              >
                ✨ Auto
              </button>
              <button
                onClick={() => dispatch({ type: 'CLEAR_BED', bedId: bed.id })}
                className="pixel-btn pixel-btn-small bg-parchment-dark text-[9px]"
              >
                Clear
              </button>
              <button
                onClick={() => handleDeleteBed(bed.id)}
                className={`pixel-btn pixel-btn-small text-[9px] ${
                  confirmDelete === bed.id ? 'pixel-btn-danger' : 'bg-parchment-dark'
                }`}
              >
                {confirmDelete === bed.id ? 'Sure?' : 'Delete'}
              </button>
            </div>

            {showAutoGen === bed.id && (
              <div className="pixel-panel p-3 mt-2 text-[9px]">
                <p className="text-wood-dark font-pixel text-[10px] mb-2">✨ AUTO-GENERATE</p>
                <p className="text-wood mb-2">Fill with an optimized companion layout.</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => autoFillBed(bed.id, 'maximize')}
                    className="pixel-btn pixel-btn-small pixel-btn-primary text-[9px] flex-1"
                    title="Fill with the best mix of all compatible plants"
                  >
                    🌈 Best Mix
                  </button>
                  <button
                    onClick={() => autoFillBed(bed.id, 'owned')}
                    className="pixel-btn pixel-btn-small text-[9px] flex-1 bg-parchment-dark"
                    title="Fill using only plants you've starred as owned"
                  >
                    ⭐ My Plants
                  </button>
                </div>
                {Object.keys(ownedPlants).length === 0 && (
                  <p className="text-[10px] text-wood-light mt-1">
                    Star ⭐ plants in the inventory to use &quot;My Plants&quot; mode
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Layout overlay */}
      {layoutOverlay && (
        <div className="absolute inset-0 pointer-events-none" style={{ opacity: layoutOpacity / 100 }}>
          {/* Fences as lines */}
          <svg className="absolute inset-0" style={{ overflow: 'visible' }}>
            {layoutOverlay.elements.filter(el => el.type === 'fence' || el.type === 'gate').map(el => {
              const isVert = el.h > el.w;
              const x1 = isVert ? (el.x + el.w / 2) * CELL_PX : el.x * CELL_PX;
              const y1 = isVert ? el.y * CELL_PX : (el.y + el.h / 2) * CELL_PX;
              const x2 = isVert ? (el.x + el.w / 2) * CELL_PX : (el.x + el.w) * CELL_PX;
              const y2 = isVert ? (el.y + el.h) * CELL_PX : (el.y + el.h / 2) * CELL_PX;
              const colors: Record<string, string> = { chainlink: '#6b7280', wood: '#78350f', pvc: '#d1d5db', metal: '#52525b' };
              return (
                <g key={el.id}>
                  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#000" strokeWidth={5} strokeLinecap="round" strokeOpacity={0.3} />
                  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={colors[el.material || 'wood'] || '#78350f'} strokeWidth={3} strokeLinecap="round"
                    strokeDasharray={el.type === 'gate' ? '4,4' : (el.material === 'chainlink' ? '6,3' : el.material === 'metal' ? '8,2' : 'none')} />
                </g>
              );
            })}
          </svg>
          {/* Other elements as outlines */}
          {layoutOverlay.elements.filter(el => el.type !== 'fence' && el.type !== 'gate').map(el => {
            const info = LAYOUT_EL_INFO[el.type];
            const isPlot = el.type === 'plot';
            return (
              <div key={el.id} className="absolute" style={{
                left: el.x * CELL_PX, top: el.y * CELL_PX,
                width: el.w * CELL_PX, height: el.h * CELL_PX,
                border: isPlot ? '2px dashed rgba(255,255,255,0.6)' : `2px dashed ${info.color}`,
                borderRadius: el.type === 'tree' || el.type === 'sprinkler' || el.type === 'deterrent' ? '50%' : 2,
                backgroundColor: isPlot ? 'rgba(255,255,255,0.05)' : 'transparent',
                transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
                transformOrigin: 'center',
              }}>
                {el.label && (
                  <span className="absolute text-[7px] font-pixel text-white/80 px-1" style={{
                    top: '50%', left: '50%', transform: 'translate(-50%,-50%)', whiteSpace: 'nowrap',
                    textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                  }}>{el.label}</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Bed — fixed top-right */}
      <button
        onClick={onAddBed}
        className="sticky top-1 z-30 border-4 border-dashed border-wood-light bg-grass-dark/30
                   flex items-center justify-center text-parchment
                   hover:bg-grass-dark/50 transition-colors cursor-pointer"
        style={{ width: 96, height: 96, float: 'right', position: 'sticky', marginRight: 12 }}
      >
        <div className="text-center">
          <span className="text-xl block">+</span>
          <span className="text-[9px]">ADD BED</span>
        </div>
      </button>
          </div>
        </div>
      </div>
    </div>
  );
}
