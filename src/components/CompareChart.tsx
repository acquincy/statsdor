'use client';

import React, { useMemo } from 'react';

export interface ComparedPlayer {
  player_id: string;
  name: string;
  team: string;
  league: string;
  history: { matchweek: number; value: number }[];
  currentValue: number;
  goals: number;
  assists: number;
  isLeader: boolean;
  color: string;
}

interface CompareChartProps {
  players: ComparedPlayer[];
  selectedWeek: number;
  maxWeek: number;
}

export function CompareChart({ players, selectedWeek, maxWeek }: CompareChartProps) {
  const width = 840;
  const height = 400;
  const top = 24;
  const bottom = 44;
  const left = 36;
  const right = 160;

  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;

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

  const getX = (mw: number) => {
    if (selectedWeek <= 1) return left + plotWidth / 2;
    return left + ((mw - 1) / (selectedWeek - 1)) * plotWidth;
  };

  const getY = (val: number) => {
    return top + (1 - val / maxVal) * plotHeight;
  };

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

  // Label collision avoidance pass
  const endLabels = useMemo(() => {
    const rawLabels = players.map((p) => {
      const endHistory = p.history.find((h) => h.matchweek === selectedWeek);
      const val = endHistory ? endHistory.value : p.currentValue;
      const rawY = getY(val);
      return {
        id: p.player_id,
        name: p.name,
        color: p.color,
        value: val,
        rawY,
        targetY: rawY,
        isLeader: p.isLeader,
      };
    });

    rawLabels.sort((a, b) => a.rawY - b.rawY);
    const minGap = 20;

    for (let i = 1; i < rawLabels.length; i++) {
      if (rawLabels[i].targetY < rawLabels[i - 1].targetY + minGap) {
        rawLabels[i].targetY = rawLabels[i - 1].targetY + minGap;
      }
    }

    const maxY = height - bottom;
    if (rawLabels.length > 0 && rawLabels[rawLabels.length - 1].targetY > maxY) {
      rawLabels[rawLabels.length - 1].targetY = maxY;
      for (let i = rawLabels.length - 2; i >= 0; i--) {
        if (rawLabels[i].targetY > rawLabels[i + 1].targetY - minGap) {
          rawLabels[i].targetY = rawLabels[i + 1].targetY - minGap;
        }
      }
    }

    return rawLabels;
  }, [players, selectedWeek, maxVal]);

  const yTicks = useMemo(() => {
    const step = maxVal <= 10 ? 2 : maxVal <= 20 ? 5 : 10;
    const ticks: number[] = [];
    for (let val = 0; val <= maxVal; val += step) {
      ticks.push(val);
    }
    return ticks;
  }, [maxVal]);

  const xTicks = useMemo(() => {
    const ticks: number[] = [];
    if (selectedWeek <= 1) return [1];
    const step = selectedWeek > 8 ? 2 : 1;
    for (let mw = 1; mw <= selectedWeek; mw += step) {
      ticks.push(mw);
    }
    if (!ticks.includes(selectedWeek)) {
      ticks.push(selectedWeek);
    }
    return ticks;
  }, [selectedWeek]);

  const endX = getX(selectedWeek);

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto block">
        {/* Y-axis gridlines */}
        {yTicks.map((val) => {
          const y = getY(val);
          return (
            <g key={`ytick-${val}`}>
              <line
                x1={left}
                y1={y}
                x2={left + plotWidth}
                y2={y}
                stroke="#222220"
                strokeWidth="1"
              />
              <text
                x={left - 8}
                y={y + 3}
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

        {/* X-axis ticks */}
        {xTicks.map((mw) => {
          const x = getX(mw);
          return (
            <g key={`xtick-${mw}`}>
              <line
                x1={x}
                y1={top}
                x2={x}
                y2={top + plotHeight}
                stroke="#1c1c1b"
                strokeWidth="1"
                strokeDasharray="2 2"
              />
              <text
                x={x}
                y={top + plotHeight + 20}
                textAnchor="middle"
                fill="#888780"
                fontSize="11"
                className="font-sans"
              >
                w{mw}
              </text>
            </g>
          );
        })}

        {/* Baseline */}
        <line
          x1={left}
          y1={top + plotHeight}
          x2={left + plotWidth}
          y2={top + plotHeight}
          stroke="#2C2C2A"
          strokeWidth="1"
        />

        {/* Lines */}
        {players.map((p) => {
          const pathD = createPath(p.history);
          const endPoint = p.history.find((h) => h.matchweek === selectedWeek);
          const endY = endPoint ? getY(endPoint.value) : getY(p.currentValue);

          return (
            <g key={p.player_id}>
              <path
                d={pathD}
                fill="none"
                stroke={p.color}
                strokeWidth={p.isLeader ? 2.5 : 2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle
                cx={endX}
                cy={endY}
                r={p.isLeader ? 4 : 3}
                fill={p.color}
              />
            </g>
          );
        })}

        {/* End labels */}
        {endLabels.map((lbl) => {
          const hasShift = Math.abs(lbl.targetY - lbl.rawY) > 3;
          return (
            <g key={`compare-lbl-${lbl.id}`}>
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
                fill={lbl.color}
                fontSize="12"
                fontWeight={lbl.isLeader ? 500 : 400}
                className="font-sans"
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
  );
}
