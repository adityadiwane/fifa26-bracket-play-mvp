export interface Env {
  DB: D1Database;
  SESSION_SECRET: string;
  CORS_ALLOWED_ORIGIN?: string;
}

type Outcome = 'HOME_WIN' | 'DRAW' | 'AWAY_WIN';
type Session = {
  token: string;
  league_id: string;
  user_id: string | null;
  is_admin: number;
  expires_at: string;
};

const OUTCOMES: Outcome[] = ['HOME_WIN', 'DRAW', 'AWAY_WIN'];
const SESSION_DAYS = 14;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      if (request.method === 'OPTIONS') return corsResponse(null, env, 204);

      const url = new URL(request.url);
      const path = url.pathname.replace(/\/$/, '') || '/';

      if (request.method === 'GET' && path === '/api/health') {
        return ok({ status: 'ok', app: 'fifa26-bracket-play' }, env);
      }

      if (request.method === 'POST' && path === '/api/leagues') {
        return createLeague(request, env);
      }

      if (request.method === 'POST' && path === '/api/join') {
        return joinLeague(request, env);
      }

      if (request.method === 'POST' && path === '/api/login') {
        return loginUser(request, env);
      }

      if (request.method === 'POST' && path === '/api/admin/login') {
        return loginAdmin(request, env);
      }

      const leagueMatches = path.match(/^\/api\/league\/([^/]+)\/matches$/);
      if (request.method === 'GET' && leagueMatches) {
        return listMatches(request, env, leagueMatches[1]);
      }

      const myPredictions = path.match(/^\/api\/league\/([^/]+)\/predictions\/me$/);
      if (request.method === 'GET' && myPredictions) {
        return listMyPredictions(request, env, myPredictions[1]);
      }

      if (request.method === 'POST' && path === '/api/predictions') {
        return savePrediction(request, env);
      }

      const leaderboard = path.match(/^\/api\/league\/([^/]+)\/leaderboard$/);
      if (request.method === 'GET' && leaderboard) {
        return getLeaderboard(request, env, leaderboard[1]);
      }

      const adminResult = path.match(/^\/api\/admin\/matches\/([^/]+)\/result$/);
      if (request.method === 'POST' && adminResult) {
        return updateMatchResult(request, env, adminResult[1]);
      }

      if (request.method === 'POST' && path === '/api/admin/recalculate') {
        const session = await requireSession(request, env, { admin: true });
        return ok({ message: 'Leaderboard is calculated dynamically; no recalculation required.', leagueId: session.league_id }, env);
      }

      return fail('Not found', env, 404);
    } catch (err) {
      const message = err instanceof AppError ? err.message : 'Unexpected server error';
      const status = err instanceof AppError ? err.status : 500;
      console.error(err);
      return fail(message, env, status);
    }
  },
};

async function createLeague(request: Request, env: Env): Promise<Response> {
  const body = await readJson(request);
  const name = cleanString(body.name, 80);
  const adminPin = cleanString(body.adminPin, 32);

  if (!name) throw new AppError('League name is required.', 400);
  if (!adminPin || adminPin.length < 4) throw new AppError('Admin PIN must be at least 4 characters.', 400);

  const id = makeId('lg');
  const inviteCode = makeInviteCode();
  const adminPinHash = await hashPin(adminPin, env);

  await env.DB.prepare(
    `INSERT INTO leagues (id, name, invite_code, admin_pin_hash) VALUES (?, ?, ?, ?)`
  ).bind(id, name, inviteCode, adminPinHash).run();

  const adminToken = await createSession(env, id, null, true);

  return ok({ leagueId: id, leagueName: name, inviteCode, adminToken }, env, 201);
}

