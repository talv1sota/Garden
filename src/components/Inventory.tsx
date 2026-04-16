'use client';

import { useState, useMemo, Dispatch } from 'react';
import { GardenAction, PlantCategory, Plant, Bed, BedType, SoilType, SupportType, LightReq, formatZone, plantFitsZone, SUPPORT_LABELS, BED_TYPE_LABELS, getCellPlantId, getCellCount } from '../types';
import { plants, plantMap } from '../data/plants';

interface Props {
  zone: number;
  selectedPlantId: string | null;
  dispatch: Dispatch<GardenAction>;
  beds: Bed[];
  ownedPlants: Record<string, number>;
  plantNotes: Record<string, string>;
  customPlants: Plant[];
}

type FilterTab = 'all' | PlantCategory | 'mine';

const CATEGORIES: { key: FilterTab; label: string; emoji: string; title: string }[] = [
  { key: 'all', label: 'All', emoji: '📦', title: 'All' },
  { key: 'vegetable', label: 'Veg', emoji: '🥬', title: 'Vegetables' },
  { key: 'herb', label: 'Herb', emoji: '🌿', title: 'Herbs' },
  { key: 'fruit', label: 'Fruit', emoji: '🍓', title: 'Fruits' },
  { key: 'flower', label: 'Flower', emoji: '🌸', title: 'Flowers' },
  { key: 'mine', label: 'Mine', emoji: '⭐', title: 'My Plants' },
];

const ICON_GROUPS: { label: string; icons: string[] }[] = [
  { label: 'Greens & Herbs', icons: ['🌱','🌿','🍀','☘️','🍃','🪴','🌾','🍄'] },
  { label: 'Vegetables', icons: ['🍅','🍆','🥕','🥔','🧅','🧄','🌽','🌶️','🫑','🥒','🥬','🥦','🫘','🫛','🥜','🫚','🫒','🎃','🥗'] },
  { label: 'Fruits & Berries', icons: ['🍓','🫐','🍒','🍇','🍈','🍉','🍊','🍋','🍋‍🟩','🍎','🍏','🍐','🍑','🥭','🥝','🥑','🫒'] },
  { label: 'Trees & Shrubs', icons: ['🌳','🌲','🌴','🪵','🪨','🏡'] },
  { label: 'Flowers', icons: ['🌸','🌺','🌻','🌼','🌷','🌹','🪷','🪻','💮','🏵️'] },
  { label: 'Colors', icons: ['🔴','🟠','🟡','🟢','🔵','🟣','🟤','⚫','⚪','🩷','🩵','🩶'] },
];

