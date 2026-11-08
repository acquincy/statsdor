import { supabase } from './supabase';
import { Player, PlayerMatch, PlayerMatchweekStat, PlayerRaceSummary, PlayerSeasonTotal } from '@/types/database';

export interface RaceFilterOptions {
  league?: string; // 'all' or 'ENG-Premier League', etc.
  position?: string; // 'all', 'Forward', 'Midfielder', 'Defender'
  minMinutes?: number;
}

export async function fetchRaceSummaries(options: RaceFilterOptions = {}) {
  const { league = 'all', position = 'all', minMinutes = 0 } = options;

  let query = supabase
    .from('player_race_summary')
    .select('*')
    .order('total_contributions', { ascending: false });

  if (league !== 'all') {
    query = query.eq('league', league);
  }
  if (position !== 'all') {
    query = query.ilike('position_category', `%${position}%`);
  }
  if (minMinutes > 0) {
    query = query.gte('total_minutes', minMinutes);
  }

  // Fetch top 100 candidates to rank and display accurately across all matchweeks
  query = query.limit(100);

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  return (data || []) as PlayerRaceSummary[];
}

export async function fetchPlayerProfile(playerId: string) {
  const [playerRes, matchesRes, mwRes] = await Promise.all([
    supabase
      .from('players')
      .select('*')
      .eq('player_id', playerId)
      .maybeSingle(),
    supabase
      .from('player_matches')
      .select('*')
      .eq('player_id', playerId)
      .order('date', { ascending: true }),
    supabase
      .from('player_matchweek_cumulative')
      .select('*')
      .eq('player_id', playerId)
      .order('matchweek', { ascending: true }),
  ]);

  if (playerRes.error) throw playerRes.error;
  if (matchesRes.error) throw matchesRes.error;
  if (mwRes.error) throw mwRes.error;

  return {
    player: playerRes.data as Player | null,
    matches: (matchesRes.data || []) as PlayerMatch[],
    matchweeks: (mwRes.data || []) as PlayerMatchweekStat[],
  };
}

export async function fetchComparePlayers(playerIds: string[]) {
  if (playerIds.length === 0) return [];

  const { data, error } = await supabase
    .from('player_race_summary')
    .select('*')
    .in('player_id', playerIds);

  if (error) throw error;
  return (data || []) as PlayerRaceSummary[];
}

export async function searchAllPlayers(queryStr: string = '') {
  let query = supabase
    .from('player_season_totals')
    .select('player_id, name, teams, league, position, goals, assists, minutes')
    .order('goals', { ascending: false })
    .limit(50);

  if (queryStr.trim().length > 0) {
    query = query.ilike('name', `%${queryStr.trim()}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as (PlayerSeasonTotal & { teams: string })[];
}
