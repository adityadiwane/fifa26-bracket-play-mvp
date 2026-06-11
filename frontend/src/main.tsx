import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  adminLogin,
  ApiError,
  createLeague,
  getLeaderboard,
  getMatches,
  getMyPredictions,
  joinLeague,
  loginUser,
  savePrediction,
  updateResult
} from './api';
import type { LeaderboardRow, Match, Outcome, Prediction, SessionState } from './types';
import './styles.css';

const STORAGE_KEY = 'fifa26.session.v1';

function App() {
  const [session, setSession] = useState<SessionState | null>(() => loadSession());
  const [tab, setTab] = useState<'predictions' | 'leaderboard' | 'admin'>('predictions');

  function persistSession(next: SessionState | null) {
    setSession(next);
    if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else localStorage.removeItem(STORAGE_KEY);
  }

  if (!session) return <AuthScreen onSession={persistSession} />;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">FIFA26 Bracket Play</p>
          <h1>{session.leagueName}</h1>
          {session.inviteCode && <p className="muted">Invite code: <strong>{session.inviteCode}</strong></p>}
        </div>
        <button className="ghost" onClick={() => persistSession(null)}>Log out</button>
      </header>

      <nav className="tabs">
        <button className={tab === 'predictions' ? 'active' : ''} onClick={() => setTab('predictions')}>Predictions</button>
        <button className={tab === 'leaderboard' ? 'active' : ''} onClick={() => setTab('leaderboard')}>Leaderboard</button>
        <button className={tab === 'admin' ? 'active' : ''} onClick={() => setTab('admin')}>Admin</button>
      </nav>

      {tab === 'predictions' && <PredictionsPage session={session} />}
      {tab === 'leaderboard' && <LeaderboardPage session={session} />}
      {tab === 'admin' && <AdminPage session={session} onSession={persistSession} />}
    </div>
  );
}

