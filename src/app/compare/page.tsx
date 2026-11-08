'use client';

import React, { useEffect, useState, useMemo, Suspense, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { fetchComparePlayers, searchAllPlayers } from '@/lib/queries';
import { PlayerRaceSummary, PlayerSeasonTotal } from '@/types/database';
import { CompareChart, ComparedPlayer } from '@/components/CompareChart';

const COMPARE_COLORS = ['#C9A24B', '#F1EFE8', '#888780'];

function CompareContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const urlP1 = searchParams.get('p1');
  const urlP2 = searchParams.get('p2');
  const urlP3 = searchParams.get('p3');

  // Default to Raphinha and Lamine Yamal
  const [selectedIds, setSelectedIds] = useState<string[]>(() => {
    const ids: string[] = [];
    if (urlP1) ids.push(urlP1);
    if (urlP2) ids.push(urlP2);
    if (urlP3) ids.push(urlP3);
    return ids.length > 0 ? ids : ['231050', '362150'];
  });

  const [allSearchPlayers, setAllSearchPlayers] = useState<(PlayerSeasonTotal & { teams: string })[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [summaries, setSummaries] = useState<PlayerRaceSummary[]>([]);
  const [loading, setLoading] = useState(true);

  // Scrubber & Replay state
  const [selectedWeek, setSelectedWeek] = useState<number>(12);
  const [maxSeasonWeek, setMaxSeasonWeek] = useState<number>(12);
  const [isReplaying, setIsReplaying] = useState<boolean>(false);
  const replayTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Load search list once
  useEffect(() => {
    async function loadSearchList() {
      try {
        const list = await searchAllPlayers();
        setAllSearchPlayers(list);
      } catch (err) {
        console.error('Failed to load search list:', err);
      }
    }
    loadSearchList();
  }, []);

  // Fetch summaries for selected players
  useEffect(() => {
    async function loadData() {
      if (selectedIds.length === 0) return;
      setLoading(true);
      try {
        const data = await fetchComparePlayers(selectedIds);
        setSummaries(data);

        let maxW = 1;
        data.forEach((p) => {
          if (p.max_mw > maxW) maxW = p.max_mw;
        });
        setMaxSeasonWeek(maxW);
        setSelectedWeek(maxW);
      } catch (err) {
        console.error('Failed to load compare data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [selectedIds]);

  // Sync URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedIds[0]) params.set('p1', selectedIds[0]);
    if (selectedIds[1]) params.set('p2', selectedIds[1]);
    if (selectedIds[2]) params.set('p3', selectedIds[2]);
    router.replace(`/compare?${params.toString()}`);
  }, [selectedIds, router]);

  // Handle Replay animation
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
      if (replayTimerRef.current) clearInterval(replayTimerRef.current);
    }

    return () => {
      if (replayTimerRef.current) clearInterval(replayTimerRef.current);
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

  // Prepare compared players at selectedWeek
  const comparedList = useMemo(() => {
    const list: ComparedPlayer[] = [];

    selectedIds.forEach((pid, idx) => {
      const summary = summaries.find((s) => s.player_id === pid);
      if (!summary) return;

      const relevant = summary.weekly_series.filter((pt) => pt.mw <= selectedWeek);
      const currentPt =
        relevant.find((pt) => pt.mw === selectedWeek) ||
        relevant[relevant.length - 1];

      const val = currentPt ? currentPt.cum_c : 0;
      const goals = currentPt ? currentPt.cum_g : 0;
      const assists = currentPt ? currentPt.cum_a : 0;

      list.push({
        player_id: pid,
        name: summary.name,
        team: summary.team,
        league: summary.league,
        currentValue: val,
        goals,
        assists,
        isLeader: false,
        color: COMPARE_COLORS[idx % COMPARE_COLORS.length],
        history: relevant.map((pt) => ({
          matchweek: pt.mw,
          value: pt.cum_c,
        })),
      });
    });

    // Mark leader among compared
    let topVal = -1;
    let topIdx = -1;
    list.forEach((p, idx) => {
      if (p.currentValue > topVal) {
        topVal = p.currentValue;
        topIdx = idx;
      }
    });

    if (topIdx >= 0) {
      list[topIdx].isLeader = true;
      list[topIdx].color = '#C9A24B';
    }

    return list;
  }, [selectedIds, summaries, selectedWeek]);

  // Editorial comparison headline
  const compareHeadline = useMemo(() => {
    if (comparedList.length < 2) return 'Compare player trajectories';
    const sorted = [...comparedList].sort((a, b) => b.currentValue - a.currentValue);
    const p1 = sorted[0];
    const p2 = sorted[1];
    const gap = p1.currentValue - p2.currentValue;

    if (gap === 0) {
      return `${p1.name} and ${p2.name} level on ${p1.currentValue} at matchweek ${selectedWeek}`;
    }
    if (gap === 1) {
      return `${p1.name} leads ${p2.name} by a single contribution`;
    }
    return `${p1.name} holds a ${gap}-point lead over ${p2.name} at matchweek ${selectedWeek}`;
  }, [comparedList, selectedWeek]);

  const addPlayer = (pid: string) => {
    if (selectedIds.includes(pid)) return;
    if (selectedIds.length >= 3) {
      setSelectedIds([selectedIds[0], selectedIds[1], pid]);
    } else {
      setSelectedIds([...selectedIds, pid]);
    }
    setSearchQuery('');
  };

  const removePlayer = (pid: string) => {
    if (selectedIds.length <= 1) return;
    setSelectedIds(selectedIds.filter((id) => id !== pid));
  };

  const filteredSearch = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return allSearchPlayers
      .filter((p) => p.name.toLowerCase().includes(q) && !selectedIds.includes(p.player_id))
      .slice(0, 6);
  }, [allSearchPlayers, searchQuery, selectedIds]);

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Editorial Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-xs text-[#888780] hover:text-[#F1EFE8] font-sans">
            ← The race
          </Link>
          <span className="text-[#2C2C2A]">/</span>
          <div className="text-[11px] uppercase tracking-widest text-[#888780] font-sans">
            Head to head · matchweek {selectedWeek}
          </div>
        </div>

        <h1 className="font-serif text-3xl sm:text-5xl font-medium tracking-tight text-[#F1EFE8] leading-tight">
          {compareHeadline}
        </h1>
        <p className="text-xs sm:text-sm text-[#B4B2A9] font-sans">
          Cumulative goals and assists trajectories evaluated week by week.
        </p>
      </div>

      {/* Player Chips & Search Picker */}
      <div className="flex flex-wrap items-center gap-3 pt-1">
        {comparedList.map((p) => (
          <div
            key={p.player_id}
            className="flex items-center gap-2 px-3 py-1.5 bg-[#181816] border border-[#2C2C2A] text-xs font-sans text-[#F1EFE8]"
          >
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: p.color }}
            />
            <span className="font-medium">{p.name}</span>
            <span className="text-[#888780]">({p.team})</span>
            {selectedIds.length > 1 && (
              <button
                onClick={() => removePlayer(p.player_id)}
                className="text-[#888780] hover:text-[#F1EFE8] ml-1 font-mono text-sm leading-none cursor-pointer"
              >
                ×
              </button>
            )}
          </div>
        ))}

        {selectedIds.length < 3 && (
          <div className="relative">
            <input
              type="text"
              placeholder="+ Add player..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-[#141412] border border-[#2C2C2A] text-xs text-[#F1EFE8] px-3 py-1.5 placeholder-[#666663] focus:outline-none focus:border-[#C9A24B] w-40"
            />
            {filteredSearch.length > 0 && (
              <div className="absolute top-full left-0 mt-1 w-64 bg-[#181816] border border-[#2C2C2A] z-20 shadow-lg divide-y divide-[#242422]">
                {filteredSearch.map((p) => (
                  <button
                    key={p.player_id}
                    onClick={() => addPlayer(p.player_id)}
                    className="w-full text-left px-3 py-2 text-xs text-[#F1EFE8] hover:bg-[#20201D] flex items-center justify-between cursor-pointer"
                  >
                    <span>{p.name}</span>
                    <span className="text-[#888780] text-[10px]">{p.teams}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <div className="py-24 text-center text-[#888780] font-sans text-sm">
          Loading comparison data...
        </div>
      ) : (
        <div className="space-y-6">
          {/* Compare Chart */}
          <CompareChart
            players={comparedList}
            selectedWeek={selectedWeek}
            maxWeek={maxSeasonWeek}
          />

          {/* Matchweek Scrubber & Replay Bar */}
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
                Evaluating matchweek {selectedWeek} of {maxSeasonWeek}
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

          {/* Big Numbers Comparison Row */}
          <div className={`grid grid-cols-1 sm:grid-cols-${Math.min(3, comparedList.length)} gap-6 pt-5 border-t border-[#2C2C2A]`}>
            {comparedList.map((p) => (
              <div key={p.player_id} className="p-5 bg-[#141412] border border-[#2C2C2A] space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-serif text-xl font-medium text-[#F1EFE8]">
                      {p.name}
                    </h3>
                    <div className="text-xs text-[#888780]">{p.team}</div>
                  </div>
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: p.color }}
                  />
                </div>

                <div className="pt-2 border-t border-[#222220] grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-[#888780]">G+A</div>
                    <div
                      className="font-serif text-3xl font-medium mt-0.5"
                      style={{ color: p.color }}
                    >
                      {p.currentValue}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-[#888780]">Goals</div>
                    <div className="font-serif text-2xl font-medium text-[#F1EFE8] mt-1">
                      {p.goals}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-[#888780]">Assists</div>
                    <div className="font-serif text-2xl font-medium text-[#F1EFE8] mt-1">
                      {p.assists}
                    </div>
                  </div>
                </div>

                <div className="pt-2 text-right">
                  <Link
                    href={`/player/${p.player_id}`}
                    className="text-[11px] text-[#C9A24B] hover:underline font-sans"
                  >
                    View player dossier →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense
      fallback={
        <div className="py-24 text-center text-[#888780] font-sans text-sm">
          Loading comparison...
        </div>
      }
    >
      <CompareContent />
    </Suspense>
  );
}
