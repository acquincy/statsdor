'use client';

import React, { useState } from 'react';
import { PlayerMatch } from '@/types/database';

interface PlayerFormStripProps {
  matches: PlayerMatch[];
}

export function PlayerFormStrip({ matches }: PlayerFormStripProps) {
  const [activeMatch, setActiveMatch] = useState<PlayerMatch | null>(null);

  // Filter and sort chronologically
  const sortedMatches = [...matches].sort((a, b) => a.date.localeCompare(b.date));

  // Compute streaks
  let currentStreak = 0;
  let maxScoringStreak = 0;
  let currentScoringStreak = 0;
  let maxContributionStreak = 0;
  let currentContributionStreak = 0;
  let outputMatchCount = 0;

  sortedMatches.forEach((m) => {
    const scored = (m.total_goals || 0) > 0;
    const assisted = (m.goal_assists || 0) > 0;
    const hadOutput = scored || assisted;

    if (hadOutput) {
      outputMatchCount++;
      currentContributionStreak++;
      if (currentContributionStreak > maxContributionStreak) {
        maxContributionStreak = currentContributionStreak;
      }
    } else {
      currentContributionStreak = 0;
    }

    if (scored) {
      currentScoringStreak++;
      if (currentScoringStreak > maxScoringStreak) {
        maxScoringStreak = currentScoringStreak;
      }
    } else {
      currentScoringStreak = 0;
    }
  });

  // Calculate active streak at end of sequence
  for (let i = sortedMatches.length - 1; i >= 0; i--) {
    const m = sortedMatches[i];
    if ((m.total_goals || 0) > 0 || (m.goal_assists || 0) > 0) {
      currentStreak++;
    } else {
      break;
    }
  }

  const strikeRatePct =
    sortedMatches.length > 0
      ? Math.round((outputMatchCount / sortedMatches.length) * 100)
      : 0;

  return (
    <div className="space-y-4">
      {/* Streak Callouts */}
      <div className="flex flex-wrap items-center gap-x-8 gap-y-2 text-xs font-sans text-[#B4B2A9]">
        {maxContributionStreak >= 3 && (
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#C9A24B]" />
            <span>
              Contributed in <strong className="text-[#F1EFE8] font-medium">{maxContributionStreak} straight</strong> matches
            </span>
          </div>
        )}
        {maxScoringStreak >= 2 && (
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#C9A24B]" />
            <span>
              Scored in <strong className="text-[#F1EFE8] font-medium">{maxScoringStreak} consecutive</strong> fixtures
            </span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#888780]" />
          <span>
            Goal or assist in <strong className="text-[#F1EFE8] font-medium">{outputMatchCount} of {sortedMatches.length}</strong> matches ({strikeRatePct}%)
          </span>
        </div>
      </div>

      {/* Form Strip Cells */}
      <div className="relative">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none">
          {sortedMatches.map((m, idx) => {
            const goals = m.total_goals || 0;
            const assists = m.goal_assists || 0;
            const played = m.appearances > 0 || m.starter || m.sub_ins > 0;

            let bgClass = 'bg-[#1C1C1A] border-[#2C2C2A] text-[#888780]';
            let label = '—';

            if (!played) {
              bgClass = 'bg-transparent border border-dashed border-[#2C2C2A] text-[#555552]';
              label = 'DNP';
            } else if (goals > 0 && assists > 0) {
              bgClass = 'bg-[#C9A24B] border-[#C9A24B] text-[#111110] font-medium';
              label = `${goals}G ${assists}A`;
            } else if (goals > 0) {
              bgClass = 'bg-[#C9A24B] border-[#C9A24B] text-[#111110] font-medium';
              label = goals > 1 ? `${goals}G` : 'G';
            } else if (assists > 0) {
              bgClass = 'bg-[#6E5928] border-[#8A7132] text-[#F1EFE8] font-medium';
              label = assists > 1 ? `${assists}A` : 'A';
            }

            return (
              <div
                key={m.game_id}
                onMouseEnter={() => setActiveMatch(m)}
                onMouseLeave={() => setActiveMatch(null)}
                className={`relative flex-shrink-0 w-11 h-12 rounded border flex flex-col items-center justify-center cursor-pointer transition-transform hover:scale-105 ${bgClass}`}
              >
                <span className="text-[10px] tracking-tight">{label}</span>
                <span className="text-[8px] opacity-70 uppercase tracking-tighter mt-0.5">
                  w{m.matchweek || idx + 1}
                </span>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-[11px] text-[#888780] pt-1 font-sans">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-[#C9A24B]" />
            <span>Goal</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-[#6E5928]" />
            <span>Assist</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-[#1C1C1A] border border-[#2C2C2A]" />
            <span>No output</span>
          </div>
        </div>

        {/* Match Details Popover */}
        {activeMatch && (
          <div className="mt-3 p-3 bg-[#181816] border border-[#2C2C2A] text-xs font-sans text-[#F1EFE8] max-w-sm">
            <div className="flex items-center justify-between text-[#888780] text-[11px] mb-1">
              <span>{activeMatch.date}</span>
              <span>Matchweek {activeMatch.matchweek}</span>
            </div>
            <div className="font-medium text-[#F1EFE8] mb-2">
              {activeMatch.game}
            </div>
            <div className="grid grid-cols-4 gap-2 pt-2 border-t border-[#2C2C2A] text-center text-[11px]">
              <div>
                <div className="text-[#888780]">Goals</div>
                <div className="text-[#F1EFE8] font-medium">{activeMatch.total_goals || 0}</div>
              </div>
              <div>
                <div className="text-[#888780]">Assists</div>
                <div className="text-[#F1EFE8] font-medium">{activeMatch.goal_assists || 0}</div>
              </div>
              <div>
                <div className="text-[#888780]">Shots</div>
                <div className="text-[#F1EFE8] font-medium">{activeMatch.total_shots || 0}</div>
              </div>
              <div>
                <div className="text-[#888780]">Role</div>
                <div className="text-[#F1EFE8] font-medium">
                  {activeMatch.starter ? 'Starter' : activeMatch.sub_ins > 0 ? 'Sub in' : 'Sub'}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
