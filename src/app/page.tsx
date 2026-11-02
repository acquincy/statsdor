'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { PlayerSeasonTotal } from '@/types/database';
import {
  Trophy,
  Search,
  Filter,
  ArrowUpDown,
  Sparkles,
  ChevronRight,
  GitCompare,
  Flame,
} from 'lucide-react';

export default function LeaderboardPage() {
  const router = useRouter();
  const [players, setPlayers] = useState<PlayerSeasonTotal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedSeason, setSelectedSeason] = useState<number | 'all'>(2026);
  const [selectedPosition, setSelectedPosition] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [minMinutes, setMinMinutes] = useState<number>(0);
  const [sortBy, setSortBy] = useState<keyof PlayerSeasonTotal>('goals');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  // Compare selection
  const [compareIds, setCompareIds] = useState<string[]>([]);

  useEffect(() => {
    async function fetchLeaderboard() {
      setLoading(true);
      setError(null);
      try {
        const { data, error } = await supabase
          .from('player_season_totals')
          .select('*')
          .order('goals', { ascending: false });

        if (error) {
          setError(error.message);
        } else if (data) {
          setPlayers(data as PlayerSeasonTotal[]);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load leaderboard data.');
      } finally {
        setLoading(false);
      }
    }

    fetchLeaderboard();
  }, []);

  const filteredPlayers = useMemo(() => {
    return players
      .filter((p) => {
        if (selectedSeason !== 'all' && p.season !== selectedSeason) return false;
        if (
          selectedPosition !== 'all' &&
          !p.position.toLowerCase().includes(selectedPosition.toLowerCase())
        ) {
          return false;
        }
        if (minMinutes > 0 && p.minutes < minMinutes) return false;
        if (searchQuery.trim() !== '') {
          const q = searchQuery.toLowerCase();
          return p.name.toLowerCase().includes(q) || p.teams.toLowerCase().includes(q);
        }
        return true;
      })
      .sort((a, b) => {
        const valA = Number(a[sortBy]) || 0;
        const valB = Number(b[sortBy]) || 0;
        return sortOrder === 'desc' ? valB - valA : valA - valB;
      });
  }, [players, selectedSeason, selectedPosition, minMinutes, searchQuery, sortBy, sortOrder]);

  const handleSort = (field: keyof PlayerSeasonTotal) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const toggleCompare = (playerId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCompareIds((prev) => {
      if (prev.includes(playerId)) {
        return prev.filter((id) => id !== playerId);
      }
      if (prev.length >= 2) {
        return [prev[1], playerId]; // Keep at most 2
      }
      return [...prev, playerId];
    });
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950/40 border border-slate-800 p-6 sm:p-8 shadow-xl">
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold mb-3">
            <Flame className="w-3.5 h-3.5 text-emerald-400" />
            <span>Live 2026 Season Tracking</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
            Premier League Leaderboards
          </h1>
          <p className="mt-2 text-slate-400 text-sm sm:text-base leading-relaxed">
            Cumulative player season totals, expected goals (xG), and per-90 rates. Click any
            player for career history and progression charts.
          </p>
        </div>
      </div>

      {/* Control Bar: Filters & Search */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-slate-900/80 p-4 rounded-xl border border-slate-800">
        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
          <input
            type="text"
            placeholder="Search player or team..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
          />
        </div>

        {/* Season Filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Season</span>
          <select
            value={selectedSeason}
            onChange={(e) =>
              setSelectedSeason(e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10))
            }
            className="flex-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-emerald-500 transition"
          >
            <option value={2026}>Current Season (2026)</option>
            <option value={2025}>2025 Season</option>
            <option value="all">All Seasons</option>
          </select>
        </div>

        {/* Position Filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Position</span>
          <select
            value={selectedPosition}
            onChange={(e) => setSelectedPosition(e.target.value)}
            className="flex-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-emerald-500 transition"
          >
            <option value="all">All Positions</option>
            <option value="Forward">Forwards</option>
            <option value="Midfielder">Midfielders</option>
            <option value="Defender">Defenders</option>
            <option value="Goalkeeper">Goalkeepers</option>
          </select>
        </div>

        {/* Min Minutes */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Min Mins</span>
          <select
            value={minMinutes}
            onChange={(e) => setMinMinutes(parseInt(e.target.value, 10))}
            className="flex-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-emerald-500 transition"
          >
            <option value={0}>Any Minutes</option>
            <option value={300}>300+ mins</option>
            <option value={500}>500+ mins</option>
            <option value={1000}>1000+ mins</option>
          </select>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Loading player data from Supabase...</span>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-rose-400">
            <p className="text-sm font-semibold">Error: {error}</p>
          </div>
        ) : filteredPlayers.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <p className="text-sm">No players match the selected filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-950/80 text-slate-400 text-xs uppercase tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3.5 pl-4 pr-2 w-12 text-center">Compare</th>
                  <th className="py-3.5 px-3">#</th>
                  <th className="py-3.5 px-4 cursor-pointer" onClick={() => handleSort('name')}>
                    <div className="flex items-center gap-1.5 hover:text-white">
                      <span>Player</span>
                      <ArrowUpDown className="w-3.5 h-3.5" />
                    </div>
                  </th>
                  <th className="py-3.5 px-3">Team</th>
                  <th className="py-3.5 px-3">Season</th>
                  <th className="py-3.5 px-3 cursor-pointer" onClick={() => handleSort('appearances')}>
                    <div className="flex items-center gap-1 hover:text-white">
                      <span>Apps</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="py-3.5 px-3 cursor-pointer" onClick={() => handleSort('minutes')}>
                    <div className="flex items-center gap-1 hover:text-white">
                      <span>Mins</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="py-3.5 px-3 cursor-pointer text-emerald-400" onClick={() => handleSort('goals')}>
                    <div className="flex items-center gap-1 font-bold">
                      <span>Goals</span>
                      <ArrowUpDown className="w-3.5 h-3.5" />
                    </div>
                  </th>
                  <th className="py-3.5 px-3 cursor-pointer" onClick={() => handleSort('assists')}>
                    <div className="flex items-center gap-1 hover:text-white">
                      <span>Assists</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="py-3.5 px-3 cursor-pointer" onClick={() => handleSort('xg')}>
                    <div className="flex items-center gap-1 hover:text-white">
                      <span>xG</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="py-3.5 px-3 cursor-pointer" onClick={() => handleSort('goals_per90')}>
                    <div className="flex items-center gap-1 hover:text-white">
                      <span>G/90</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="py-3.5 px-3 cursor-pointer" onClick={() => handleSort('xg_per90')}>
                    <div className="flex items-center gap-1 hover:text-white">
                      <span>xG/90</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="py-3.5 pr-4 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredPlayers.map((player, idx) => {
                  const isCompared = compareIds.includes(player.player_id);
                  return (
                    <tr
                      key={`${player.player_id}-${player.season}`}
                      onClick={() => router.push(`/player/${player.player_id}`)}
                      className={`hover:bg-slate-800/40 cursor-pointer transition-colors ${
                        isCompared ? 'bg-emerald-950/20' : ''
                      }`}
                    >
                      <td className="py-3 pl-4 pr-2 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isCompared}
                          onChange={(e) => toggleCompare(player.player_id, e as any)}
                          className="w-4 h-4 rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-slate-900 bg-slate-950 cursor-pointer"
                        />
                      </td>
                      <td className="py-3 px-3 text-slate-500 font-mono text-xs">{idx + 1}</td>
                      <td className="py-3 px-4 font-semibold text-slate-100 flex items-center gap-2">
                        <span>{player.name}</span>
                        <span className="text-[11px] font-normal text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">
                          {player.position}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-300 font-medium">{player.teams}</td>
                      <td className="py-3 px-3">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            player.season === 2026
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {player.season}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-300">{player.appearances}</td>
                      <td className="py-3 px-3 text-slate-400 font-mono text-xs">{player.minutes}</td>
                      <td className="py-3 px-3 font-bold text-emerald-400 text-base">
                        {player.goals}
                      </td>
                      <td className="py-3 px-3 text-slate-200 font-medium">{player.assists}</td>
                      <td className="py-3 px-3 text-teal-400 font-mono text-xs">{player.xg}</td>
                      <td className="py-3 px-3 text-emerald-400 font-mono text-xs">
                        {player.goals_per90}
                      </td>
                      <td className="py-3 px-3 text-teal-400 font-mono text-xs">
                        {player.xg_per90}
                      </td>
                      <td className="py-3 pr-4 text-right">
                        <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-white transition" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Floating Compare Action Bar */}
      {compareIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 border border-emerald-500/40 text-slate-100 px-5 py-3 rounded-full shadow-2xl flex items-center gap-4 animate-in fade-in slide-in-from-bottom-4">
          <span className="text-xs font-medium text-emerald-400 flex items-center gap-1.5">
            <GitCompare className="w-4 h-4" />
            <span>{compareIds.length} player(s) selected</span>
          </span>
          <div className="h-4 w-px bg-slate-700" />
          <button
            onClick={() => {
              if (compareIds.length === 1) {
                router.push(`/compare?p1=${compareIds[0]}`);
              } else {
                router.push(`/compare?p1=${compareIds[0]}&p2=${compareIds[1]}`);
              }
            }}
            className="px-4 py-1.5 rounded-full bg-emerald-500 text-slate-950 font-bold text-xs hover:bg-emerald-400 transition"
          >
            Compare Now
          </button>
          <button
            onClick={() => setCompareIds([])}
            className="text-xs text-slate-400 hover:text-white transition"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
