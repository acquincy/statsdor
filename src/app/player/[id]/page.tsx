'use client';

import { useEffect, useState, Suspense } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { PlayerSeasonTotal, PlayerStatsSnapshot } from '@/types/database';
import {
  ArrowLeft,
  Flame,
  Target,
  Zap,
  Clock,
  Shield,
  Trophy,
  GitCompare,
  TrendingUp,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';

function PlayerContent() {
  const params = useParams();
  const router = useRouter();
  const playerId = params.id as string;

  const [seasons, setSeasons] = useState<PlayerSeasonTotal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchPlayer() {
      if (!playerId) return;
      setLoading(true);
      setError(null);
      try {
        const { data, error } = await supabase
          .from('player_season_totals')
          .select('*')
          .eq('player_id', playerId)
          .order('season', { ascending: false });

        if (error) {
          setError(error.message);
        } else if (data) {
          setSeasons(data as PlayerSeasonTotal[]);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load player details.');
      } finally {
        setLoading(false);
      }
    }

    fetchPlayer();
  }, [playerId]);

  if (loading) {
    return (
      <div className="p-16 text-center text-slate-400 flex flex-col items-center justify-center gap-3">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">Loading player profile...</span>
      </div>
    );
  }

  if (error || seasons.length === 0) {
    return (
      <div className="space-y-4">
        <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Leaderboard
        </Link>
        <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-xl">
          <p className="text-rose-400 font-semibold">{error || 'Player not found.'}</p>
        </div>
      </div>
    );
  }

  const latestSeason = seasons[0];
  const playerName = latestSeason.name;
  const currentTeam = latestSeason.teams;
  const position = latestSeason.position;

  // Chart data formatted chronologically (oldest to newest)
  const chartData = [...seasons]
    .sort((a, b) => a.season - b.season)
    .map((s) => ({
      season: `${s.season}`,
      goals: s.goals,
      assists: s.assists,
      xg: s.xg,
      goals_per90: s.goals_per90,
    }));

  return (
    <div className="space-y-6">
      {/* Top Navigation */}
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-white transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Leaderboards</span>
        </Link>
        <button
          onClick={() => router.push(`/compare?p1=${playerId}`)}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-semibold text-teal-400 hover:border-teal-500/50 transition"
        >
          <GitCompare className="w-3.5 h-3.5" />
          <span>Compare this Player</span>
        </button>
      </div>

      {/* Header Profile Card */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-emerald-950/30 border border-slate-800 p-6 sm:p-8 shadow-xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                {currentTeam}
              </span>
              <span className="text-xs text-slate-400 font-medium">{position}</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
              {playerName}
            </h1>
            <p className="text-xs text-slate-500">
              Player ID: <span className="font-mono text-slate-400">{playerId}</span> • Premier League
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-2.5 text-center">
              <span className="block text-2xl font-black text-emerald-400">{latestSeason.goals}</span>
              <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                {latestSeason.season} Goals
              </span>
            </div>
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-2.5 text-center">
              <span className="block text-2xl font-black text-teal-400">{latestSeason.xg}</span>
              <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                {latestSeason.season} xG
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Season Totals Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 text-center">
          <span className="block text-xl font-bold text-slate-100">{latestSeason.appearances}</span>
          <span className="text-[11px] text-slate-400 uppercase font-medium">Appearances</span>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 text-center">
          <span className="block text-xl font-bold text-slate-100">{latestSeason.minutes}</span>
          <span className="text-[11px] text-slate-400 uppercase font-medium">Minutes</span>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 text-center">
          <span className="block text-xl font-bold text-emerald-400">{latestSeason.goals}</span>
          <span className="text-[11px] text-slate-400 uppercase font-medium">Goals</span>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 text-center">
          <span className="block text-xl font-bold text-slate-100">{latestSeason.assists}</span>
          <span className="text-[11px] text-slate-400 uppercase font-medium">Assists</span>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 text-center">
          <span className="block text-xl font-bold text-emerald-400 font-mono">
            {latestSeason.goals_per90}
          </span>
          <span className="text-[11px] text-slate-400 uppercase font-medium">Goals / 90</span>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 text-center">
          <span className="block text-xl font-bold text-teal-400 font-mono">
            {latestSeason.xg_per90}
          </span>
          <span className="text-[11px] text-slate-400 uppercase font-medium">xG / 90</span>
        </div>
      </div>

      {/* Multi-Season Trend Chart */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <h2 className="font-bold text-sm text-slate-100">Season Progression Over Time</h2>
          </div>
          <span className="text-xs text-slate-400">Goals & Expected Goals (xG)</span>
        </div>

        <div className="h-64 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="season" stroke="#64748b" fontSize={12} />
              <YAxis stroke="#64748b" fontSize={12} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  borderColor: '#334155',
                  borderRadius: '0.75rem',
                  fontSize: '12px',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
              <Bar dataKey="goals" name="Goals" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="xg" name="Expected Goals (xG)" fill="#14b8a6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* All Seasons Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-800 flex items-center gap-2">
          <Trophy className="w-4 h-4 text-emerald-400" />
          <h2 className="font-bold text-sm text-slate-100">Career Season Breakdown</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-950/80 text-slate-400 text-xs uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Season</th>
                <th className="py-3 px-3">Team</th>
                <th className="py-3 px-3">Apps (Starts)</th>
                <th className="py-3 px-3">Minutes</th>
                <th className="py-3 px-3 text-emerald-400">Goals</th>
                <th className="py-3 px-3">Assists</th>
                <th className="py-3 px-3">xG</th>
                <th className="py-3 px-3">Shots</th>
                <th className="py-3 px-3">G/90</th>
                <th className="py-3 px-3">xG/90</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-xs">
              {seasons.map((s) => (
                <tr key={s.season} className="hover:bg-slate-800/30">
                  <td className="py-3 px-4 font-bold text-slate-100">{s.season}</td>
                  <td className="py-3 px-3 text-slate-300 font-sans">{s.teams}</td>
                  <td className="py-3 px-3 text-slate-300">
                    {s.appearances} ({s.starts})
                  </td>
                  <td className="py-3 px-3 text-slate-400">{s.minutes}</td>
                  <td className="py-3 px-3 font-bold text-emerald-400 text-sm">{s.goals}</td>
                  <td className="py-3 px-3 text-slate-200">{s.assists}</td>
                  <td className="py-3 px-3 text-teal-400">{s.xg}</td>
                  <td className="py-3 px-3 text-slate-400">{s.shots}</td>
                  <td className="py-3 px-3 text-emerald-400">{s.goals_per90}</td>
                  <td className="py-3 px-3 text-teal-400">{s.xg_per90}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function PlayerPage() {
  return (
    <Suspense
      fallback={
        <div className="p-16 text-center text-slate-400 flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Loading player profile...</span>
        </div>
      }
    >
      <PlayerContent />
    </Suspense>
  );
}
