'use client';

import { Dispatch } from 'react';
import { Plant, Bed, SOIL_INFO, SUPPORT_LABELS, BED_TYPE_LABELS, formatZone, plantFitsZone, GardenAction } from '../types';
import { plantMap } from '../data/plants';

interface Props {
  plant: Plant | null;
  bed: Bed | null;
  zone: number;
  plantNotes?: Record<string, string>;
  dispatch?: Dispatch<GardenAction>;
}

export default function PlantDetails({ plant, bed, zone, plantNotes = {}, dispatch }: Props) {
  if (!plant) {
    return (
      <div className="p-4 text-center">
        <div className="text-3xl mb-3 mt-8">🌿</div>
        <p className="text-[9px] text-wood-dark mb-2">PLANT INFO</p>
        <p className="text-[8px] text-wood-light leading-relaxed">
          Select a plant from the inventory or click a planted cell to see details.
        </p>

        <div className="mt-6 text-left px-2">
          <p className="text-[9px] text-wood-dark mb-2">HOW TO USE:</p>
          <ul className="text-[9px] text-wood leading-loose list-none">
            <li>🌱 Pick a plant from the left</li>
            <li>👆 Click a cell to plant it</li>
            <li>👉 Right-click to remove</li>
            <li>🔍 Click planted cells to inspect</li>
            <li>⭐ Star plants you own</li>
            <li>💚 Green glow = companion</li>
            <li>❤️ Red glow = enemy</li>
            <li>🟠 Orange glow = bad soil</li>
          </ul>
        </div>
      </div>
    );
  }

  const light = {
    'full-sun': { label: 'Full Sun', emoji: '☀️', desc: '6+ hours direct sun' },
    'partial-shade': { label: 'Partial Shade', emoji: '⛅', desc: '3–6 hours direct sun' },
    'full-shade': { label: 'Full Shade', emoji: '☁️', desc: 'Under 3 hours direct sun' },
  }[plant.light];

  const support = SUPPORT_LABELS[plant.support];

  // Soil compatibility
  const soilMatch = bed ? plant.soilPrefs.includes(bed.soilType) : null;
  const soilBad = bed ? plant.soilAvoid.includes(bed.soilType) : null;

  // Light compatibility
  const lightMatch = bed
    ? plant.light === bed.sunExposure ||
      (plant.light === 'partial-shade' && bed.sunExposure !== 'full-shade')
    : null;

  // Bed type compatibility
  const bedTypeMatch = bed ? plant.bedPrefs.includes(bed.type) : null;

  return (
    <div className="p-3 text-[9px]">
      {/* Header */}
      <div className="text-center mb-3">
        <div className="text-4xl mb-1">{plant.emoji}</div>
        <h3 className="text-xs text-wood-dark">{plant.name}</h3>
        <span className="tag tag-green text-[9px] mt-1">{plant.category}</span>
      </div>

      <p className="text-[9px] text-wood leading-relaxed mb-3">{plant.description}</p>

      <hr className="border-wood-light mb-3" />

      {/* Zone */}
      <div className="mb-2">
        <span className="text-wood-dark font-pixel text-[9px]">ZONES: </span>
        <span className="text-wood">{plant.zones[0]}a–{plant.zones[1]}b</span>
        {!plantFitsZone(plant.zones, zone) ? (
          <span className="tag tag-red text-[9px] ml-1">Not in your zone!</span>
        ) : (
          <span className="tag tag-green text-[9px] ml-1">OK</span>
        )}
      </div>

      {/* Light */}
      <div className="mb-2">
        <span className="text-wood-dark font-pixel text-[9px]">LIGHT: </span>
        <span>{light.emoji} {light.label}</span>
        <p className="text-[9px] text-wood-light mt-0.5">{light.desc}</p>
        {bed && lightMatch === false && (
          <span className="tag tag-red text-[9px] mt-1">Bed is {bed.sunExposure} — needs {plant.light}</span>
        )}
      </div>

      {/* Bed type */}
      <div className="mb-2">
        <span className="text-wood-dark font-pixel text-[9px]">BED TYPE: </span>
        <div className="flex flex-wrap gap-1 mt-1">
          {plant.bedPrefs.map(b => (
            <span key={b} className="tag tag-green text-[9px]">
              {BED_TYPE_LABELS[b].emoji} {BED_TYPE_LABELS[b].label}
            </span>
          ))}
        </div>
        {bed && bedTypeMatch === false && (
          <div className="mt-1 tag tag-red text-[9px]">
            ⚠️ Not ideal for {BED_TYPE_LABELS[bed.type].label.toLowerCase()} — prefers {plant.bedPrefs.map(b => BED_TYPE_LABELS[b].label.toLowerCase()).join(' or ')}
          </div>
        )}
      </div>

      {/* Soil */}
      <div className="mb-2">
        <span className="text-wood-dark font-pixel text-[9px]">SOIL: </span>
        <div className="flex flex-wrap gap-1 mt-1">
          <span className="text-[9px] text-wood">Prefers: </span>
          {plant.soilPrefs.map(s => (
            <span key={s} className="tag tag-green text-[9px]">{SOIL_INFO[s].emoji} {SOIL_INFO[s].name}</span>
          ))}
        </div>
        {plant.soilAvoid.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            <span className="text-[9px] text-wood">Avoid: </span>
            {plant.soilAvoid.map(s => (
              <span key={s} className="tag tag-red text-[9px]">{SOIL_INFO[s].name}</span>
            ))}
          </div>
        )}
        {bed && soilBad && (
          <div className="mt-1 tag tag-red text-[9px]">⚠️ Bed soil ({SOIL_INFO[bed.soilType].name}) not ideal</div>
        )}
        {bed && soilMatch && (
          <div className="mt-1 tag tag-green text-[9px]">✓ {SOIL_INFO[bed.soilType].name} soil is great!</div>
        )}
      </div>

      <hr className="border-wood-light mb-3" />

      {/* Spacing & size */}
      <div className="mb-2">
        <span className="text-wood-dark font-pixel text-[9px]">SPACING: </span>
        <span>{plant.spacingInches}&quot; apart</span>
        {plant.perSqFt > 1 ? (
          <span className="text-grass-dark font-bold ml-1">({plant.perSqFt} per sq ft!)</span>
        ) : plant.spacingInches >= 24 ? (
          <span className="text-red-600 ml-1">(needs room!)</span>
        ) : null}
      </div>

      <div className="mb-2">
        <span className="text-wood-dark font-pixel text-[9px]">HEIGHT: </span>
        <span>{plant.height}</span>
      </div>

      <div className="mb-2">
        <span className="text-wood-dark font-pixel text-[9px]">HARVEST: </span>
        <span>{plant.daysToHarvest[0]}–{plant.daysToHarvest[1]} days</span>
      </div>

      {/* Support */}
      <div className="mb-3">
        <span className="text-wood-dark font-pixel text-[9px]">SUPPORT: </span>
        <span>{support.emoji} {support.label}</span>
        <p className="text-[9px] text-wood-light mt-0.5">{support.desc}</p>
        {plant.supportNote && (
          <p className="text-[9px] text-wood mt-1 italic">💡 {plant.supportNote}</p>
        )}
      </div>

      <hr className="border-wood-light mb-3" />

      {/* Planting timing */}
      <div className="mb-3">
        <p className="text-wood-dark font-pixel text-[9px] mb-1">📅 WHEN TO PLANT:</p>
        {plant.plantingInfo.sowIndoors && (
          <div className="mb-1">
            <span className="text-[9px] text-wood-dark">🏠 Start indoors: </span>
            <span className="text-[9px] text-wood">{plant.plantingInfo.sowIndoors}</span>
          </div>
        )}
        {plant.plantingInfo.directSow && (
          <div className="mb-1">
            <span className="text-[9px] text-wood-dark">🌱 Direct sow: </span>
            <span className="text-[9px] text-wood">{plant.plantingInfo.directSow}</span>
          </div>
        )}
        {plant.plantingInfo.transplant && (
          <div className="mb-1">
            <span className="text-[9px] text-wood-dark">🪴 Transplant: </span>
            <span className="text-[9px] text-wood">{plant.plantingInfo.transplant}</span>
          </div>
        )}
      </div>

      <hr className="border-wood-light mb-3" />

      {/* Companions */}
      <div className="mb-2">
        <p className="text-wood-dark font-pixel text-[9px] mb-1">✅ COMPANIONS:</p>
        <div className="flex flex-wrap gap-1">
          {plant.companions.map(id => {
            const comp = plantMap.get(id);
            return comp ? (
              <span key={id} className="tag tag-green text-[9px]">{comp.emoji} {comp.name}</span>
            ) : null;
          })}
        </div>
      </div>

      {/* Enemies */}
      {plant.enemies.length > 0 && (
        <div className="mb-2">
          <p className="text-wood-dark font-pixel text-[9px] mb-1">❌ KEEP AWAY:</p>
          <div className="flex flex-wrap gap-1">
            {plant.enemies.map(id => {
              const enemy = plantMap.get(id);
              return enemy ? (
                <span key={id} className="tag tag-red text-[9px]">{enemy.emoji} {enemy.name}</span>
              ) : null;
            })}
          </div>
        </div>
      )}

      {/* Personal note */}
      {dispatch && (
        <>
          <hr className="border-wood-light mb-3 mt-3" />
          <div className="mb-2">
            <p className="text-wood-dark font-pixel text-[9px] mb-1">📝 MY NOTE:</p>
            <textarea
              value={plantNotes[plant.id] || ''}
              onChange={e => dispatch({ type: 'SET_PLANT_NOTE', plantId: plant.id, note: e.target.value })}
              placeholder="Add a note..."
              className="pixel-input w-full text-[8px] py-1 px-1.5"
              rows={2}
              style={{ resize: 'vertical', opacity: plantNotes[plant.id] ? 1 : 0.6 }}
            />
          </div>
        </>
      )}
    </div>
  );
}