function AuthScreen({ onSession }: { onSession: (session: SessionState) => void }) {
  const [mode, setMode] = useState<'join' | 'login' | 'create'>('join');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [leagueName, setLeagueName] = useState('My World Cup Pool');
  const [adminPin, setAdminPin] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [pin, setPin] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'create') {
        const league = await createLeague(leagueName, adminPin);
        onSession({
          token: league.adminToken,
          adminToken: league.adminToken,
          leagueId: league.leagueId,
          leagueName: league.leagueName,
          inviteCode: league.inviteCode
        });
      } else if (mode === 'join') {
        const joined = await joinLeague(inviteCode, displayName, pin);
        onSession(joined);
      } else {
        const loggedIn = await loginUser(inviteCode, displayName, pin);
        onSession(loggedIn);
      }
    } catch (err) {
      setError(getAuthErrorMessage(mode, err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="hero-card">
        <p className="eyebrow">Simple friends-only pool</p>
        <h1>Pick the winner. Track the leaderboard.</h1>
        <p className="muted">No score predictions. Group games allow draw picks. Knockout games allow either team advancing.</p>
      </section>

      <form className="panel" onSubmit={submit}>
        <div className="mode-switcher">
          <button type="button" className={mode === 'join' ? 'active' : ''} onClick={() => setMode('join')}>Join</button>
          <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Login</button>
          <button type="button" className={mode === 'create' ? 'active' : ''} onClick={() => setMode('create')}>Create</button>
        </div>

        {mode === 'create' ? (
          <>
            <label>League name<input value={leagueName} onChange={(e) => setLeagueName(e.target.value)} required /></label>
            <label>Admin PIN<input type="password" value={adminPin} onChange={(e) => setAdminPin(e.target.value)} minLength={4} required /></label>
          </>
        ) : (
          <>
            <label>Invite code<input value={inviteCode} onChange={(e) => setInviteCode(e.target.value.toUpperCase())} required /></label>
            <label>Display name<input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required /></label>
            <label>PIN<input type="password" value={pin} onChange={(e) => setPin(e.target.value)} minLength={4} required /></label>
          </>
        )}

        {error && <div className="error">{error}</div>}
        <button className="primary" disabled={loading}>{loading ? 'Saving...' : mode === 'create' ? 'Create league' : mode === 'join' ? 'Join league' : 'Login'}</button>
      </form>
    </main>
  );
}

function PredictionsPage({ session }: { session: SessionState }) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [predictions, setPredictions] = useState<Record<string, Prediction>>({});
  const [filter, setFilter] = useState<'all' | 'open' | 'completed'>('all');
  const [selectedDate, setSelectedDate] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setError('');
    try {
      const [matchResponse, predictionResponse] = await Promise.all([
        getMatches(session.leagueId, session.token),
        getMyPredictions(session.leagueId, session.token)
      ]);
      setMatches(matchResponse.matches);
      setPredictions(Object.fromEntries(predictionResponse.predictions.map((p) => [p.match_id, p])));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load predictions.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, [session.leagueId, session.token]);

  async function pick(match: Match, outcome: Outcome) {
    setError('');
    try {
      await savePrediction(match.id, outcome, session.token);
      setPredictions((prev) => ({
        ...prev,
        [match.id]: { match_id: match.id, predicted_outcome: outcome, points_awarded: 0 }
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save prediction.');
    }
  }

  const dateOptions = useMemo(() => {
    const uniqueDates = new Map<string, string>();
    for (const match of matches) {
      const key = getLocalDateKey(match.kickoff_at);
      if (!uniqueDates.has(key)) uniqueDates.set(key, formatDateOption(match.kickoff_at));
    }
    return Array.from(uniqueDates, ([value, label]) => ({ value, label }));
  }, [matches]);

  useEffect(() => {
    if (dateOptions.length === 0) {
      setSelectedDate('');
      return;
    }

    if (!selectedDate || !dateOptions.some((date) => date.value === selectedDate)) {
      setSelectedDate(dateOptions[0].value);
    }
  }, [dateOptions, selectedDate]);

  const visibleMatches = useMemo(() => {
    return matches.filter((match) => {
      if (selectedDate && getLocalDateKey(match.kickoff_at) !== selectedDate) return false;
      if (filter === 'open') return !match.is_locked && match.status !== 'COMPLETED';
      if (filter === 'completed') return match.status === 'COMPLETED';
      return true;
    });
  }, [matches, filter, selectedDate]);

  if (loading) return <Loading />;

  return (
    <section className="content-grid">
      <div className="section-header">
        <div>
          <p className="eyebrow">Match picks</p>
          <h2>Your predictions</h2>
        </div>
        <div className="prediction-controls">
          <label className="date-picker">Match date
            <select value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} disabled={dateOptions.length === 0}>
              {dateOptions.map((date) => <option key={date.value} value={date.value}>{date.label}</option>)}
            </select>
          </label>
          <div className="segmented">
            <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All</button>
            <button className={filter === 'open' ? 'active' : ''} onClick={() => setFilter('open')}>Open</button>
            <button className={filter === 'completed' ? 'active' : ''} onClick={() => setFilter('completed')}>Completed</button>
          </div>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="match-list">
        {visibleMatches.map((match) => (
          <MatchCard
            key={match.id}
            match={match}
            selected={predictions[match.id]?.predicted_outcome}
            points={predictions[match.id]?.points_awarded ?? 0}
            onPick={(outcome) => pick(match, outcome)}
          />
        ))}
        {visibleMatches.length === 0 && <div className="empty">No matches found for this date and filter.</div>}
      </div>
    </section>
  );
}

function MatchCard({ match, selected, points, onPick }: {
  match: Match;
  selected?: Outcome;
  points: number;
  onPick: (outcome: Outcome) => void;
}) {
  const locked = match.is_locked || match.status === 'COMPLETED';
  const status = match.status === 'COMPLETED' ? 'Completed' : locked ? 'Locked' : 'Open';

  return (
    <article className="match-card">
      <div className="match-meta">
        <span>#{match.fifa_match_no}</span>
        <span>{formatStage(match.stage, match.group_name)}</span>
        <span>{formatDate(match.kickoff_at)}</span>
        <span className={locked ? 'badge locked' : 'badge open'}>{status}</span>
      </div>

      <div className="teams">
        <strong>{match.home_label}</strong>
        <span>vs</span>
        <strong>{match.away_label}</strong>
      </div>

      {match.venue && <p className="muted small">{match.venue}</p>}

      <div className="pick-row">
        <OutcomeButton outcome="HOME_WIN" label={match.home_label} selected={selected} disabled={locked} onClick={onPick} />
        {match.allowed_outcomes.includes('DRAW') && <OutcomeButton outcome="DRAW" label="Draw" selected={selected} disabled={locked} onClick={onPick} />}
        <OutcomeButton outcome="AWAY_WIN" label={match.away_label} selected={selected} disabled={locked} onClick={onPick} />
      </div>

      <footer className="match-footer">
        <span>Your pick: <strong>{selected ? outcomeLabel(selected, match) : 'Not picked'}</strong></span>
        {match.status === 'COMPLETED' && (
          <span>Actual: <strong>{match.actual_outcome ? outcomeLabel(match.actual_outcome, match) : 'TBD'}</strong> · Points: <strong>{points}</strong></span>
        )}
      </footer>
    </article>
  );
}

function OutcomeButton({ outcome, label, selected, disabled, onClick }: {
  outcome: Outcome;
  label: string;
  selected?: Outcome;
  disabled: boolean;
  onClick: (outcome: Outcome) => void;
}) {
  return (
    <button
      className={selected === outcome ? 'pick selected' : 'pick'}
      disabled={disabled}
      onClick={() => onClick(outcome)}
    >
      {label}
    </button>
  );
}

function LeaderboardPage({ session }: { session: SessionState }) {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const response = await getLeaderboard(session.leagueId, session.token);
        setRows(response.leaderboard);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load leaderboard.');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [session.leagueId, session.token]);

  if (loading) return <Loading />;

  return (
    <section className="panel wide">
      <div className="section-header">
        <div>
          <p className="eyebrow">Live standings</p>
          <h2>Leaderboard</h2>
        </div>
      </div>
      {error && <div className="error">{error}</div>}
      <table>
        <thead>
          <tr><th>Rank</th><th>Player</th><th>Points</th><th>Correct</th><th>Wrong</th></tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.user_id}>
              <td>{row.rank}</td>
              <td>{row.display_name}</td>
              <td><strong>{row.total_points}</strong></td>
              <td>{row.correct_picks}</td>
              <td>{row.wrong_picks}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <div className="empty">No players have joined yet.</div>}
    </section>
  );
}

