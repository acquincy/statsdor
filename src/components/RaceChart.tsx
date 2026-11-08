'use client';

import React, { useState, useMemo, useRef } from 'react';

export interface RacePlayerLine {
  player_id: string;
  name: string;
  team: string;
  league: string;
  history: { matchweek: number; value: number; goals?: number; assists?: number }[];
  currentValue: number;
  goals: number;
  assists: number;
  isLeader: boolean;
}

interface RaceChartProps {
  players: RacePlayerLine[];
  selectedWeek: number;
  maxWeek: number;
  isReplaying?: boolean;
  onSelectPlayer?: (playerId: string) => void;
}

export function RaceChart({
  players,
  selectedWeek,
  maxWeek,
  isReplaying,
  onSelectPlayer,
}: RaceChartProps) {
  const [hoveredPlayerId, setHoveredPlayerId] = useState<string | null>(null);
  const [crosshairWeek, setCrosshairWeek] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Layout dimensions - larger hero chart with minimal top waste
  const width = 920;
  const height = 500;
  const top = 20;
  const bottom = 48;
  const left = 36;
  const right = 170;

  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;

  // Max value calculation across all players up to selectedWeek
  const maxVal = useMemo(() => {
    let m = 0;
    players.forEach((p) => {
      p.history.forEach((h) => {
        if (h.matchweek <= selectedWeek && h.value > m) {
          m = h.value;
        }
      });
    });
    return Math.max(5, Math.ceil(m * 1.15));
  }, [players, selectedWeek]);

  // Coordinate scales
  const getX = (mw: number) => {
    if (selectedWeek <= 1) return left + plotWidth / 2;
    return left + ((mw - 1) / (selectedWeek - 1)) * plotWidth;
  };

  const getY = (val: number) => {
    return top + (1 - val / maxVal) * plotHeight;
  };

  // Monotone cubic curve generator
  const createPath = (history: { matchweek: number; value: number }[]) => {
    const valid = history.filter((h) => h.matchweek <= selectedWeek);
    if (valid.length === 0) return '';
    if (valid.length === 1) {
      const x = getX(valid[0].matchweek);
      const y = getY(valid[0].value);
      return `M ${x} ${y} L ${x + 1} ${y}`;
    }

    const points = valid.map((h) => ({ x: getX(h.matchweek), y: getY(h.value) }));
    let d = `M ${points[0].x} ${points[0].y}`;

    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }
    return d;
  };

  // Collision-avoidance algorithm for direct line end labels
  const endLabels = useMemo(() => {
    const rawLabels = players.map((p) => {
      const endHistory = p.history.find((h) => h.matchweek === selectedWeek);
      const val = endHistory ? endHistory.value : p.currentValue;
      const rawY = getY(val);
      return {
        id: p.player_id,
        name: p.name,
        team: p.team,
        value: val,
        rawY,
        targetY: rawY,
        isLeader: p.isLeader,
      };
    });

    rawLabels.sort((a, b) => a.rawY - b.rawY);
    const minGap = 20;

    // Forward pass
    for (let i = 1; i < rawLabels.length; i++) {
      if (rawLabels[i].targetY < rawLabels[i - 1].targetY + minGap) {
        rawLabels[i].targetY = rawLabels[i - 1].targetY + minGap;
      }
    }

    // Backward pass
    const maxY = height - bottom;
    if (rawLabels.length > 0 && rawLabels[rawLabels.length - 1].targetY > maxY) {
      rawLabels[rawLabels.length - 1].targetY = maxY;
      for (let i = rawLabels.length - 2; i >= 0; i--) {
        if (rawLabels[i].targetY > rawLabels[i + 1].targetY - minGap) {
          rawLabels[i].targetY = rawLabels[i + 1].targetY - minGap;
        }
      }
    }

    // Top clamp
    const minY = top + 8;
    if (rawLabels.length > 0 && rawLabels[0].targetY < minY) {
      rawLabels[0].targetY = minY;
      for (let i = 1; i < rawLabels.length; i++) {
        if (rawLabels[i].targetY < rawLabels[i - 1].targetY + minGap) {
          rawLabels[i].targetY = rawLabels[i - 1].targetY + minGap;
        }
      }
    }

    return rawLabels;
  }, [players, selectedWeek, maxVal]);

  // Y-axis grid ticks
  const yTicks = useMemo(() => {
    const step = maxVal <= 10 ? 2 : maxVal <= 20 ? 5 : 10;
    const ticks: number[] = [];
    for (let val = 0; val <= maxVal; val += step) {
      ticks.push(val);
    }
    return ticks;
  }, [maxVal]);

  // X-axis ticks
  const xTicks = useMemo(() => {
    const ticks: number[] = [];
    if (selectedWeek <= 1) return [1];
    for (let mw = 1; mw <= selectedWeek; mw++) {
      ticks.push(mw);
    }
    return ticks;
  }, [selectedWeek]);

  // Crosshair mouse movement tracker
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || selectedWeek <= 1) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * width;

    // Check if mouse is within plot area
    if (mouseX >= left && mouseX <= left + plotWidth) {
      const pct = (mouseX - left) / plotWidth;
      const approximateWeek = Math.round(1 + pct * (selectedWeek - 1));
      const clampedWeek = Math.max(1, Math.min(selectedWeek, approximateWeek));
      setCrosshairWeek(clampedWeek);
    } else {
      setCrosshairWeek(null);
    }
  };

  const handleMouseLeave = () => {
    setCrosshairWeek(null);
    setHoveredPlayerId(null);
  };

  // Crosshair standings at hovered week
  const activeWeekForTooltip = crosshairWeek || null;
  const crosshairStandings = useMemo(() => {
    if (!activeWeekForTooltip) return [];
    return players
      .map((p) => {
        const hist = p.history.find((h) => h.matchweek === activeWeekForTooltip);
        const val = hist ? hist.value : 0;
        return {
          player_id: p.player_id,
          name: p.name,
          team: p.team,
          value: val,
          isLeader: p.isLeader,
        };
      })
      .sort((a, b) => b.value - a.value);
  }, [players, activeWeekForTooltip]);

  const endX = getX(selectedWeek);

  return (
    <div className="relative w-full select-none">
      <div className="w-full overflow-hidden">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className="w-full h-auto block cursor-crosshair"
          style={{ maxHeight: '540px' }}
        >
          {/* Subtle horizontal grid lines */}
          {yTicks.map((val) => {
            const y = getY(val);
            return (
              <g key={`ytick-${val}`}>
                <line
                  x1={left}
                  y1={y}
                  x2={left + plotWidth}
                  y2={y}
                  stroke="#1E1E1C"
                  strokeWidth="1"
                />
                <text
                  x={left - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  fill="#888780"
                  fontSize="10"
                  className="font-sans"
                >
                  {val}
                </text>
              </g>
            );
          })}

          {/* Matchweek vertical grid lines & labels */}
          {xTicks.map((mw) => {
            const x = getX(mw);
            const isHoveredCol = crosshairWeek === mw;
            return (
              <g key={`xtick-${mw}`}>
                <line
                  x1={x}
                  y1={top}
                  x2={x}
                  y2={top + plotHeight}
                  stroke={isHoveredCol ? '#333330' : '#1A1A18'}
                  strokeWidth="1"
                  strokeDasharray="2 2"
                />
                <text
                  x={x}
                  y={top + plotHeight + 22}
                  textAnchor="middle"
                  fill={isHoveredCol ? '#C9A24B' : '#888780'}
                  fontSize="11"
                  fontWeight={isHoveredCol ? 500 : 400}
                  className="font-sans transition-colors"
                >
                  w{mw}
                </text>
              </g>
            );
          })}

          {/* Baseline axis */}
          <line
            x1={left}
            y1={top + plotHeight}
            x2={left + plotWidth}
            y2={top + plotHeight}
            stroke="#2C2C2A"
            strokeWidth="1"
          />

          {/* Interactive Crosshair vertical line */}
          {crosshairWeek && (
            <line
              x1={getX(crosshairWeek)}
              y1={top}
              x2={getX(crosshairWeek)}
              y2={top + plotHeight}
              stroke="#C9A24B"
              strokeWidth="1"
              strokeDasharray="3 3"
              opacity="0.8"
            />
          )}

          {/* Player Lines */}
          {players.map((p) => {
            const isHovered = hoveredPlayerId === p.player_id;
            const isAnyHovered = hoveredPlayerId !== null;

            let strokeColor = '#3A3A38';
            let strokeWidth = 1.6;
            let opacity = 1;

            if (p.isLeader) {
              strokeColor = '#C9A24B';
              strokeWidth = 2.6;
              opacity = isHovered || !isAnyHovered ? 1 : 0.85;
            } else if (isHovered) {
              strokeColor = '#F1EFE8';
              strokeWidth = 2.4;
              opacity = 1;
            } else if (isAnyHovered) {
              strokeColor = '#242422';
              opacity = 0.45;
            }

            const pathD = createPath(p.history);
            const endPoint = p.history.find((h) => h.matchweek === selectedWeek);
            const endY = endPoint ? getY(endPoint.value) : getY(p.currentValue);

            return (
              <g
                key={p.player_id}
                onMouseEnter={() => setHoveredPlayerId(p.player_id)}
                onMouseLeave={() => setHoveredPlayerId(null)}
                onClick={() => onSelectPlayer && onSelectPlayer(p.player_id)}
                className="cursor-pointer"
              >
                {/* Wide invisible hit line */}
                <path
                  d={pathD}
                  fill="none"
                  stroke="transparent"
                  strokeWidth="18"
                  strokeLinecap="round"
                />

                {/* Visible line with entrance animation */}
                <path
                  d={pathD}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={opacity}
                  className="transition-[d,stroke] duration-200"
                />

                {/* Dot at selected matchweek */}
                <circle
                  cx={endX}
                  cy={endY}
                  r={p.isLeader ? 4.5 : isHovered ? 3.5 : 2}
                  fill={p.isLeader ? '#C9A24B' : isHovered ? '#F1EFE8' : '#4A4A46'}
                />

                {/* Crosshair dot at hovered week */}
                {crosshairWeek && crosshairWeek !== selectedWeek && (
                  <circle
                    cx={getX(crosshairWeek)}
                    cy={getY(p.history.find((h) => h.matchweek === crosshairWeek)?.value || 0)}
                    r={p.isLeader ? 3.5 : 2}
                    fill={p.isLeader ? '#C9A24B' : isHovered ? '#F1EFE8' : '#555552'}
                  />
                )}
              </g>
            );
          })}

          {/* Collision-avoided direct end labels */}
          {endLabels.map((lbl) => {
            const isHovered = hoveredPlayerId === lbl.id;
            const isAnyHovered = hoveredPlayerId !== null;
            const hasShift = Math.abs(lbl.targetY - lbl.rawY) > 3;

            let textColor = '#B4B2A9';
            let fontWeight = 400;

            if (lbl.isLeader) {
              textColor = '#C9A24B';
              fontWeight = 500;
            } else if (isHovered) {
              textColor = '#F1EFE8';
              fontWeight = 500;
            } else if (isAnyHovered) {
              textColor = '#444442';
            }

            return (
              <g
                key={`label-${lbl.id}`}
                onMouseEnter={() => setHoveredPlayerId(lbl.id)}
                onMouseLeave={() => setHoveredPlayerId(null)}
                onClick={() => onSelectPlayer && onSelectPlayer(lbl.id)}
                className="cursor-pointer"
              >
                {hasShift && (
                  <path
                    d={`M ${endX + 5} ${lbl.rawY} L ${endX + 10} ${lbl.targetY} L ${endX + 16} ${lbl.targetY}`}
                    fill="none"
                    stroke="#2C2C2A"
                    strokeWidth="1"
                  />
                )}

                <text
                  x={endX + (hasShift ? 20 : 12)}
                  y={lbl.targetY + 4}
                  fill={textColor}
                  fontSize="12"
                  fontWeight={fontWeight}
                  className="font-sans transition-colors duration-150"
                >
                  {lbl.name}
                  <tspan fill="#888780" fontSize="11" dx="6">
                    {lbl.value}
                  </tspan>
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Crosshair Standings Tooltip: Displays every top player's total at hovered matchweek */}
      {crosshairWeek && crosshairStandings.length > 0 && (
        <div
          className="absolute z-30 top-4 py-2 px-3 bg-[#111110] border border-[#2C2C2A] text-xs font-sans text-[#F1EFE8] shadow-2xl pointer-events-none"
          style={{
            left: getX(crosshairWeek) > width / 2 ? `${getX(crosshairWeek) - 210}px` : `${getX(crosshairWeek) + 16}px`,
            maxWidth: '220px',
          }}
        >
          <div className="flex items-center justify-between border-b border-[#2C2C2A] pb-1.5 mb-2">
            <span className="font-medium text-[#C9A24B]">Matchweek {crosshairWeek}</span>
            <span className="text-[10px] text-[#888780] uppercase tracking-wider">Leaders then</span>
          </div>

          <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
            {crosshairStandings.slice(0, 8).map((p, rank) => {
              const isHighlight = p.player_id === hoveredPlayerId;
              const isLead = rank === 0;
              return (
                <div
                  key={p.player_id}
                  className={`flex items-center justify-between text-[11px] ${
                    isHighlight
                      ? 'text-[#F1EFE8] font-medium'
                      : isLead
                      ? 'text-[#C9A24B]'
                      : 'text-[#B4B2A9]'
                  }`}
                >
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="text-[#888780] w-3 text-[10px]">{rank + 1}</span>
                    <span className="truncate">{p.name}</span>
                  </div>
                  <span className="font-serif font-medium text-xs ml-2">
                    {p.value}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
