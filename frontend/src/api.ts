import type { LeaderboardRow, Match, Outcome, Prediction, SessionState } from './types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(data.error || `Request failed: ${response.status}`);
  }

  return data as T;
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
  return request<{ leaderboard: LeaderboardRow[] }>(`/api/league/${leagueId}/leaderboard`, {}, token);
}

export async function updateResult(matchId: string, actualOutcome: Outcome, adminToken: string) {
  return request<{ updated: boolean }>('/api/admin/matches/' + matchId + '/result', {
    method: 'POST',
    body: JSON.stringify({ actualOutcome })
  }, adminToken);
}
