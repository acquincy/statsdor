'use client';

import React, { useEffect, useState, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { fetchRaceSummaries } from '@/lib/queries';
import { PlayerRaceSummary, WeeklyPoint } from '@/types/database';
import { RaceChart, RacePlayerLine } from '@/components/RaceChart';

export default function RacePage() {
  const router = useRouter();

  const [playersSummary, setPlayersSummary] = useState<PlayerRaceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedLeague, setSelectedLeague] = useState<string>('all');
  const [selectedPosition, setSelectedPosition] = useState<string>('all');
  const [minMinutes, setMinMinutes] = useState<number>(0);

  // Scrubber & Replay state
  const [selectedWeek, setSelectedWeek] = useState<number>(12);
  const [isReplaying, setIsReplaying] = useState<boolean>(false);
  const replayTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Load race data
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchRaceSummaries({
          league: selectedLeague,
          position: selectedPosition,
          minMinutes: minMinutes,
        });
        setPlayersSummary(data);

        // Find the latest matchweek that actually exists in this dataset
        let maxExistingWeek = 1;
        data.forEach((p) => {
          if (p.max_mw > maxExistingWeek) {
            maxExistingWeek = p.max_mw;
          }
          p.weekly_series.forEach((pt) => {
            if (pt.played && pt.mw > maxExistingWeek) {
              maxExistingWeek = pt.mw;
            }
          });
        });

        setSelectedWeek(maxExistingWeek);
      } catch (err: any) {
        setError(err.message || 'Failed to load race data.');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [selectedLeague, selectedPosition, minMinutes]);

  // Max week in current dataset
  const maxSeasonWeek = useMemo(() => {
    let m = 1;
    playersSummary.forEach((p) => {
      if (p.max_mw > m) m = p.max_mw;
      p.weekly_series.forEach((pt) => {
        if (pt.played && pt.mw > m) m = pt.mw;
      });
    });
    return m;
  }, [playersSummary]);

  // Handle Replay Season animation
  useEffect(() => {
    if (isReplaying) {
      replayTimerRef.current = setInterval(() => {
        setSelectedWeek((prev) => {
          if (prev >= maxSeasonWeek) {
            setIsReplaying(false);
            if (replayTimerRef.current) clearInterval(replayTimerRef.current);
            return maxSeasonWeek;
          }
          return prev + 1;
        });
      }, 650);
    } else {
      if (replayTimerRef.current) {
        clearInterval(replayTimerRef.current);
      }
    }

    return () => {
      if (replayTimerRef.current) {
        clearInterval(replayTimerRef.current);
      }
    };
  }, [isReplaying, maxSeasonWeek]);

  const toggleReplay = () => {
    if (isReplaying) {
      setIsReplaying(false);
    } else {
      if (selectedWeek >= maxSeasonWeek) {
        setSelectedWeek(1);
      }
      setIsReplaying(true);
    }
  };

  // Compute standings at selectedWeek
  const rankedAtWeek = useMemo(() => {
    const list: {
      player_id: string;
      name: string;
      team: string;
      league: string;
      position: string;
      cum_contributions: number;
      cum_goals: number;
      cum_assists: number;
      cum_minutes: number;
      matchesWithOutput: number;
      history: { matchweek: number; value: number }[];
    }[] = [];

    playersSummary.forEach((p) => {
      // Find point at or before selectedWeek
      const relevantPts = p.weekly_series.filter((pt) => pt.mw <= selectedWeek);
      if (relevantPts.length === 0) return;

      const currentPt =
        relevantPts.find((pt) => pt.mw === selectedWeek) ||
        relevantPts[relevantPts.length - 1];

      // Calculate matches with output up to selectedWeek
      let outputCount = 0;
      relevantPts.forEach((pt) => {
        if (pt.played && (pt.g > 0 || pt.a > 0)) {
          outputCount++;
        }
      });

      // Filter by minMinutes at that point in time
      if (minMinutes > 0 && currentPt.cum_m < minMinutes) {
        return;
      }

      list.push({
        player_id: p.player_id,
        name: p.name,
        team: p.team,
        league: p.league,
        position: p.position,
        cum_contributions: currentPt.cum_c,
        cum_goals: currentPt.cum_g,
        cum_assists: currentPt.cum_a,
        cum_minutes: currentPt.cum_m,
        matchesWithOutput: outputCount,
        history: relevantPts.map((pt) => ({
          matchweek: pt.mw,
          value: pt.cum_c,
        })),
      });
    });

    // Rank: contributions desc, then goals desc, then fewer minutes
    list.sort((a, b) => {
      if (b.cum_contributions !== a.cum_contributions) {
        return b.cum_contributions - a.cum_contributions;
      }
      if (b.cum_goals !== a.cum_goals) {
        return b.cum_goals - a.cum_goals;
      }
      return a.cum_minutes - b.cum_minutes;
    });

    return list;
  }, [playersSummary, selectedWeek, minMinutes]);

  // Top 10 for hero chart
  const top10Players: RacePlayerLine[] = useMemo(() => {
    return rankedAtWeek.slice(0, 10).map((p, idx) => ({
      player_id: p.player_id,
      name: p.name,
      team: p.team,
      league: p.league,
      history: p.history,
      currentValue: p.cum_contributions,
      goals: p.cum_goals,
      assists: p.cum_assists,
      isLeader: idx === 0,
    }));
  }, [rankedAtWeek]);

  // Leader and gap calculation
  const leader = rankedAtWeek[0] || null;
  const second = rankedAtWeek[1] || null;
  const leadGap = leader && second ? leader.cum_contributions - second.cum_contributions : 0;

  // Editorial story headline
  const editorialHeadline = useMemo(() => {
    if (!leader) return 'The race for the European summit begins';
    if (!second || leadGap === 0) {
      if (second) {
        return `${leader.name} and ${second.name} share the lead on ${leader.cum_contributions} contributions`;
      }
      return `${leader.name} leads the continent with ${leader.cum_contributions} contributions`;
    }
    if (leadGap === 1) {
      return `${leader.name} edges one clear at the summit`;
    }
    if (leadGap === 2) {
      return `${leader.name} establishes a two-goal cushion at the top`;
    }
    return `${leader.name} pulls ${leadGap} clear in the race for the top spot`;
  }, [leader, second, leadGap]);

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Editorial Header - tight and clean without wasted top margin */}
      <div className="space-y-2">
        <div className="text-[11px] uppercase tracking-widest text-[#888780] font-sans">
          The race · matchweek {selectedWeek}
        </div>
        <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl font-medium tracking-tight text-[#F1EFE8] leading-tight">
          {editorialHeadline}
        </h1>
        <p className="text-xs sm:text-sm text-[#B4B2A9] font-sans">
          Cumulative goals and assists across the 2026–27 season.
        </p>
      </div>

      {loading ? (
        <div className="py-24 text-center text-[#888780] font-sans text-sm">
          Loading race data...
        </div>
      ) : error ? (
        <div className="p-4 bg-[#1A1A18] border border-[#2C2C2A] text-xs text-[#B4B2A9]">
          {error}
        </div>
      ) : (
        <>
          {/* Hero Chart Container */}
          <div className="space-y-4">
            <RaceChart
              players={top10Players}
              selectedWeek={selectedWeek}
              maxWeek={maxSeasonWeek}
              isReplaying={isReplaying}
              onSelectPlayer={(id) => router.push(`/player/${id}`)}
            />

            {/* Matchweek Scrubber & Replay Season Bar */}
            <div className="pt-3 border-t border-[#2C2C2A] space-y-2">
              <div className="flex items-center justify-between text-xs text-[#888780] font-sans">
                <div className="flex items-center gap-3">
                  <button
                    onClick={toggleReplay}
                    className="flex items-center gap-1.5 px-2.5 py-1 bg-[#1A1A18] hover:bg-[#222220] border border-[#2C2C2A] text-[#F1EFE8] text-[11px] font-sans transition-colors cursor-pointer"
                  >
                    <span>{isReplaying ? '⏸' : '▶'}</span>
                    <span>{isReplaying ? 'Pause' : 'Replay season'}</span>
                  </button>
                  <span className="hidden sm:inline">Matchweek 1</span>
                </div>

                <span className="text-[#C9A24B] font-medium">
                  Viewing matchweek {selectedWeek} of {maxSeasonWeek}
                </span>

                <span>Matchweek {maxSeasonWeek} (Latest)</span>
              </div>

              <input
                type="range"
                min={1}
                max={maxSeasonWeek}
                value={selectedWeek}
                onChange={(e) => {
                  setIsReplaying(false);
                  setSelectedWeek(Number(e.target.value));
                }}
                className="w-full"
              />
            </div>

            {/* Summary Row (Three figures max) */}
            {leader && (
              <div className="grid grid-cols-3 gap-6 pt-5 border-t border-[#2C2C2A]">
                <div>
                  <div className="font-serif text-4xl sm:text-5xl font-medium text-[#C9A24B]">
                    {leader.cum_contributions}
                  </div>
                  <div className="text-xs text-[#888780] mt-1 font-sans">
                    Leader&apos;s contributions ({leader.cum_goals}G, {leader.cum_assists}A)
                  </div>
                </div>

                <div>
                  <div className="font-serif text-4xl sm:text-5xl font-medium text-[#F1EFE8]">
                    {leader.matchesWithOutput}
                  </div>
                  <div className="text-xs text-[#888780] mt-1 font-sans">
                    Matches with a goal or assist
                  </div>
                </div>

                <div>
                  <div className="font-serif text-4xl sm:text-5xl font-medium text-[#F1EFE8]">
                    {leadGap > 0 ? `+${leadGap}` : 'Level'}
                  </div>
                  <div className="text-xs text-[#888780] mt-1 font-sans">
                    Lead over second place
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Below the Fold: Filter Bar & Top 20 Ranked List with Sparklines */}
          <div className="pt-8 border-t border-[#2C2C2A] space-y-5">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h2 className="font-serif text-2xl font-medium text-[#F1EFE8]">
                  Standings at matchweek {selectedWeek}
                </h2>
                <p className="text-xs text-[#888780] mt-0.5 font-sans">
                  Top performers ordered by total contributions at this stage of the campaign.
                </p>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-2 text-xs font-sans">
                <select
                  value={selectedLeague}
                  onChange={(e) => setSelectedLeague(e.target.value)}
                  className="bg-[#181816] border border-[#2C2C2A] text-[#F1EFE8] px-3 py-1.5 focus:outline-none focus:border-[#C9A24B]"
                >
                  <option value="all">All top-5 leagues</option>
                  <option value="ENG-Premier League">Premier League</option>
                  <option value="ESP-La Liga">La Liga</option>
                  <option value="GER-Bundesliga">Bundesliga</option>
                  <option value="FRA-Ligue 1">Ligue 1</option>
                  <option value="ITA-Serie A">Serie A</option>
                </select>

                <select
                  value={selectedPosition}
                  onChange={(e) => setSelectedPosition(e.target.value)}
                  className="bg-[#181816] border border-[#2C2C2A] text-[#F1EFE8] px-3 py-1.5 focus:outline-none focus:border-[#C9A24B]"
                >
                  <option value="all">All positions</option>
                  <option value="Forward">Forwards</option>
                  <option value="Midfielder">Midfielders</option>
                  <option value="Defender">Defenders</option>
                </select>

                <select
                  value={minMinutes}
                  onChange={(e) => setMinMinutes(Number(e.target.value))}
                  className="bg-[#181816] border border-[#2C2C2A] text-[#F1EFE8] px-3 py-1.5 focus:outline-none focus:border-[#C9A24B]"
                >
                  <option value={0}>No min minutes</option>
                  <option value={270}>270+ mins</option>
                  <option value={450}>450+ mins</option>
                  <option value={720}>720+ mins</option>
                </select>
              </div>
            </div>

            {/* Ranked Table with Sparkline Per Player */}
            <div className="border border-[#2C2C2A] overflow-hidden">
              <table className="w-full text-left font-sans text-xs">
                <thead>
                  <tr className="border-b border-[#2C2C2A] bg-[#161614] text-[#888780] uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-4 w-10 text-center">#</th>
                    <th className="py-3 px-4">Player</th>
                    <th className="py-3 px-4">Club</th>
                    <th className="py-3 px-4 w-28 text-center hidden md:table-cell">Trajectory</th>
                    <th className="py-3 px-4 text-center">Goals</th>
                    <th className="py-3 px-4 text-center">Assists</th>
                    <th className="py-3 px-4 text-center font-medium text-[#F1EFE8]">G+A</th>
                    <th className="py-3 px-4 text-right hidden sm:table-cell">Minutes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#222220]">
                  {rankedAtWeek.slice(0, 20).map((p, idx) => {
                    const isLeader = idx === 0;

                    // Sparkline SVG path
                    const sparkMax = Math.max(1, p.cum_contributions);
                    const sparkPts = p.history.map((h, i) => {
                      const sx = p.history.length > 1 ? (i / (p.history.length - 1)) * 72 + 4 : 40;
                      const sy = 18 - (h.value / sparkMax) * 14;
                      return { sx, sy };
                    });
                    const sparkD =
                      sparkPts.length > 1
                        ? sparkPts.reduce((acc, pt, i) => (i === 0 ? `M ${pt.sx} ${pt.sy}` : `${acc} L ${pt.sx} ${pt.sy}`), '')
                        : '';
                    const lastSpark = sparkPts[sparkPts.length - 1];

                    return (
                      <tr
                        key={p.player_id}
                        onClick={() => router.push(`/player/${p.player_id}`)}
                        className="hover:bg-[#181816] cursor-pointer transition-colors"
                      >
                        <td className="py-3 px-4 text-center text-[#888780] font-sans">
                          {idx + 1}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`font-medium ${
                              isLeader ? 'text-[#C9A24B]' : 'text-[#F1EFE8]'
                            } hover:underline`}
                          >
                            {p.name}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-[#B4B2A9]">
                          <span>{p.team}</span>
                          <span className="text-[10px] text-[#888780] block sm:inline sm:ml-2">
                            {p.league.replace(/^[A-Z]{3}-/, '')}
                          </span>
                        </td>

                        {/* Sparkline column */}
                        <td className="py-3 px-4 hidden md:table-cell text-center">
                          <svg className="w-20 h-5 inline-block" viewBox="0 0 80 20">
                            {sparkD && (
                              <path
                                d={sparkD}
                                fill="none"
                                stroke={isLeader ? '#C9A24B' : '#666662'}
                                strokeWidth="1.4"
                                strokeLinecap="round"
                              />
                            )}
                            {lastSpark && (
                              <circle
                                cx={lastSpark.sx}
                                cy={lastSpark.sy}
                                r="2"
                                fill={isLeader ? '#C9A24B' : '#888780'}
                              />
                            )}
                          </svg>
                        </td>

                        <td className="py-3 px-4 text-center text-[#B4B2A9]">
                          {p.cum_goals}
                        </td>
                        <td className="py-3 px-4 text-center text-[#B4B2A9]">
                          {p.cum_assists}
                        </td>
                        <td
                          className={`py-3 px-4 text-center font-serif text-sm font-medium ${
                            isLeader ? 'text-[#C9A24B]' : 'text-[#F1EFE8]'
                          }`}
                        >
                          {p.cum_contributions}
                        </td>
                        <td className="py-3 px-4 text-right text-[#888780] hidden sm:table-cell font-sans">
                          {p.cum_minutes}′
                        </td>
                      </tr>
                    );
                  })}
                  {rankedAtWeek.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-[#888780]">
                        No players match the selected filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
