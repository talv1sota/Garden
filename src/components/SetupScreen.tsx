'use client';

import { useState, Dispatch } from 'react';
import { GardenAction, Bed, BedType, SunExposure, SoilType, SOIL_INFO, ALL_ZONES, formatZone } from '../types';

interface Props {
  dispatch: Dispatch<GardenAction>;
}

export default function SetupScreen({ dispatch }: Props) {
  const [step, setStep] = useState<'zone' | 'bed'>('zone');
  const [zone, setZone] = useState(7); // 7.0 = 7a, 7.5 = 7b

  // Bed form
  const [bedName, setBedName] = useState('Main Bed');
  const [bedType, setBedType] = useState<BedType>('raised');
  const [bedWidth, setBedWidth] = useState(4);
  const [bedHeight, setBedHeight] = useState(4);
  const [sunExposure, setSunExposure] = useState<SunExposure>('full-sun');
  const [soilType, setSoilType] = useState<SoilType>('loamy');

  const handleZoneNext = () => {
    dispatch({ type: 'SET_ZONE', zone });
    setStep('bed');
  };

  const handleCreateBed = () => {
    const w = bedType === 'pot' ? Math.min(bedWidth, 3) : bedWidth;
    const h = bedType === 'pot' ? Math.min(bedHeight, 3) : bedHeight;

    const bed: Bed = {
      id: `bed-${Date.now()}`,
      name: bedName || 'Garden Bed',
      type: bedType,
      width: w,
      height: h,
      sunExposure,
      soilType,
      cells: Array.from({ length: h }, () => Array(w).fill(null)),
      x: 20,
      y: 20,
    };

    dispatch({ type: 'ADD_BED', bed });
    dispatch({ type: 'SET_SCREEN', screen: 'planner' });
  };

  return (
    <div className="min-h-screen grass-bg flex items-center justify-center p-4">
      <div className="pixel-panel p-6 max-w-md w-full">
        {step === 'zone' ? (
          <>
            <h2 className="text-sm text-wood-dark mb-6 text-center">
              🌍 YOUR ZONE
            </h2>

            <p className="text-[8px] text-wood mb-4 leading-relaxed">
              Select your USDA Hardiness Zone. This determines which plants
              will thrive in your area.
            </p>

            <div className="mb-4">
              <label className="text-[8px] text-wood-dark block mb-2">
                HARDINESS ZONE
              </label>
              <select
                value={zone}
                onChange={e => setZone(Number(e.target.value))}
                className="pixel-select w-full"
              >
                {ALL_ZONES.map(z => (
                  <option key={z.value} value={z.value}>
                    {z.label}
                  </option>
                ))}
              </select>
            </div>

            <p className="text-[7px] text-wood-light mb-6 leading-relaxed">
              Not sure? Search &quot;USDA plant hardiness zone&quot; + your zip code online.
            </p>

            <div className="flex justify-center">
              <button onClick={handleZoneNext} className="pixel-btn pixel-btn-primary text-[10px]">
                Next →
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-sm text-wood-dark mb-1 text-center">
              🛏️ FIRST BED
            </h2>
            <p className="text-[7px] text-wood-light mb-5 text-center">
              Zone {formatZone(zone)} &bull; You can add more beds later
            </p>

            {/* Name */}
            <div className="mb-3">
              <label className="text-[8px] text-wood-dark block mb-1">NAME</label>
              <input
                type="text"
                value={bedName}
                onChange={e => setBedName(e.target.value)}
                className="pixel-input w-full"
                maxLength={24}
              />
            </div>

            {/* Type */}
            <div className="mb-3">
              <label className="text-[8px] text-wood-dark block mb-1">TYPE</label>
              <div className="flex gap-2">
                {([['raised', '🪵 Raised'], ['inground', '⬜ In-Ground'], ['pot', '🪴 Pot']] as const).map(([t, label]) => (
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

            {/* Size */}
            <div className="flex gap-3 mb-3">
              <div className="flex-1">
                <label className="text-[8px] text-wood-dark block mb-1">
                  WIDTH (ft)
                </label>
                <input
                  type="number"
                  min={1}
                  max={bedType === 'pot' ? 3 : 20}
                  value={bedWidth}
                  onChange={e => setBedWidth(Math.max(1, Math.min(bedType === 'pot' ? 3 : 20, Number(e.target.value))))}
                  className="pixel-input w-full"
                />
              </div>
              <div className="flex-1">
                <label className="text-[8px] text-wood-dark block mb-1">
                  LENGTH (ft)
                </label>
                <input
                  type="number"
                  min={1}
                  max={bedType === 'pot' ? 3 : 20}
                  value={bedHeight}
                  onChange={e => setBedHeight(Math.max(1, Math.min(bedType === 'pot' ? 3 : 20, Number(e.target.value))))}
                  className="pixel-input w-full"
                />
              </div>
            </div>

            {/* Sun */}
            <div className="mb-3">
              <label className="text-[8px] text-wood-dark block mb-1">SUN EXPOSURE</label>
              <div className="flex gap-2">
                {([['full-sun', '☀️ Full Sun'], ['partial-shade', '⛅ Partial'], ['full-shade', '☁️ Shade']] as const).map(([s, label]) => (
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

            {/* Soil Type */}
            <div className="mb-4">
              <label className="text-[8px] text-wood-dark block mb-1">SOIL TYPE</label>
              <select
                value={soilType}
                onChange={e => setSoilType(e.target.value as SoilType)}
                className="pixel-select w-full"
              >
                {(Object.entries(SOIL_INFO) as [SoilType, typeof SOIL_INFO[SoilType]][]).map(([key, info]) => (
                  <option key={key} value={key}>
                    {info.emoji} {info.name}
                  </option>
                ))}
              </select>
              <p className="text-[7px] text-wood-light mt-1">
                {SOIL_INFO[soilType].desc}
              </p>
            </div>

            <div className="flex gap-3 justify-center">
              <button onClick={() => setStep('zone')} className="pixel-btn text-[10px] bg-parchment-dark">
                ← Back
              </button>
              <button onClick={handleCreateBed} className="pixel-btn pixel-btn-primary text-[10px]">
                🌱 Start Planting!
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
