'use client';

import { Dispatch, useMemo, useState, useCallback } from 'react';
import { Bed, GardenAction, Tool, SoilType, SOIL_INFO, isCompanionOf, isEnemyOf, getCellPlantId, getCellCount, CellContent } from '../types';
import { plantMap } from '../data/plants';

interface Props {
  bed: Bed;
  selectedPlantId: string | null;
  tool: Tool;
  dispatch: Dispatch<GardenAction>;
  inspectedCell: { bedId: string; row: number; col: number } | null;
  cellSize?: number;
}

function getNeighborPlantIds(cells: (CellContent | null)[][], row: number, col: number): string[] {
  const ids: string[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const r = row + dr;
      const c = col + dc;
      if (r >= 0 && r < cells.length && c >= 0 && c < cells[0].length) {
        const id = getCellPlantId(cells[r][c]);
        if (id) ids.push(id);
      }
    }
  }
  return ids;
}

function getCellStatus(
  selectedPlantId: string,
  neighbors: string[],
  bedSoil: SoilType,
  bedSun: string
): { companion: 'good' | 'bad' | 'neutral' | 'empty'; soilWarn: boolean; lightWarn: boolean } {
  const plant = plantMap.get(selectedPlantId);
  if (!plant) return { companion: 'empty', soilWarn: false, lightWarn: false };

  const soilWarn = plant.soilAvoid.includes(bedSoil);
  const lightWarn =
    (plant.light === 'full-sun' && bedSun === 'full-shade') ||
    (plant.light === 'full-shade' && bedSun === 'full-sun');

  if (neighbors.length === 0) return { companion: 'empty', soilWarn, lightWarn };

  const hasCompanion = neighbors.some(id => isCompanionOf(id, plant.companions));
  const hasEnemy = neighbors.some(id => isEnemyOf(id, plant.enemies));

  if (hasEnemy) return { companion: 'bad', soilWarn, lightWarn };
  if (hasCompanion) return { companion: 'good', soilWarn, lightWarn };
  return { companion: 'neutral', soilWarn, lightWarn };
}

function hasSpacingConflict(cells: (CellContent | null)[][], row: number, col: number): boolean {
  const plantId = getCellPlantId(cells[row][col]);
  if (!plantId) return false;
  const plant = plantMap.get(plantId);
  if (!plant || plant.spacingInches < 24) return false;

  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const r = row + dr;
      const c = col + dc;
      if (r >= 0 && r < cells.length && c >= 0 && c < cells[0].length) {
        const neighborId = getCellPlantId(cells[r][c]);
        if (neighborId && neighborId !== plantId) {
          const neighborPlant = plantMap.get(neighborId);
          if (neighborPlant && neighborPlant.spacingInches >= 18) return true;
        }
      }
    }
  }
  return false;
}

// How many cells radius a plant's spacing covers
function getSpacingRadius(spacingInches: number): number {
  if (spacingInches >= 36) return 2;
  if (spacingInches >= 24) return 1;
  if (spacingInches >= 18) return 1;
  return 0;
}

const SOIL_CSS: Record<SoilType, string> = {
  loamy: 'soil-loamy', clay: 'soil-clay', sandy: 'soil-sandy',
  silty: 'soil-silty', chalky: 'soil-chalky', peaty: 'soil-peaty',
};
const BED_CSS: Record<string, string> = {
  raised: 'bed-raised', inground: 'bed-inground', pot: 'bed-pot',
};
const SUN_LABELS: Record<string, string> = {
  'full-sun': '☀️', 'partial-shade': '⛅', 'full-shade': '☁️',
};