async function joinLeague(request: Request, env: Env): Promise<Response> {
  const body = await readJson(request);
  const inviteCode = cleanString(body.inviteCode, 20).toUpperCase();
  const displayName = cleanString(body.displayName, 40);
  const pin = cleanString(body.pin, 32);

  if (!inviteCode) throw new AppError('Invite code is required.', 400);
  if (!displayName) throw new AppError('Display name is required.', 400);
  if (!pin || pin.length < 4) throw new AppError('PIN must be at least 4 characters.', 400);

  const league = await env.DB.prepare(`SELECT id, name FROM leagues WHERE invite_code = ?`)
    .bind(inviteCode)
    .first<{ id: string; name: string }>();
  if (!league) throw new AppError('Invalid invite code.', 404);

  const pinHash = await hashPin(pin, env);
  const existing = await env.DB.prepare(
    `SELECT id, user_pin_hash FROM users WHERE league_id = ? AND lower(display_name) = lower(?)`
  ).bind(league.id, displayName).first<{ id: string; user_pin_hash: string }>();

  let userId = existing?.id;
  if (existing) {
    if (existing.user_pin_hash !== pinHash) {
      throw new AppError('That display name already exists with a different PIN.', 409);
    }
  } else {
    userId = makeId('usr');
    await env.DB.prepare(
      `INSERT INTO users (id, league_id, display_name, user_pin_hash) VALUES (?, ?, ?, ?)`
    ).bind(userId, league.id, displayName, pinHash).run();
  }

  const token = await createSession(env, league.id, userId!, false);
  return ok({ token, leagueId: league.id, leagueName: league.name, userId, displayName }, env, 201);
}

async function loginUser(request: Request, env: Env): Promise<Response> {
  const body = await readJson(request);
  const displayName = cleanString(body.displayName, 40);
  const pin = cleanString(body.pin, 32);
  const league = await findLeague(env, body.leagueId, body.inviteCode);

  if (!displayName) throw new AppError('Display name is required.', 400);
  if (!pin) throw new AppError('PIN is required.', 400);

  const user = await env.DB.prepare(
    `SELECT id, display_name, user_pin_hash FROM users WHERE league_id = ? AND lower(display_name) = lower(?)`
  ).bind(league.id, displayName).first<{ id: string; display_name: string; user_pin_hash: string }>();

  if (!user || user.user_pin_hash !== await hashPin(pin, env)) {
    throw new AppError('Invalid display name or PIN.', 401);
  }

  await env.DB.prepare(`UPDATE users SET last_login_at = datetime('now') WHERE id = ?`).bind(user.id).run();
  const token = await createSession(env, league.id, user.id, false);
  return ok({ token, leagueId: league.id, leagueName: league.name, userId: user.id, displayName: user.display_name }, env);
}

async function loginAdmin(request: Request, env: Env): Promise<Response> {
  const body = await readJson(request);
  const adminPin = cleanString(body.adminPin, 32);
  const league = await findLeague(env, body.leagueId, body.inviteCode);

  if (!adminPin) throw new AppError('Admin PIN is required.', 400);
  if (league.admin_pin_hash !== await hashPin(adminPin, env)) {
    throw new AppError('Invalid admin PIN.', 401);
  }

  const adminToken = await createSession(env, league.id, null, true);
  return ok({ adminToken, leagueId: league.id, leagueName: league.name }, env);
}

async function listMatches(request: Request, env: Env, leagueId: string): Promise<Response> {
  await requireLeagueSession(request, env, leagueId);
  const { results } = await env.DB.prepare(
    `SELECT id, fifa_match_no, stage, group_name, home_team, away_team, home_placeholder, away_placeholder,
            kickoff_at, venue, status, actual_outcome, updated_at
       FROM matches
      ORDER BY datetime(kickoff_at), fifa_match_no`
  ).all();

  const now = Date.now();
  const matches = (results ?? []).map((m: any) => ({
    ...m,
    home_label: labelFor(m.home_team, m.home_placeholder),
    away_label: labelFor(m.away_team, m.away_placeholder),
    is_locked: new Date(m.kickoff_at).getTime() <= now,
    allowed_outcomes: allowedOutcomes(m.stage),
  }));

  return ok({ matches }, env);
}

async function listMyPredictions(request: Request, env: Env, leagueId: string): Promise<Response> {
  const session = await requireLeagueSession(request, env, leagueId);
  if (!session.user_id) throw new AppError('User session required.', 401);

  const { results } = await env.DB.prepare(
    `SELECT p.match_id, p.predicted_outcome, p.created_at, p.updated_at,
            CASE WHEN m.status = 'COMPLETED' AND p.predicted_outcome = m.actual_outcome THEN 3 ELSE 0 END AS points_awarded
       FROM predictions p
       JOIN matches m ON m.id = p.match_id
      WHERE p.league_id = ? AND p.user_id = ?`
  ).bind(leagueId, session.user_id).all();

  return ok({ predictions: results ?? [] }, env);
}