function AdminPage({ session, onSession }: { session: SessionState; onSession: (session: SessionState) => void }) {
  const [adminPin, setAdminPin] = useState('');
  const [adminToken, setAdminToken] = useState(session.adminToken || '');
  const [matches, setMatches] = useState<Match[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState('');
  const [actualOutcome, setActualOutcome] = useState<Outcome>('HOME_WIN');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadMatches() {
      try {
        const response = await getMatches(session.leagueId, session.token);
        setMatches(response.matches);
        setSelectedMatchId(response.matches[0]?.id || '');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load matches.');
      }
    }
    void loadMatches();
  }, [session.leagueId, session.token]);

  const selectedMatch = matches.find((m) => m.id === selectedMatchId);

  async function login(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      const response = await adminLogin(session.leagueId, adminPin);
      setAdminToken(response.adminToken);
      onSession({ ...session, adminToken: response.adminToken });
      setMessage('Admin login successful.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Admin login failed.');
    }
  }

  async function saveResult(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedMatchId || !adminToken) return;
    setError('');
    setMessage('');
    try {
      await updateResult(selectedMatchId, actualOutcome, adminToken);
      setMessage('Result updated. Leaderboard will reflect it immediately.');
      const response = await getMatches(session.leagueId, session.token);
      setMatches(response.matches);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update result.');
    }
  }

  return (
    <section className="content-grid two-column">
      <form className="panel" onSubmit={login}>
        <p className="eyebrow">Admin</p>
        <h2>Admin login</h2>
        <label>Admin PIN<input type="password" value={adminPin} onChange={(e) => setAdminPin(e.target.value)} minLength={4} /></label>
        <button className="primary">Unlock admin</button>
      </form>

      <form className="panel" onSubmit={saveResult}>
        <p className="eyebrow">Manual results</p>
        <h2>Update match result</h2>
        <label>Match
          <select value={selectedMatchId} onChange={(e) => setSelectedMatchId(e.target.value)}>
            {matches.map((match) => <option key={match.id} value={match.id}>#{match.fifa_match_no} {match.home_label} vs {match.away_label}</option>)}
          </select>
        </label>

        {selectedMatch && (
          <label>Actual outcome
            <select value={actualOutcome} onChange={(e) => setActualOutcome(e.target.value as Outcome)}>
              <option value="HOME_WIN">{selectedMatch.home_label}</option>
              {selectedMatch.allowed_outcomes.includes('DRAW') && <option value="DRAW">Draw</option>}
              <option value="AWAY_WIN">{selectedMatch.away_label}</option>
            </select>
          </label>
        )}

        <button className="primary" disabled={!adminToken}>Save result</button>
        {!adminToken && <p className="muted small">Login as admin first.</p>}
      </form>

      {message && <div className="success">{message}</div>}
      {error && <div className="error">{error}</div>}
    </section>
  );
}

function Loading() {
  return <div className="panel">Loading...</div>;
}

function loadSession(): SessionState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function getAuthErrorMessage(mode: 'join' | 'login' | 'create', err: unknown) {
  if (mode === 'join' && err instanceof ApiError) {
    if (err.status === 404) return 'Invalid Invite Code';
    if (err.status === 409) return 'User Already Exists';
  }

  if (mode === 'login' && err instanceof ApiError) {
    if (err.status === 404) return 'Invalid Invite Code';
    if (err.status === 401) return 'Invalid PIN';
  }

  return err instanceof Error ? err.message : 'Something went wrong.';
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  }).format(new Date(value));
}

function getLocalDateKey(value: string) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateOption(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  }).format(new Date(value));
}

function formatStage(stage: string, groupName?: string | null) {
  if (stage === 'GROUP') return groupName ? `Group ${groupName}` : 'Group';
  return stage.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}

function outcomeLabel(outcome: Outcome, match: Match) {
  if (outcome === 'HOME_WIN') return match.home_label;
  if (outcome === 'AWAY_WIN') return match.away_label;
  return 'Draw';
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