export default function GardenBed({ bed, selectedPlantId, tool, dispatch, inspectedCell, cellSize }: Props) {
  const CS = cellSize || 60;
  const soilClass = SOIL_CSS[bed.soilType] || 'soil-texture';
  const bedClass = BED_CSS[bed.type] || '';
  const [hoveredCell, setHoveredCell] = useState<{ r: number; c: number } | null>(null);

  const plantedCount = useMemo(
    () => bed.cells.flat().filter(Boolean).length,
    [bed.cells]
  );

  const selectedPlantData = selectedPlantId ? plantMap.get(selectedPlantId) : null;
  const spacingRadius = selectedPlantData ? getSpacingRadius(selectedPlantData.spacingInches) : 0;

  // Precompute which cells fall in the spacing zone of the hovered cell
  const spacingZone = useMemo(() => {
    if (!hoveredCell || !selectedPlantData || spacingRadius === 0) return new Set<string>();
    const zone = new Set<string>();
    for (let dr = -spacingRadius; dr <= spacingRadius; dr++) {
      for (let dc = -spacingRadius; dc <= spacingRadius; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = hoveredCell.r + dr;
        const nc = hoveredCell.c + dc;
        if (nr >= 0 && nr < bed.height && nc >= 0 && nc < bed.width) {
          zone.add(`${nr},${nc}`);
        }
      }
    }
    return zone;
  }, [hoveredCell, selectedPlantData, spacingRadius, bed.height, bed.width]);

  const handleCellClick = (row: number, col: number) => {
    const existing = bed.cells[row][col];
    if (tool === 'remove') {
      if (existing) dispatch({ type: 'REMOVE_FROM_CELL', bedId: bed.id, row, col });
      return;
    }
    if (tool === 'inspect') {
      if (existing) dispatch({ type: 'INSPECT_CELL', bedId: bed.id, row, col });
      return;
    }
    if (selectedPlantId) {
      dispatch({ type: 'PLANT_IN_CELL', bedId: bed.id, row, col });
    } else if (existing) {
      dispatch({ type: 'INSPECT_CELL', bedId: bed.id, row, col });
    }
  };

  const handleRightClick = useCallback((e: React.MouseEvent, row: number, col: number) => {
    e.preventDefault();
    if (bed.cells[row][col]) {
      dispatch({ type: 'REMOVE_FROM_CELL', bedId: bed.id, row, col });
    }
  }, [bed.cells, bed.id, dispatch]);

  return (
    <div>
      {/* Bed info bar */}
      <div className="flex items-center gap-2 mb-1 px-1">
        <span className="text-[9px]">{SUN_LABELS[bed.sunExposure]}</span>
        <span className="text-[9px] text-parchment-dark opacity-75">
          {SOIL_INFO[bed.soilType].emoji} {SOIL_INFO[bed.soilType].name}
        </span>
        <span className="text-[9px] text-parchment-dark opacity-60 ml-auto">
          {plantedCount}/{bed.width * bed.height}
        </span>
      </div>

      {/* Bed grid */}
      <div
        className={`${bedClass} inline-block`}
        onMouseLeave={() => setHoveredCell(null)}
      >
        <div
          className="grid"
          style={{
            gridTemplateColumns: `repeat(${bed.width}, ${CS}px)`,
            gridTemplateRows: `repeat(${bed.height}, ${CS}px)`,
          }}
        >
          {bed.cells.map((row, r) =>
            row.map((cellData, c) => {
              const cellPlantId = getCellPlantId(cellData);
              const cellCount = getCellCount(cellData);
              const plant = cellPlantId ? plantMap.get(cellPlantId) : null;
              const isInspected = inspectedCell?.row === r && inspectedCell?.col === c;
              const spacingIssue = cellPlantId ? hasSpacingConflict(bed.cells, r, c) : false;
              const isHovered = hoveredCell?.r === r && hoveredCell?.c === c;

              // Spacing zone: is this cell within the hovered plant's footprint?
              const inSpacingZone = selectedPlantId && spacingZone.has(`${r},${c}`);
              // Is this the center of the zone (the hovered cell)?
              const isZoneCenter = selectedPlantId && isHovered;

              // Check if placing here would be too close to a large neighbor
              let tooCloseToLarge = false;
              if (selectedPlantData && !cellPlantId && selectedPlantData.spacingInches >= 24) {
                const nearbyIds = getNeighborPlantIds(bed.cells, r, c);
                tooCloseToLarge = nearbyIds.some(id => {
                  const np = plantMap.get(id);
                  return np && np.spacingInches >= 18;
                });
              }

              // Companion status for empty cells when a plant is selected
              let statusClass = '';
              if (selectedPlantId && !cellPlantId) {
                if (tooCloseToLarge) {
                  statusClass = 'spacing-conflict';
                } else {
                  const neighbors = getNeighborPlantIds(bed.cells, r, c);
                  const status = getCellStatus(selectedPlantId, neighbors, bed.soilType, bed.sunExposure);
                  if (status.soilWarn) statusClass = 'soil-warning';
                  else if (status.companion === 'good') statusClass = 'companion-good';
                  else if (status.companion === 'bad') statusClass = 'companion-bad';
                  else if (status.companion === 'neutral') statusClass = 'companion-neutral';
                  if (status.lightWarn) statusClass += ' light-warning';
                }
              }

              // Emoji size based on spacing
              let emojiSize = '24px';
              if (plant) {
                if (plant.spacingInches >= 24) emojiSize = '30px';
                else if (plant.perSqFt >= 9) emojiSize = '18px';
                else if (plant.perSqFt >= 4) emojiSize = '20px';
              }

              // Tooltip — include unobtrusive warnings
              const warnings: string[] = [];
              const tipPlant = plant || selectedPlantData;
              if (tipPlant) {
                if (tipPlant.soilAvoid.includes(bed.soilType))
                  warnings.push(`⚠ ${tipPlant.name} dislikes ${bed.soilType} soil`);
                if (!tipPlant.bedPrefs.includes(bed.type))
                  warnings.push(`⚠ Prefers ${tipPlant.bedPrefs.join('/')}, not ${bed.type}`);
                if (tipPlant.light === 'full-sun' && bed.sunExposure === 'full-shade')
                  warnings.push('⚠ Needs full sun — this bed is full shade');
                if (tipPlant.light === 'full-shade' && bed.sunExposure === 'full-sun')
                  warnings.push('⚠ Prefers shade — this bed is full sun');
              }
              const warnStr = warnings.length > 0 ? '\n' + warnings.join('\n') : '';

              let titleText = '';
              if (plant) {
                titleText = plant.name;
                if (spacingIssue) titleText += ' — ⚠ crowded';
                titleText += warnStr;
                titleText += '\nRight-click to remove';
              } else if (selectedPlantId && selectedPlantData) {
                titleText = `Place ${selectedPlantData.name}`;
                if (tooCloseToLarge) titleText += ' — ⚠ too close to a large plant';
                titleText += warnStr;
              } else {
                titleText = 'Select a plant from the inventory';
              }

              return (
                <div
                  key={`${r}-${c}`}
                  className={[
                    'garden-cell',
                    soilClass,
                    statusClass,
                    plant ? 'planted-cell' : '',
                    isInspected ? 'ring-2 ring-yellow-400 ring-inset z-10' : '',
                    tool === 'remove' && plant ? 'hover:bg-red-900/30' : '',
                    spacingIssue ? 'spacing-conflict' : '',
                    isZoneCenter && !cellPlantId ? 'spacing-center' : '',
                    inSpacingZone && !isHovered ? 'spacing-zone' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => handleCellClick(r, c)}
                  onContextMenu={e => handleRightClick(e, r, c)}
                  onMouseEnter={() => selectedPlantId && setHoveredCell({ r, c })}
                  title={titleText}
                  style={{ width: CS, height: CS, fontSize: Math.round(CS * 0.45) }}
                >
                  {plant && (
                    <>
                      <span
                        className="plant-emoji select-none"
                        style={{ fontSize: emojiSize }}
                      >
                        {plant.emoji}
                      </span>
                      {cellCount > 1 && (
                        <span className="cell-count">×{cellCount}</span>
                      )}
                      {spacingIssue && (
                        <span className="cell-spacing-warn">⚠</span>
                      )}
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