export default function Inventory({ zone, selectedPlantId, dispatch, beds, ownedPlants, plantNotes, customPlants }: Props) {
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<FilterTab>('all');
  const [showAddPlant, setShowAddPlant] = useState(false);

  // Merge built-in + custom plants and register custom in plantMap
  const allPlants = useMemo(() => {
    customPlants.forEach(p => { if (!plantMap.has(p.id)) plantMap.set(p.id, p); });
    return [...plants, ...customPlants];
  }, [customPlants]);

  const zonePlants = useMemo(
    () => allPlants.filter(p => plantFitsZone(p.zones, zone)),
    [zone, allPlants]
  );

  const filtered = useMemo(() => {
    let list = zonePlants;
    if (tab === 'mine') {
      list = list.filter(p => p.id in ownedPlants && ownedPlants[p.id] > 0);
    } else if (tab !== 'all') {
      list = list.filter(p => p.category === tab);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.category.includes(q) ||
        p.description.toLowerCase().includes(q)
      );
    }
    return list;
  }, [zonePlants, tab, search, ownedPlants]);

  const plantCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    beds.forEach(bed => {
      bed.cells.flat().forEach(cell => {
        const id = getCellPlantId(cell);
        const n = getCellCount(cell);
        if (id) counts[id] = (counts[id] || 0) + n;
      });
    });
    return counts;
  }, [beds]);

  const ownedCount = Object.keys(ownedPlants).filter(k => ownedPlants[k] > 0).length;

  const isMineTab = tab === 'mine';

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b-2 border-wood-light">
        <h2 className="text-[9px] text-wood-dark mb-2">📦 INVENTORY</h2>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search plants..."
          title="Search by name, category, or description"
          className="pixel-input w-full text-[7px]"
        />
      </div>

      {/* Category tabs */}
      <div className="flex border-b-2 border-wood-light">
        {CATEGORIES.map(cat => (
          <button
            key={cat.key}
            onClick={() => setTab(cat.key)}
            title={cat.title}
            className={`cat-tab flex-1 ${tab === cat.key ? 'active' : ''}`}
          >
            <span className="text-sm block">{cat.emoji}</span>
          </button>
        ))}
      </div>

      {/* Plant list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-4 text-center text-[9px] text-wood-light leading-relaxed">
            {isMineTab && ownedCount === 0
              ? 'No plants yet! Click ☆ next to any plant to add it, or just plant something in a bed and it\'ll appear here.'
              : `No plants match${tab !== 'all' && !isMineTab ? ` in ${tab}s` : ''}${search ? ` for "${search}"` : ''} for Zone ${formatZone(zone)}.`
            }
          </div>
        ) : (
          filtered.map(plant => {
            const placed = plantCounts[plant.id] || 0;
            const isSelected = selectedPlantId === plant.id;
            const isOwned = plant.id in ownedPlants && ownedPlants[plant.id] > 0;
            const ownedQty = ownedPlants[plant.id] || 0;
            const support = SUPPORT_LABELS[plant.support];

            return (
              <div key={plant.id} className="flex items-start border-b border-wood-light/30">
                {/* Ownership toggle */}
                <button
                  onClick={e => {
                    e.stopPropagation();
                    dispatch({ type: 'TOGGLE_OWNED', plantId: plant.id });
                  }}
                  className="px-1 pt-2 text-sm hover:scale-125 transition-transform flex-shrink-0"
                  title={isOwned ? 'Remove from your plants' : 'Add to your plants'}
                >
                  {isOwned ? '⭐' : '☆'}
                </button>

                {/* Plant info — clickable to select */}
                <div
                  className={`inventory-item flex-1 ${isSelected ? 'selected' : ''}`}
                  onClick={() =>
                    dispatch({
                      type: 'SELECT_PLANT',
                      plantId: isSelected ? null : plant.id,
                    })
                  }
                >
                  <span className="item-emoji">{plant.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div
                      className="text-[9px] text-wood-dark font-pixel leading-tight"
                      title={plant.name}
                    >
                      {plant.name}
                    </div>
                    <div className="flex gap-1 mt-0.5 flex-wrap">
                      {plant.light === 'full-sun' && (
                        <span className="tag tag-yellow text-[9px]" title="Full sun — 6+ hours direct sunlight">☀️</span>
                      )}
                      {plant.light === 'partial-shade' && (
                        <span className="tag tag-blue text-[9px]" title="Partial shade — 3-6 hours direct sunlight">⛅</span>
                      )}
                      {plant.light === 'full-shade' && (
                        <span className="tag tag-purple text-[9px]" title="Full shade — under 3 hours direct sunlight">☁️</span>
                      )}
                      {plant.support !== 'none' && (
                        <span className="tag tag-orange text-[9px]" title={support.label}>
                          {support.emoji}
                        </span>
                      )}
                      {plant.bedPrefs.length === 1 && plant.bedPrefs[0] === 'pot' && (
                        <span className="tag tag-purple text-[9px]" title="Best in pot / container">
                          🪴 pot
                        </span>
                      )}
                    </div>

                    {/* My Plants tab: quantity row */}
                  </div>

                  {/* Placed count */}
                  {placed > 0 && (
                    <span className="text-[9px] text-grass-dark font-pixel flex-shrink-0">
                      ×{placed}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
        {isMineTab && (
          <div className="p-3 border-t border-wood-light/30">
            <button
              onClick={() => setShowAddPlant(true)}
              className="pixel-btn pixel-btn-small pixel-btn-primary text-[9px] w-full"
              title="Add a custom plant not in the list"
            >
              + New Plant
            </button>
          </div>
        )}
        <div className="p-2 border-t border-wood-light/30 text-[9px] text-wood-light text-center">
          {isMineTab ? `${ownedCount} owned` : `${filtered.length} for Zone ${formatZone(zone)}`}
        </div>
      </div>

      {/* Add Custom Plant modal */}
      {showAddPlant && (
        <AddPlantForm
          zone={zone}
          onAdd={(plant) => {
            dispatch({ type: 'ADD_CUSTOM_PLANT', plant });
            setShowAddPlant(false);
          }}
          onCancel={() => setShowAddPlant(false)}
        />
      )}
    </div>
  );
}

// ── Add Custom Plant Form ──────────────────────────────
function AddPlantForm({ zone, onAdd, onCancel }: { zone: number; onAdd: (p: Plant) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🌱');
  const [category, setCategory] = useState<PlantCategory>('vegetable');
  const [light, setLight] = useState<LightReq>('full-sun');
  const [support, setSupport] = useState<SupportType>('none');
  const [spacing, setSpacing] = useState(12);
  const [perSqFt, setPerSqFt] = useState(1);
  const [days, setDays] = useState(60);

  const handleSubmit = () => {
    if (!name.trim()) return;
    const id = `custom-${name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;
    const plant: Plant = {
      id,
      name: name.trim(),
      emoji,
      category,
      zones: [1, 13],
      light,
      spacingInches: spacing,
      perSqFt,
      support,
      soilPrefs: ['loamy'],
      soilAvoid: [],
      bedPrefs: ['raised', 'inground', 'pot'],
      companions: [],
      enemies: [],
      daysToHarvest: [days, days + 20],
      height: '',
      description: 'Custom plant',
      plantingInfo: {},
    };
    onAdd(plant);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="pixel-panel p-5 max-w-xs w-full">
        <h3 className="text-[9px] text-wood-dark mb-3 text-center">🌱 ADD CUSTOM PLANT</h3>

        <div className="mb-2">
          <label className="text-[9px] text-wood-dark block mb-1">NAME</label>
          <input value={name} onChange={e => setName(e.target.value)} className="pixel-input w-full text-[9px]" placeholder="e.g. Thai Basil" maxLength={30} />
        </div>

        <div className="mb-2">
          <div className="flex items-center gap-2 mb-2">
            <label className="text-[9px] text-wood-dark">ICON</label>
            <span className="text-2xl leading-none -mt-1.5">{emoji}</span>
          </div>
          <div className="max-h-32 overflow-y-auto border-2 border-wood-light bg-white/50 p-1.5">
            {ICON_GROUPS.map(group => (
              <div key={group.label} className="mb-1.5 last:mb-0">
                <p className="text-[9px] text-wood-light font-pixel mb-0.5">{group.label}</p>
                <div className="flex gap-0.5 flex-wrap">
                  {group.icons.map(e => (
                    <button key={e} onClick={() => setEmoji(e)}
                      className={`w-7 h-7 text-base flex items-center justify-center rounded-sm transition-all
                        ${emoji === e
                          ? 'border-2 border-green-600 bg-green-100 scale-110 shadow-sm'
                          : 'border border-transparent hover:border-wood-light hover:bg-parchment-dark'
                        }`}
                    >{e}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-2 mb-2">
          <div className="flex-1">
            <label className="text-[9px] text-wood-dark block mb-1">TYPE</label>
            <select value={category} onChange={e => setCategory(e.target.value as PlantCategory)} className="pixel-select w-full text-[9px]">
              <option value="vegetable">Vegetable</option>
              <option value="herb">Herb</option>
              <option value="fruit">Fruit</option>
              <option value="flower">Flower</option>
            </select>
          </div>
          <div className="flex-1">
            <label className="text-[9px] text-wood-dark block mb-1">LIGHT</label>
            <select value={light} onChange={e => setLight(e.target.value as LightReq)} className="pixel-select w-full text-[9px]">
              <option value="full-sun">☀️ Full Sun</option>
              <option value="partial-shade">⛅ Partial</option>
              <option value="full-shade">☁️ Shade</option>
            </select>
          </div>
        </div>

        <div className="flex gap-2 mb-2">
          <div className="flex-1">
            <label className="text-[9px] text-wood-dark block mb-1">SUPPORT</label>
            <select value={support} onChange={e => setSupport(e.target.value as SupportType)} className="pixel-select w-full text-[9px]">
              <option value="none">None</option>
              <option value="stake">Stake</option>
              <option value="cage">Cage</option>
              <option value="trellis">Trellis</option>
              <option value="arch">Arch</option>
              <option value="net">Net</option>
            </select>
          </div>
          <div className="flex-1">
            <label className="text-[9px] text-wood-dark block mb-1">SPACING (in)</label>
            <input type="number" min={1} max={60} value={spacing} onChange={e => setSpacing(Number(e.target.value))} className="pixel-input w-full text-[9px]" />
          </div>
        </div>

        <div className="flex gap-2 mb-3">
          <div className="flex-1">
            <label className="text-[9px] text-wood-dark block mb-1">PER SQ FT</label>
            <input type="number" min={1} max={16} value={perSqFt} onChange={e => setPerSqFt(Number(e.target.value))} className="pixel-input w-full text-[9px]" />
          </div>
          <div className="flex-1">
            <label className="text-[9px] text-wood-dark block mb-1">DAYS TO HARVEST</label>
            <input type="number" min={10} max={365} value={days} onChange={e => setDays(Number(e.target.value))} className="pixel-input w-full text-[9px]" />
          </div>
        </div>

        <div className="flex gap-2 justify-center">
          <button onClick={onCancel} className="pixel-btn text-[9px] bg-parchment-dark">Cancel</button>
          <button onClick={handleSubmit} className="pixel-btn pixel-btn-primary text-[9px]" disabled={!name.trim()}>🌱 Add</button>
        </div>
      </div>
    </div>
  );
}
