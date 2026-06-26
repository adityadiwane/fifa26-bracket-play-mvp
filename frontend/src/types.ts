export type Outcome = 'HOME_WIN' | 'DRAW' | 'AWAY_WIN';

export type SessionState = {
  token: string;
  leagueId: string;
  leagueName: string;
  userId?: string;
  displayName?: string;
  adminToken?: string;
  inviteCode?: string;
};

export type Match = {
  id: string;
  fifa_match_no: number;
  stage: string;
  group_name?: string | null;
  home_team?: string | null;
  away_team?: string | null;
  home_placeholder?: string | null;
  away_placeholder?: string | null;
  home_label: string;
  away_label: string;
  kickoff_at: string;
  venue?: string | null;
  status: 'SCHEDULED' | 'COMPLETED' | 'POSTPONED';
  actual_outcome?: Outcome | null;
  actual_home_score?: number | null;
  actual_away_score?: number | null;
  is_locked: boolean;
  allowed_outcomes: Outcome[];
};

export type Prediction = {
  match_id: string;
  predicted_outcome: Outcome;
  predicted_home_score?: number | null;
  predicted_away_score?: number | null;
  points_awarded: number;
  created_at?: string;
  updated_at?: string;
};

export type LeaderboardRow = {
  rank: number;
  previous_rank: number;
  rank_change: 'up' | 'down' | 'same';
  user_id: string;
  display_name: string;
  total_points: number;
  bonus_points: number;
  score_bonus_points?: number;
  correct_picks: number;
  wrong_picks: number;
  completed_picks: number;
  latest_picks?: Record<string, Outcome | null>;
};

export type LatestMatch = {
  id: string;
  fifa_match_no: number;
  home_label: string;
  away_label: string;
  stage: string;
};
