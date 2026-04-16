export type Screen = 'welcome' | 'setup' | 'planner';
export type BedType = 'raised' | 'inground' | 'pot';
export type SunExposure = 'full-sun' | 'partial-shade' | 'full-shade';
export type PlantCategory = 'vegetable' | 'herb' | 'fruit' | 'flower';
export type LightReq = 'full-sun' | 'partial-shade' | 'full-shade';
export type SupportType = 'none' | 'trellis' | 'stake' | 'cage' | 'arch' | 'net';
export type Tool = 'plant' | 'remove' | 'inspect';
export type SoilType = 'loamy' | 'clay' | 'sandy' | 'silty' | 'chalky' | 'peaty';

export interface PlantingInfo {
  sowIndoors?: string;
  directSow?: string;
  transplant?: string;
}

export interface Plant {
  id: string;
  name: string;
  category: PlantCategory;
  emoji: string;
  zones: [number, number];
  light: LightReq;
  spacingInches: number;
  perSqFt: number;
  support: SupportType;
  supportNote?: string;
  soilPrefs: SoilType[];
  soilAvoid: SoilType[];
  bedPrefs: BedType[];
  companions: string[];
  enemies: string[];
  daysToHarvest: [number, number];
  height: string;
  description: string;
  plantingInfo: PlantingInfo;
}

export interface CellContent {
  plantId: string;
  count: number; // how many of this plant in this cell (for small plants that fit multiple per sq ft)
}

export interface Bed {
  id: string;
  name: string;
  type: BedType;
  width: number;
  height: number;
  sunExposure: SunExposure;
  soilType: SoilType;
  cells: (CellContent | null)[][];
  x: number; // px position on canvas
  y: number;
}

// Helpers to read cell data (backwards compat with old string format from localStorage)
export function getCellPlantId(cell: CellContent | string | null): string | null {
  if (!cell) return null;
  if (typeof cell === 'string') return cell; // legacy
  return cell.plantId;
}

export function getCellCount(cell: CellContent | string | null): number {
  if (!cell) return 0;
  if (typeof cell === 'string') return 1; // legacy
  return cell.count;
}

export interface GardenState {
  screen: Screen;
  zone: number | null;
  beds: Bed[];
  selectedPlantId: string | null;
  tool: Tool;
  inspectedCell: { bedId: string; row: number; col: number } | null;
  ownedPlants: Record<string, number>;
  plantNotes: Record<string, string>;
  customPlants: Plant[];
  layout: GardenLayout;
}

export type LayoutElType = 'fence' | 'sprinkler' | 'raised-bed' | 'trellis' | 'cage' | 'arch' | 'pot' | 'path' | 'label' | 'post' | 'gate' | 'tree' | 'plot' | 'deterrent' | 'stake';

export interface LayoutElement {
  id: string;
  type: LayoutElType;
  x: number;   // feet from left
  y: number;   // feet from top
  w: number;   // feet wide
  h: number;   // feet tall
  rotation?: number; // 0, 90, 180, 270
  label?: string;
  material?: string; // fence: chainlink/wood/pvc, path: stone/gravel/mulch
}

export interface BoundaryEdge {
  fenceType: 'chainlink' | 'wood' | 'pvc' | 'metal' | 'none';
  label: string;
}

export interface GardenPlot {
  x: number;  // feet
  y: number;
  w: number;  // feet
  h: number;
  name?: string;
  color?: string;
}

export interface GardenLayout {
  width: number;    // canvas width in feet
  height: number;   // canvas height in feet
  plot: GardenPlot;                       // the rectangular green garden area
  boundary: { x: number; y: number }[];  // fence corners (polygon)
  edges: BoundaryEdge[];                  // fence info per edge
  elements: LayoutElement[];              // items placed inside
}

