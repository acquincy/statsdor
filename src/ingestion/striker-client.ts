import {
  StrikerPlayerResponse,
  StrikerPlayerResponseSchema,
  StrikerSquadResponse,
  StrikerSquadResponseSchema,
} from '../schemas/striker';

export interface StrikerCreditInfo {
  remaining: number | null;
  used: number | null;
}

export class StrikerClient {
  private apiKey: string;
  private baseUrl: string;
  public lastCreditInfo: StrikerCreditInfo = { remaining: null, used: null };

  constructor(options?: { apiKey?: string; baseUrl?: string }) {
    this.apiKey = options?.apiKey || process.env.STRIKER_API_KEY || '';
    this.baseUrl = options?.baseUrl || process.env.STRIKER_BASE_URL || 'https://mcp.strikerapi.com';

    if (!this.apiKey) {
      throw new Error('STRIKER_API_KEY is not set in environment.');
    }
  }

  private async request<T>(endpoint: string, body: Record<string, unknown>): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
      },
      body: JSON.stringify(body),
    });

    const remaining = response.headers.get('x-credits-remaining');
    const used = response.headers.get('x-credits-used');
    this.lastCreditInfo = {
      remaining: remaining !== null ? parseInt(remaining, 10) : null,
      used: used !== null ? parseInt(used, 10) : null,
    };

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`StrikerAPI HTTP error ${response.status}: ${errorText}`);
    }

    return (await response.json()) as T;
  }

  async getSquad(league: string = 'soccer', team?: string): Promise<StrikerSquadResponse['data']> {
    const body: Record<string, unknown> = { league };
    if (team) body.team = team;

    const data = await this.request<unknown>('/v1/get_squad', body);
    const parsed = StrikerSquadResponseSchema.safeParse(data);
    if (!parsed.success) {
      throw new Error(`Invalid squad response: ${JSON.stringify(parsed.error.issues, null, 2)}`);
    }
    return parsed.data.data;
  }

  async getPlayer(playerId: string, league: string = 'soccer'): Promise<StrikerPlayerResponse['data']> {
    const data = await this.request<unknown>('/v1/get_player', {
      player_id: playerId,
      league,
    });
    const parsed = StrikerPlayerResponseSchema.safeParse(data);
    if (!parsed.success) {
      throw new Error(`Invalid player response: ${JSON.stringify(parsed.error.issues, null, 2)}`);
    }
    return parsed.data.data;
  }

  async getLeaders(
    stat: string = 'goals',
    season?: number,
    league: string = 'soccer',
    limit: number = 50
  ) {
    const body: Record<string, unknown> = {
      stat,
      league,
      limit,
    };
    if (season) body.season = season;

    return await this.request<{ data: any }>('/v1/get_leaders', body);
  }
}
