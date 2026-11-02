'use client';

import { useEffect, useState, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { PlayerSeasonTotal } from '@/types/database';
import {
  ArrowLeft,
  GitCompare,
  Trophy,
  Flame,
  Award,
  Zap,
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

function CompareContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const initialP1 = searchParams.get('p1') || '';
  const initialP2 = searchParams.get('p2') || '';

  const [allPlayers, setAllPlayers] = useState<PlayerSeasonTotal[]>([]);
  const [selectedP1, setSelectedP1] = useState<string>(initialP1);
  const [selectedP2, setSelectedP2] = useState<string>(initialP2);
  const [seasonFilter, setSeasonFilter] = useState<number>(2026);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadAll() {
      setLoading(true);
      try {
        const { data } = await supabase
          .from('player_season_totals')
          .select('*')
          .order('name', { ascending: true });

        if (data) {
          setAllPlayers(data as PlayerSeasonTotal[]);

          // If no initial params, default to first two available players
          if (!initialP1 && data.length > 0) {
            setSelectedP1(data[0].player_id);
          }
          if (!initialP2 && data.length > 1) {
            setSelectedP2(data[1].player_id);
          }
        }
      } finally {
        setLoading(false);
      }
    }
    loadAll();
  }, []);

  const p1Data = useMemo(() => {
    return allPlayers.find((p) => p.player_id === selectedP1 && p.season === seasonFilter) ||
      allPlayers.find((p) => p.player_id === selectedP1);
  }, [allPlayers, selectedP1, seasonFilter]);

  const p2Data = useMemo(() => {
    return allPlayers.find((p) => p.player_id === selectedP2 && p.season === seasonFilter) ||
      allPlayers.find((p) => p.player_id === selectedP2);
  }, [allPlayers, selectedP2, seasonFilter]);

  // Unique players list for dropdowns
  const uniquePlayers = useMemo(() => {
    const map = new Map<string, string>();
    allPlayers.forEach((p) => {
      if (!map.has(p.player_id)) {
        map.set(p.player_id, `${p.name} (${p.teams})`);
      }
    });
    return Array.from(map.entries()).map(([id, label]) => ({ id, label }));
  }, [allPlayers]);

  const comparisonMetrics = [
    { label: 'Goals', val1: p1Data?.goals ?? 0, val2: p2Data?.goals ?? 0 },
    { label: 'Assists', val1: p1Data?.assists ?? 0, val2: p2Data?.assists ?? 0 },
    { label: 'Expected Goals (xG)', val1: p1Data?.xg ?? 0, val2: p2Data?.xg ?? 0 },
    { label: 'Goals / 90', val1: p1Data?.goals_per90 ?? 0, val2: p2Data?.goals_per90 ?? 0 },
    { label: 'xG / 90', val1: p1Data?.xg_per90 ?? 0, val2: p2Data?.xg_per90 ?? 0 },
    { label: 'Shots', val1: p1Data?.shots ?? 0, val2: p2Data?.shots ?? 0 },
    { label: 'Shots on Target', val1: p1Data?.shots_on_target ?? 0, val2: p2Data?.shots_on_target ?? 0 },
    { label: 'Minutes', val1: p1Data?.minutes ?? 0, val2: p2Data?.minutes ?? 0 },
    { label: 'Appearances', val1: p1Data?.appearances ?? 0, val2: p2Data?.appearances ?? 0 },
  ];

  const chartData = [
    { metric: 'Goals', [p1Data?.name || 'Player 1']: p1Data?.goals || 0, [p2Data?.name || 'Player 2']: p2Data?.goals || 0 },
    { metric: 'Assists', [p1Data?.name || 'Player 1']: p1Data?.assists || 0, [p2Data?.name || 'Player 2']: p2Data?.assists || 0 },
    { metric: 'xG', [p1Data?.name || 'Player 1']: p1Data?.xg || 0, [p2Data?.name || 'Player 2']: p2Data?.xg || 0 },
    { metric: 'G/90', [p1Data?.name || 'Player 1']: p1Data?.goals_per90 || 0, [p2Data?.name || 'Player 2']: p2Data?.goals_per90 || 0 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-white transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Leaderboards</span>
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Comparing Season:</span>
          <select
            value={seasonFilter}
            onChange={(e) => setSeasonFilter(parseInt(e.target.value, 10))}
            className="px-2.5 py-1 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
          >
            <option value={2026}>2026 (Current)</option>
            <option value={2025}>2025 Season</option>
          </select>
        </div>
      </div>

      {/* Selectors Bar */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Player 1 Selector */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>Player 1</span>
          </label>
          <select
            value={selectedP1}
            onChange={(e) => setSelectedP1(e.target.value)}
            className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-emerald-500 font-medium"
          >
            {uniquePlayers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        {/* Player 2 Selector */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-teal-400 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-teal-400" />
            <span>Player 2</span>
          </label>
          <select
            value={selectedP2}
            onChange={(e) => setSelectedP2(e.target.value)}
            className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-teal-500 font-medium"
          >
            {uniquePlayers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Side-by-Side Head-to-Head Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Player 1 Card */}
        <div className="bg-gradient-to-br from-slate-900 to-emerald-950/20 border border-emerald-500/30 p-6 rounded-2xl shadow-lg relative">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                {p1Data?.teams || 'Team'}
              </span>
              <h2 className="text-2xl font-black text-white mt-0.5">{p1Data?.name || 'Player 1'}</h2>
              <span className="text-xs text-slate-400">{p1Data?.position}</span>
            </div>
            <div className="text-right">
              <span className="text-3xl font-black text-emerald-400">{p1Data?.goals ?? 0}</span>
              <span className="block text-[10px] text-slate-400 uppercase font-semibold">Goals</span>
            </div>
          </div>
        </div>

        {/* Player 2 Card */}
        <div className="bg-gradient-to-br from-slate-900 to-teal-950/20 border border-teal-500/30 p-6 rounded-2xl shadow-lg relative">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs font-semibold text-teal-400 uppercase tracking-wider">
                {p2Data?.teams || 'Team'}
              </span>
              <h2 className="text-2xl font-black text-white mt-0.5">{p2Data?.name || 'Player 2'}</h2>
              <span className="text-xs text-slate-400">{p2Data?.position}</span>
            </div>
            <div className="text-right">
              <span className="text-3xl font-black text-teal-400">{p2Data?.goals ?? 0}</span>
              <span className="block text-[10px] text-slate-400 uppercase font-semibold">Goals</span>
            </div>
          </div>
        </div>
      </div>

      {/* Head-to-Head Metric Bars */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
        <h3 className="font-bold text-sm text-slate-200 border-b border-slate-800 pb-3 flex items-center gap-2">
          <GitCompare className="w-4 h-4 text-emerald-400" />
          <span>Stat Comparison ({seasonFilter} Season)</span>
        </h3>

        <div className="space-y-4 pt-1">
          {comparisonMetrics.map((m) => {
            const total = (Number(m.val1) || 0) + (Number(m.val2) || 0);
            const p1Pct = total > 0 ? ((Number(m.val1) || 0) / total) * 100 : 50;
            const p2Pct = total > 0 ? ((Number(m.val2) || 0) / total) * 100 : 50;
            const p1Leading = Number(m.val1) > Number(m.val2);
            const p2Leading = Number(m.val2) > Number(m.val1);

            return (
              <div key={m.label} className="space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span
                    className={`font-mono font-bold ${
                      p1Leading ? 'text-emerald-400 text-sm' : 'text-slate-400'
                    }`}
                  >
                    {m.val1}
                  </span>
                  <span className="font-semibold text-slate-300 uppercase tracking-wider text-[11px]">
                    {m.label}
                  </span>
                  <span
                    className={`font-mono font-bold ${
                      p2Leading ? 'text-teal-400 text-sm' : 'text-slate-400'
                    }`}
                  >
                    {m.val2}
                  </span>
                </div>
                <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden flex">
                  <div
                    style={{ width: `${p1Pct}%` }}
                    className="bg-emerald-500 transition-all duration-500"
                  />
                  <div
                    style={{ width: `${p2Pct}%` }}
                    className="bg-teal-500 transition-all duration-500"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Visual Bar Comparison Chart */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
        <h3 className="font-bold text-sm text-slate-200">Side-by-Side Chart</h3>
        <div className="h-64 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="metric" stroke="#64748b" fontSize={12} />
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
              <Bar
                dataKey={p1Data?.name || 'Player 1'}
                fill="#10b981"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey={p2Data?.name || 'Player 2'}
                fill="#14b8a6"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense
      fallback={
        <div className="p-16 text-center text-slate-400">Loading comparison...</div>
      }
    >
      <CompareContent />
    </Suspense>
  );
}
