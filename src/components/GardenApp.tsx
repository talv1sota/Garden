'use client';

import { useReducer, useEffect, useState, useCallback } from 'react';
import { GardenState, GardenAction, getCellPlantId } from '../types';
import { plantMap } from '../data/plants';
import SetupScreen from './SetupScreen';
import PlannerScreen from './PlannerScreen';
import { useCloudSync } from '../hooks/useCloudSync';

const STORAGE_KEY = 'pixel-garden-planner-v2';

const initialState: GardenState = {
  screen: 'welcome',
  zone: null,
  beds: [],
  selectedPlantId: null,
  tool: 'plant',
  inspectedCell: null,
  ownedPlants: {},
  plantNotes: {},
  customPlants: [],
  layout: {
    width: 24,
    height: 14,
    plot: { x: 1, y: 1, w: 10, h: 10 },
    boundary: [],
    edges: [],
    elements: [
      { id: 'plot-main', type: 'plot', x: 1, y: 1, w: 10, h: 10, label: 'Garden' },
    ],
  },
};

function reducer(state: GardenState, action: GardenAction): GardenState {
  switch (action.type) {
    case 'SET_SCREEN':
      return { ...state, screen: action.screen };
    case 'SET_ZONE':
      return { ...state, zone: action.zone };
    case 'ADD_BED':
      return { ...state, beds: [...state.beds, action.bed] };
    case 'REMOVE_BED':
      return { ...state, beds: state.beds.filter(b => b.id !== action.bedId), inspectedCell: null };
    case 'SELECT_PLANT':
      return { ...state, selectedPlantId: action.plantId, tool: 'plant', inspectedCell: null };
    case 'PLANT_IN_CELL': {
      if (!state.selectedPlantId) return state;
      const pid = state.selectedPlantId;
      // Auto-add to owned if not already there
      const owned = pid in state.ownedPlants
        ? state.ownedPlants
        : { ...state.ownedPlants, [pid]: 1 };
      return {
        ...state,
        ownedPlants: owned,
        beds: state.beds.map(bed => {
          if (bed.id !== action.bedId) return bed;
          return {
            ...bed,
            cells: bed.cells.map((row, r) =>
              row.map((cell, c) => {
                if (r !== action.row || c !== action.col) return cell;
                const existing = getCellPlantId(cell);
                const plant = plantMap.get(pid);
                // Stack: same plant clicked again & it fits multiple per sq ft
                if (existing === pid && plant && plant.perSqFt > 1) {
                  const currentCount = cell && typeof cell === 'object' ? cell.count : 1;
                  if (currentCount < plant.perSqFt) {
                    return { plantId: pid, count: currentCount + 1 };
                  }
                  return cell; // already at max
                }
                return { plantId: pid, count: 1 };
              })
            ),
          };
        }),
      };
    }
    case 'REMOVE_FROM_CELL':
      return {
        ...state,
        beds: state.beds.map(bed =>
          bed.id === action.bedId
            ? {
                ...bed,
                cells: bed.cells.map((row, r) =>
                  row.map((cell, c) =>
                    r === action.row && c === action.col ? null : cell
                  )
                ),
              }
            : bed
        ),
        inspectedCell: state.inspectedCell?.bedId === action.bedId &&
          state.inspectedCell?.row === action.row &&
          state.inspectedCell?.col === action.col
            ? null
            : state.inspectedCell,
      };
    case 'CLEAR_BED':
      return {
        ...state,
        beds: state.beds.map(bed =>
          bed.id === action.bedId
            ? { ...bed, cells: bed.cells.map(row => row.map(() => null)) }
            : bed
        ),
        inspectedCell: state.inspectedCell?.bedId === action.bedId ? null : state.inspectedCell,
      };
    case 'MOVE_BED':
      return {
        ...state,
        beds: state.beds.map(bed =>
          bed.id === action.bedId ? { ...bed, x: action.x, y: action.y } : bed
        ),
      };
    case 'SET_TOOL':
      return {
        ...state,
        tool: action.tool,
        selectedPlantId: action.tool !== 'plant' ? null : state.selectedPlantId,
        inspectedCell: action.tool !== 'inspect' ? null : state.inspectedCell,
      };
    case 'INSPECT_CELL':
      return { ...state, inspectedCell: { bedId: action.bedId, row: action.row, col: action.col } };
    case 'CLEAR_INSPECTION':
      return { ...state, inspectedCell: null };
    case 'TOGGLE_OWNED': {
      const has = action.plantId in state.ownedPlants && state.ownedPlants[action.plantId] > 0;
      if (has) {
        const { [action.plantId]: _, ...rest } = state.ownedPlants;
        return { ...state, ownedPlants: rest };
      }
      return { ...state, ownedPlants: { ...state.ownedPlants, [action.plantId]: 1 } };
    }
    case 'SET_OWNED_QTY': {
      if (action.qty <= 0) {
        const { [action.plantId]: _, ...rest } = state.ownedPlants;
        return { ...state, ownedPlants: rest };
      }
      return { ...state, ownedPlants: { ...state.ownedPlants, [action.plantId]: action.qty } };
    }
    case 'SET_PLANT_NOTE': {
      const notes = { ...state.plantNotes };
      if (action.note.trim()) notes[action.plantId] = action.note;
      else delete notes[action.plantId];
      return { ...state, plantNotes: notes };
    }
    case 'ADD_CUSTOM_PLANT':
      return { ...state, customPlants: [...(state.customPlants || []), action.plant] };
    case 'SET_LAYOUT_SIZE':
      return { ...state, layout: { ...state.layout, width: action.width, height: action.height } };
    case 'ADD_LAYOUT_EL':
      return { ...state, layout: { ...state.layout, elements: [...state.layout.elements, action.element] } };
    case 'MOVE_LAYOUT_EL':
      return { ...state, layout: { ...state.layout, elements: state.layout.elements.map(el => el.id === action.id ? { ...el, x: action.x, y: action.y } : el) } };
    case 'UPDATE_LAYOUT_EL':
      return { ...state, layout: { ...state.layout, elements: state.layout.elements.map(el => el.id === action.id ? { ...el, ...action.updates } : el) } };
    case 'REMOVE_LAYOUT_EL':
      return { ...state, layout: { ...state.layout, elements: state.layout.elements.filter(el => el.id !== action.id) } };
    case 'MOVE_BOUNDARY_PT':
      return { ...state, layout: { ...state.layout, boundary: state.layout.boundary.map((pt, i) => i === action.index ? { x: action.x, y: action.y } : pt) } };
    case 'ADD_BOUNDARY_PT': {
      const newBoundary = [...state.layout.boundary];
      const newEdges = [...state.layout.edges];
      newBoundary.splice(action.afterIndex + 1, 0, { x: action.x, y: action.y });
      newEdges.splice(action.afterIndex + 1, 0, { fenceType: 'none', label: '' });
      return { ...state, layout: { ...state.layout, boundary: newBoundary, edges: newEdges } };
    }
    case 'REMOVE_BOUNDARY_PT': {
      if (state.layout.boundary.length <= 3) return state;
      return { ...state, layout: { ...state.layout, boundary: state.layout.boundary.filter((_, i) => i !== action.index), edges: state.layout.edges.filter((_, i) => i !== action.index) } };
    }
    case 'UPDATE_EDGE':
      return { ...state, layout: { ...state.layout, edges: state.layout.edges.map((e, i) => i === action.index ? { ...e, ...action.updates } : e) } };
    case 'UPDATE_PLOT':
      return { ...state, layout: { ...state.layout, plot: { ...state.layout.plot, ...action.updates } } };
    case 'RESET':
      return { ...initialState, screen: action.screen ?? 'welcome' };
    case 'LOAD_STATE':
      {
        const savedLayout = action.state.layout;
        const layout = savedLayout && savedLayout.boundary && savedLayout.edges && savedLayout.plot && savedLayout.plot.w > 0
          ? savedLayout
          : initialState.layout;
        return { ...action.state, screen: 'planner', ownedPlants: action.state.ownedPlants || {}, plantNotes: action.state.plantNotes || {}, customPlants: action.state.customPlants || [], layout };
      }
    default:
      return state;
  }
}

