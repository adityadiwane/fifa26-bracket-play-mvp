import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  lookupLeague,
  savePrediction,
  updateResult
} from './api';
import type { LatestMatch, LeaderboardRow, Match, Outcome, Prediction, SessionState } from './types';
import './styles.css';

const STORAGE_KEY = 'fifa26.session.v1';
const JOIN_PIN_PLACEHOLDER = 'Create your PIN. Remember it. No option to reset it yet';
const LOGIN_PIN_PLACEHOLDER = 'Enter your PIN';
const PLACEHOLDER_BASE_FONT_SIZE = 16;
const PLACEHOLDER_MIN_FONT_SIZE = 8;
const KNOCKOUT_STAGES = ['ROUND_OF_32', 'ROUND_OF_16', 'QUARTER_FINAL', 'SEMI_FINAL', 'FINAL'];

type AppTab = 'predictions' | 'bracket' | 'leaderboard' | 'admin';
type DraftPrediction = {
  outcome?: Outcome;
  homeScore: string;
  awayScore: string;
};

function App() {
  const [session, setSession] = useState<SessionState | null>(() => loadSession());
  const [tab, setTab] = useState<AppTab>('predictions');

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
          <h1 className="league-heading">
            <span>{session.leagueName}</span>
            {session.inviteCode && <span className="league-invite-code">Invite code: {session.inviteCode}</span>}
          </h1>
        </div>
        <button className="ghost" onClick={() => persistSession(null)}>Log out</button>
      </header>

      <nav className="tabs">
        <button className={tab === 'predictions' ? 'active' : ''} onClick={() => setTab('predictions')}>Predictions</button>
        <button className={tab === 'bracket' ? 'active' : ''} onClick={() => setTab('bracket')}>Bracket</button>
        <button className={tab === 'leaderboard' ? 'active' : ''} onClick={() => setTab('leaderboard')}>Leaderboard</button>
        <button className={tab === 'admin' ? 'active' : ''} onClick={() => setTab('admin')}>Admin</button>
      </nav>

      {tab === 'predictions' && <PredictionsPage session={session} />}
      {tab === 'bracket' && <BracketPage session={session} />}
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
  const [leagueLookup, setLeagueLookup] = useState<{ status: 'idle' | 'found' | 'not_found'; name: string }>({ status: 'idle', name: '' });
  const [adminPin, setAdminPin] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [pin, setPin] = useState('');

  useEffect(() => {
    const trimmed = inviteCode.trim();
    if (trimmed.length < 4) {
      setLeagueLookup({ status: 'idle', name: '' });
      return;
    }
    const timeout = setTimeout(async () => {
      try {
        const result = await lookupLeague(trimmed);
        setLeagueLookup({ status: 'found', name: result.leagueName });
      } catch {
        setLeagueLookup({ status: 'not_found', name: '' });
      }
    }, 400);
    return () => clearTimeout(timeout);
  }, [inviteCode]);

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
        onSession({ ...joined, inviteCode: inviteCode.trim().toUpperCase() });
      } else {
        const loggedIn = await loginUser(inviteCode, displayName, pin);
        onSession({ ...loggedIn, inviteCode: inviteCode.trim().toUpperCase() });
      }
    } catch (err) {
      setError(getAuthErrorMessage(mode, err));
    } finally {
      setLoading(false);
    }
  }

  const inviteCodePlaceholder = mode === 'join' ? 'Enter invite code from the league admin' : 'Enter your invite code';
  const displayNamePlaceholder = mode === 'join' ? 'Create your display name' : 'Enter your display name';
  const pinPlaceholder = mode === 'join' ? JOIN_PIN_PLACEHOLDER : LOGIN_PIN_PLACEHOLDER;

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
            <label>League name<AutoResizeInput value={leagueName} onChange={(e) => setLeagueName(e.target.value)} placeholder="Name your league or pool" required /></label>
            <label>Admin PIN<AutoResizeInput type="password" value={adminPin} onChange={(e) => setAdminPin(e.target.value)} placeholder="Create admin PIN. Remember it. No option to reset it yet" minLength={4} required /></label>
          </>
        ) : (
          <>
            <label>Invite code<AutoResizeInput value={inviteCode} onChange={(e) => setInviteCode(e.target.value.toUpperCase())} placeholder={inviteCodePlaceholder} required /></label>
            {leagueLookup.status === 'found' && <div className="league-resolved">League: <strong>{leagueLookup.name}</strong></div>}
            {leagueLookup.status === 'not_found' && <div className="league-not-found">No league exists with this code</div>}
            <label>Display name<AutoResizeInput value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={displayNamePlaceholder} required /></label>
            <label>PIN<AutoResizeInput type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder={pinPlaceholder} minLength={4} required /></label>
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
      const today = getLocalDateKey(new Date().toISOString());
      const todayMatch = dateOptions.find((d) => d.value === today);
      const futureMatch = dateOptions.find((d) => d.value >= today);
      setSelectedDate(todayMatch?.value ?? futureMatch?.value ?? dateOptions[0].value);
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

type BracketEntry = {
  match: Match;
  homeLabel: string;
  awayLabel: string;
};

function BracketPage({ session }: { session: SessionState }) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [predictions, setPredictions] = useState<Record<string, Prediction>>({});
  const [draft, setDraft] = useState<Record<string, DraftPrediction>>({});
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      setError('');
      try {
        const [matchResponse, predictionResponse] = await Promise.all([
          getMatches(session.leagueId, session.token),
          getMyPredictions(session.leagueId, session.token)
        ]);
        setMatches(matchResponse.matches);
        const nextPredictions = Object.fromEntries(predictionResponse.predictions.map((p) => [p.match_id, p]));
        setPredictions(nextPredictions);
        setDraft(Object.fromEntries(predictionResponse.predictions.map((p) => [p.match_id, draftFromPrediction(p)])));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load bracket.');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [session.leagueId, session.token]);

  const bracketRounds = useMemo(() => buildBracketRounds(matches, draft), [matches, draft]);
  const knockoutEntries = useMemo(() => flattenBracketRounds(bracketRounds), [bracketRounds]);
  const openEntries = knockoutEntries.filter(({ match }) => !isMatchLocked(match));
  const completedPicks = knockoutEntries.filter(({ match }) => draft[match.id]?.outcome).length;
  const allOpenPicked = openEntries.every(({ match }) => draft[match.id]?.outcome);
  const scoreErrors = knockoutEntries
    .map((entry) => getScoreError(entry, draft[entry.match.id]))
    .filter(Boolean);
  const canSave = openEntries.length > 0 && allOpenPicked && scoreErrors.length === 0 && !saving;

  function updateDraft(matchId: string, update: Partial<DraftPrediction>) {
    setMessage('');
    setError('');
    setDraft((prev) => ({
      ...prev,
      [matchId]: {
        outcome: prev[matchId]?.outcome,
        homeScore: prev[matchId]?.homeScore ?? '',
        awayScore: prev[matchId]?.awayScore ?? '',
        ...update
      }
    }));
  }

  async function saveBracket() {
    setError('');
    setMessage('');
    setSaving(true);
    try {
      await Promise.all(openEntries.map(({ match }) => {
        const pick = draft[match.id];
        if (!pick?.outcome) throw new Error('Every open bracket match needs a winner.');
        return savePrediction(match.id, pick.outcome, session.token, {
          home: scoreToNullable(pick.homeScore),
          away: scoreToNullable(pick.awayScore)
        });
      }));

      setPredictions((prev) => {
        const next = { ...prev };
        for (const { match } of openEntries) {
          const pick = draft[match.id];
          if (!pick?.outcome) continue;
          next[match.id] = {
            match_id: match.id,
            predicted_outcome: pick.outcome,
            predicted_home_score: scoreToNullable(pick.homeScore),
            predicted_away_score: scoreToNullable(pick.awayScore),
            points_awarded: prev[match.id]?.points_awarded ?? 0
          };
        }
        return next;
      });
      setMessage('Bracket predictions saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save bracket predictions.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Loading />;

  if (knockoutEntries.length === 0) {
    return (
      <section className="panel wide">
        <p className="eyebrow">Knockout bracket</p>
        <h2>Round of 32 predictions</h2>
        <div className="empty">No knockout matches are available yet. Seed Round of 32 through Final matches to enable this tab.</div>
      </section>
    );
  }

  return (
    <section className="bracket-section">
      <div className="section-header">
        <div>
          <p className="eyebrow">Knockout bracket</p>
          <h2>Round of 32 to champion</h2>
        </div>
        <div className="bracket-actions">
          <span>{completedPicks}/{knockoutEntries.length} winners picked</span>
          <button className="primary compact" disabled={!canSave} onClick={saveBracket}>{saving ? 'Saving...' : 'Save bracket'}</button>
        </div>
      </div>

      {message && <div className="success">{message}</div>}
      {error && <div className="error">{error}</div>}
      {!allOpenPicked && <div className="empty">Pick a winner for every open knockout match before saving.</div>}
      {scoreErrors.length > 0 && <div className="error">{scoreErrors[0]}</div>}

      <div className="bracket-scroll">
        <div className="bracket-board">
          <BracketSide
            side="left"
            entries={[
              bracketRounds.round32.slice(0, 8),
              bracketRounds.round16.slice(0, 4),
              bracketRounds.quarters.slice(0, 2),
              bracketRounds.semis.slice(0, 1)
            ]}
            draft={draft}
            predictions={predictions}
            onChange={updateDraft}
          />

          <div className="final-column">
            <p className="round-label">Final</p>
            {bracketRounds.final[0] && (
              <BracketMatchCard
                entry={bracketRounds.final[0]}
                draft={draft[bracketRounds.final[0].match.id]}
                points={predictions[bracketRounds.final[0].match.id]?.points_awarded ?? 0}
                onChange={(update) => updateDraft(bracketRounds.final[0].match.id, update)}
              />
            )}
            <div className="champion-box">
              <span>Champion</span>
              <strong>{bracketRounds.final[0] ? selectedWinnerLabel(bracketRounds.final[0], draft) : 'TBD'}</strong>
            </div>
          </div>

          <BracketSide
            side="right"
            entries={[
              bracketRounds.semis.slice(1, 2),
              bracketRounds.quarters.slice(2, 4),
              bracketRounds.round16.slice(4, 8),
              bracketRounds.round32.slice(8, 16)
            ]}
            draft={draft}
            predictions={predictions}
            onChange={updateDraft}
          />
        </div>
      </div>
    </section>
  );
}

function BracketSide({ side, entries, draft, predictions, onChange }: {
  side: 'left' | 'right';
  entries: BracketEntry[][];
  draft: Record<string, DraftPrediction>;
  predictions: Record<string, Prediction>;
  onChange: (matchId: string, update: Partial<DraftPrediction>) => void;
}) {
  const labels = side === 'left'
    ? ['Round of 32', 'Round of 16', 'Quarter Finals', 'Semi Finals']
    : ['Semi Finals', 'Quarter Finals', 'Round of 16', 'Round of 32'];

  return (
    <div className={`bracket-side ${side}`}>
      {entries.map((roundEntries, index) => (
        <div className="bracket-round" key={`${side}-${labels[index]}`}>
          <p className="round-label">{labels[index]}</p>
          <div className="round-stack">
            {roundEntries.map((entry) => (
              <BracketMatchCard
                key={entry.match.id}
                entry={entry}
                draft={draft[entry.match.id]}
                points={predictions[entry.match.id]?.points_awarded ?? 0}
                onChange={(update) => onChange(entry.match.id, update)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function BracketMatchCard({ entry, draft, points, onChange }: {
  entry: BracketEntry;
  draft?: DraftPrediction;
  points: number;
  onChange: (update: Partial<DraftPrediction>) => void;
}) {
  const locked = isMatchLocked(entry.match);
  const selected = draft?.outcome;
  const scoreError = getScoreError(entry, draft);

  return (
    <article className={`bracket-match ${locked ? 'locked' : ''}`}>
      <div className="bracket-match-meta">
        <span>#{entry.match.fifa_match_no}</span>
        <span>{formatStage(entry.match.stage)}</span>
      </div>

      <button
        type="button"
        className={selected === 'HOME_WIN' ? 'bracket-team selected' : 'bracket-team'}
        disabled={locked}
        onClick={() => onChange({ outcome: 'HOME_WIN' })}
      >
        <span>{entry.homeLabel}</span>
      </button>
      <button
        type="button"
        className={selected === 'AWAY_WIN' ? 'bracket-team selected' : 'bracket-team'}
        disabled={locked}
        onClick={() => onChange({ outcome: 'AWAY_WIN' })}
      >
        <span>{entry.awayLabel}</span>
      </button>

      <div className="score-row">
        <input
          aria-label={`${entry.homeLabel} score`}
          type="number"
          min="0"
          max="99"
          inputMode="numeric"
          placeholder="H"
          value={draft?.homeScore ?? ''}
          disabled={locked}
          onChange={(event) => onChange({ homeScore: event.target.value })}
        />
        <span>-</span>
        <input
          aria-label={`${entry.awayLabel} score`}
          type="number"
          min="0"
          max="99"
          inputMode="numeric"
          placeholder="A"
          value={draft?.awayScore ?? ''}
          disabled={locked}
          onChange={(event) => onChange({ awayScore: event.target.value })}
        />
      </div>

      {scoreError && <div className="score-error">{scoreError}</div>}
      {entry.match.status === 'COMPLETED' && <div className="bracket-points">Points: <strong>{points}</strong></div>}
    </article>
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
  const [latestMatches, setLatestMatches] = useState<LatestMatch[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const response = await getLeaderboard(session.leagueId, session.token);
        setRows(response.leaderboard);
        setLatestMatches(response.latestMatches ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load leaderboard.');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [session.leagueId, session.token]);

  if (loading) return <Loading />;

  function pickLabel(match: LatestMatch, pick?: Outcome | null): string {
    if (!pick) return '–';
    if (pick === 'HOME_WIN') return match.home_label;
    if (pick === 'AWAY_WIN') return match.away_label;
    return 'Draw';
  }

  return (
    <section className="panel wide">
      <div className="section-header">
        <div>
          <p className="eyebrow">Live standings</p>
          <h2>Leaderboard</h2>
        </div>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Rank</th><th>Player</th><th>Points</th>
              {latestMatches.map((m) => (
                <th key={m.id}>{m.home_label.slice(0, 3).toUpperCase()} vs {m.away_label.slice(0, 3).toUpperCase()}</th>
              ))}
              <th>Correct</th><th>Wrong</th><th>Bonus</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.user_id}>
                <td>{row.rank} <span className={`rank-${row.rank_change}`}>{row.rank_change === 'up' ? '\u25B2' : row.rank_change === 'down' ? '\u25BC' : '\u2014'}</span></td>
                <td>{row.display_name}</td>
                <td><strong>{row.total_points}</strong></td>
                {latestMatches.map((m) => (
                  <td key={m.id}>{pickLabel(m, row.latest_picks?.[m.id])}</td>
                ))}
                <td>{row.correct_picks}</td>
                <td>{row.wrong_picks}</td>
                <td>{row.score_bonus_points ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
  const [actualHomeScore, setActualHomeScore] = useState('');
  const [actualAwayScore, setActualAwayScore] = useState('');
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

  useEffect(() => {
    setActualHomeScore(selectedMatch?.actual_home_score === null || selectedMatch?.actual_home_score === undefined ? '' : String(selectedMatch.actual_home_score));
    setActualAwayScore(selectedMatch?.actual_away_score === null || selectedMatch?.actual_away_score === undefined ? '' : String(selectedMatch.actual_away_score));
  }, [selectedMatch?.id, selectedMatch?.actual_home_score, selectedMatch?.actual_away_score]);

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
      await updateResult(selectedMatchId, actualOutcome, adminToken, {
        home: scoreToNullable(actualHomeScore),
        away: scoreToNullable(actualAwayScore)
      });
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
        <label>Admin PIN<AutoResizeInput type="password" value={adminPin} onChange={(e) => setAdminPin(e.target.value)} placeholder="Enter admin PIN" minLength={4} /></label>
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

        <div className="score-admin-row">
          <label>Home score
            <input
              type="number"
              min="0"
              max="99"
              inputMode="numeric"
              value={actualHomeScore}
              onChange={(e) => setActualHomeScore(e.target.value)}
              placeholder="Optional"
            />
          </label>
          <label>Away score
            <input
              type="number"
              min="0"
              max="99"
              inputMode="numeric"
              value={actualAwayScore}
              onChange={(e) => setActualAwayScore(e.target.value)}
              placeholder="Optional"
            />
          </label>
        </div>

        <button className="primary" disabled={!adminToken}>Save result</button>
        {!adminToken && <p className="muted small">Login as admin first.</p>}
      </form>

      {message && <div className="success">{message}</div>}
      {error && <div className="error">{error}</div>}
    </section>
  );
}

function AutoResizeInput({ style, placeholder, value, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { placeholder: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [placeholderFontSize, setPlaceholderFontSize] = useState(PLACEHOLDER_BASE_FONT_SIZE);
  const hasValue = value !== undefined && value !== null && String(value).length > 0;

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return;

    const resizePlaceholder = () => {
      const styles = window.getComputedStyle(input);
      const horizontalPadding = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
      const availableWidth = input.clientWidth - horizontalPadding - 4;
      if (availableWidth <= 0) return;

      context.font = `${styles.fontWeight} ${PLACEHOLDER_BASE_FONT_SIZE}px ${styles.fontFamily}`;
      const textWidth = context.measureText(placeholder).width;

      if (textWidth <= availableWidth) {
        setPlaceholderFontSize(PLACEHOLDER_BASE_FONT_SIZE);
        return;
      }

      const scaledSize = Math.floor((availableWidth / textWidth) * PLACEHOLDER_BASE_FONT_SIZE);
      setPlaceholderFontSize(Math.max(PLACEHOLDER_MIN_FONT_SIZE, scaledSize));
    };

    resizePlaceholder();

    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resizePlaceholder) : null;
    observer?.observe(input);
    window.addEventListener('resize', resizePlaceholder);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', resizePlaceholder);
    };
  }, [placeholder]);

  return (
    <input
      {...props}
      ref={inputRef}
      value={value}
      placeholder={placeholder}
      style={{ ...style, ...(hasValue ? {} : { fontSize: `${placeholderFontSize}px` }) }}
    />
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

function draftFromPrediction(prediction: Prediction): DraftPrediction {
  return {
    outcome: prediction.predicted_outcome,
    homeScore: prediction.predicted_home_score === null || prediction.predicted_home_score === undefined ? '' : String(prediction.predicted_home_score),
    awayScore: prediction.predicted_away_score === null || prediction.predicted_away_score === undefined ? '' : String(prediction.predicted_away_score)
  };
}

function isKnockoutMatch(match: Match) {
  return KNOCKOUT_STAGES.includes(match.stage);
}

function isMatchLocked(match: Match) {
  return match.is_locked || match.status === 'COMPLETED';
}

function buildBracketRounds(matches: Match[], draft: Record<string, DraftPrediction>) {
  const knockout = matches
    .filter(isKnockoutMatch)
    .sort((a, b) => a.fifa_match_no - b.fifa_match_no);

  const round32Matches = knockout.filter((match) => match.stage === 'ROUND_OF_32').slice(0, 16);
  const round16Matches = knockout.filter((match) => match.stage === 'ROUND_OF_16').slice(0, 8);
  const quarterMatches = knockout.filter((match) => match.stage === 'QUARTER_FINAL').slice(0, 4);
  const semiMatches = knockout.filter((match) => match.stage === 'SEMI_FINAL').slice(0, 2);
  const finalMatches = knockout.filter((match) => match.stage === 'FINAL').slice(0, 1);

  const round32 = round32Matches.map((match) => ({
    match,
    homeLabel: match.home_label,
    awayLabel: match.away_label
  }));
  const round16 = buildNextRound(round16Matches, round32, draft);
  const quarters = buildNextRound(quarterMatches, round16, draft);
  const semis = buildNextRound(semiMatches, quarters, draft);
  const final = buildNextRound(finalMatches, semis, draft);

  return { round32, round16, quarters, semis, final };
}

function buildNextRound(matches: Match[], feeders: BracketEntry[], draft: Record<string, DraftPrediction>): BracketEntry[] {
  return matches.map((match, index) => {
    const homeFeeder = feeders[index * 2];
    const awayFeeder = feeders[index * 2 + 1];
    return {
      match,
      homeLabel: homeFeeder ? selectedWinnerLabel(homeFeeder, draft) : match.home_label,
      awayLabel: awayFeeder ? selectedWinnerLabel(awayFeeder, draft) : match.away_label
    };
  });
}

function flattenBracketRounds(rounds: ReturnType<typeof buildBracketRounds>) {
  return [
    ...rounds.round32,
    ...rounds.round16,
    ...rounds.quarters,
    ...rounds.semis,
    ...rounds.final
  ];
}

function selectedWinnerLabel(entry: BracketEntry, draft: Record<string, DraftPrediction>) {
  const selected = draft[entry.match.id]?.outcome;
  if (selected === 'HOME_WIN') return entry.homeLabel;
  if (selected === 'AWAY_WIN') return entry.awayLabel;
  return `Winner #${entry.match.fifa_match_no}`;
}

function scoreToNullable(value: string) {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getScoreError(entry: BracketEntry, draft?: DraftPrediction) {
  if (!draft) return '';
  const hasHome = draft.homeScore.trim() !== '';
  const hasAway = draft.awayScore.trim() !== '';
  if (!hasHome && !hasAway) return '';
  if (hasHome !== hasAway) return `Enter both scores for #${entry.match.fifa_match_no}, or leave both blank.`;

  const home = Number(draft.homeScore);
  const away = Number(draft.awayScore);
  if (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0 || home > 99 || away > 99) {
    return `Scores for #${entry.match.fifa_match_no} must be whole numbers from 0 to 99.`;
  }
  if (home === away) return `Scores cannot be tied for #${entry.match.fifa_match_no}.`;
  if (draft.outcome === 'HOME_WIN' && home <= away) return `Score must match the selected winner for #${entry.match.fifa_match_no}.`;
  if (draft.outcome === 'AWAY_WIN' && away <= home) return `Score must match the selected winner for #${entry.match.fifa_match_no}.`;
  return '';
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
