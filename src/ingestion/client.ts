import { ApiPlayersResponse, ApiPlayersResponseSchema } from '../schemas/api-football';

export interface RateLimitInfo {
  remaining: number | null;
  limit: number | null;
}

export class ApiFootballClient {
  private apiKey: string;
  private baseUrl: string;
  private minIntervalMs: number;
  private lastRequestTime: number = 0;
  public lastRateLimit: RateLimitInfo = { remaining: null, limit: null };

  constructor(options?: { apiKey?: string; baseUrl?: string; minIntervalMs?: number }) {
    this.apiKey = options?.apiKey || process.env.API_FOOTBALL_KEY || '';
    this.baseUrl = options?.baseUrl || process.env.API_FOOTBALL_BASE_URL || 'https://v3.football.api-sports.io';
    this.minIntervalMs = options?.minIntervalMs ?? 6500; // 6.5s throttle to stay well below 10/min cap

    if (!this.apiKey) {
      throw new Error('API_FOOTBALL_KEY is required but not set in environment.');
    }
  }

  private async throttle(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.minIntervalMs) {
      const waitTime = this.minIntervalMs - elapsed;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
    this.lastRequestTime = Date.now();
  }

  async fetchPlayersPage(league: number, season: number, page: number): Promise<ApiPlayersResponse> {
    await this.throttle();

    const url = `${this.baseUrl}/players?league=${league}&season=${season}&page=${page}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-apisports-key': this.apiKey,
      },
    });

    const remainingHeader = response.headers.get('x-ratelimit-requests-remaining');
    const limitHeader = response.headers.get('x-ratelimit-requests-limit');

    this.lastRateLimit = {
      remaining: remainingHeader !== null ? parseInt(remainingHeader, 10) : null,
      limit: limitHeader !== null ? parseInt(limitHeader, 10) : null,
    };

    if (!response.ok) {
      throw new Error(`API-Football HTTP error: ${response.status} ${response.statusText}`);
    }

    const json = await response.json();

    // Check for API-specific error objects
    if (json.errors && !Array.isArray(json.errors) && Object.keys(json.errors).length > 0) {
      const errorMsg = Object.entries(json.errors)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
      throw new Error(`API-Football error: ${errorMsg}`);
    }

    // Validate with Zod schema
    const parseResult = ApiPlayersResponseSchema.safeParse(json);
    if (!parseResult.success) {
      const errorDetails = JSON.stringify(parseResult.error.format(), null, 2);
      throw new Error(`API response validation failed:\n${errorDetails}`);
    }

    return parseResult.data;
  }
}