async function savePrediction(request: Request, env: Env): Promise<Response> {
  const session = await requireSession(request, env, { admin: false });
  if (!session.user_id) throw new AppError('User session required.', 401);

  const body = await readJson(request);
  const matchId = cleanString(body.matchId, 80);
  const predictedOutcome = cleanString(body.predictedOutcome, 20) as Outcome;
  if (!matchId) throw new AppError('matchId is required.', 400);
  validateOutcome(predictedOutcome);

  const match = await env.DB.prepare(
    `SELECT id, stage, kickoff_at, status FROM matches WHERE id = ?`
  ).bind(matchId).first<{ id: string; stage: string; kickoff_at: string; status: string }>();

  if (!match) throw new AppError('Match not found.', 404);
  if (new Date(match.kickoff_at).getTime() <= Date.now()) {
    throw new AppError('Prediction is locked because kickoff time has passed.', 409);
  }
  if (match.status === 'COMPLETED') throw new AppError('Prediction is locked because match is completed.', 409);
  if (predictedOutcome === 'DRAW' && !isGroupStage(match.stage)) {
    throw new AppError('Draw is only allowed for group-stage matches.', 400);
  }

  const existing = await env.DB.prepare(
    `SELECT id FROM predictions WHERE league_id = ? AND user_id = ? AND match_id = ?`
  ).bind(session.league_id, session.user_id, matchId).first<{ id: string }>();

  if (existing) {
    await env.DB.prepare(
      `UPDATE predictions SET predicted_outcome = ?, updated_at = datetime('now') WHERE id = ?`
    ).bind(predictedOutcome, existing.id).run();
  } else {
    await env.DB.prepare(
      `INSERT INTO predictions (id, league_id, user_id, match_id, predicted_outcome)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(makeId('pred'), session.league_id, session.user_id, matchId, predictedOutcome).run();
  }

  return ok({ saved: true, matchId, predictedOutcome }, env);
}

async function getLeaderboard(request: Request, env: Env, leagueId: string): Promise<Response> {
  await requireLeagueSession(request, env, leagueId);

  const { results } = await env.DB.prepare(
    `SELECT u.id AS user_id,
            u.display_name,
            COALESCE(SUM(CASE WHEN m.status = 'COMPLETED' AND p.predicted_outcome = m.actual_outcome THEN 3 ELSE 0 END), 0) AS total_points,
            COALESCE(SUM(CASE WHEN m.status = 'COMPLETED' AND p.predicted_outcome = m.actual_outcome THEN 1 ELSE 0 END), 0) AS correct_picks,
            COALESCE(SUM(CASE WHEN m.status = 'COMPLETED' AND p.id IS NOT NULL AND p.predicted_outcome != m.actual_outcome THEN 1 ELSE 0 END), 0) AS wrong_picks,
            COALESCE(SUM(CASE WHEN m.status = 'COMPLETED' AND p.id IS NOT NULL THEN 1 ELSE 0 END), 0) AS completed_picks
       FROM users u
       LEFT JOIN predictions p ON p.user_id = u.id AND p.league_id = u.league_id
       LEFT JOIN matches m ON m.id = p.match_id
      WHERE u.league_id = ?
      GROUP BY u.id, u.display_name
      ORDER BY total_points DESC, correct_picks DESC, completed_picks DESC, lower(u.display_name) ASC`
  ).bind(leagueId).all();

  let lastPoints: number | null = null;
  let lastCorrect: number | null = null;
  let rank = 0;
  const leaderboard = (results ?? []).map((row: any, index: number) => {
    const points = Number(row.total_points ?? 0);
    const correct = Number(row.correct_picks ?? 0);
    if (points !== lastPoints || correct !== lastCorrect) {
      rank = index + 1;
      lastPoints = points;
      lastCorrect = correct;
    }
    return { ...row, rank };
  });

  return ok({ leaderboard }, env);
}

async function updateMatchResult(request: Request, env: Env, matchId: string): Promise<Response> {
  const session = await requireSession(request, env, { admin: true });
  const body = await readJson(request);
  const actualOutcome = cleanString(body.actualOutcome, 20) as Outcome;
  validateOutcome(actualOutcome);

  const match = await env.DB.prepare(
    `SELECT id, stage, status, actual_outcome FROM matches WHERE id = ?`
  ).bind(matchId).first<{ id: string; stage: string; status: string; actual_outcome: string | null }>();

  if (!match) throw new AppError('Match not found.', 404);
  if (actualOutcome === 'DRAW' && !isGroupStage(match.stage)) {
    throw new AppError('Draw is only allowed for group-stage matches.', 400);
  }

  const oldValue = JSON.stringify({ status: match.status, actualOutcome: match.actual_outcome });
  await env.DB.prepare(
    `UPDATE matches SET actual_outcome = ?, status = 'COMPLETED', updated_at = datetime('now') WHERE id = ?`
  ).bind(actualOutcome, matchId).run();

  await env.DB.prepare(
    `INSERT INTO admin_audit_log (id, league_id, action, match_id, old_value, new_value)
     VALUES (?, ?, 'UPDATE_MATCH_RESULT', ?, ?, ?)`
  ).bind(makeId('audit'), session.league_id, matchId, oldValue, JSON.stringify({ status: 'COMPLETED', actualOutcome })).run();

  return ok({ updated: true, matchId, actualOutcome }, env);
}

async function findLeague(env: Env, leagueId?: unknown, inviteCode?: unknown): Promise<{ id: string; name: string; invite_code: string; admin_pin_hash: string }> {
  const id = cleanString(leagueId, 80);
  const code = cleanString(inviteCode, 20).toUpperCase();

  if (!id && !code) throw new AppError('leagueId or inviteCode is required.', 400);

  const league = id
    ? await env.DB.prepare(`SELECT id, name, invite_code, admin_pin_hash FROM leagues WHERE id = ?`).bind(id).first<any>()
    : await env.DB.prepare(`SELECT id, name, invite_code, admin_pin_hash FROM leagues WHERE invite_code = ?`).bind(code).first<any>();

  if (!league) throw new AppError('League not found.', 404);
  return league;
}

async function createSession(env: Env, leagueId: string, userId: string | null, isAdmin: boolean): Promise<string> {
  const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  await env.DB.prepare(
    `INSERT INTO sessions (token, league_id, user_id, is_admin, expires_at) VALUES (?, ?, ?, ?, ?)`
  ).bind(token, leagueId, userId, isAdmin ? 1 : 0, expiresAt).run();

  return token;
}

async function requireLeagueSession(request: Request, env: Env, leagueId: string): Promise<Session> {
  const session = await requireSession(request, env, {});
  if (session.league_id !== leagueId) throw new AppError('Session is not valid for this league.', 403);
  return session;
}

async function requireSession(request: Request, env: Env, options: { admin?: boolean } = {}): Promise<Session> {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) throw new AppError('Missing session token.', 401);

  const session = await env.DB.prepare(
    `SELECT token, league_id, user_id, is_admin, expires_at
       FROM sessions
      WHERE token = ? AND datetime(expires_at) > datetime('now')`
  ).bind(token).first<Session>();

  if (!session) throw new AppError('Invalid or expired session.', 401);
  if (options.admin && session.is_admin !== 1) throw new AppError('Admin session required.', 403);
  if (options.admin === false && session.is_admin === 1) throw new AppError('User session required.', 403);
  return session;
}

function allowedOutcomes(stage: string): Outcome[] {
  return isGroupStage(stage) ? ['HOME_WIN', 'DRAW', 'AWAY_WIN'] : ['HOME_WIN', 'AWAY_WIN'];
}

function isGroupStage(stage: string): boolean {
  return stage.toUpperCase() === 'GROUP';
}

function labelFor(team?: string | null, placeholder?: string | null): string {
  const cleanTeam = (team ?? '').trim();
  const cleanPlaceholder = (placeholder ?? '').trim();
  return cleanTeam || cleanPlaceholder || 'TBD';
}

function validateOutcome(outcome: Outcome): void {
  if (!OUTCOMES.includes(outcome)) throw new AppError('Invalid outcome. Use HOME_WIN, DRAW, or AWAY_WIN.', 400);
}

async function readJson(request: Request): Promise<any> {
  try {
    return await request.json();
  } catch {
    throw new AppError('Request body must be valid JSON.', 400);
  }
}

function cleanString(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

async function hashPin(pin: string, env: Env): Promise<string> {
  const secret = env.SESSION_SECRET || 'dev-only-secret';
  const encoded = new TextEncoder().encode(`${pin}:${secret}`);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function makeId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
}

function makeInviteCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

function ok(payload: unknown, env: Env, status = 200): Response {
  return corsResponse(JSON.stringify(payload), env, status);
}

function fail(message: string, env: Env, status = 400): Response {
  return corsResponse(JSON.stringify({ error: message }), env, status);
}

function corsResponse(body: BodyInit | null, env: Env, status = 200): Response {
  const origin = env.CORS_ALLOWED_ORIGIN || '*';
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    },
  });
}

class AppError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
