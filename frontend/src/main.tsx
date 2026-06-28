import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  adminLogin,
  ApiError,
  createLeague,
  getBracketLeaderboard,
  getLeaderboard,
  getMatches,
  getMyBracket,
  getMyPredictions,
  joinLeague,
  loginUser,
  lookupLeague,
  savePrediction,
  saveBracketPredictions,
  updateResult
} from './api';
import type { BracketLeaderboardRow, BracketPrediction, LatestMatch, LeaderboardRow, Match, Outcome, Prediction, SessionState } from './types';
import './styles.css';

const STORAGE_KEY = 'fifa26.session.v1';
const JOIN_PIN_PLACEHOLDER = 'Create your PIN. Remember it. No option to reset it yet';
const LOGIN_PIN_PLACEHOLDER = 'Enter your PIN';
const PLACEHOLDER_BASE_FONT_SIZE = 16;
const PLACEHOLDER_MIN_FONT_SIZE = 8;
const KNOCKOUT_STAGES = ['ROUND_OF_32', 'ROUND_OF_16', 'QUARTER_FINAL', 'SEMI_FINAL', 'THIRD_PLACE', 'FINAL'];
const MAX_DOUBLES = 8;

type AppTab = 'predictions' | 'bracket' | 'leaderboard' | 'admin';
type BracketDraft = {
  outcome?: Outcome;
  isDoubled: boolean;
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

// ─── Auth ────────────────────────────────────────────────────────────────────

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

// ─── Predictions Page (individual match picks) ───────────────────────────────

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

// ─── Bracket Page ────────────────────────────────────────────────────────────

type BracketEntry = {
  match: Match;
  homeLabel: string;
  awayLabel: string;
};

function BracketPage({ session }: { session: SessionState }) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [draft, setDraft] = useState<Record<string, BracketDraft>>({});
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [lockStatus, setLockStatus] = useState<'open' | 'phase1' | 'locked'>('open');

  useEffect(() => {
    async function load() {
      setError('');
      try {
        const [matchResponse, bracketResponse] = await Promise.all([
          getMatches(session.leagueId, session.token),
          getMyBracket(session.leagueId, session.token)
        ]);
        setMatches(matchResponse.matches);

        const nextDraft: Record<string, BracketDraft> = {};
        for (const bp of bracketResponse.predictions) {
          nextDraft[bp.match_id] = {
            outcome: bp.predicted_outcome,
            isDoubled: bp.is_doubled === 1,
          };
        }
        setDraft(nextDraft);

        // Determine lock status from R32 kickoffs (sorted chronologically)
        const r32Matches = matchResponse.matches
          .filter((m: Match) => m.stage === 'ROUND_OF_32')
          .sort((a: Match, b: Match) => new Date(a.kickoff_at).getTime() - new Date(b.kickoff_at).getTime());

        if (r32Matches.length >= 2) {
          const now = Date.now();
          const secondKickoff = new Date(r32Matches[1].kickoff_at).getTime();
          const firstKickoff = new Date(r32Matches[0].kickoff_at).getTime();
          if (now >= secondKickoff) setLockStatus('locked');
          else if (now >= firstKickoff) setLockStatus('phase1');
          else setLockStatus('open');
        }
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

  const r32Matches = useMemo(() =>
    matches.filter((m) => m.stage === 'ROUND_OF_32').sort((a, b) => new Date(a.kickoff_at).getTime() - new Date(b.kickoff_at).getTime()),
    [matches]
  );
  const firstR32Id = r32Matches[0]?.id ?? null;


  const completedPicks = knockoutEntries.filter(({ match }) => draft[match.id]?.outcome).length;
  const doublesUsed = Object.values(draft).filter((d) => d.isDoubled).length;

  async function persistPick(matchId: string, outcome: Outcome, isDoubled: boolean) {
    try {
      await saveBracketPredictions([{ matchId, predictedOutcome: outcome, isDoubled }], session.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save pick.');
    }
  }

  function updateDraft(matchId: string, update: Partial<BracketDraft>) {
    setMessage('');
    setError('');
    setDraft((prev) => {
      const next = {
        outcome: prev[matchId]?.outcome,
        isDoubled: prev[matchId]?.isDoubled ?? false,
        ...update
      };
      if (next.outcome) persistPick(matchId, next.outcome, next.isDoubled);
      return { ...prev, [matchId]: next };
    });
  }

  function toggleDouble(matchId: string) {
    setDraft((prev) => {
      const current = prev[matchId]?.isDoubled ?? false;
      if (!current && doublesUsed >= MAX_DOUBLES) return prev;
      const next = {
        outcome: prev[matchId]?.outcome,
        isDoubled: !current,
      };
      if (next.outcome) persistPick(matchId, next.outcome, next.isDoubled);
      return { ...prev, [matchId]: next };
    });
  }



  const [countdowns, setCountdowns] = useState<{ first: string; all: string }>({ first: '', all: '' });

  useEffect(() => {
    if (r32Matches.length < 2) return;
    const firstKO = new Date(r32Matches[0].kickoff_at).getTime();
    const secondKO = new Date(r32Matches[1].kickoff_at).getTime();

    function tick() {
      const now = Date.now();
      setCountdowns({
        first: now >= firstKO ? 'LOCKED' : formatCountdown(firstKO - now),
        all: now >= secondKO ? 'LOCKED' : formatCountdown(secondKO - now),
      });
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [r32Matches]);

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

  const firstLabel = r32Matches[0] ? `${r32Matches[0].home_label} vs ${r32Matches[0].away_label}` : '';
  const secondLabel = r32Matches[1] ? `${r32Matches[1].home_label} vs ${r32Matches[1].away_label}` : '';

  const lockBannerLines = lockStatus === 'locked'
    ? ['Bracket is fully locked. No changes allowed.']
    : lockStatus === 'phase1'
      ? [
          `${firstLabel} is locked (kickoff passed).`,
          `All remaining picks lock when ${secondLabel} kicks off.`
        ]
      : r32Matches.length >= 2
        ? [
            `First pick (${firstLabel}) must be locked in before kickoff.`,
            `All other bracket picks can be changed until ${secondLabel} kicks off.`
          ]
        : ['Bracket open'];

  return (
    <section className="bracket-section">
      <div className="section-header">
        <div>
          <p className="eyebrow">Knockout bracket</p>
          <h2>Round of 32 to World Champion</h2>
        </div>
        <div className="bracket-actions">
          <span>{completedPicks}/{knockoutEntries.length} picked</span>
          <span className="double-counter">{doublesUsed}/{MAX_DOUBLES} double points</span>
        </div>
      </div>

      <div className={`lock-banner ${lockStatus}`}>
        {lockBannerLines.map((line, i) => <p key={i}>{line}</p>)}
        {lockStatus !== 'locked' && r32Matches.length >= 2 && (
          <div className="countdown-row">
            <span className="countdown-item">
              <span className="countdown-label">First pick locks in:</span>
              <span className="countdown-value">{countdowns.first}</span>
            </span>
            <span className="countdown-item">
              <span className="countdown-label">All picks lock in:</span>
              <span className="countdown-value">{countdowns.all}</span>
            </span>
          </div>
        )}
      </div>

      <details className="bracket-instructions">
        <summary>How to play</summary>
        <div className="bracket-instructions-body">
          <p><strong>All picks must be submitted together as a complete bracket</strong> — predict the winner of every knockout match from the Round of 32 through to the Final.</p>

          <h4>Scoring</h4>
          <p>Points increase as the tournament progresses:</p>
          <table className="scoring-table">
            <tbody>
              <tr><td>Round of 32</td><td>2 pts</td></tr>
              <tr><td>Round of 16</td><td>4 pts</td></tr>
              <tr><td>Quarter-Finals</td><td>6 pts</td></tr>
              <tr><td>Semi-Finals</td><td>8 pts</td></tr>
              <tr><td>3rd Place Match</td><td>8 pts</td></tr>
              <tr><td>Final</td><td>10 pts</td></tr>
            </tbody>
          </table>

          <h4>Double Points (x2)</h4>
          <p>You have <strong>8 double tokens</strong> to use across your entire bracket. Apply a double to any match you feel confident about — if your pick is correct, the points for that match are doubled. If your pick is wrong, the token is wasted and you score zero. Choose wisely!</p>
        </div>
      </details>

      {message && <div className="success">{message}</div>}
      {error && <div className="error">{error}</div>}

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
            lockStatus={lockStatus}
            firstR32Id={firstR32Id}
            doublesUsed={doublesUsed}
            onChange={updateDraft}
            onToggleDouble={toggleDouble}
          />

          <div className="final-column">
            <p className="round-label">Final</p>
            {bracketRounds.final[0] && (
              <BracketMatchCard
                entry={bracketRounds.final[0]}
                draft={draft[bracketRounds.final[0].match.id]}
                locked={lockStatus === 'locked'}
                doublesUsed={doublesUsed}
                onChange={(update) => updateDraft(bracketRounds.final[0].match.id, update)}
                onToggleDouble={() => toggleDouble(bracketRounds.final[0].match.id)}
              />
            )}
            <div className="champion-box">
              <span>Champion</span>
              <strong>{bracketRounds.final[0] ? selectedWinnerLabel(bracketRounds.final[0], draft) : 'TBD'}</strong>
            </div>
            {bracketRounds.thirdPlace[0] && (
              <div className="third-place-box">
                <p className="round-label">3rd Place</p>
                <BracketMatchCard
                  entry={bracketRounds.thirdPlace[0]}
                  draft={draft[bracketRounds.thirdPlace[0].match.id]}
                  locked={lockStatus === 'locked'}
                  doublesUsed={doublesUsed}
                  onChange={(update) => updateDraft(bracketRounds.thirdPlace[0].match.id, update)}
                  onToggleDouble={() => toggleDouble(bracketRounds.thirdPlace[0].match.id)}
                />
              </div>
            )}
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
            lockStatus={lockStatus}
            firstR32Id={firstR32Id}
            doublesUsed={doublesUsed}
            onChange={updateDraft}
            onToggleDouble={toggleDouble}
          />
        </div>
      </div>
    </section>
  );
}

function BracketSide({ side, entries, draft, lockStatus, firstR32Id, doublesUsed, onChange, onToggleDouble }: {
  side: 'left' | 'right';
  entries: BracketEntry[][];
  draft: Record<string, BracketDraft>;
  lockStatus: 'open' | 'phase1' | 'locked';
  firstR32Id: string | null;
  doublesUsed: number;
  onChange: (matchId: string, update: Partial<BracketDraft>) => void;
  onToggleDouble: (matchId: string) => void;
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
            {roundEntries.map((entry) => {
              const isLocked = lockStatus === 'locked' || (lockStatus === 'phase1' && entry.match.id === firstR32Id);
              return (
                <BracketMatchCard
                  key={entry.match.id}
                  entry={entry}
                  draft={draft[entry.match.id]}
                  locked={isLocked}
                  doublesUsed={doublesUsed}
                  onChange={(update) => onChange(entry.match.id, update)}
                  onToggleDouble={() => onToggleDouble(entry.match.id)}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function BracketMatchCard({ entry, draft, locked, doublesUsed, onChange, onToggleDouble }: {
  entry: BracketEntry;
  draft?: BracketDraft;
  locked: boolean;
  doublesUsed: number;
  onChange: (update: Partial<BracketDraft>) => void;
  onToggleDouble: () => void;
}) {
  const selected = draft?.outcome;
  const isDoubled = draft?.isDoubled ?? false;
  const canDouble = isDoubled || doublesUsed < MAX_DOUBLES;

  const isCompleted = entry.match.status === 'COMPLETED';
  const isCorrect = isCompleted && selected && selected === entry.match.actual_outcome;
  const isWrong = isCompleted && selected && selected !== entry.match.actual_outcome;

  const resultClass = isCorrect ? 'result-correct' : isWrong ? 'result-wrong' : '';

  return (
    <article className={`bracket-match ${locked ? 'locked' : ''} ${isDoubled ? 'doubled' : ''} ${resultClass}`}>
      <div className="bracket-match-meta">
        <span>#{entry.match.fifa_match_no}</span>
        <span>{formatStage(entry.match.stage)}</span>
        {isCorrect && <span className="result-badge correct">&#10003;</span>}
        {isWrong && <span className="result-badge wrong">&#10007;</span>}
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

      <button
        type="button"
        className={`double-toggle ${isDoubled ? 'active' : ''}`}
        disabled={locked || (!isDoubled && !canDouble)}
        onClick={onToggleDouble}
        title={isDoubled ? 'Remove double' : 'Use a double token (2x points if correct)'}
      >
        2x {isDoubled ? '\u2713' : ''}
      </button>
    </article>
  );
}

// ─── Match Card ──────────────────────────────────────────────────────────────

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

// ─── Leaderboard Page (with sub-tabs) ────────────────────────────────────────

function LeaderboardPage({ session }: { session: SessionState }) {
  const [subTab, setSubTab] = useState<'match' | 'bracket'>('match');

  return (
    <section className="panel wide">
      <div className="section-header">
        <div>
          <p className="eyebrow">Live standings</p>
          <h2>Leaderboard</h2>
        </div>
      </div>
      <div className="segmented leaderboard-tabs">
        <button className={subTab === 'match' ? 'active' : ''} onClick={() => setSubTab('match')}>Match Predictions</button>
        <button className={subTab === 'bracket' ? 'active' : ''} onClick={() => setSubTab('bracket')}>Bracket Predictions</button>
      </div>
      {subTab === 'match' && <MatchLeaderboard session={session} />}
      {subTab === 'bracket' && <BracketLeaderboard session={session} />}
    </section>
  );
}

function MatchLeaderboard({ session }: { session: SessionState }) {
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
    if (!pick) return '\u2013';
    if (pick === 'HOME_WIN') return stripEmoji(match.home_label);
    if (pick === 'AWAY_WIN') return stripEmoji(match.away_label);
    return 'Draw';
  }

  return (
    <>
      {error && <div className="error">{error}</div>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Rank</th><th>Player</th><th>Points</th>
              {latestMatches.map((m) => (
                <th key={m.id}>{abbreviateLabel(m.home_label)} vs {abbreviateLabel(m.away_label)}</th>
              ))}
              <th>Correct</th><th>Wrong</th>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <div className="empty">No players have joined yet.</div>}
    </>
  );
}

function BracketLeaderboard({ session }: { session: SessionState }) {
  const [rows, setRows] = useState<BracketLeaderboardRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const response = await getBracketLeaderboard(session.leagueId, session.token);
        setRows(response.leaderboard);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load bracket leaderboard.');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [session.leagueId, session.token]);

  if (loading) return <Loading />;

  return (
    <>
      {error && <div className="error">{error}</div>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Rank</th><th>Player</th><th>Points</th><th>Correct</th><th>Wrong</th><th>Doubles</th><th>Champion</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.user_id}>
                <td>{row.rank}</td>
                <td>{row.display_name}</td>
                <td><strong>{row.total_points}</strong></td>
                <td>{row.correct_picks}</td>
                <td>{row.wrong_picks}</td>
                <td>{row.doubles_used}/{MAX_DOUBLES}</td>
                <td>{row.champion_pick ?? '\u2013'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <div className="empty">No bracket predictions yet.</div>}
    </>
  );
}

// ─── Admin Page ──────────────────────────────────────────────────────────────

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

        <button className="primary" disabled={!adminToken}>Save result</button>
        {!adminToken && <p className="muted small">Login as admin first.</p>}
      </form>

      {message && <div className="success">{message}</div>}
      {error && <div className="error">{error}</div>}
    </section>
  );
}

// ─── Shared Components ───────────────────────────────────────────────────────

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

// ─── Utilities ───────────────────────────────────────────────────────────────

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

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'LOCKED';
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m ${seconds}s`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  return `${minutes}m ${seconds}s`;
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

function abbreviateLabel(label: string): string {
  const withoutEmoji = label.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\u{E0061}-\u{E007A}\u{E007F}\u200D\uFE0F]/gu, '').trim();
  return withoutEmoji.slice(0, 3).toUpperCase();
}

function stripEmoji(label: string): string {
  return label.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\u{E0061}-\u{E007A}\u{E007F}\u200D\uFE0F]/gu, '').trim();
}

function outcomeLabel(outcome: Outcome, match: Match) {
  if (outcome === 'HOME_WIN') return match.home_label;
  if (outcome === 'AWAY_WIN') return match.away_label;
  return 'Draw';
}

function isKnockoutMatch(match: Match) {
  return KNOCKOUT_STAGES.includes(match.stage);
}

function parseFeederMatchNo(placeholder: string | null | undefined): number | null {
  if (!placeholder) return null;
  const m = placeholder.match(/(?:Winner|Loser)\s+Match\s+(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

function buildBracketRounds(matches: Match[], draft: Record<string, BracketDraft>) {
  const knockout = matches.filter(isKnockoutMatch);
  const byNo = new Map<number, Match>();
  knockout.forEach((m) => byNo.set(m.fifa_match_no, m));

  const finalMatch = knockout.find((m) => m.stage === 'FINAL');
  if (!finalMatch) {
    return { round32: [], round16: [], quarters: [], semis: [], final: [], thirdPlace: [] };
  }

  const semiHomeNo = parseFeederMatchNo(finalMatch.home_placeholder);
  const semiAwayNo = parseFeederMatchNo(finalMatch.away_placeholder);
  const leftSemi = semiHomeNo ? byNo.get(semiHomeNo) : undefined;
  const rightSemi = semiAwayNo ? byNo.get(semiAwayNo) : undefined;

  function orderSide(semiMatch: Match | undefined): { r32: Match[]; r16: Match[]; qf: Match[]; sf: Match[] } {
    if (!semiMatch) return { r32: [], r16: [], qf: [], sf: [] };
    const qfHomeNo = parseFeederMatchNo(semiMatch.home_placeholder);
    const qfAwayNo = parseFeederMatchNo(semiMatch.away_placeholder);
    const qf1 = qfHomeNo ? byNo.get(qfHomeNo) : undefined;
    const qf2 = qfAwayNo ? byNo.get(qfAwayNo) : undefined;

    function orderQfBranch(qfMatch: Match | undefined): { r32: Match[]; r16: Match[] } {
      if (!qfMatch) return { r32: [], r16: [] };
      const r16HomeNo = parseFeederMatchNo(qfMatch.home_placeholder);
      const r16AwayNo = parseFeederMatchNo(qfMatch.away_placeholder);
      const r16a = r16HomeNo ? byNo.get(r16HomeNo) : undefined;
      const r16b = r16AwayNo ? byNo.get(r16AwayNo) : undefined;

      function orderR16Branch(r16Match: Match | undefined): Match[] {
        if (!r16Match) return [];
        const r32HomeNo = parseFeederMatchNo(r16Match.home_placeholder);
        const r32AwayNo = parseFeederMatchNo(r16Match.away_placeholder);
        const r32a = r32HomeNo ? byNo.get(r32HomeNo) : undefined;
        const r32b = r32AwayNo ? byNo.get(r32AwayNo) : undefined;
        return [r32a, r32b].filter(Boolean) as Match[];
      }

      return {
        r32: [...orderR16Branch(r16a), ...orderR16Branch(r16b)],
        r16: [r16a, r16b].filter(Boolean) as Match[]
      };
    }

    const branch1 = orderQfBranch(qf1);
    const branch2 = orderQfBranch(qf2);
    return {
      r32: [...branch1.r32, ...branch2.r32],
      r16: [...branch1.r16, ...branch2.r16],
      qf: [qf1, qf2].filter(Boolean) as Match[],
      sf: [semiMatch]
    };
  }

  const left = orderSide(leftSemi);
  const right = orderSide(rightSemi);

  function toEntry(match: Match, allEntries: BracketEntry[]): BracketEntry {
    const homeNo = parseFeederMatchNo(match.home_placeholder);
    const awayNo = parseFeederMatchNo(match.away_placeholder);
    const homeFeeder = homeNo ? allEntries.find((e) => e.match.fifa_match_no === homeNo) : undefined;
    const awayFeeder = awayNo ? allEntries.find((e) => e.match.fifa_match_no === awayNo) : undefined;
    return {
      match,
      homeLabel: homeFeeder ? selectedWinnerLabel(homeFeeder, draft) : match.home_label,
      awayLabel: awayFeeder ? selectedWinnerLabel(awayFeeder, draft) : match.away_label
    };
  }

  const allR32 = [...left.r32, ...right.r32];
  const round32: BracketEntry[] = allR32.map((m) => ({ match: m, homeLabel: m.home_label, awayLabel: m.away_label }));

  const allR16 = [...left.r16, ...right.r16];
  const round16: BracketEntry[] = allR16.map((m) => toEntry(m, round32));

  const allQF = [...left.qf, ...right.qf];
  const quarters: BracketEntry[] = allQF.map((m) => toEntry(m, round16));

  const allSF = [...left.sf, ...right.sf];
  const semis: BracketEntry[] = allSF.map((m) => toEntry(m, quarters));

  const final: BracketEntry[] = [toEntry(finalMatch, semis)];

  const thirdPlaceMatch = knockout.find((m) => m.stage === 'THIRD_PLACE');
  const thirdPlace: BracketEntry[] = thirdPlaceMatch ? [{
    match: thirdPlaceMatch,
    homeLabel: semis[0] ? selectedLoserLabel(semis[0], draft) : thirdPlaceMatch.home_label,
    awayLabel: semis[1] ? selectedLoserLabel(semis[1], draft) : thirdPlaceMatch.away_label
  }] : [];

  return { round32, round16, quarters, semis, final, thirdPlace };
}

function flattenBracketRounds(rounds: ReturnType<typeof buildBracketRounds>) {
  return [
    ...rounds.round32,
    ...rounds.round16,
    ...rounds.quarters,
    ...rounds.semis,
    ...rounds.final,
    ...rounds.thirdPlace
  ];
}

function selectedWinnerLabel(entry: BracketEntry, draft: Record<string, BracketDraft>) {
  const selected = draft[entry.match.id]?.outcome;
  if (selected === 'HOME_WIN') return entry.homeLabel;
  if (selected === 'AWAY_WIN') return entry.awayLabel;
  return `Winner #${entry.match.fifa_match_no}`;
}

function selectedLoserLabel(entry: BracketEntry, draft: Record<string, BracketDraft>) {
  const selected = draft[entry.match.id]?.outcome;
  if (selected === 'HOME_WIN') return entry.awayLabel;
  if (selected === 'AWAY_WIN') return entry.homeLabel;
  return `Loser #${entry.match.fifa_match_no}`;
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