export const LAYOUT_EL_INFO: Record<LayoutElType, { emoji: string; label: string; defaultW: number; defaultH: number; color: string }> = {
  'fence':       { emoji: '🔲', label: 'Fence',       defaultW: 8,  defaultH: 0.4, color: '#8b7355' },
  'sprinkler':   { emoji: '💧', label: 'Sprinkler',   defaultW: 1,  defaultH: 1,   color: '#60a5fa' },
  'raised-bed':  { emoji: '🪵', label: 'Raised Bed',  defaultW: 4,  defaultH: 4,   color: '#92400e' },
  'trellis':     { emoji: '🪜', label: 'Trellis',     defaultW: 4,  defaultH: 0.5, color: '#a3a3a3' },
  'cage':        { emoji: '🔲', label: 'Cage',        defaultW: 2,  defaultH: 2,   color: '#71717a' },
  'arch':        { emoji: '🌉', label: 'Arch',  defaultW: 3,  defaultH: 1,   color: '#78716c' },
  'pot':         { emoji: '🪴', label: 'Pot',          defaultW: 1.5,defaultH: 1.5, color: '#b87333' },
  'path':        { emoji: '🪨', label: 'Path',        defaultW: 6,  defaultH: 1.5, color: '#a8a29e' },
  'label':       { emoji: '🏷️', label: 'Label',       defaultW: 3,  defaultH: 1,   color: 'transparent' },
  'post':        { emoji: '🪵', label: 'Post',        defaultW: 0.5,defaultH: 0.5, color: '#78350f' },
  'gate':        { emoji: '🚪', label: 'Gate',        defaultW: 3,  defaultH: 0.5, color: '#92400e' },
  'tree':        { emoji: '🌳', label: 'Tree',        defaultW: 3,  defaultH: 3,   color: '#2d5a16' },
  'plot':        { emoji: '🟩', label: 'Plot',        defaultW: 4,  defaultH: 4,   color: '#4a8f2c' },
  'deterrent':   { emoji: '🦉', label: 'Deterrent',   defaultW: 1,  defaultH: 1,   color: '#92400e' },
  'stake':       { emoji: '🥢', label: 'Stake',       defaultW: 0.5, defaultH: 0.5, color: '#6b4423' },
};

export type GardenAction =
  | { type: 'SET_SCREEN'; screen: Screen }
  | { type: 'SET_ZONE'; zone: number }
  | { type: 'ADD_BED'; bed: Bed }
  | { type: 'REMOVE_BED'; bedId: string }
  | { type: 'SELECT_PLANT'; plantId: string | null }
  | { type: 'PLANT_IN_CELL'; bedId: string; row: number; col: number }
  | { type: 'REMOVE_FROM_CELL'; bedId: string; row: number; col: number }
  | { type: 'SET_TOOL'; tool: Tool }
  | { type: 'INSPECT_CELL'; bedId: string; row: number; col: number }
  | { type: 'CLEAR_INSPECTION' }
  | { type: 'LOAD_STATE'; state: GardenState }
  | { type: 'CLEAR_BED'; bedId: string }
  | { type: 'MOVE_BED'; bedId: string; x: number; y: number }
  | { type: 'TOGGLE_OWNED'; plantId: string }
  | { type: 'SET_OWNED_QTY'; plantId: string; qty: number }
  | { type: 'SET_PLANT_NOTE'; plantId: string; note: string }
  | { type: 'ADD_CUSTOM_PLANT'; plant: Plant }
  | { type: 'SET_LAYOUT_SIZE'; width: number; height: number }
  | { type: 'ADD_LAYOUT_EL'; element: LayoutElement }
  | { type: 'MOVE_LAYOUT_EL'; id: string; x: number; y: number }
  | { type: 'UPDATE_LAYOUT_EL'; id: string; updates: Partial<LayoutElement> }
  | { type: 'REMOVE_LAYOUT_EL'; id: string }
  | { type: 'MOVE_BOUNDARY_PT'; index: number; x: number; y: number }
  | { type: 'ADD_BOUNDARY_PT'; afterIndex: number; x: number; y: number }
  | { type: 'REMOVE_BOUNDARY_PT'; index: number }
  | { type: 'UPDATE_EDGE'; index: number; updates: Partial<BoundaryEdge> }
  | { type: 'UPDATE_PLOT'; updates: Partial<GardenPlot> }
  | { type: 'RESET'; screen?: Screen };

