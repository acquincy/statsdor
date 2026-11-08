'use client';

import React from 'react';
import { Player, PlayerMatch, PlayerSeasonTotal } from '@/types/database';

interface PlayerCardProps {
  player: Player;
  totals?: PlayerSeasonTotal | null;
  matches: PlayerMatch[];
}

export function PlayerCard({ player, totals, matches }: PlayerCardProps) {
  const sortedMatches = [...matches].sort((a, b) => a.date.localeCompare(b.date));
  const goals = totals ? totals.goals : matches.reduce((acc, m) => acc + (m.total_goals || 0), 0);
  const assists = totals ? totals.assists : matches.reduce((acc, m) => acc + (m.goal_assists || 0), 0);
  const contributions = goals + assists;
  const minutes = totals ? totals.minutes : matches.reduce((acc, m) => acc + (m.starter ? 85 : m.sub_ins ? 25 : 0), 0);

  return (
    <div className="w-full max-w-md bg-[#161614] border border-[#2C2C2A] p-6 text-[#F1EFE8] font-sans">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-[#2C2C2A] pb-3 mb-5">
        <div className="text-[10px] tracking-widest uppercase text-[#888780]">
          StatsDor · Player Dossier
        </div>
        <div className="text-[10px] uppercase tracking-wider text-[#C9A24B]">
          2026–27
        </div>
      </div>

      {/* Player Identity */}
      <div className="mb-6">
        <h2 className="font-serif text-3xl font-medium tracking-tight text-[#F1EFE8] leading-tight">
          {player.name}
        </h2>
        <div className="text-xs text-[#B4B2A9] mt-1 flex items-center gap-2">
          <span>{player.team}</span>
          <span className="text-[#888780]">·</span>
          <span>{player.league}</span>
          <span className="text-[#888780]">·</span>
          <span>{player.position}</span>
        </div>
      </div>

      {/* Key Numbers */}
      <div className="grid grid-cols-4 gap-3 py-4 border-y border-[#2C2C2A] mb-6">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-[#888780]">Total G+A</div>
          <div className="font-serif text-3xl font-medium text-[#C9A24B] mt-0.5">
            {contributions}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-[#888780]">Goals</div>
          <div className="font-serif text-3xl font-medium text-[#F1EFE8] mt-0.5">
            {goals}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-[#888780]">Assists</div>
          <div className="font-serif text-3xl font-medium text-[#F1EFE8] mt-0.5">
            {assists}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-[#888780]">Minutes</div>
          <div className="font-serif text-2xl font-medium text-[#B4B2A9] mt-1">
            {minutes}
          </div>
        </div>
      </div>

      {/* Mini Form Strip */}
      <div className="mb-6">
        <div className="text-[10px] uppercase tracking-wider text-[#888780] mb-2">
          Match-by-match sequence
        </div>
        <div className="flex items-center gap-1">
          {sortedMatches.map((m, idx) => {
            const hasG = (m.total_goals || 0) > 0;
            const hasA = (m.goal_assists || 0) > 0;
            const color =
              hasG && hasA
                ? 'bg-[#C9A24B]'
                : hasG
                ? 'bg-[#C9A24B]'
                : hasA
                ? 'bg-[#6E5928]'
                : 'bg-[#262624]';

            return (
              <div
                key={m.game_id || idx}
                title={`${m.game}: ${m.total_goals || 0}G, ${m.goal_assists || 0}A`}
                className={`h-4 flex-1 rounded-sm ${color}`}
              />
            );
          })}
        </div>
      </div>

      {/* Card Footnote */}
      <div className="flex items-center justify-between text-[10px] text-[#888780] pt-2 border-t border-[#222220]">
        <span>StatsDor · Players only</span>
        <span>Output based</span>
      </div>
    </div>
  );
}
