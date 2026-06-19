import type { LatestMatch, LeaderboardRow, Match, Outcome, Prediction, SessionState } from './types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {})
      }
    });
  } catch {
    throw new ApiError('Cannot connect to API. Make sure the backend is running.', 0);
  }

  const text = await response.text();
  const data = text ? safeJsonParse(text) : {};

  if (!response.ok) {
    throw new ApiError(getApiErrorMessage(data.error, response.status), response.status);
  }

  return data as T;
}

function getApiErrorMessage(error: unknown, status: number): string {
  const message = typeof error === 'string' ? error : '';
  if (status === 422 && message.toLowerCase().includes('display name')) return 'Invalid Display Name';
  return message || `Request failed: ${status}`;
}

function safeJsonParse(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export async function lookupLeague(inviteCode: string) {
  return request<{ leagueName: string }>(`/api/leagues/lookup?inviteCode=${encodeURIComponent(inviteCode)}`);
}

export async function createLeague(name: string, adminPin: string) {
  return request<{ leagueId: string; leagueName: string; inviteCode: string; adminToken: string }>('/api/leagues', {
    method: 'POST',
    body: JSON.stringify({ name, adminPin })
  });
}

export async function joinLeague(inviteCode: string, displayName: string, pin: string) {
  return request<SessionState>('/api/join', {
    method: 'POST',
    body: JSON.stringify({ inviteCode, displayName, pin })
  });
}

export async function loginUser(inviteCode: string, displayName: string, pin: string) {
  return request<SessionState>('/api/login', {
    method: 'POST',
    body: JSON.stringify({ inviteCode, displayName, pin })
  });
}

export async function adminLogin(leagueId: string, adminPin: string) {
  return request<{ adminToken: string; leagueId: string; leagueName: string }>('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify({ leagueId, adminPin })
  });
}

export async function getMatches(leagueId: string, token: string) {
  return request<{ matches: Match[] }>(`/api/league/${leagueId}/matches`, {}, token);
}

export async function getMyPredictions(leagueId: string, token: string) {
  return request<{ predictions: Prediction[] }>(`/api/league/${leagueId}/predictions/me`, {}, token);
}

export async function savePrediction(matchId: string, predictedOutcome: Outcome, token: string) {
  return request<{ saved: boolean }>('/api/predictions', {
    method: 'POST',
    body: JSON.stringify({ matchId, predictedOutcome })
  }, token);
}

export async function getLeaderboard(leagueId: string, token: string) {
  return request<{ leaderboard: LeaderboardRow[]; latestMatches: LatestMatch[] }>(`/api/league/${leagueId}/leaderboard`, {}, token);
}

export async function updateResult(matchId: string, actualOutcome: Outcome, adminToken: string) {
  return request<{ updated: boolean }>('/api/admin/matches/' + matchId + '/result', {
    method: 'POST',
    body: JSON.stringify({ actualOutcome })
  }, adminToken);
}