export default function GardenApp() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [hasSave, setHasSave] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Cloud sync — auto-saves to Neon when logged in
  const { user, loading: authLoading, login, register, logout } = useCloudSync(state, dispatch);

  // Auth form state (welcome screen)
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authUser, setAuthUser] = useState('');
  const [authPass, setAuthPass] = useState('');
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);

  const handleAuth = async () => {
    setAuthError('');
    setAuthBusy(true);
    const err = authMode === 'login'
      ? await login(authUser, authPass)
      : await register(authUser, authPass);
    setAuthBusy(false);
    if (err) { setAuthError(err); return; }
    setAuthUser('');
    setAuthPass('');
  };

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setHasSave(true);
    } catch {}
    setLoaded(true);
  }, []);

  // Auto-save to localStorage when in planner
  useEffect(() => {
    if (state.screen === 'planner' && state.beds.length > 0) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {}
    }
  }, [state]);

  const loadSave = useCallback(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) dispatch({ type: 'LOAD_STATE', state: JSON.parse(saved) });
    } catch {}
  }, []);

  const newGarden = useCallback(() => {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    try { indexedDB.deleteDatabase('garden-planner-files'); } catch {}
    dispatch({ type: 'RESET', screen: 'setup' });
    setHasSave(false);
  }, []);

  if (!loaded || authLoading) {
    return (
      <div className="min-h-screen grass-bg flex items-center justify-center">
        <p className="text-parchment text-xs">Loading...</p>
      </div>
    );
  }

  // ── Welcome Screen ──
  if (state.screen === 'welcome') {
    return (
      <div className="min-h-screen grass-bg flex items-center justify-center p-4">
        <div className="pixel-panel p-8 max-w-lg w-full text-center">
          {/* Decorative plants */}
          <div className="flex justify-center gap-3 mb-6">
            {['🌻', '🍅', '🥕', '🌽', '🥬', '🌿', '🍓', '🌸'].map((e, i) => (
              <span key={i} className="deco-plant" style={{ animationDelay: `${i * 0.35}s` }}>{e}</span>
            ))}
          </div>

          <h1 className="text-lg leading-relaxed mb-2 text-wood-dark">GARDEN</h1>
          <h1 className="text-lg leading-relaxed mb-4 text-grass-dark">PLANNER</h1>
          <p className="text-[9px] text-wood mb-6 leading-relaxed">Plan your perfect garden!</p>

          {/* Auth section */}
          {user ? (
            <div className="mb-6">
              <p className="text-[9px] text-grass-dark mb-2">Logged in as <strong>{user.username}</strong></p>
              <button onClick={logout} className="text-[8px] text-wood-light underline cursor-pointer">Log out</button>
            </div>
          ) : (
            <div className="mb-6 max-w-xs mx-auto text-left">
              <div className="flex gap-2 mb-3 justify-center">
                <button
                  onClick={() => { setAuthMode('login'); setAuthError(''); }}
                  className={`text-[9px] font-pixel px-3 py-1 cursor-pointer transition-colors ${authMode === 'login' ? 'text-grass-dark border-b-2 border-grass-dark' : 'text-wood-light'}`}
                >Log In</button>
                <button
                  onClick={() => { setAuthMode('register'); setAuthError(''); }}
                  className={`text-[9px] font-pixel px-3 py-1 cursor-pointer transition-colors ${authMode === 'register' ? 'text-grass-dark border-b-2 border-grass-dark' : 'text-wood-light'}`}
                >Sign Up</button>
              </div>
              <input
                type="text"
                placeholder="Username"
                value={authUser}
                onChange={e => setAuthUser(e.target.value)}
                className="pixel-input w-full text-[9px] mb-2"
                autoComplete="username"
              />
              <input
                type="password"
                placeholder="Password"
                value={authPass}
                onChange={e => setAuthPass(e.target.value)}
                className="pixel-input w-full text-[9px] mb-2"
                autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}
                onKeyDown={e => { if (e.key === 'Enter') handleAuth(); }}
              />
              {authError && <p className="text-[8px] text-red-600 mb-2">{authError}</p>}
              <button
                onClick={handleAuth}
                disabled={authBusy || !authUser || !authPass}
                className="pixel-btn pixel-btn-primary text-[9px] w-full"
              >
                {authBusy ? '...' : authMode === 'login' ? 'Log In' : 'Create Account'}
              </button>
              <p className="text-[7px] text-wood-light mt-2 text-center">
                {authMode === 'login' ? 'Your garden auto-saves to the cloud when logged in.' : 'Password must be at least 8 characters.'}
              </p>
            </div>
          )}

          <div className="flex flex-col gap-4 items-center">
            <button onClick={newGarden} className="pixel-btn pixel-btn-primary text-[10px] w-56">
              🌱 New Garden
            </button>
            {hasSave && (
              <button onClick={loadSave} className="pixel-btn text-[10px] w-56 bg-parchment-dark">
                📋 Load Saved
              </button>
            )}
          </div>

          <p className="text-[8px] text-wood-light mt-8">
            companion planting &bull; soil types &bull; trellising<br />
            zones 1–13 &bull; raised beds &bull; pots
          </p>
        </div>
      </div>
    );
  }

  if (state.screen === 'setup') {
    return <SetupScreen dispatch={dispatch} />;
  }

  return <PlannerScreen state={state} dispatch={dispatch} user={user} onLogout={logout} />;
}
