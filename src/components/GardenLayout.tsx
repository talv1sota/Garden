'use client';

import { useState, useCallback, useMemo, Dispatch, useRef, useEffect } from 'react';
import { GardenAction, GardenLayout as Layout, LayoutElement, LayoutElType, LAYOUT_EL_INFO } from '../types';

interface Props {
  layout: Layout;
  dispatch: Dispatch<GardenAction>;
  scale: number;
}

const SCALE_DEFAULT = 56;
const SCALE_MIN = 24;
const SCALE_MAX = 80;
const SCALE_STEP = 8;


export default function GardenLayout({ layout, dispatch, scale: SCALE }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selBox, setSelBox] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const groupDragOrigins = useRef<Record<string, { x: number; y: number }>>({});
  const selBoxRef = useRef<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [selBoxStart, setSelBoxStart] = useState<{ x: number; y: number } | null>(null);
  const [addingType, setAddingType] = useState<LayoutElType | null>(null);
  const [newElLabel, setNewElLabel] = useState('');
  const [newElMaterial, setNewElMaterial] = useState('wood');
  const [newElW, setNewElW] = useState(0);
  const [newElH, setNewElH] = useState(0);
  const [fenceDir, setFenceDir] = useState<'h' | 'v'>('h');
  const [fenceStart, setFenceStart] = useState<{ x: number; y: number } | null>(null); // first click for fence placement
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null); // live mouse for fence preview
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [hideLabels, setHideLabels] = useState(false);
  const [unit, setUnit] = useState<'ft' | 'in'>('ft');
  const [scrollPos, setScrollPos] = useState({ x: 0, y: 0 });

  // Unit conversion helpers — all stored values are in feet
  // Inputs round to whole inches / nearest 0.1ft so toggling produces clean numbers
  const toD = (ft: number) => unit === 'in' ? Math.round(ft * 12) : Math.round(ft * 10) / 10;
  const fromD = (v: number) => unit === 'in' ? v / 12 : v;
  const unitStep = unit === 'in' ? 1 : 0.5;
  const minD = (ft: number) => unit === 'in' ? ft * 12 : ft;
  // Formatter for labels/tooltips — shows "5ft" or "60in" or "5.5ft"
  const fmtLen = (ft: number) => unit === 'in' ? `${Math.round(ft * 12)}in` : `${Math.round(ft * 10) / 10}ft`;

  // When palette item changes, reset new element options to defaults
  const selectAddType = (type: LayoutElType | null) => {
    if (type) {
      const info = LAYOUT_EL_INFO[type];
      setNewElLabel(info.label);
      setNewElMaterial(type === 'plot' ? '#7cb342' : 'wood');
      setNewElW(info.defaultW);
      setNewElH(info.defaultH);
    }
    setAddingType(type);
    setSelected(null);
        setFenceStart(null);
  };

  // Dragging state (shared for elements, boundary points, and edges)
  const [dragging, setDragging] = useState<{ kind: 'element' | 'point' | 'resize' | 'edge'; id: string | number; startX: number; startY: number; origX: number; origY: number; origW?: number; origH?: number; origX2?: number; origY2?: number } | null>(null);
  const draggingRef = useRef(dragging);
  draggingRef.current = dragging;
  const [dragPos, setDragPos] = useState<{ x: number; y: number; w?: number; h?: number } | null>(null);

  const boundary = layout.boundary || [];
  const edges = layout.edges || [];
  const elements = layout.elements || [];
  const defaultPlot = { x: 1, y: 1, w: 20, h: 10 };
  const plot = layout.plot && typeof layout.plot.x === 'number' && !isNaN(layout.plot.x) ? layout.plot : defaultPlot;

  const selectedEl = useMemo(() => elements.find(e => e.id === selected), [elements, selected]);

  // Arrow keys to move selected element
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ids = selectedIds.length > 0 ? selectedIds : selected ? [selected] : [];
      if (ids.length === 0 || editingLabel) return;
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
      const step = e.shiftKey ? 1 : 0.25;
      let dx = 0, dy = 0;
      if (e.key === 'ArrowLeft') dx = -step;
      else if (e.key === 'ArrowRight') dx = step;
      else if (e.key === 'ArrowUp') dy = -step;
      else if (e.key === 'ArrowDown') dy = step;
      else if (e.key === 'Delete' || e.key === 'Backspace') {
        ids.forEach(id => dispatch({ type: 'REMOVE_LAYOUT_EL', id }));
        clearSelection();
        e.preventDefault();
        return;
      }
      else return;
      e.preventDefault();
      ids.forEach(id => {
        const el = elements.find(el => el.id === id);
        if (el) dispatch({ type: 'MOVE_LAYOUT_EL', id, x: Math.max(0, el.x + dx), y: Math.max(0, el.y + dy) });
      });
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selected, editingLabel, elements, dispatch]);

  // Measure container to ensure rulers fill the viewport
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 800, h: 600 });
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setContainerSize({ w: width, h: height });
    });
    obs.observe(el);
    const onScroll = () => {
      setScrollPos({ x: el.scrollLeft, y: el.scrollTop });
      // Clamp scroll if content shrunk
      const maxScrollX = el.scrollWidth - el.clientWidth;
      const maxScrollY = el.scrollHeight - el.clientHeight;
      if (el.scrollLeft > maxScrollX + 10) el.scrollLeft = Math.max(0, maxScrollX);
      if (el.scrollTop > maxScrollY + 10) el.scrollTop = Math.max(0, maxScrollY);
    };
    el.addEventListener('scroll', onScroll);
    return () => { obs.disconnect(); el.removeEventListener('scroll', onScroll); };
  }, []);

  // Canvas sized to content + include drag position so ruler grows during drag
  const dragMaxX = dragging && dragPos ? (dragPos.x || 0) + (dragPos.w || 5) : 0;
  const dragMaxY = dragging && dragPos ? (dragPos.y || 0) + (dragPos.h || 5) : 0;
  const maxX = Math.max(plot.x + plot.w, ...elements.map(e => e.x + e.w), dragMaxX, 0);
  const maxY = Math.max(plot.y + plot.h, ...elements.map(e => e.y + e.h), dragMaxY, 0);
  const rulerPad = 1;
  const contentW = Math.ceil(maxX + rulerPad) * SCALE;
  const contentH = Math.ceil(maxY + rulerPad) * SCALE;
  const viewW = containerSize.w - 44; // 28 ruler + 16 padding
  const viewH = containerSize.h - 40; // 24 ruler + 16 padding
  const canvasW = contentW;
  const canvasH = contentH;

  // Detect fence junctions — line endpoints of different fences that overlap
  type EndType = 'start' | 'end';
  interface Junction { x: number; y: number; parts: { id: string; end: EndType }[] }
  const junctions = useMemo(() => {
    const fences = elements.filter(e => e.type === 'fence' || e.type === 'gate');
    // Use line endpoints, not rectangle corners
    const endpoints: { x: number; y: number; id: string; end: EndType }[] = [];
    fences.forEach(f => {
      const isVert = f.h > f.w;
      if (isVert) {
        endpoints.push({ x: f.x + f.w / 2, y: f.y, id: f.id, end: 'start' });
        endpoints.push({ x: f.x + f.w / 2, y: f.y + f.h, id: f.id, end: 'end' });
      } else {
        endpoints.push({ x: f.x, y: f.y + f.h / 2, id: f.id, end: 'start' });
        endpoints.push({ x: f.x + f.w, y: f.y + f.h / 2, id: f.id, end: 'end' });
      }
    });
    const juncs: Junction[] = [];
    const used = new Set<string>();
    for (let i = 0; i < endpoints.length; i++) {
      if (used.has(`${endpoints[i].id}-${endpoints[i].end}`)) continue;
      const group = [endpoints[i]];
      for (let j = i + 1; j < endpoints.length; j++) {
        if (endpoints[j].id === endpoints[i].id) continue;
        if (used.has(`${endpoints[j].id}-${endpoints[j].end}`)) continue;
        if (Math.abs(endpoints[j].x - endpoints[i].x) < 0.5 && Math.abs(endpoints[j].y - endpoints[i].y) < 0.5) {
          group.push(endpoints[j]);
          used.add(`${endpoints[j].id}-${endpoints[j].end}`);
        }
      }
      if (group.length >= 2) {
        used.add(`${endpoints[i].id}-${endpoints[i].end}`);
        juncs.push({ x: endpoints[i].x, y: endpoints[i].y, parts: group.map(g => ({ id: g.id, end: g.end })) });
      }
    }
    return juncs;
  }, [elements]);

  const snap = (v: number) => Math.round(v * 4) / 4;
  const clampX = (v: number) => Math.max(0, snap(v));
  const clampY = (v: number) => Math.max(0, snap(v));

  // Snap fence corners to nearby fence corners
  const SNAP_DIST = 1; // feet
  const snapFence = useCallback((el: LayoutElement, newX: number, newY: number, newW?: number, newH?: number): { x: number; y: number; w: number; h: number } => {
    const w = newW ?? el.w;
    const h = newH ?? el.h;
    let x = newX, y = newY;
    const isVert = h > w;
    // Get line endpoints of the moving fence
    const myCorners = isVert
      ? [{ cx: x + w / 2, cy: y }, { cx: x + w / 2, cy: y + h }]
      : [{ cx: x, cy: y + h / 2 }, { cx: x + w, cy: y + h / 2 }];
    // Get line endpoints of all other fences
    const otherCorners: { cx: number; cy: number }[] = [];
    elements.forEach(other => {
      if (other.id === el.id || (other.type !== 'fence' && other.type !== 'gate')) return;
      const oV = other.h > other.w;
      if (oV) {
        otherCorners.push({ cx: other.x + other.w / 2, cy: other.y }, { cx: other.x + other.w / 2, cy: other.y + other.h });
      } else {
        otherCorners.push({ cx: other.x, cy: other.y + other.h / 2 }, { cx: other.x + other.w, cy: other.y + other.h / 2 });
      }
    });
    // Snap gate endpoints to anywhere along a fence line (axis-aligned)
    if (el.type === 'gate' || el.type === 'post') {
      elements.forEach(other => {
        if (other.id === el.id || other.type !== 'fence') return;
        const oV = other.h > other.w;
        for (const my of myCorners) {
          if (oV) {
            const fx = other.x + other.w / 2;
            // Snap to the fence's x if gate endpoint is anywhere near vertically
            if (Math.abs(my.cx - fx) < SNAP_DIST * 2) {
              // Clamp y to fence range
              const cy = Math.max(other.y, Math.min(other.y + other.h, my.cy));
              otherCorners.push({ cx: fx, cy });
            }
          } else {
            const fy = other.y + other.h / 2;
            if (Math.abs(my.cy - fy) < SNAP_DIST * 2) {
              const cx = Math.max(other.x, Math.min(other.x + other.w, my.cx));
              otherCorners.push({ cx, cy: fy });
            }
          }
        }
      });
    }
    // Also snap fences to gate endpoints
    if (el.type === 'fence') {
      elements.forEach(other => {
        if (other.id === el.id || other.type !== 'gate') return;
        const oV = other.h > other.w;
        if (oV) {
          otherCorners.push({ cx: other.x + other.w / 2, cy: other.y }, { cx: other.x + other.w / 2, cy: other.y + other.h });
        } else {
          otherCorners.push({ cx: other.x, cy: other.y + other.h / 2 }, { cx: other.x + other.w, cy: other.y + other.h / 2 });
        }
      });
    }

    // Find the closest snap for any corner pair
    let bestDx = 0, bestDy = 0, bestDist = SNAP_DIST;
    for (const my of myCorners) {
      for (const ot of otherCorners) {
        const dist = Math.sqrt((my.cx - ot.cx) ** 2 + (my.cy - ot.cy) ** 2);
        if (dist < bestDist) {
          bestDist = dist;
          bestDx = ot.cx - my.cx;
          bestDy = ot.cy - my.cy;
        }
      }
    }
    return { x: x + bestDx, y: y + bestDy, w, h };
  }, [elements]);

  const clearSelection = () => { setSelected(null); setSelectedIds([]); };

  // ── Canvas click: add element or clear selection ──
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (addingType) {
      const rect = e.currentTarget.getBoundingClientRect();
      const cx = clampX((e.clientX - rect.left) / SCALE);
      const cy = clampY((e.clientY - rect.top) / SCALE);
      const isFenceType = addingType === 'fence' || addingType === 'gate';

      if (isFenceType) {
        if (!fenceStart) {
          // First click — set start point
          setFenceStart({ x: snap(cx), y: snap(cy) });
          return;
        }
        // Second click — create fence from start to here
        const ex = snap(cx);
        const ey = snap(cy);
        const dx = Math.abs(ex - fenceStart.x);
        const dy = Math.abs(ey - fenceStart.y);
        // Snap to horizontal or vertical based on which axis has more movement
        const isVert = dy > dx;
        const FENCE_THICK = 0.3;
        const el: LayoutElement = {
          id: `${addingType}-${Date.now()}`,
          type: addingType,
          x: isVert ? fenceStart.x - FENCE_THICK / 2 : Math.min(fenceStart.x, ex),
          y: isVert ? Math.min(fenceStart.y, ey) : fenceStart.y - FENCE_THICK / 2,
          w: isVert ? FENCE_THICK : Math.max(0.5, dx),
          h: isVert ? Math.max(0.5, dy) : FENCE_THICK,
          label: newElLabel,
          material: newElMaterial,
        };
        const snapped = snapFence(el, el.x, el.y, el.w, el.h);
        dispatch({ type: 'ADD_LAYOUT_EL', element: { ...el, x: snapped.x, y: snapped.y, w: snapped.w, h: snapped.h } });
        setSelected(el.id);
        setFenceStart(null);
        setAddingType(null);
        return;
      }

      // Non-fence: single click placement
      const el: LayoutElement = {
        id: `${addingType}-${Date.now()}`,
        type: addingType,
        x: clampX(cx - newElW / 2),
        y: clampY(cy - newElH / 2),
        w: newElW, h: newElH,
        label: newElLabel,
        material: (addingType === 'plot' || addingType === 'post') ? newElMaterial : undefined,
      };
      dispatch({ type: 'ADD_LAYOUT_EL', element: el });
      setSelected(el.id);
      setAddingType(null);
      return;
    }
    setFenceStart(null);
    clearSelection();
  }, [addingType, dispatch, fenceStart, newElW, newElH, newElLabel, newElMaterial, snapFence, plot]);

  // Track mouse for fence preview line
  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (fenceStart && addingType) {
      const rect = e.currentTarget.getBoundingClientRect();
      setMousePos({ x: snap((e.clientX - rect.left) / SCALE), y: snap((e.clientY - rect.top) / SCALE) });
    }
    // Selection box drag
    if (selBoxStart && !addingType && !dragging) {
      const rect = e.currentTarget.getBoundingClientRect();
      const x2 = (e.clientX - rect.left - 8) / SCALE;
      const y2 = (e.clientY - rect.top - 8) / SCALE;
      const box = { x1: selBoxStart.x, y1: selBoxStart.y, x2, y2 };
      selBoxRef.current = box;
      setSelBox(box);
    }
  }, [fenceStart, addingType, selBoxStart, dragging]);

  const handleCanvasPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (addingType || dragging) return;
    // Don't start selection if clicking on an interactive element
    const target = e.target as HTMLElement;
    if (target.closest('[data-layout-el]')) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left - 8) / SCALE; // subtract padding
    const y = (e.clientY - rect.top - 8) / SCALE;
    setSelBoxStart({ x, y });
    setSelBox(null);
  }, [addingType, dragging]);

  const handleCanvasPointerUp = useCallback(() => {
    const box = selBoxRef.current;
    if (box) {
      const bx1 = Math.min(box.x1, box.x2);
      const by1 = Math.min(box.y1, box.y2);
      const bx2 = Math.max(box.x1, box.x2);
      const by2 = Math.max(box.y1, box.y2);
      if (Math.abs(bx2 - bx1) > 0.5 || Math.abs(by2 - by1) > 0.5) {
        const ids = elements.filter(el => {
          return el.x < bx2 && el.x + el.w > bx1 && el.y < by2 && el.y + el.h > by1;
        }).map(el => el.id);
        if (ids.length > 0) {
          setSelectedIds(ids);
          setSelected(ids.length === 1 ? ids[0] : null);
        }
      }
    }
    selBoxRef.current = null;
    setSelBox(null);
    setSelBoxStart(null);
  }, [elements]);

  // ── Pointer move/up for dragging ──
  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const d = draggingRef.current;
    if (!d) return;
    const dx = (e.clientX - d.startX) / SCALE;
    const dy = (e.clientY - d.startY) / SCALE;
    const id = d.id as string;
    if (typeof id === 'string' && id.startsWith('plot-el-')) {
      const side = id.split('-')[2];
      const oW = d.origW || 1, oH = d.origH || 1;
      let nx = d.origX, ny = d.origY, nw = oW, nh = oH;
      if (side === 'top' || side === 'tl' || side === 'tr') { ny = clampY(d.origY + dy); nh = Math.max(1, snap(oH - dy)); }
      if (side === 'bottom' || side === 'bl' || side === 'br') { nh = Math.max(1, snap(oH + dy)); }
      if (side === 'left' || side === 'tl' || side === 'bl') { nx = clampX(d.origX + dx); nw = Math.max(1, snap(oW - dx)); }
      if (side === 'right' || side === 'tr' || side === 'br') { nw = Math.max(1, snap(oW + dx)); }
      setDragPos({ x: nx, y: ny, w: nw, h: nh });
    } else if (typeof id === 'string' && id.startsWith('junc-')) {
      setDragPos({ x: clampX(d.origX + dx), y: clampY(d.origY + dy) });
    } else if (d.kind === 'resize') {
      const el = elements.find(e => e.id === id);
      const isFence = el && (el.type === 'fence' || el.type === 'gate');
      const isStartEnd = d.origX2; // 1=start, 0=end, undefined=normal
      if (isFence && isStartEnd !== undefined) {
        const oW = d.origW || 1, oH = d.origH || 1;
        const isVert = oH > oW;
        if (isStartEnd === 1) {
          // Dragging start: move origin, shrink length
          if (isVert) setDragPos({ x: d.origX, y: clampY(d.origY + dy), w: 0.3, h: Math.max(0.5, snap(oH - dy)) });
          else setDragPos({ x: clampX(d.origX + dx), y: d.origY, w: Math.max(0.5, snap(oW - dx)), h: 0.3 });
        } else {
          // Dragging end: grow length
          if (isVert) setDragPos({ x: d.origX, y: d.origY, w: 0.3, h: Math.max(0.5, snap(oH + dy)) });
          else setDragPos({ x: d.origX, y: d.origY, w: Math.max(0.5, snap(oW + dx)), h: 0.3 });
        }
      } else {
        const rot = d.origX2 || 0;
        const oW = d.origW || 1, oH = d.origH || 1;
        // Rotate deltas to match element's rotation
        let rdx = dx, rdy = dy;
        if (rot === 90) { rdx = dy; rdy = -dx; }
        else if (rot === 180) { rdx = -dx; rdy = -dy; }
        else if (rot === 270) { rdx = -dy; rdy = dx; }
        const nw = Math.max(0.5, snap(oW + rdx));
        const nh = Math.max(0.5, snap(oH + rdy));
        // Adjust position to keep the anchor corner fixed during rotation
        const rad = rot * Math.PI / 180;
        const cs = Math.cos(rad), sn = Math.sin(rad);
        const ax = (-oW/2) * cs - (-oH/2) * sn;
        const ay = (-oW/2) * sn + (-oH/2) * cs;
        const ax2 = (-nw/2) * cs - (-nh/2) * sn;
        const ay2 = (-nw/2) * sn + (-nh/2) * cs;
        const cx = d.origX + oW/2;
        const cy = d.origY + oH/2;
        setDragPos({
          x: snap(cx + ax - ax2 - nw/2),
          y: snap(cy + ay - ay2 - nh/2),
          w: nw, h: nh,
        });
      }
    } else {
      setDragPos({ x: clampX(d.origX + dx), y: clampY(d.origY + dy) });
    }
  }, [SCALE, elements]);

  const handlePointerUp = useCallback(() => {
    if (!dragging || !dragPos) { setDragging(null); setDragPos(null); return; }
    const id = dragging.id as string;
    if (typeof id === 'string' && id.startsWith('junc-')) {
      const jIdx = parseInt(id.replace('junc-', ''));
      const junc = junctions[jIdx];
      if (junc) {
        const nx = dragPos.x, ny = dragPos.y;
        for (const part of junc.parts) {
          const f = elements.find(e => e.id === part.id);
          if (!f) continue;
          const isVert = f.h > f.w;
          const u: Partial<LayoutElement> = {};
          if (isVert) {
            // Vertical fence: align x to junction, adjust y/h for the dragged end
            u.x = nx - f.w / 2;
            if (part.end === 'start') {
              u.y = ny; u.h = snap(Math.max(0.5, f.h + (f.y - ny)));
            } else {
              u.h = snap(Math.max(0.5, ny - f.y));
            }
          } else {
            // Horizontal fence: align y to junction, adjust x/w for the dragged end
            u.y = ny - f.h / 2;
            if (part.end === 'start') {
              u.x = nx; u.w = snap(Math.max(0.5, f.w + (f.x - nx)));
            } else {
              u.w = snap(Math.max(0.5, nx - f.x));
            }
          }
          dispatch({ type: 'UPDATE_LAYOUT_EL', id: part.id, updates: u });
        }
      }
    } else if (typeof id === 'string' && id.startsWith('plot-el-')) {
      const realId = id.substring(id.indexOf('-', id.indexOf('-', 5) + 1) + 1);
      dispatch({ type: 'UPDATE_LAYOUT_EL', id: realId, updates: { x: Math.round(dragPos.x), y: Math.round(dragPos.y), w: dragPos.w, h: dragPos.h } });
    } else if (dragging.kind === 'element') {
      const dx = dragPos.x - dragging.origX;
      const dy = dragPos.y - dragging.origY;
      // Group drag: move all selected elements by the same delta
      if (Object.keys(groupDragOrigins.current).length > 1) {
        Object.entries(groupDragOrigins.current).forEach(([gid, orig]) => {
          dispatch({ type: 'MOVE_LAYOUT_EL', id: gid, x: Math.max(0, orig.x + dx), y: Math.max(0, orig.y + dy) });
        });
        groupDragOrigins.current = {};
      } else {
        const el = elements.find(e => e.id === id);
        if (el && (el.type === 'fence' || el.type === 'gate' || el.type === 'post')) {
          const snapped = snapFence(el, dragPos.x, dragPos.y);
          dispatch({ type: 'MOVE_LAYOUT_EL', id, x: snapped.x, y: snapped.y });
        } else {
          const el2 = elements.find(e => e.id === id);
          // Plots snap to whole feet (grid lines)
          const sx = el2?.type === 'plot' ? Math.round(dragPos.x) : dragPos.x;
          const sy = el2?.type === 'plot' ? Math.round(dragPos.y) : dragPos.y;
          dispatch({ type: 'MOVE_LAYOUT_EL', id, x: sx, y: sy });
        }
      }
    } else if (dragging.kind === 'resize' && dragPos.w != null && dragPos.h != null) {
      const el = elements.find(e => e.id === id);
      const isFence = el && (el.type === 'fence' || el.type === 'gate');
      if (isFence) {
        const snapped = snapFence(el, dragPos.x, dragPos.y, dragPos.w, dragPos.h);
        dispatch({ type: 'UPDATE_LAYOUT_EL', id, updates: { x: snapped.x, y: snapped.y, w: snapped.w, h: snapped.h } });
      } else {
        dispatch({ type: 'UPDATE_LAYOUT_EL', id, updates: { x: dragPos.x, y: dragPos.y, w: dragPos.w, h: dragPos.h } });
      }
    }
    setDragging(null); setDragPos(null);
  }, [dragging, dragPos, dispatch]);


  // ── Render an element ──
  const renderElement = (el: LayoutElement) => {
    const isDrag = dragging?.kind === 'element' && dragging.id === el.id;
    const isResize = dragging?.kind === 'resize' && dragging.id === el.id;
    const isPlotElResize = dragging && typeof dragging.id === 'string' && (dragging.id as string).endsWith(el.id) && (dragging.id as string).startsWith('plot-el-');
    // Group drag: if this element is part of a group being dragged, compute its offset position
    const isGroupDrag = isDrag ? false : (dragging?.kind === 'element' && Object.keys(groupDragOrigins.current).length > 1 && el.id in groupDragOrigins.current && dragPos);
    const isActive = isDrag || isResize || isPlotElResize || isGroupDrag;
    let px = isActive && dragPos ? dragPos.x : el.x;
    let py = isActive && dragPos ? dragPos.y : el.y;
    if (isGroupDrag && dragPos && dragging) {
      const dx = dragPos.x - dragging.origX;
      const dy = dragPos.y - dragging.origY;
      const orig = groupDragOrigins.current[el.id];
      if (orig) { px = Math.max(0, orig.x + dx); py = Math.max(0, orig.y + dy); }
    }
    const pw = (isResize || isPlotElResize) && dragPos?.w != null ? dragPos.w : el.w;
    const ph = (isResize || isPlotElResize) && dragPos?.h != null ? dragPos.h : el.h;
    const isSel = selected === el.id || selectedIds.includes(el.id);
    const info = LAYOUT_EL_INFO[el.type];

    const rot = el.rotation || 0;
    const base: React.CSSProperties = {
      position: 'absolute', left: px * SCALE, top: py * SCALE,
      width: pw * SCALE, height: ph * SCALE,
      cursor: 'grab', zIndex: isActive ? 50 : isSel ? 20 : 10,
      outline: isSel ? '2px solid #fbbf24' : 'none', outlineOffset: 2,
      transition: isActive ? 'none' : 'left 0.15s, top 0.15s, width 0.15s, height 0.15s',
      transform: `rotate(${rot}deg)`,
      transformOrigin: 'center center',
    };

    // Fences and gates are rendered in SVG layer, not here
    if (el.type === 'fence' || el.type === 'gate') return null;

    let style = { ...base };
    let content: React.ReactNode = null;
    // Counter-rotate text to always stay horizontal (fences handle their own text in SVG)
    const textRotate = rot ? `translate(-50%,-50%) rotate(-${rot}deg)` : 'translate(-50%,-50%)';
    const labelNode = (text: string, cls = 'text-[9px]') => hideLabels ? null : (
      <span className={`absolute ${cls} font-pixel px-1 truncate`} style={{ textShadow: '0 1px 2px rgba(255,255,255,0.7)', top: '50%', left: '50%', transform: textRotate, whiteSpace: 'nowrap' }}>
        {text}
      </span>
    );

    switch (el.type) {
      case 'sprinkler':
        style = { ...style, borderRadius: '50%', border: '3px dashed #60a5fa', backgroundColor: 'rgba(96,165,250,0.15)', zIndex: isSel ? 25 : 15 };
        content = <><span className="absolute inset-0 flex items-center justify-center text-xl pointer-events-none">💧</span></>;
        break;
      case 'raised-bed':
        style = { ...style, border: '4px solid #6b4423', backgroundColor: 'rgba(139,111,71,0.35)', boxShadow: 'inset 0 0 0 2px #d4a574' };
        content = (
          <>
            {labelNode(el.label || 'Raised Bed', 'text-[9px] text-parchment')}
            {!hideLabels && <span className="font-pixel select-none pointer-events-none"
              style={{ position: 'absolute', top: 4, right: 5, fontSize: 9, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.5)', transform: rot ? `rotate(-${rot}deg)` : undefined, zIndex: 1 }}>{fmtLen(pw)}×{fmtLen(ph)}</span>}
          </>
        );
        break;
      case 'trellis':
        style = { ...style, border: '2px solid #78716c', backgroundColor: 'rgba(168,162,158,0.2)', backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 5px, rgba(120,113,108,0.25) 5px, rgba(120,113,108,0.25) 6px), repeating-linear-gradient(90deg, transparent, transparent 5px, rgba(120,113,108,0.25) 5px, rgba(120,113,108,0.25) 6px)' };
        content = labelNode(el.label || 'Trellis', 'text-[9px] text-stone-600');
        break;
      case 'cage':
        style = { ...style, border: '2px dashed #71717a', borderRadius: 4, backgroundColor: 'rgba(113,113,122,0.1)' };
        content = labelNode(el.label || 'Cage', 'text-[9px] text-zinc-500');
        break;
      case 'arch':
        style = { ...style, border: '3px solid #78716c', borderRadius: '40% 40% 0 0', backgroundColor: 'rgba(120,113,108,0.15)' };
        content = labelNode(el.label || 'Arch', 'text-[9px] text-stone-600');
        break;
      case 'pot':
        style = { ...style, border: '3px solid #b87333', borderRadius: '0 0 30% 30%', borderTop: '4px solid #cd853f', backgroundColor: 'rgba(184,115,51,0.15)' };
        content = <span className="absolute inset-0 flex items-center justify-center text-lg pointer-events-none">🪴</span>;
        break;
      case 'path':
        style = { ...style, backgroundColor: 'rgba(168,162,158,0.5)', border: '1px solid #78716c', borderRadius: 3,
          zIndex: isActive ? 50 : isSel ? 2 : 1,
          pointerEvents: selected && selected !== el.id ? 'none' : 'auto',
        };
        content = labelNode(el.label || 'Path', 'text-[9px] text-stone-700');
        break;
      case 'post': {
        const postColors: Record<string, string> = { wood: '#78350f', metal: '#52525b', pvc: '#d1d5db' };
        style = { ...style, backgroundColor: postColors[el.material || 'wood'] || '#78350f', border: '2px solid #4a2f17', borderRadius: 2 };
        break;
      }
      case 'tree':
        style = { ...style, borderRadius: '50%', backgroundColor: 'rgba(45,90,22,0.3)', border: '2px dashed #2d5a16' };
        content = <span className="absolute inset-0 flex items-center justify-center text-2xl pointer-events-none" style={{ transform: rot ? `rotate(-${rot}deg)` : undefined }}>🌳</span>;
        break;
      case 'plot':
        style = {
          ...style,
          backgroundColor: el.material || '#7cb342',
          backgroundImage: `
            radial-gradient(circle 1px at 25% 35%, rgba(0,0,0,0.06) 0%, transparent 100%),
            radial-gradient(circle 1px at 75% 65%, rgba(255,255,255,0.08) 0%, transparent 100%),
            linear-gradient(rgba(0,0,0,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px)
          `,
          backgroundSize: `16px 16px, 16px 16px, ${SCALE}px ${SCALE}px, ${SCALE}px ${SCALE}px`,
          borderRadius: 2,
          border: isSel ? '2px dashed #fff' : '1px solid rgba(0,0,0,0.1)',
          outline: 'none',
          zIndex: isActive ? 50 : isSel ? 2 : 1,
          pointerEvents: selected && selected !== el.id ? 'none' : 'auto',
        };
        content = (
          <>
            <span className="absolute text-[9px] font-pixel text-white/60 select-none pointer-events-none"
              style={{ bottom: 4, right: 6, transform: rot ? `rotate(-${rot}deg)` : undefined }}>
              {el.label ? `${el.label} · ` : ''}{fmtLen(pw)}×{fmtLen(ph)}
            </span>
            {isSel && (() => {
              const Dot = ({ cx, cy, cur, sid }: { cx: number; cy: number; cur: string; sid: string }) => (
                <div className="absolute" style={{ left: cx - 5, top: cy - 5, width: 10, height: 10, cursor: cur, zIndex: 60, backgroundColor: '#fff', border: '2px solid #4a7a2e', borderRadius: '50%' }}
                  onPointerDown={e => {
                    e.stopPropagation(); e.preventDefault();
                    (e.target as HTMLElement).setPointerCapture(e.pointerId);
                    setDragging({ kind: 'resize' as any, id: `plot-el-${sid}-${el.id}`, startX: e.clientX, startY: e.clientY, origX: el.x, origY: el.y, origW: el.w, origH: el.h });
                    setDragPos({ x: el.x, y: el.y, w: el.w, h: el.h });
                  }} />
              );
              const W = pw * SCALE, H = ph * SCALE;
              return (
                <>
                  <Dot cx={W / 2} cy={0} cur="ns-resize" sid="top" />
                  <Dot cx={W / 2} cy={H} cur="ns-resize" sid="bottom" />
                  <Dot cx={0} cy={H / 2} cur="ew-resize" sid="left" />
                  <Dot cx={W} cy={H / 2} cur="ew-resize" sid="right" />
                  <Dot cx={0} cy={0} cur="nwse-resize" sid="tl" />
                  <Dot cx={W} cy={0} cur="nesw-resize" sid="tr" />
                  <Dot cx={0} cy={H} cur="nesw-resize" sid="bl" />
                  <Dot cx={W} cy={H} cur="nwse-resize" sid="br" />
                </>
              );
            })()}
          </>
        );
        break;
      case 'deterrent':
        style = { ...style, borderRadius: '50%', backgroundColor: 'rgba(146,64,14,0.15)', border: '2px dashed #92400e' };
        content = <span className="absolute inset-0 flex items-center justify-center text-xl pointer-events-none" style={{ transform: rot ? `rotate(-${rot}deg)` : undefined }}>🦉</span>;
        break;
      case 'stake':
        style = { ...style, borderRadius: 2, backgroundColor: '#6b4423', border: '2px solid #4a2f17' };
        content = <span className="absolute inset-0 flex items-center justify-center text-sm pointer-events-none" style={{ transform: rot ? `rotate(-${rot}deg)` : undefined }}>🥢</span>;
        break;
      case 'label':
        style = { ...style, backgroundColor: 'transparent' };
        if (editingLabel === el.id) {
          content = (
            <input
              autoFocus
              defaultValue={el.label || ''}
              className="w-full h-full bg-transparent text-[9px] font-pixel text-wood-dark outline-none border-b border-wood-light px-1"
              style={{ textShadow: '0 1px 2px rgba(255,255,255,0.6)' }}
              onClick={e => e.stopPropagation()}
              onPointerDown={e => e.stopPropagation()}
              onBlur={e => { dispatch({ type: 'UPDATE_LAYOUT_EL', id: el.id, updates: { label: e.target.value } }); setEditingLabel(null); }}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            />
          );
        } else {
          content = labelNode(el.label || 'Label', 'text-[9px] text-wood-dark');
        }
        break;
    }

    return (
      <div key={el.id} data-layout-el style={style} title={`${el.label || info.label} (${fmtLen(el.w)}×${fmtLen(el.h)})`}
        onClick={e => { if (addingType) return; e.stopPropagation(); setSelected(el.id); }}
        onDoubleClick={e => { e.stopPropagation(); if (el.type === 'label') setEditingLabel(el.id); }}
        onPointerDown={e => {
          if (addingType || editingLabel === el.id) return;
          e.stopPropagation(); e.preventDefault();
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          // If this element is part of a multi-selection, store all origins for group drag
          if (selectedIds.includes(el.id) && selectedIds.length > 1) {
            const origins: Record<string, { x: number; y: number }> = {};
            selectedIds.forEach(id => {
              const item = elements.find(e => e.id === id);
              if (item) origins[id] = { x: item.x, y: item.y };
            });
            groupDragOrigins.current = origins;
          } else {
            groupDragOrigins.current = {};
            setSelectedIds([]);
            setSelected(el.id);
          }
          setDragging({ kind: 'element', id: el.id, startX: e.clientX, startY: e.clientY, origX: el.x, origY: el.y });
          setDragPos({ x: el.x, y: el.y });
        }}
      >
        {content}
        {/* Resize handle — corner square for normal elements */}
        {isSel && el.type !== 'plot' && (
          <div
            className="absolute w-3 h-3 bg-yellow-400 border border-yellow-600 cursor-se-resize"
            style={{ right: -6, bottom: -6, zIndex: 60 }}
            onPointerDown={e => {
              e.stopPropagation(); e.preventDefault();
              (e.target as HTMLElement).setPointerCapture(e.pointerId);
              setDragging({ kind: 'resize', id: el.id, startX: e.clientX, startY: e.clientY, origX: el.x, origY: el.y, origW: el.w, origH: el.h, origX2: el.rotation || 0 });
              setDragPos({ x: el.x, y: el.y, w: el.w, h: el.h });
            }}
          />
        )}
      </div>
    );
  };

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* ── Left panel ── */}
      <div className="w-56 flex-shrink-0 pixel-panel overflow-y-auto flex flex-col" style={{ borderTop: 'none' }}>
        <div className="p-3 border-b-2 border-wood-light">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-[9px] text-wood-dark">📐 LAYOUT</h2>
            <button onClick={() => setUnit(unit === 'ft' ? 'in' : 'ft')}
              title="Toggle all measurements between feet and inches"
              className="text-[8px] font-pixel px-2 py-0.5 bg-parchment-dark border border-wood-light text-wood-dark hover:bg-parchment leading-none"
            >{unit}</button>
          </div>
          <p className="text-[8px] text-wood-light">Drag corners to shape your garden. Click items to place.</p>
        </div>

        {/* Element palette */}
        <div className="p-2 border-b-2 border-wood-light">
          <p className="text-[9px] text-wood-dark font-pixel mb-1">ADD ITEM</p>
          <div className="grid grid-cols-3 gap-0.5">
            {(Object.entries(LAYOUT_EL_INFO) as [LayoutElType, typeof LAYOUT_EL_INFO[LayoutElType]][]).map(([type, info]) => (
              <button key={type}
                onClick={() => selectAddType(addingType === type ? null : type)}
                className={`flex flex-col items-center p-1 border transition-colors text-center ${addingType === type ? 'border-green-600 bg-green-100' : 'border-transparent hover:border-wood-light hover:bg-parchment-dark'}`}
                title={info.label}
              >
                <span className="text-lg">{info.emoji}</span>
                <span className="text-[7px] font-pixel text-wood mt-0.5 leading-tight">{info.label}</span>
              </button>
            ))}
          </div>
        </div>




        {/* New element options — shown before placing */}
        {addingType && !selectedEl && (
          <div className="p-2 border-b-2 border-wood-light">
            <p className="text-[9px] text-wood-dark font-pixel mb-1">{LAYOUT_EL_INFO[addingType].emoji} NEW {LAYOUT_EL_INFO[addingType].label.toUpperCase()}</p>
            <p className="text-[8px] text-wood-light mb-1.5">
              {(addingType === 'fence' || addingType === 'gate')
                ? (fenceStart ? 'Click again to set the other end.' : 'Click to set the start point, then click again for the end.')
                : 'Click on the grid to place.'}
            </p>
            <div className="mb-1.5">
              <label className="text-[7px] text-wood">Label</label>
              <input value={newElLabel} onChange={e => setNewElLabel(e.target.value)}
                className="pixel-input w-full text-[9px] py-0.5" />
            </div>
            {(addingType === 'fence' || addingType === 'post' || addingType === 'gate') && (
              <div className="mb-1.5">
                <label className="text-[7px] text-wood">Material</label>
                <select value={newElMaterial} onChange={e => setNewElMaterial(e.target.value)}
                  className="pixel-select w-full text-[9px] py-0.5">
                  <option value="wood">Wood</option>
                  <option value="chainlink">Chainlink</option>
                  <option value="pvc">PVC</option>
                  <option value="metal">Metal</option>
                </select>
              </div>
            )}
            {addingType !== 'sprinkler' && addingType !== 'label' && addingType !== 'fence' && (
              <>
                <p className="text-[9px] text-wood-dark font-pixel mb-1">SIZE</p>
                <div className="flex gap-2 mb-1.5">
                  <div className="flex-1">
                    <label className="text-[7px] text-wood">Width ({unit})</label>
                    <input type="number" min={minD(0.5)} step={unitStep} value={toD(newElW)}
                      onChange={e => setNewElW(Math.max(0.5, fromD(Number(e.target.value))))}
                      className="pixel-input w-full text-[9px] py-0.5" />
                  </div>
                  <div className="flex-1">
                    <label className="text-[7px] text-wood">Length ({unit})</label>
                    <input type="number" min={minD(0.5)} step={unitStep} value={toD(newElH)}
                      onChange={e => setNewElH(Math.max(0.5, fromD(Number(e.target.value))))}
                      className="pixel-input w-full text-[9px] py-0.5" />
                  </div>
                </div>
              </>
            )}
            {addingType === 'plot' && (
              <div className="mb-1.5">
                <label className="text-[7px] text-wood">Color</label>
                <div className="flex gap-1 flex-wrap mt-0.5">
                  {[
                    { c: '#7cb342', l: 'Green' },
                    { c: '#8d6e63', l: 'Dirt' },
                    { c: '#a5d6a7', l: 'Light Green' },
                    { c: '#c8e6c9', l: 'Pale Green' },
                    { c: '#d7ccc8', l: 'Sand' },
                    { c: '#bcaaa4', l: 'Clay' },
                    { c: '#90a4ae', l: 'Gravel' },
                    { c: '#fff9c4', l: 'Straw' },
                  ].map(({ c, l }) => (
                    <button key={c} title={l}
                      onClick={() => setNewElMaterial(c)}
                      className="w-6 h-6 rounded-sm border-2 transition-all"
                      style={{
                        backgroundColor: c,
                        borderColor: newElMaterial === c ? '#4a2f17' : 'transparent',
                        outline: newElMaterial === c ? '2px solid #fbbf24' : 'none',
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Selected element properties */}
        {selectedEl && (
          <div className="p-2 flex-1">
            {selectedEl.type === 'plot' ? (
              <>
                <p className="text-[9px] text-wood-dark font-pixel mb-1">🌿 GARDEN PLOT</p>
                <div className="mb-1.5">
                  <label className="text-[7px] text-wood">Name</label>
                  <input value={selectedEl.label || ''} onChange={e => dispatch({ type: 'UPDATE_LAYOUT_EL', id: selectedEl.id, updates: { label: e.target.value } })}
                    className="pixel-input w-full text-[9px] py-0.5" placeholder="My Garden" />
                </div>
                <p className="text-[9px] text-wood-dark font-pixel mb-1">SIZE</p>
                <div className="flex gap-2 mb-1.5">
                  <div className="flex-1">
                    <label className="text-[7px] text-wood">Width ({unit})</label>
                    <input type="number" min={minD(2)} step={unitStep} value={toD(selectedEl.w)}
                      onChange={e => dispatch({ type: 'UPDATE_LAYOUT_EL', id: selectedEl.id, updates: { w: Math.max(2, fromD(Number(e.target.value))) } })}
                      className="pixel-input w-full text-[9px] py-0.5" />
                  </div>
                  <div className="flex-1">
                    <label className="text-[7px] text-wood">Length ({unit})</label>
                    <input type="number" min={minD(2)} step={unitStep} value={toD(selectedEl.h)}
                      onChange={e => dispatch({ type: 'UPDATE_LAYOUT_EL', id: selectedEl.id, updates: { h: Math.max(2, fromD(Number(e.target.value))) } })}
                      className="pixel-input w-full text-[9px] py-0.5" />
                  </div>
                </div>
                <div className="mb-1.5">
                  <label className="text-[7px] text-wood">Color</label>
                  <div className="flex gap-1 flex-wrap mt-0.5">
                    {[
                      { c: '#7cb342', l: 'Green' },
                      { c: '#8d6e63', l: 'Dirt' },
                      { c: '#a5d6a7', l: 'Light Green' },
                      { c: '#c8e6c9', l: 'Pale Green' },
                      { c: '#d7ccc8', l: 'Sand' },
                      { c: '#bcaaa4', l: 'Clay' },
                      { c: '#90a4ae', l: 'Gravel' },
                      { c: '#fff9c4', l: 'Straw' },
                    ].map(({ c, l }) => (
                      <button key={c} title={l}
                        onClick={() => dispatch({ type: 'UPDATE_LAYOUT_EL', id: selectedEl.id, updates: { material: c } })}
                        className="w-6 h-6 rounded-sm border-2 transition-all"
                        style={{
                          backgroundColor: c,
                          borderColor: (selectedEl.material || '#7cb342') === c ? '#4a2f17' : 'transparent',
                          outline: (selectedEl.material || '#7cb342') === c ? '2px solid #fbbf24' : 'none',
                        }}
                      />
                    ))}
                  </div>
                </div>
                <button onClick={() => { dispatch({ type: 'REMOVE_LAYOUT_EL', id: selectedEl.id }); setSelected(null); }}
                  className="pixel-btn pixel-btn-small pixel-btn-danger text-[9px] w-full mt-0.5" style={{ padding: '6px 0' }}>Delete</button>
              </>
            ) : (
              <>
                <p className="text-[9px] text-wood-dark font-pixel mb-1">{LAYOUT_EL_INFO[selectedEl.type].emoji} {LAYOUT_EL_INFO[selectedEl.type].label.toUpperCase()}</p>
                <div className="mb-1.5">
                  <label className="text-[7px] text-wood">Label</label>
                  <input value={selectedEl.label || ''} onChange={e => dispatch({ type: 'UPDATE_LAYOUT_EL', id: selectedEl.id, updates: { label: e.target.value } })}
                    className="pixel-input w-full text-[9px] py-0.5" />
                </div>
              </>
            )}
            {selectedEl.type === 'fence' && (
              <div className="mb-1.5">
                <label className="text-[7px] text-wood">Material</label>
                <select value={selectedEl.material || 'wood'}
                  onChange={e => dispatch({ type: 'UPDATE_LAYOUT_EL', id: selectedEl.id, updates: { material: e.target.value } })}
                  className="pixel-select w-full text-[9px] py-0.5">
                  <option value="wood">Wood</option>
                  <option value="chainlink">Chainlink</option>
                  <option value="pvc">PVC</option>
                  <option value="metal">Metal</option>
                </select>
              </div>
            )}
            {(selectedEl.type === 'post' || selectedEl.type === 'gate') && (
              <div className="mb-1.5">
                <label className="text-[7px] text-wood">Material</label>
                <select value={selectedEl.material || 'wood'}
                  onChange={e => dispatch({ type: 'UPDATE_LAYOUT_EL', id: selectedEl.id, updates: { material: e.target.value } })}
                  className="pixel-select w-full text-[9px] py-0.5">
                  <option value="wood">Wood</option>
                  <option value="metal">Metal</option>
                  <option value="pvc">PVC</option>
                </select>
              </div>
            )}
            {(selectedEl.type === 'fence' || selectedEl.type === 'gate') && (() => {
              const isVert = selectedEl.h > selectedEl.w;
              const len = isVert ? selectedEl.h : selectedEl.w;
              return (
                <div className="mb-5">
                  <label className="text-[7px] text-wood">Length ({unit}) — {isVert ? 'vertical' : 'horizontal'}</label>
                  <input type="number" min={minD(0.5)} step={unitStep} value={toD(len)}
                    onChange={e => {
                      const nl = Math.max(0.5, fromD(Number(e.target.value)));
                      dispatch({ type: 'UPDATE_LAYOUT_EL', id: selectedEl.id, updates: isVert ? { h: nl, w: 0.3 } : { w: nl, h: 0.3 } });
                    }}
                    className="pixel-input w-full text-[9px] py-0.5" />
                </div>
              );
            })()}
            {selectedEl.type !== 'sprinkler' && selectedEl.type !== 'label' && selectedEl.type !== 'fence' && selectedEl.type !== 'gate' && selectedEl.type !== 'plot' && (
              <>
                <p className="text-[9px] text-wood-dark font-pixel mb-1">SIZE</p>
                <div className="flex gap-2 mb-1.5">
                  <div className="flex-1">
                    <label className="text-[7px] text-wood">Width ({unit})</label>
                    <input type="number" min={minD(0.5)} step={unitStep} value={toD(selectedEl.w)}
                      onChange={e => dispatch({ type: 'UPDATE_LAYOUT_EL', id: selectedEl.id, updates: { w: fromD(Number(e.target.value)) } })}
                      className="pixel-input w-full text-[9px] py-0.5" />
                  </div>
                  <div className="flex-1">
                    <label className="text-[7px] text-wood">Length ({unit})</label>
                    <input type="number" min={minD(0.5)} step={unitStep} value={toD(selectedEl.h)}
                      onChange={e => dispatch({ type: 'UPDATE_LAYOUT_EL', id: selectedEl.id, updates: { h: fromD(Number(e.target.value)) } })}
                      className="pixel-input w-full text-[9px] py-0.5" />
                  </div>
                </div>
              </>
            )}
            {selectedEl.type !== 'plot' && <div className="flex gap-1 mb-1.5">
              {selectedEl.type !== 'fence' && selectedEl.type !== 'gate' && (
                <button onClick={() => {
                  if (selectedEl.type === 'label') {
                    dispatch({ type: 'UPDATE_LAYOUT_EL', id: selectedEl.id, updates: { rotation: (selectedEl.rotation || 0) === 0 ? 270 : 0 } });
                  } else {
                    dispatch({ type: 'UPDATE_LAYOUT_EL', id: selectedEl.id, updates: { rotation: ((selectedEl.rotation || 0) + 270) % 360 } });
                  }
                }} className="pixel-btn pixel-btn-small bg-parchment-dark flex-1" title="Rotate" style={{ fontSize: 18, padding: '2px 0' }}><span style={{ position: 'relative', top: -4 }}>↺</span></button>
              )}
              <button onClick={() => { dispatch({ type: 'REMOVE_LAYOUT_EL', id: selectedEl.id }); setSelected(null); }}
                className="pixel-btn pixel-btn-small pixel-btn-danger text-[9px] flex-1" style={{ padding: '6px 0' }}>Delete</button>
            </div>}
            <button onClick={() => {
              const dup = { ...selectedEl, id: `${selectedEl.type}-${Date.now()}`, x: selectedEl.x + 1, y: selectedEl.y + 1 };
              dispatch({ type: 'ADD_LAYOUT_EL', element: dup }); setSelected(dup.id);
            }} className="pixel-btn pixel-btn-small bg-parchment-dark text-[9px] w-full mt-3" style={{ padding: '6px 0' }}>Duplicate</button>
          </div>
        )}

        {!selectedEl && !addingType && (
          <div className="p-3 text-[8px] text-wood-light text-center flex-1">
            Select an item above to place it. Click placed items to edit. Click the element on the grid to move or resize it.
          </div>
        )}

        <div className="p-2 border-t-2 border-wood-light">
          <button onClick={() => setHideLabels(!hideLabels)}
            className={`text-[8px] w-full py-1 cursor-pointer transition-colors ${hideLabels ? 'text-wood-dark' : 'text-wood-light hover:text-wood'}`}
          >{hideLabels ? 'Show Labels' : 'Hide Labels'}</button>
        </div>
      </div>

      {/* ── Canvas with fixed rulers ── */}
      <div className="flex-1 flex flex-col" style={{ borderTop: '4px solid #4a2f17' }}>
        {/* Top ruler — fixed, never scrolls */}
        <div className="flex z-20" style={{ flexShrink: 0 }}>
          <div style={{ width: 28, height: 24, flexShrink: 0, backgroundColor: '#e0d8c8', borderBottom: '2px solid #b8a88a', borderRight: '2px solid #b8a88a' }}>
            <span className="text-[9px] text-stone-400 flex items-center justify-center h-full">{unit}</span>
          </div>
          <div className="relative overflow-hidden" style={{ height: 24, backgroundColor: '#e8e0d0', borderBottom: '2px solid #b8a88a', flex: 1 }}>
            <div className="absolute" style={{ left: -scrollPos.x, top: 0, height: 24, width: 99999 }}>
              {Array.from({ length: Math.ceil((containerSize.w + 500) / SCALE) + 1 }, (_, i) => (
                <span key={`rt-${i}`} className="absolute text-[9px] font-pixel select-none pointer-events-none"
                  style={{ left: i * SCALE - 1, bottom: 2, color: i % 5 === 0 ? '#5c4033' : '#a89880', borderLeft: '1px solid #b8a88a', paddingLeft: 2, height: i % 5 === 0 ? 12 : 6 }}>
                  {i % 5 === 0 ? `${unit === 'in' ? i * 12 : i}` : ''}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden relative">
          {/* Left ruler — fixed, never scrolls */}
          <div className="relative overflow-hidden z-20" style={{ width: 28, flexShrink: 0, backgroundColor: '#e8e0d0', borderRight: '2px solid #b8a88a' }}>
            <div className="absolute" style={{ top: -scrollPos.y, left: 0, width: 28, height: 99999 }}>
              {Array.from({ length: Math.ceil((containerSize.h + 500) / SCALE) + 1 }, (_, i) => (
                <span key={`rl-${i}`} className="absolute text-[9px] font-pixel select-none pointer-events-none"
                  style={{ top: i * SCALE - 1, right: 3, color: i % 5 === 0 ? '#5c4033' : '#a89880', borderTop: '1px solid #b8a88a', paddingTop: 1, width: i % 5 === 0 ? 'auto' : 6 }}>
                  {i % 5 === 0 ? `${unit === 'in' ? i * 12 : i}` : ''}
                </span>
              ))}
            </div>
          </div>

          {/* Scrollable garden area */}
          <div ref={containerRef} style={{
            backgroundColor: '#f0ebe0',
            backgroundImage: `linear-gradient(rgba(0,0,0,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px)`,
            backgroundSize: `${SCALE}px ${SCALE}px`,
            overflow: 'auto',
            position: 'absolute',
            top: 0, right: 0, bottom: 0, left: 28,
          }}
            onPointerMove={handlePointerMove}
            onPointerUp={e => { handlePointerUp(); handleCanvasPointerUp(); }}
            onPointerCancel={e => { handlePointerUp(); handleCanvasPointerUp(); }}
          >
          <div style={{
              minWidth: `max(${canvasW + 16}px, 100%)`,
              minHeight: `max(${canvasH + 16}px, 100%)`,
              padding: 8, position: 'relative',
            }}
              onClick={handleCanvasClick}
              onMouseMove={handleCanvasMouseMove}
              onPointerDown={handleCanvasPointerDown}
            >
          {/* Main plot removed — use Plot elements from palette instead */}


          {/* Fence SVG layer */}
          <svg className="absolute inset-0" width={canvasW + 16} height={canvasH + 16} style={{ pointerEvents: 'none', overflow: 'visible', zIndex: 3 }}>
            {elements.filter(el => el.type === 'fence' || el.type === 'gate').map(el => {
              const isDrag = dragging?.kind === 'element' && dragging.id === el.id;
              const isResize = dragging?.kind === 'resize' && dragging.id === el.id;
              const isSel = selected === el.id || selectedIds.includes(el.id);
              const ex = (isDrag || isResize) && dragPos ? dragPos.x : el.x;
              const ey = (isDrag || isResize) && dragPos ? dragPos.y : el.y;
              const ew = isResize && dragPos?.w != null ? dragPos.w : el.w;
              const eh = isResize && dragPos?.h != null ? dragPos.h : el.h;
              const isVert = eh > ew;

              // Line endpoints
              const x1 = isVert ? (ex + ew / 2) * SCALE : ex * SCALE;
              const y1 = isVert ? ey * SCALE : (ey + eh / 2) * SCALE;
              const x2 = isVert ? (ex + ew / 2) * SCALE : (ex + ew) * SCALE;
              const y2 = isVert ? (ey + eh) * SCALE : (ey + eh / 2) * SCALE;

              const fenceColors: Record<string, { color: string; dash?: string }> = {
                chainlink: { color: '#6b7280', dash: '6,3' },
                wood: { color: '#78350f' },
                pvc: { color: '#d1d5db' },
                metal: { color: '#52525b', dash: '8,2' },
              };
              const fc = fenceColors[el.material || 'wood'] || fenceColors.wood;
              const fenceClick = (e: React.MouseEvent) => {
                e.stopPropagation(); setSelected(el.id); setAddingType(null);               };
              const fenceDrag = (e: React.PointerEvent) => {
                e.stopPropagation(); e.preventDefault();
                (e.currentTarget as SVGElement).setPointerCapture(e.pointerId);
                setSelected(el.id); setAddingType(null);                 setDragging({ kind: 'element', id: el.id, startX: e.clientX, startY: e.clientY, origX: el.x, origY: el.y });
                setDragPos({ x: el.x, y: el.y });
              };
              const endDrag = (isStart: number) => (e: React.PointerEvent) => {
                e.stopPropagation(); e.preventDefault();
                (e.target as SVGElement).setPointerCapture(e.pointerId);
                setSelected(el.id); setAddingType(null);                 setDragging({ kind: 'resize', id: el.id, startX: e.clientX, startY: e.clientY,
                  origX: el.x, origY: el.y, origW: el.w, origH: el.h, origX2: isStart });
                setDragPos({ x: el.x, y: el.y, w: el.w, h: el.h });
              };

              return (
                <g key={el.id}>
                  {/* Wide invisible hit area */}
                  <line x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke="transparent" strokeWidth={16}
                    style={{ pointerEvents: 'stroke', cursor: 'grab' }}
                    onClick={fenceClick} onPointerDown={fenceDrag} />
                  {/* Fence border */}
                  <line x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke="#000" strokeWidth={isSel ? 8 : el.type === 'gate' ? 8 : 6}
                    strokeLinecap="round" strokeOpacity={0.3}
                    style={{ pointerEvents: 'none' }} />
                  {/* Visible fence line */}
                  <line x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke={isSel ? '#fbbf24' : fc.color}
                    strokeWidth={isSel ? 6 : el.type === 'gate' ? 6 : 4}
                    strokeDasharray={el.type === 'gate' ? '4,4' : (fc.dash || 'none')}
                    strokeLinecap="round"
                    style={{ pointerEvents: 'none' }} />
                  {/* Label */}
                  {!hideLabels && (() => {
                    const lenFt = Math.max(ew, eh);
                    const lenTxt = fmtLen(lenFt);
                    const txt = el.label ? `${el.label} (${lenTxt})` : lenTxt;
                    const mx = (x1 + x2) / 2;
                    const my = (y1 + y2) / 2;
                    // If label would be hidden past the ruler (too close to top/left), flip to other side
                    const tooCloseTop = my < 20;
                    const tooCloseLeft = mx < 40;
                    if (isVert) {
                      // Vertical fence — rotated text, flip left/right
                      const lx = tooCloseLeft ? mx + 12 : mx - 12;
                      return (
                        <text x={lx} y={my}
                          textAnchor="middle" dominantBaseline="middle"
                          transform={`rotate(-90, ${lx}, ${my})`}
                          style={{ pointerEvents: 'auto', cursor: 'pointer', fontSize: 10, fontFamily: 'var(--font-pixel)', fill: isSel ? '#92400e' : '#57534e' }}
                          onClick={fenceClick}>
                          {txt}
                        </text>
                      );
                    }
                    // Horizontal fence — flip above/below
                    const ly = tooCloseTop ? my + 14 : my - 8;
                    return (
                      <text x={mx} y={ly}
                        textAnchor="middle"
                        style={{ pointerEvents: 'auto', cursor: 'pointer', fontSize: 10, fontFamily: 'var(--font-pixel)', fill: isSel ? '#92400e' : '#57534e' }}
                        onClick={fenceClick}>
                        {txt}
                      </text>
                    );
                  })()}
                  {/* Endpoint circles — only when selected, hidden if at a junction */}
                  {isSel && (() => {
                    const atJunc1 = junctions.some(j => Math.abs(j.x * SCALE - x1) < 5 && Math.abs(j.y * SCALE - y1) < 5);
                    const atJunc2 = junctions.some(j => Math.abs(j.x * SCALE - x2) < 5 && Math.abs(j.y * SCALE - y2) < 5);
                    return (
                      <>
                        {!atJunc1 && <circle cx={x1} cy={y1} r={6}
                          fill="#fff" stroke="#6b4423" strokeWidth={2}
                          style={{ pointerEvents: 'auto', cursor: isVert ? 'ns-resize' : 'ew-resize' }}
                          onPointerDown={endDrag(1)} />}
                        {!atJunc2 && <circle cx={x2} cy={y2} r={6}
                          fill="#fff" stroke="#6b4423" strokeWidth={2}
                          style={{ pointerEvents: 'auto', cursor: isVert ? 'ns-resize' : 'ew-resize' }}
                          onPointerDown={endDrag(0)} />}
                      </>
                    );
                  })()}
                </g>
              );
            })}

            {/* Preview line while placing a fence */}
            {fenceStart && mousePos && (addingType === 'fence' || addingType === 'gate') && (() => {
              const dx = Math.abs(mousePos.x - fenceStart.x);
              const dy = Math.abs(mousePos.y - fenceStart.y);
              const isVert = dy > dx;
              const x1 = fenceStart.x * SCALE;
              const y1 = fenceStart.y * SCALE;
              const x2 = isVert ? fenceStart.x * SCALE : mousePos.x * SCALE;
              const y2 = isVert ? mousePos.y * SCALE : fenceStart.y * SCALE;
              const len = Math.round((isVert ? dy : dx) * 10) / 10;
              return (
                <g>
                  <line x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke="#fbbf24" strokeWidth={3} strokeDasharray="6,4" style={{ pointerEvents: 'none' }} />
                  <circle cx={x1} cy={y1} r={5} fill="#fbbf24" stroke="#92400e" strokeWidth={2} style={{ pointerEvents: 'none' }} />
                  <circle cx={x2} cy={y2} r={5} fill="#fbbf24" stroke="#92400e" strokeWidth={2} style={{ pointerEvents: 'none' }} />
                  <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 10}
                    textAnchor="middle" style={{ pointerEvents: 'none', fontSize: 11, fontFamily: 'var(--font-pixel)', fill: '#92400e' }}>
                    {len}ft
                  </text>
                </g>
              );
            })()}
          </svg>

          {/* Selection box with measurements */}
          {selBox && (() => {
            const rawW = Math.abs(selBox.x2 - selBox.x1);
            const rawH = Math.abs(selBox.y2 - selBox.y1);
            const w = rawW;
            const h = rawH;
            const fmtW = fmtLen(rawW);
            const fmtH = fmtLen(rawH);
            const left = Math.min(selBox.x1, selBox.x2) * SCALE;
            const top = Math.min(selBox.y1, selBox.y2) * SCALE;
            return (
              <div className="absolute z-40 pointer-events-none" style={{ left, top, width: w * SCALE, height: h * SCALE }}>
                <div className="absolute inset-0 border-2 border-dashed border-blue-400 bg-blue-400/10" />
                {/* Width label — top */}
                {w > 0.3 && (
                  <span className="absolute font-pixel text-blue-600 select-none"
                    style={{ top: -16, left: '50%', transform: 'translateX(-50%)', fontSize: 10, textShadow: '0 1px 2px rgba(255,255,255,0.9)' }}>
                    {fmtW}
                  </span>
                )}
                {/* Height label — right */}
                {h > 0.3 && (
                  <span className="absolute font-pixel text-blue-600 select-none"
                    style={{ right: -40, top: '50%', transform: 'translateY(-50%)', fontSize: 10, textShadow: '0 1px 2px rgba(255,255,255,0.9)', whiteSpace: 'nowrap' }}>
                    {fmtH}
                  </span>
                )}
              </div>
            );
          })()}

          {/* Cursor overlay for placing */}
          {addingType && <div className="absolute inset-0 cursor-crosshair z-5" />}

          {/* Layout elements (non-fence) */}
          {elements.map(renderElement)}


          {/* Junction dots — where fences meet */}
          {junctions.map((junc, i) => {
            const isDrag = dragging && (dragging.id as string) === `junc-${i}`;
            const anySelected = junc.parts.some(p => p.id === selected);
            if (!anySelected && !isDrag) return null;
            const jx = isDrag && dragPos ? dragPos.x : junc.x;
            const jy = isDrag && dragPos ? dragPos.y : junc.y;
            return (
              <div
                key={`junc-${i}`}
                className="absolute cursor-move z-30"
                style={{
                  left: jx * SCALE - 7, top: jy * SCALE - 7,
                  width: 14, height: 14,
                  backgroundColor: '#fff', border: '2px solid #6b4423',
                  borderRadius: '50%',
                  transition: isDrag ? 'none' : 'left 0.15s, top 0.15s',
                  boxShadow: '0 0 0 2px rgba(251,191,36,0.5)',
                }}
                title="Drag to resize both fences"
                onPointerDown={e => {
                  e.stopPropagation(); e.preventDefault();
                  (e.target as HTMLElement).setPointerCapture(e.pointerId);
                  setDragging({ kind: 'resize' as any, id: `junc-${i}`, startX: e.clientX, startY: e.clientY, origX: junc.x, origY: junc.y });
                  setDragPos({ x: junc.x, y: junc.y });
                }}
              />
            );
          })}
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}
