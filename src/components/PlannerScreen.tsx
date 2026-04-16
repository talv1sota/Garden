'use client';

import { useState, Dispatch, useRef, useCallback, useEffect, useMemo } from 'react';
import { GardenState, GardenAction, Bed, BedType, SunExposure, SoilType, SOIL_INFO, formatZone, ALL_ZONES, plantFitsZone, getCellPlantId, isCompanionOf, isEnemyOf } from '../types';
import { plantMap, plants } from '../data/plants';
import GardenBed from './GardenBed';
import GardenCanvas from './GardenCanvas';
import GardenLayout from './GardenLayout';
import Inventory from './Inventory';
import PlantDetails from './PlantDetails';
import { getStoredHandle, setStoredHandle, verifyPermission, writeToHandle, readFromHandle, isFsAccessSupported } from '../utils/fileStore';

interface Props {
  state: GardenState;
  dispatch: Dispatch<GardenAction>;
  user?: { id: string; username: string } | null;
  onLogout?: () => void;
}

export default function PlannerScreen({ state, dispatch, user, onLogout }: Props) {
  const [zoomPct, setZoomPct] = useState(100);
  const gridScale = Math.round(zoomPct / 100 * 33);
  const [showAddBed, setShowAddBed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Seamless file-backed auto-save (File System Access API) ──
  // User opens a file once with 📂; browser remembers the handle across reloads
  // and every state change auto-writes to it. No manual save action.
  const [fileHandle, setFileHandle] = useState<FileSystemFileHandle | null>(null);
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [showSavedToast, setShowSavedToast] = useState(false);
  const justLoadedFromFileRef = useRef(false);
  const savedToastTimer = useRef<number | null>(null);

  const flashSaved = useCallback(() => {
    setShowSavedToast(true);
    if (savedToastTimer.current) window.clearTimeout(savedToastTimer.current);
    savedToastTimer.current = window.setTimeout(() => setShowSavedToast(false), 1500);
  }, []);

  // On mount: reconnect to the previously connected file if permission is still granted.
  useEffect(() => {
    if (!isFsAccessSupported()) return;
    (async () => {
      const h = await getStoredHandle();
      if (!h) return;
      // @ts-ignore queryPermission without prompting
      if ((await h.queryPermission({ mode: 'readwrite' })) === 'granted') {
        try {
          const txt = await readFromHandle(h);
          const parsed = JSON.parse(txt);
          if (parsed && Array.isArray(parsed.beds)) {
            justLoadedFromFileRef.current = true;
            dispatch({ type: 'LOAD_STATE', state: parsed });
          }
          setFileHandle(h);
        } catch {
          await setStoredHandle(null);
        }
      }
    })();
  }, [dispatch]);

  // Auto-write to the connected file on every state change (debounced).
  useEffect(() => {
    if (!fileHandle) return;
    if (justLoadedFromFileRef.current) { justLoadedFromFileRef.current = false; return; }
    const t = setTimeout(() => {
      writeToHandle(fileHandle, JSON.stringify(state, null, 2))
        .then(() => flashSaved())
        .catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [state, fileHandle, flashSaved]);

  // Pick a new/existing file to auto-save to. One-time setup, then seamless forever.
  const connectFile = useCallback(async () => {
    if (!isFsAccessSupported()) {
      // Fallback for unsupported browsers: download a JSON snapshot
      const data = JSON.stringify(state, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `garden-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return;
    }
    try {
      // @ts-ignore
      const handle: FileSystemFileHandle = await window.showSaveFilePicker({
        suggestedName: 'garden.json',
        types: [{ description: 'Garden Planner save', accept: { 'application/json': ['.json'] } }],
      });
      if (!(await verifyPermission(handle, 'readwrite'))) return;
      await writeToHandle(handle, JSON.stringify(state, null, 2));
      await setStoredHandle(handle);
      setFileHandle(handle);
      flashSaved();
    } catch {
      // user cancelled — ignore
    }
  }, [state, flashSaved]);

  // Open an existing file → load its contents → auto-save to it from now on.
  const openFile = useCallback(async () => {
    if (isFsAccessSupported()) {
      try {
        // @ts-ignore
        const [handle]: FileSystemFileHandle[] = await window.showOpenFilePicker({
          types: [{ description: 'Garden Planner save', accept: { 'application/json': ['.json'] } }],
          multiple: false,
        });
        if (!(await verifyPermission(handle, 'readwrite'))) return;
        const txt = await readFromHandle(handle);
        const parsed = JSON.parse(txt);
        if (!parsed || !Array.isArray(parsed.beds)) {
          alert("That file doesn't look like a Garden Planner save.");
          return;
        }
        justLoadedFromFileRef.current = true;
        dispatch({ type: 'LOAD_STATE', state: parsed });
        await setStoredHandle(handle);
        setFileHandle(handle);
      } catch {
        // user cancelled — ignore
      }
      return;
    }
    // Fallback for browsers without File System Access API
    fileInputRef.current?.click();
  }, [dispatch]);

  const disconnectFile = useCallback(async () => {
    await setStoredHandle(null);
    setFileHandle(null);
  }, []);

  // Fallback: read JSON via hidden <input type=file> (Safari/Firefox)
  const handleFallbackImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const parsed = JSON.parse(String(ev.target?.result || ''));
        if (!parsed || !Array.isArray(parsed.beds)) { alert("That file doesn't look like a Garden Planner save."); return; }
        if (!confirm('Replace your current garden with the imported one?')) return;
        dispatch({ type: 'LOAD_STATE', state: parsed });
      } catch {
        alert('Could not read that file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, [dispatch]);
  const [bedName, setBedName] = useState('');
  const [bedType, setBedType] = useState<BedType>('raised');
  const [bedWidth, setBedWidth] = useState(4);
  const [bedHeight, setBedHeight] = useState(4);
  const [sunExposure, setSunExposure] = useState<SunExposure>('full-sun');
  const [soilType, setSoilType] = useState<SoilType>('loamy');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [showAutoGen, setShowAutoGen] = useState<string | null>(null); // bed id
  const [layoutView, setLayoutView] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const [overlayOpacity, setOverlayOpacity] = useState(30);
  // Undo/redo for layout — simple history stack
  const historyRef = useRef<{ past: string[]; future: string[] }>({ past: [], future: [] });
  const prevLayoutRef = useRef<string>('');
  const isUndoRedoRef = useRef(false);
  const [undoCount, setUndoCount] = useState(0); // force re-render for button states

  // Track layout changes
  useEffect(() => {
    if (!layoutView) return;
    const snap = JSON.stringify(state.layout);
    if (snap === prevLayoutRef.current) return;
    if (!isUndoRedoRef.current && prevLayoutRef.current) {
      historyRef.current.past = [...historyRef.current.past.slice(-30), prevLayoutRef.current];
      historyRef.current.future = [];
      setUndoCount(c => c + 1);
    }
    isUndoRedoRef.current = false;
    prevLayoutRef.current = snap;
  }, [state.layout, layoutView]);

  const layoutUndo = () => {
    const { past, future } = historyRef.current;
    if (past.length === 0) return;
    const prev = past[past.length - 1];
    historyRef.current = {
      past: past.slice(0, -1),
      future: [prevLayoutRef.current, ...future],
    };
    prevLayoutRef.current = prev;
    isUndoRedoRef.current = true;
    setUndoCount(c => c + 1);
    dispatch({ type: 'LOAD_STATE', state: { ...state, layout: JSON.parse(prev) } });
  };

  const layoutRedo = () => {
    const { past, future } = historyRef.current;
    if (future.length === 0) return;
    const next = future[0];
    historyRef.current = {
      past: [...past, prevLayoutRef.current],
      future: future.slice(1),
    };
    prevLayoutRef.current = next;
    isUndoRedoRef.current = true;
    setUndoCount(c => c + 1);
    dispatch({ type: 'LOAD_STATE', state: { ...state, layout: JSON.parse(next) } });
  };

  // ── AUTO-GENERATE ──
  const autoFillBed = (bedId: string, mode: 'maximize' | 'owned') => {
    const bed = state.beds.find(b => b.id === bedId);
    if (!bed || !state.zone) return;

    // ── Helper: filter plants by bed conditions ──
    const fitsBed = (p: typeof plants[0]) =>
      plantFitsZone(p.zones, state.zone!) &&
      p.bedPrefs.includes(bed.type) &&
      !p.soilAvoid.includes(bed.soilType) &&
      (p.light === bed.sunExposure ||
        (p.light === 'partial-shade' && bed.sunExposure !== 'full-shade') ||
        (bed.sunExposure === 'partial-shade'));

    let candidates = plants.filter(fitsBed);

    const ownedIds = Object.keys(state.ownedPlants).filter(k => state.ownedPlants[k] > 0);
    if (mode === 'owned' && ownedIds.length > 0) {
      const owned = candidates.filter(p => ownedIds.includes(p.id));
      if (owned.length > 0) candidates = owned;
    }

    if (candidates.length === 0) return;

    const cellArea = bed.width * bed.height;
    const maxPerPlant = Math.max(2, Math.ceil(cellArea * 0.18));

    const newCells: (string | null)[][] = bed.cells.map(row =>
      row.map(cell => getCellPlantId(cell))
    );
    const placedCounts: Record<string, number> = {};
    const countPlaced = (id: string) => placedCounts[id] || 0;
    const place = (r: number, c: number, id: string) => {
      newCells[r][c] = id;
      placedCounts[id] = (placedCounts[id] || 0) + 1;
    };
    const isEmpty = (r: number, c: number) =>
      r >= 0 && r < bed.height && c >= 0 && c < bed.width && !newCells[r][c];

    const getNeighborIds = (r: number, c: number): string[] => {
      const ids: string[] = [];
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < bed.height && nc >= 0 && nc < bed.width && newCells[nr][nc]) {
            ids.push(newCells[nr][nc]!);
          }
        }
      }
      return ids;
    };

    const hasEnemy = (plantId: string, r: number, c: number): boolean => {
      const p = plantMap.get(plantId);
      if (!p) return false;
      return getNeighborIds(r, c).some(n => {
        if (isCompanionOf(n, p.enemies)) return true;
        const np = plantMap.get(n);
        return np ? isEnemyOf(plantId, np.enemies) : false;
      });
    };

    // Size classes based on real SFG spacing data:
    // Large (24"+): tomato, squash, eggplant, pumpkin — need buffer from other large plants
    // Medium (12-23"): pepper, broccoli, cabbage, cucumber — OK next to each other
    // Small (<12"): herbs, lettuce, radish, carrots, marigold — fine anywhere, ideal next to large plants
    const sizeClass = (p: typeof plants[0]) =>
      p.spacingInches >= 24 ? 'large' : p.spacingInches >= 12 ? 'medium' : 'small';

    // Spacing compatibility score: large next to large = bad, small next to large = good
    const spacingScore = (plantId: string, r: number, c: number): number => {
      const p = plantMap.get(plantId);
      if (!p) return 0;
      const pSize = sizeClass(p);
      let score = 0;
      const neighbors = getNeighborIds(r, c);
      for (const nId of neighbors) {
        const np = plantMap.get(nId);
        if (!np) continue;
        const nSize = sizeClass(np);
        if (pSize === 'large' && nSize === 'large') score -= 15; // two large competing = very bad
        else if (pSize === 'large' && nSize === 'medium') score -= 5; // large + medium = not great
        else if (pSize === 'small' && nSize === 'large') score += 5; // small next to large = ideal (understory)
        else if (pSize === 'medium' && nSize === 'large') score -= 3;
        // small + small, small + medium, medium + medium = neutral (0)
      }
      return score;
    };

    const candidateMap = new Map(candidates.map(p => [p.id, p]));
    const findCandidate = (id: string) => candidateMap.get(id);

    // Categorize candidates
    const largeCrops = candidates.filter(p => p.spacingInches >= 24 && (p.category === 'vegetable' || p.category === 'fruit'));
    const mediumCrops = candidates.filter(p => p.spacingInches >= 12 && p.spacingInches < 24 && (p.category === 'vegetable' || p.category === 'fruit'));
    const herbs = candidates.filter(p => p.category === 'herb' && p.id !== 'fennel');
    const flowers = candidates.filter(p => p.category === 'flower');
    const smallVeg = candidates.filter(p => p.spacingInches < 12 && p.category === 'vegetable');

    // Known companion pairings: main crop -> best companion to place adjacent
    const companionPairings: Record<string, string[]> = {
      'tomato': ['basil', 'borage', 'marigold', 'parsley', 'carrot'],
      'tomato-cherry': ['basil', 'borage', 'marigold', 'chives'],
      'tomato-beefsteak': ['basil', 'borage', 'marigold', 'parsley'],
      'tomato-roma': ['basil', 'borage', 'marigold', 'parsley'],
      'tomato-grape': ['basil', 'borage', 'marigold', 'chives'],
      'tomato-heirloom': ['basil', 'borage', 'marigold', 'parsley'],
      'pepper': ['basil', 'marigold', 'oregano', 'carrot'],
      'jalapeno': ['basil', 'marigold', 'oregano', 'carrot'],
      'cucumber': ['dill', 'nasturtium', 'borage', 'radish'],
      'eggplant': ['basil', 'marigold', 'thyme', 'borage'],
      'cabbage': ['chamomile', 'dill', 'nasturtium', 'onion'],
      'broccoli': ['chamomile', 'oregano', 'nasturtium', 'onion'],
      'brussels-sprouts': ['chamomile', 'oregano', 'nasturtium', 'onion'],
      'cauliflower': ['chamomile', 'oregano', 'nasturtium', 'onion'],
      'kale': ['chamomile', 'nasturtium', 'garlic', 'onion'],
      'squash': ['nasturtium', 'marigold', 'borage', 'radish'],
      'pumpkin': ['nasturtium', 'marigold', 'borage', 'corn'],
      'zucchini': ['nasturtium', 'marigold', 'borage', 'radish'],
      'strawberry': ['borage', 'thyme', 'chives', 'lettuce'],
    };

    // Three Sisters grouping
    const threeSistersIds = ['corn', 'bean', 'squash'];
    const hasThreeSisters = threeSistersIds.every(id => findCandidate(id));

    // ── PHASE 1: Three Sisters block if we have a large enough bed ──
    if (hasThreeSisters && cellArea >= 9 && bed.width >= 3 && bed.height >= 3) {
      const startR = Math.floor((bed.height - 3) / 2);
      const startC = Math.floor((bed.width - 3) / 2);
      const pattern = [
        ['squash', 'bean', 'squash'],
        ['bean', 'corn', 'bean'],
        ['squash', 'bean', 'squash'],
      ];
      for (let dr = 0; dr < 3; dr++) {
        for (let dc = 0; dc < 3; dc++) {
          const r = startR + dr, c = startC + dc;
          if (isEmpty(r, c) && countPlaced(pattern[dr][dc]) < maxPerPlant) {
            place(r, c, pattern[dr][dc]);
          }
        }
      }
    }

    // ── PHASE 2: Place main/large crops with spacing buffer ──
    // Large plants (24"+) placed every other cell, ensuring no two large plants are adjacent.
    // Based on SFG principle: large plants need the full sq ft but small companions can share the adjacent cell.
    const mainCrops = largeCrops.filter(p =>
      !threeSistersIds.includes(p.id) || !hasThreeSisters
    );
    if (mainCrops.length > 0) {
      let cropIdx = 0;
      // Space large crops 2 cells apart so small companions fit between them
      for (let r = 0; r < bed.height; r += 2) {
        for (let c = 0; c < bed.width; c += 2) {
          if (!isEmpty(r, c)) continue;
          // Check no adjacent large plant exists
          const adjHasLarge = getNeighborIds(r, c).some(nId => {
            const np = plantMap.get(nId);
            return np && np.spacingInches >= 24;
          });
          if (adjHasLarge) continue;
          let tries = 0;
          while (tries < mainCrops.length) {
            const crop = mainCrops[cropIdx % mainCrops.length];
            cropIdx++;
            if (countPlaced(crop.id) < maxPerPlant && !hasEnemy(crop.id, r, c)) {
              place(r, c, crop.id);
              break;
            }
            tries++;
          }
        }
      }
    }

    // ── PHASE 3: Place best SMALL companion adjacent to each large crop ──
    // Key principle: basil next to tomato is great (small understory plant),
    // but another tomato next to a tomato is bad (both compete for space).
    // Companion pairings are intentionally small plants (herbs, flowers, small veg).
    for (let r = 0; r < bed.height; r++) {
      for (let c = 0; c < bed.width; c++) {
        const cropId = newCells[r][c];
        if (!cropId) continue;
        const crop = plantMap.get(cropId);
        if (!crop || crop.spacingInches < 18) continue; // only pair companions for med-large crops

        const pairList = companionPairings[cropId] || crop.companions.slice(0, 5);

        const adjacentEmpty: [number, number][] = [
          [r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1],
        ].filter(([ar, ac]) => isEmpty(ar, ac)) as [number, number][];

        for (const adjCell of adjacentEmpty) {
          let didPlace = false;
          for (const compId of pairList) {
            const comp = findCandidate(compId);
            if (!comp) continue;
            // Only place small plants next to large ones
            if (crop.spacingInches >= 24 && comp.spacingInches >= 18) continue;
            if (countPlaced(compId) >= maxPerPlant) continue;
            if (hasEnemy(compId, adjCell[0], adjCell[1])) continue;
            place(adjCell[0], adjCell[1], compId);
            didPlace = true;
            break;
          }
          if (didPlace) break; // one companion per large crop is enough
        }
      }
    }

    // ── PHASE 4: Fill border/edge cells with pest-deterrent flowers ──
    const borderFlowers = ['marigold', 'nasturtium', 'borage', 'chamomile', 'cosmos', 'yarrow']
      .map(id => findCandidate(id))
      .filter(Boolean) as typeof plants[number][];

    if (borderFlowers.length > 0) {
      let flowerIdx = 0;
      for (let r = 0; r < bed.height; r++) {
        for (let c = 0; c < bed.width; c++) {
          const isEdge = r === 0 || r === bed.height - 1 || c === 0 || c === bed.width - 1;
          if (!isEdge || !isEmpty(r, c)) continue;

          const isCorner = (r === 0 || r === bed.height - 1) && (c === 0 || c === bed.width - 1);
          if (isCorner) {
            const mg = findCandidate('marigold');
            if (mg && countPlaced('marigold') < maxPerPlant && !hasEnemy('marigold', r, c)) {
              place(r, c, 'marigold');
              continue;
            }
          }

          let tries = 0;
          while (tries < borderFlowers.length) {
            const flower = borderFlowers[flowerIdx % borderFlowers.length];
            flowerIdx++;
            if (countPlaced(flower.id) < maxPerPlant && !hasEnemy(flower.id, r, c)) {
              place(r, c, flower.id);
              break;
            }
            tries++;
          }
        }
      }
    }

    // ── PHASE 5: Fill remaining gaps — spacing-aware scoring ──
    // Prioritize small plants next to large ones, never large next to large.
    // Based on interplanting principles: small understory crops thrive next to
    // tall plants that provide partial shade (lettuce under tomatoes, etc.)
    const fillers = [...herbs, ...smallVeg, ...mediumCrops, ...flowers].filter(p =>
      p.id !== 'fennel'
    );
    for (let r = 0; r < bed.height; r++) {
      for (let c = 0; c < bed.width; c++) {
        if (!isEmpty(r, c)) continue;
        const neighbors = getNeighborIds(r, c);
        const pool = fillers.length > 0 ? fillers : candidates.filter(p => p.id !== 'fennel');
        if (pool.length === 0) continue;

        let best: { id: string; score: number } | null = null;
        for (const plant of pool) {
          let score = 0;
          // Companion synergy (bidirectional)
          score += neighbors.filter(n => isCompanionOf(n, plant.companions)).length * 6;
          score += neighbors.filter(n => { const np = plantMap.get(n); return np ? isCompanionOf(plant.id, np.companions) : false; }).length * 4;
          // Enemy hard penalty (bidirectional)
          if (neighbors.some(n => {
            if (isEnemyOf(n, plant.enemies)) return true;
            const np = plantMap.get(n); return np ? isEnemyOf(plant.id, np.enemies) : false;
          })) score -= 100;
          // Spacing compatibility — the key improvement
          score += spacingScore(plant.id, r, c);
          // Diversity cap
          if (countPlaced(plant.id) >= maxPerPlant) score -= 50;
          // Soil preference
          if (plant.soilPrefs.includes(bed.soilType)) score += 2;
          // Slight randomness for variety
          score += Math.random() * 3;

          if (!best || score > best.score) best = { id: plant.id, score };
        }

        if (best && best.score > -20) {
          place(r, c, best.id);
        }
      }
    }

    // ── PHASE 6: Final pass — fill any remaining empty cells ──
    for (let r = 0; r < bed.height; r++) {
      for (let c = 0; c < bed.width; c++) {
        if (!isEmpty(r, c)) continue;
        const safePicks = candidates.filter(p =>
          p.id !== 'fennel' &&
          countPlaced(p.id) < maxPerPlant &&
          !hasEnemy(p.id, r, c)
        );
        if (safePicks.length > 0) {
          const neighbors = getNeighborIds(r, c);
          const scored = safePicks.map(p => ({
            id: p.id,
            score: neighbors.filter(n => p.companions.includes(n)).length,
          })).sort((a, b) => b.score - a.score);
          place(r, c, scored[0].id);
        }
      }
    }

    // ── Dispatch all placements ──
    for (let r = 0; r < bed.height; r++) {
      for (let c = 0; c < bed.width; c++) {
        const existingId = getCellPlantId(bed.cells[r][c]);
        if (newCells[r][c] && newCells[r][c] !== existingId) {
          dispatch({ type: 'SELECT_PLANT', plantId: newCells[r][c] });
          dispatch({ type: 'PLANT_IN_CELL', bedId: bed.id, row: r, col: c });
        }
      }
    }
    dispatch({ type: 'SELECT_PLANT', plantId: null });
    setShowAutoGen(null);
  };

  const selectedPlant = state.selectedPlantId ? plantMap.get(state.selectedPlantId) : null;

  // Get the plant from an inspected cell
  const inspectedCellData = state.inspectedCell
    ? state.beds
        .find(b => b.id === state.inspectedCell!.bedId)
        ?.cells[state.inspectedCell.row]?.[state.inspectedCell.col]
    : null;
  const inspectedPlantId = getCellPlantId(inspectedCellData ?? null);
  const inspectedPlant = inspectedPlantId ? plantMap.get(inspectedPlantId) : null;
  const inspectedBed = state.inspectedCell
    ? state.beds.find(b => b.id === state.inspectedCell!.bedId)
    : null;

  const handleAddBed = () => {
    const w = bedType === 'pot' ? Math.min(bedWidth, 3) : bedWidth;
    const h = bedType === 'pot' ? Math.min(bedHeight, 3) : bedHeight;
    // Find a clear spot for the new bed using simple packing
    const cellPx = 48;
    const pad = 24;
    const newBedW = w * cellPx + pad * 2;
    const newBedH = h * cellPx + pad + 100;
    let bestX = 20, bestY = 20;
    // Try placing to the right of the rightmost existing bed
    if (state.beds.length > 0) {
      const rightEdge = Math.max(...state.beds.map(b => (b.x ?? 0) + b.width * cellPx + pad * 2));
      bestX = rightEdge + 20;
      bestY = 20;
      // If it would go way off screen, wrap to next row
      if (bestX + newBedW > 1200) {
        bestX = 20;
        bestY = Math.max(...state.beds.map(b => (b.y ?? 0) + b.height * cellPx + pad + 100)) + 20;
      }
    }
    const bed: Bed = {
      id: `bed-${Date.now()}`,
      name: bedName || `Bed ${state.beds.length + 1}`,
      type: bedType,
      width: w,
      height: h,
      sunExposure,
      soilType,
      cells: Array.from({ length: h }, () => Array(w).fill(null)),
      x: bestX,
      y: bestY,
    };
    dispatch({ type: 'ADD_BED', bed });
    setShowAddBed(false);
    setBedName('');
  };

  const handleDeleteBed = (bedId: string) => {
    if (confirmDelete === bedId) {
      dispatch({ type: 'REMOVE_BED', bedId });
      setConfirmDelete(null);
    } else {
      setConfirmDelete(bedId);
      setTimeout(() => setConfirmDelete(null), 3000);
    }
  };

  // Use the actual grid cells (b.cells) rather than b.width * b.height —
  // keeps the count correct even if a stale save has mismatched dimensions.
  const totalCells = state.beds.reduce((sum, b) => sum + b.cells.flat().length, 0);
  const plantedCells = state.beds.reduce(
    (sum, b) => sum + b.cells.flat().filter(Boolean).length,
    0
  );
  const bedBreakdown = state.beds
    .map(b => `${b.name}: ${b.cells.flat().filter(Boolean).length}/${b.cells.flat().length} (${b.width}×${b.height})`)
    .join('\n');

  return (
    <div className={`h-screen flex flex-col overflow-hidden ${layoutView ? '' : 'grass-bg'}`} style={layoutView ? {
      backgroundColor: '#f0ebe0',
      backgroundImage: 'linear-gradient(rgba(0,0,0,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px)',
      backgroundSize: `${gridScale}px ${gridScale}px`,
    } : undefined}>
      {/* ── HEADER ── */}
      <header className="pixel-panel-dark flex items-center px-4 py-2 gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="text-sm">🌱</span>
          <h1 className="text-[11px] text-parchment">GARDEN PLANNER</h1>
          <span className="tag tag-green">Zone {formatZone(state.zone!)}</span>

          <div className="flex gap-1">
            <button
              onClick={() => setLayoutView(false)}
              className={`tool-btn text-[9px] ${!layoutView ? 'active' : ''}`}
              title="Planting view"
            >
              🔲
            </button>
            <button
              onClick={() => setLayoutView(true)}
              className={`tool-btn text-[9px] ${layoutView ? 'active' : ''}`}
              title="Layout view"
            >
              📐
            </button>
          </div>
        </div>

        {/* Zoom + overlay controls — center */}
        <div className="flex items-center gap-3 mx-auto">
          <div className="flex items-center gap-2">
            <button onClick={() => setZoomPct(z => Math.max(50, z - 10))}
              className="text-parchment-dark hover:text-parchment text-xs cursor-pointer px-1 opacity-60 hover:opacity-100 transition-opacity leading-none" title="Zoom out" style={{ position: 'relative', top: 3 }}>−</button>
            <span className="text-[9px] text-parchment-dark opacity-50 w-8 text-center select-none">{zoomPct}%</span>
            <button onClick={() => setZoomPct(z => Math.min(300, z + 10))}
              className="text-parchment-dark hover:text-parchment text-xs cursor-pointer px-1 opacity-60 hover:opacity-100 transition-opacity" title="Zoom in">+</button>
          </div>
          {!layoutView && (
            <button onClick={() => setShowOverlay(!showOverlay)}
              className="text-[8px] font-pixel cursor-pointer px-2 py-0.5 rounded-sm transition-all"
              style={{
                backgroundColor: showOverlay ? '#5a3319' : '#6b4423',
                color: showOverlay ? '#fef3c7' : '#d4a574',
                border: '1px solid #4a2f17',
                boxShadow: showOverlay ? 'inset 0 2px 3px rgba(0,0,0,0.3)' : '0 1px 0 #4a2f17',
                transform: showOverlay ? 'translateY(1px)' : 'none',
              }}
              title="Toggle layout overlay">overlay</button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {layoutView ? (
            <>
              {/* Layout tools */}
              <button
                onClick={layoutUndo}
                className={`tool-btn ${historyRef.current.past.length === 0 ? 'opacity-40' : ''}`}
                title="Undo"
              >
                ↩️
              </button>
              <button
                onClick={layoutRedo}
                className={`tool-btn ${historyRef.current.future.length === 0 ? 'opacity-40' : ''}`}
                title="Redo"
              >
                ↪️
              </button>
            </>
          ) : (
            <>
              {/* Planting tools */}
              <button
                onClick={() => dispatch({ type: 'SET_TOOL', tool: 'plant' })}
                className={`tool-btn ${state.tool === 'plant' ? 'active' : ''}`}
                title="Plant mode"
              >
                🌱
              </button>
              <button
                onClick={() => dispatch({ type: 'SET_TOOL', tool: 'remove' })}
                className={`tool-btn ${state.tool === 'remove' ? 'active' : ''}`}
                title="Remove mode"
              >
                🗑️
              </button>
              <button
                onClick={() => dispatch({ type: 'SET_TOOL', tool: 'inspect' })}
                className={`tool-btn ${state.tool === 'inspect' ? 'active' : ''}`}
                title="Inspect mode"
              >
                🔍
              </button>
            </>
          )}

          <div className="w-px h-6 bg-wood-light mx-1" />

          {/* Save menu — cloud + file options */}
          <div className="relative">
            <button
              onClick={() => setFileMenuOpen(v => !v)}
              className="text-[20px] cursor-pointer px-1 leading-none hover:opacity-80 transition-opacity"
              title="Save"
              style={{ background: 'transparent', border: 'none' }}
            >
              💾
            </button>
            {/* Transient "Saved!" pop */}
            <div
              className="absolute top-full right-0 mt-1 text-[8px] font-pixel text-grass-dark bg-parchment border border-grass-dark px-2 py-0.5 whitespace-nowrap pointer-events-none transition-opacity duration-200"
              style={{ opacity: showSavedToast ? 1 : 0 }}
            >Saved!</div>
            {fileMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setFileMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 min-w-[220px] pixel-panel py-1" style={{ backgroundColor: '#e8dcc0' }}>
                  {user && (
                    <div className="px-3 py-2 border-b-2 border-wood-light">
                      <p className="text-[8px] text-wood-light leading-relaxed">Auto-saving to cloud as <strong>{user.username}</strong></p>
                    </div>
                  )}
                  {user && (
                    <button
                      onClick={() => {
                        setFileMenuOpen(false);
                        fetch('/api/garden', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ state }),
                        }).then(() => flashSaved()).catch(() => {});
                      }}
                      className="block w-full text-left text-[9px] text-wood-dark px-3 py-1.5 hover:bg-parchment-dark"
                    >☁️ Save to cloud now</button>
                  )}
                  {fileHandle && (
                    <div className="px-3 py-2 border-b-2 border-wood-light">
                      <p className="text-[8px] text-wood-light">Also auto-saving to:</p>
                      <p className="text-[9px] text-wood-dark font-pixel truncate">{fileHandle.name}</p>
                    </div>
                  )}
                  <button
                    onClick={() => { setFileMenuOpen(false); connectFile(); }}
                    className="block w-full text-left text-[9px] text-wood-dark px-3 py-1.5 hover:bg-parchment-dark"
                  >💾 {fileHandle ? 'Save as new file…' : 'Save to a file…'}</button>
                  <button
                    onClick={() => { setFileMenuOpen(false); openFile(); }}
                    className="block w-full text-left text-[9px] text-wood-dark px-3 py-1.5 hover:bg-parchment-dark"
                  >📂 Open a saved file…</button>
                  {fileHandle && (
                    <button
                      onClick={() => { setFileMenuOpen(false); disconnectFile(); }}
                      className="block w-full text-left text-[9px] text-wood-dark px-3 py-1.5 hover:bg-parchment-dark border-t-2 border-wood-light"
                    >✕ Stop auto-saving to file</button>
                  )}
                </div>
              </>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleFallbackImport}
            style={{ display: 'none' }}
          />

          {user && (
            <>
              <span className="text-[8px] text-parchment-dark opacity-60">{user.username}</span>
              {onLogout && (
                <button
                  onClick={onLogout}
                  className="text-[8px] text-parchment-dark opacity-60 hover:opacity-100 cursor-pointer underline"
                  style={{ background: 'transparent', border: 'none' }}
                >log out</button>
              )}
            </>
          )}

        </div>
      </header>

      {/* ── MAIN CONTENT ── */}
      {layoutView ? (
        /* ── LAYOUT VIEW ── */
        <div className="flex flex-1 overflow-hidden" style={{
          backgroundColor: '#e8e0d0',
        }}>
          <GardenLayout layout={state.layout} dispatch={dispatch} scale={gridScale} />
        </div>
      ) : (
        /* ── PLANTING VIEW ── */
        <div className="flex flex-1 overflow-hidden">
          {/* LEFT: Inventory */}
          <div className="w-56 flex-shrink-0 pixel-panel overflow-hidden" style={{ borderTop: 'none' }}>
            <Inventory
              zone={state.zone!}
              selectedPlantId={state.selectedPlantId}
              dispatch={dispatch}
              beds={state.beds}
              ownedPlants={state.ownedPlants}
              plantNotes={state.plantNotes || {}}
              customPlants={state.customPlants || []}
            />
          </div>

          {/* CENTER: Garden */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {state.selectedPlantId && (
              <div className="pixel-panel p-2 flex items-center gap-3 text-[10px] flex-shrink-0 z-10">
                <span className="text-lg">{selectedPlant?.emoji}</span>
                <span className="text-wood-dark">
                  Planting: <strong>{selectedPlant?.name}</strong> — click a cell to place
                </span>
                <button
                  onClick={() => dispatch({ type: 'SELECT_PLANT', plantId: null })}
                  className="pixel-btn pixel-btn-small bg-parchment-dark ml-auto"
                >
                  ✕ Cancel
                </button>
              </div>
            )}

            {state.tool === 'remove' && (
              <div className="pixel-panel p-2 flex items-center gap-3 text-[10px] flex-shrink-0 z-10">
                <span className="text-lg">🗑️</span>
                <span className="text-wood-dark">Remove mode — click a planted cell to dig it up</span>
              </div>
            )}

            {state.tool === 'inspect' && (
              <div className="pixel-panel p-2 flex items-center gap-3 text-[10px] flex-shrink-0 z-10">
                <span className="text-lg">🔍</span>
                <span className="text-wood-dark">Inspect mode — click a plant to see its details</span>
              </div>
            )}

            {state.selectedPlantId && (
              <div className="flex gap-3 py-1 px-2 text-[8px] text-parchment-light flex-shrink-0" style={{ backgroundColor: 'var(--grass-dark)' }}>
                <span className="flex items-center gap-1"><span className="legend-dot bg-green-400 border-green-700" /> Companion</span>
                <span className="flex items-center gap-1"><span className="legend-dot bg-red-400 border-red-700" /> Enemy</span>
                <span className="flex items-center gap-1"><span className="legend-dot bg-yellow-400 border-yellow-700" /> Neutral</span>
                <span className="flex items-center gap-1"><span className="legend-dot bg-orange-400 border-orange-700" /> Wrong Soil</span>
              </div>
            )}

            <GardenCanvas
              beds={state.beds}
              selectedPlantId={state.selectedPlantId}
              tool={state.tool}
              dispatch={dispatch}
              inspectedCell={state.inspectedCell}
              ownedPlants={state.ownedPlants}
              showAutoGen={showAutoGen}
              setShowAutoGen={setShowAutoGen}
              autoFillBed={autoFillBed}
              confirmDelete={confirmDelete}
              handleDeleteBed={handleDeleteBed}
              onAddBed={() => setShowAddBed(true)}
              scale={gridScale}
              layoutOverlay={showOverlay && !layoutView ? state.layout : undefined}
              layoutOpacity={100}
            />
          </div>

          {/* RIGHT: Plant Details */}
          <div className="w-64 flex-shrink-0 pixel-panel overflow-y-auto" style={{ borderTop: 'none' }}>
            <PlantDetails
              plant={inspectedPlant || selectedPlant || null}
              bed={inspectedBed || null}
              zone={state.zone!}
              plantNotes={state.plantNotes || {}}
              dispatch={dispatch}
            />
          </div>
        </div>
      )}

      {/* ── ADD BED MODAL ── */}
      {showAddBed && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="pixel-panel p-6 max-w-sm w-full">
            <h3 className="text-xs text-wood-dark mb-4 text-center">
              ➕ NEW BED
            </h3>

            <div className="mb-3">
              <label className="text-[9px] text-wood-dark block mb-1">NAME</label>
              <input
                type="text"
                value={bedName}
                onChange={e => setBedName(e.target.value)}
                placeholder={`Bed ${state.beds.length + 1}`}
                className="pixel-input w-full"
                maxLength={24}
              />
            </div>

            <div className="mb-3">
              <label className="text-[9px] text-wood-dark block mb-1">TYPE</label>
              <div className="flex gap-2">
                {([['raised', '🪵 Raised'], ['inground', '⬜ Ground'], ['pot', '🪴 Pot']] as const).map(([t, label]) => (
                  <button
                    key={t}
                    onClick={() => setBedType(t)}
                    className={`pixel-btn pixel-btn-small flex-1 ${bedType === t ? 'pixel-btn-primary' : 'bg-parchment'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3 mb-3">
              <div className="flex-1">
                <label className="text-[9px] text-wood-dark block mb-1">WIDTH</label>
                <input
                  type="number" min={1} max={bedType === 'pot' ? 3 : 20}
                  value={bedWidth}
                  onChange={e => setBedWidth(Math.max(1, Math.min(bedType === 'pot' ? 3 : 20, Number(e.target.value))))}
                  className="pixel-input w-full"
                />
              </div>
              <div className="flex-1">
                <label className="text-[9px] text-wood-dark block mb-1">LENGTH</label>
                <input
                  type="number" min={1} max={bedType === 'pot' ? 3 : 20}
                  value={bedHeight}
                  onChange={e => setBedHeight(Math.max(1, Math.min(bedType === 'pot' ? 3 : 20, Number(e.target.value))))}
                  className="pixel-input w-full"
                />
              </div>
            </div>

            <div className="mb-3">
              <label className="text-[9px] text-wood-dark block mb-1">SUN</label>
              <div className="flex gap-2">
                {([['full-sun', '☀️ Full'], ['partial-shade', '⛅ Part'], ['full-shade', '☁️ Shade']] as const).map(([s, label]) => (
                  <button
                    key={s}
                    onClick={() => setSunExposure(s)}
                    className={`pixel-btn pixel-btn-small flex-1 ${sunExposure === s ? 'pixel-btn-primary' : 'bg-parchment'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <label className="text-[9px] text-wood-dark block mb-1">SOIL</label>
              <select
                value={soilType}
                onChange={e => setSoilType(e.target.value as SoilType)}
                className="pixel-select w-full"
              >
                {(Object.entries(SOIL_INFO) as [SoilType, typeof SOIL_INFO[SoilType]][]).map(([key, info]) => (
                  <option key={key} value={key}>{info.emoji} {info.name}</option>
                ))}
              </select>
              <p className="text-[9px] text-wood-light mt-1">{SOIL_INFO[soilType].desc}</p>
            </div>

            <div className="flex gap-3 justify-center">
              <button
                onClick={() => setShowAddBed(false)}
                className="pixel-btn text-[9px] bg-parchment-dark"
              >
                Cancel
              </button>
              <button onClick={handleAddBed} className="pixel-btn pixel-btn-primary text-[9px]">
                🌱 Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
