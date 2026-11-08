'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { fetchPlayerProfile } from '@/lib/queries';
import { Player, PlayerMatch, PlayerMatchweekStat } from '@/types/database';
import { PlayerFormStrip } from '@/components/PlayerFormStrip';
import { PlayerCard } from '@/components/PlayerCard';

function PlayerProfileContent() {
  const params = useParams();
  const router = useRouter();
  const playerId = params.id as string;

  const [player, setPlayer] = useState<Player | null>(null);
  const [matches, setMatches] = useState<PlayerMatch[]>([]);
  const [matchweeks, setMatchweeks] = useState<PlayerMatchweekStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (!playerId) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetchPlayerProfile(playerId);
        setPlayer(res.player);
        setMatches(res.matches);
        setMatchweeks(res.matchweeks);
      } catch (err: any) {
        setError(err.message || 'Failed to load player profile.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [playerId]);

  if (loading) {
    return (
      <div className="py-24 text-center text-[#888780] font-sans text-sm">
        Loading player dossier...
      </div>
    );
  }

  if (error || !player) {
    return (
      <div className="space-y-4">
        <Link href="/" className="text-xs text-[#888780] hover:text-[#F1EFE8] font-sans">
          ← Back to the race
        </Link>
        <div className="p-4 bg-[#1A1A18] border border-[#2C2C2A] text-xs text-[#B4B2A9]">
          {error || 'Player not found.'}
        </div>
      </div>
    );
  }

  // Calculate season totals from match logs
  const totalGoals = matches.reduce((acc, m) => acc + (m.total_goals || 0), 0);
  const totalAssists = matches.reduce((acc, m) => acc + (m.goal_assists || 0), 0);
  const totalContributions = totalGoals + totalAssists;
  const totalMinutes = matches.reduce((acc, m) => acc + (m.starter ? 85 : m.sub_ins ? 25 : 0), 0);
  const totalShots = matches.reduce((acc, m) => acc + (m.total_shots || 0), 0);
  const totalAppearances = matches.filter((m) => m.appearances > 0 || m.starter || m.sub_ins > 0).length;

  // Single-player cumulative accumulation chart math
  const maxCumulative = Math.max(5, Math.ceil(totalContributions * 1.2));
  const maxWeek = Math.max(1, ...matchweeks.map((m) => m.matchweek));

  const chartW = 740;
  const chartH = 220;
  const cTop = 20;
  const cBottom = 30;
  const cLeft = 30;
  const cRight = 60;
  const cPlotW = chartW - cLeft - cRight;
  const cPlotH = chartH - cTop - cBottom;

  const getCX = (mw: number) => {
    if (maxWeek <= 1) return cLeft + cPlotW / 2;
    return cLeft + ((mw - 1) / (maxWeek - 1)) * cPlotW;
  };

  const getCY = (val: number) => {
    return cTop + (1 - val / maxCumulative) * cPlotH;
  };

  const linePoints = matchweeks.map((m) => ({
    x: getCX(m.matchweek),
    y: getCY(m.cum_contributions),
  }));

  const linePath =
    linePoints.length > 0
      ? linePoints.reduce((acc, pt, i) => (i === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`), '')
      : '';

  const endPt = linePoints[linePoints.length - 1];

  return (
    <div className="space-y-12">
      {/* Editorial Header */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-xs text-[#888780] hover:text-[#F1EFE8] font-sans">
            ← The race
          </Link>
          <span className="text-[#2C2C2A]">/</span>
          <div className="text-[11px] uppercase tracking-widest text-[#888780] font-sans">
            Player profile · 2026–27
          </div>
        </div>

        <h1 className="font-serif text-3xl sm:text-5xl font-medium tracking-tight text-[#F1EFE8] leading-tight">
          {player.name}
        </h1>

        <div className="text-sm text-[#B4B2A9] font-sans flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-[#F1EFE8] font-medium">{player.team}</span>
          <span className="text-[#888780]">·</span>
          <span>{player.league}</span>
          <span className="text-[#888780]">·</span>
          <span>{player.position}</span>
          {player.jersey && (
            <>
              <span className="text-[#888780]">·</span>
              <span>No. {player.jersey}</span>
            </>
          )}
        </div>
      </div>

      {/* Big Numbers Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 py-6 border-y border-[#2C2C2A]">
        <div>
          <div className="font-serif text-4xl sm:text-5xl font-medium text-[#C9A24B]">
            {totalContributions}
          </div>
          <div className="text-xs text-[#888780] mt-1 font-sans">
            Goals and assists
          </div>
        </div>

        <div>
          <div className="font-serif text-4xl sm:text-5xl font-medium text-[#F1EFE8]">
            {totalGoals}
          </div>
          <div className="text-xs text-[#888780] mt-1 font-sans">
            Goals scored
          </div>
        </div>

        <div>
          <div className="font-serif text-4xl sm:text-5xl font-medium text-[#F1EFE8]">
            {totalAssists}
          </div>
          <div className="text-xs text-[#888780] mt-1 font-sans">
            Assists created
          </div>
        </div>

        <div>
          <div className="font-serif text-4xl sm:text-5xl font-medium text-[#B4B2A9]">
            {totalMinutes}′
          </div>
          <div className="text-xs text-[#888780] mt-1 font-sans">
            Minutes across {totalAppearances} apps
          </div>
        </div>
      </div>

      {/* Form Strip Section */}
      <div className="space-y-4">
        <div>
          <h2 className="font-serif text-2xl font-medium text-[#F1EFE8]">
            Season form strip
          </h2>
          <p className="text-xs text-[#888780] mt-1 font-sans">
            Chronological match logs with individual match contributions. Hover or tap for fixture box scores.
          </p>
        </div>

        <PlayerFormStrip matches={matches} />
      </div>

      {/* Cumulative Trajectory Chart */}
      <div className="space-y-4 pt-6 border-t border-[#2C2C2A]">
        <div>
          <h2 className="font-serif text-2xl font-medium text-[#F1EFE8]">
            Cumulative trajectory
          </h2>
          <p className="text-xs text-[#888780] mt-1 font-sans">
            Goal contributions accumulated week by week.
          </p>
        </div>

        <div className="border border-[#2C2C2A] p-4 bg-[#141412]">
          <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-auto block">
            {/* Horizontal gridlines */}
            {[0, Math.round(maxCumulative / 2), maxCumulative].map((val) => {
              const y = getCY(val);
              return (
                <g key={`y-${val}`}>
                  <line
                    x1={cLeft}
                    y1={y}
                    x2={cLeft + cPlotW}
                    y2={y}
                    stroke="#222220"
                    strokeWidth="1"
                  />
                  <text
                    x={cLeft - 6}
                    y={y + 3}
                    textAnchor="end"
                    fill="#888780"
                    fontSize="9"
                    className="font-sans"
                  >
                    {val}
                  </text>
                </g>
              );
            })}

            {/* X-axis ticks */}
            {matchweeks.map((mw) => {
              const x = getCX(mw.matchweek);
              return (
                <text
                  key={`mw-${mw.matchweek}`}
                  x={x}
                  y={cTop + cPlotH + 18}
                  textAnchor="middle"
                  fill="#888780"
                  fontSize="10"
                  className="font-sans"
                >
                  w{mw.matchweek}
                </text>
              );
            })}

            {/* Path */}
            <path
              d={linePath}
              fill="none"
              stroke="#C9A24B"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Dots */}
            {linePoints.map((pt, i) => (
              <circle
                key={`pt-${i}`}
                cx={pt.x}
                cy={pt.y}
                r="3"
                fill="#C9A24B"
              />
            ))}

            {/* End label */}
            {endPt && (
              <text
                x={endPt.x + 8}
                y={endPt.y + 4}
                fill="#C9A24B"
                fontSize="12"
                fontWeight="500"
                className="font-sans"
              >
                {totalContributions} G+A
              </text>
            )}
          </svg>
        </div>
      </div>

      {/* Shareable Card Section */}
      <div className="space-y-4 pt-6 border-t border-[#2C2C2A]">
        <div>
          <h2 className="font-serif text-2xl font-medium text-[#F1EFE8]">
            Player dossier card
          </h2>
          <p className="text-xs text-[#888780] mt-1 font-sans">
            Editorial card layout ready for clipping or sharing.
          </p>
        </div>

        <div className="flex justify-start">
          <PlayerCard
            player={player}
            matches={matches}
          />
        </div>
      </div>
    </div>
  );
}

export default function PlayerPage() {
  return (
    <Suspense
      fallback={
        <div className="py-24 text-center text-[#888780] font-sans text-sm">
          Loading player dossier...
        </div>
      }
    >
      <PlayerProfileContent />
    </Suspense>
  );
}