// Zone is stored as a decimal: 7a = 7.0, 7b = 7.5
export function formatZone(zone: number): string {
  const num = Math.floor(zone);
  const sub = zone % 1 >= 0.5 ? 'b' : 'a';
  return `${num}${sub}`;
}

export function parseZone(str: string): number {
  const num = parseInt(str);
  return str.endsWith('b') ? num + 0.5 : num;
}

export function plantFitsZone(plantZones: [number, number], userZone: number): boolean {
  return userZone >= plantZones[0] && userZone <= plantZones[1] + 0.5;
}

export const ALL_ZONES: { value: number; label: string }[] = Array.from({ length: 26 }, (_, i) => {
  const num = Math.floor(i / 2) + 1;
  const sub = i % 2 === 0 ? 'a' : 'b';
  const value = num + (sub === 'b' ? 0.5 : 0);
  return { value, label: `Zone ${num}${sub}` };
});

export const SOIL_INFO: Record<SoilType, { name: string; emoji: string; desc: string; color: string }> = {
  loamy: { name: 'Loamy', emoji: '🌱', desc: 'Ideal balance of sand, silt & clay. Great drainage & nutrients.', color: '#5c4033' },
  clay: { name: 'Clay', emoji: '🧱', desc: 'Heavy, retains water, slow draining. Rich in nutrients but compacts easily.', color: '#8b4513' },
  sandy: { name: 'Sandy', emoji: '🏖️', desc: 'Light & fast-draining. Low nutrients, warms up quickly in spring.', color: '#c2b280' },
  silty: { name: 'Silty', emoji: '🌊', desc: 'Smooth & fertile. Retains moisture well, can compact when wet.', color: '#7a6652' },
  chalky: { name: 'Chalky', emoji: '🪨', desc: 'Alkaline & free-draining. May need extra nutrients & amendments.', color: '#d3cfc3' },
  peaty: { name: 'Peaty', emoji: '🍂', desc: 'Acidic & moisture-retentive. High organic matter, great for acid-lovers.', color: '#3d2b1f' },
};

// Companion/enemy matching that handles variants like 'tomato-cherry' matching 'tomato'
export function isCompanionOf(plantId: string, companionList: string[]): boolean {
  if (companionList.includes(plantId)) return true;
  if (plantId.includes('-')) return companionList.includes(plantId.split('-')[0]);
  return false;
}

export function isEnemyOf(plantId: string, enemyList: string[]): boolean {
  if (enemyList.includes(plantId)) return true;
  if (plantId.includes('-')) return enemyList.includes(plantId.split('-')[0]);
  return false;
}

export const BED_TYPE_LABELS: Record<BedType, { label: string; emoji: string }> = {
  raised: { label: 'Raised Bed', emoji: '🪵' },
  inground: { label: 'In-Ground', emoji: '⬜' },
  pot: { label: 'Pot / Container', emoji: '🪴' },
};

export const SUPPORT_LABELS: Record<SupportType, { label: string; emoji: string; desc: string }> = {
  none: { label: 'None needed', emoji: '🆓', desc: 'Grows on its own without support' },
  trellis: { label: 'Trellis', emoji: '🪜', desc: 'Vertical structure with mesh or strings for climbing' },
  stake: { label: 'Stake / Pole', emoji: '🥢', desc: 'Single pole or bamboo stake tied to the stem' },
  cage: { label: 'Cage', emoji: '🔲', desc: 'Wire cage surrounds the plant for support' },
  arch: { label: 'Arch / A-frame', emoji: '🌉', desc: 'Sturdy archway or A-frame for heavy vines' },
  net: { label: 'Net / Netting', emoji: '🕸️', desc: 'Horizontal or angled netting for sprawling vines' },
};
