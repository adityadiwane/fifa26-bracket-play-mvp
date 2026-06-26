"""Scoring helpers for FIFA26 Bracket Play.

The hosted Worker calculates the leaderboard dynamically in SQL. This Python
module is kept for local validation, tests, and future backfills.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum


class Outcome(StrEnum):
    HOME_WIN = "HOME_WIN"
    DRAW = "DRAW"
    AWAY_WIN = "AWAY_WIN"


CORRECT_WINNER_POINTS = 2
CORRECT_DRAW_POINTS = 2.5
CORRECT_SCORE_BONUS_POINTS = 1


@dataclass(frozen=True)
class MatchPrediction:
    match_id: str
    predicted_outcome: Outcome
    actual_outcome: Outcome | None
    predicted_home_score: int | None = None
    predicted_away_score: int | None = None
    actual_home_score: int | None = None
    actual_away_score: int | None = None


def calculate_match_points(
    predicted_outcome: Outcome | str | None,
    actual_outcome: Outcome | str | None,
    predicted_home_score: int | None = None,
    predicted_away_score: int | None = None,
    actual_home_score: int | None = None,
    actual_away_score: int | None = None,
) -> float:
    """Return points for a prediction under the current scoring rules."""
    if not predicted_outcome or not actual_outcome:
        return 0

    try:
        predicted = Outcome(predicted_outcome)
        actual = Outcome(actual_outcome)
    except ValueError:
        return 0

    if predicted != actual:
        return 0

    points = CORRECT_DRAW_POINTS if actual == Outcome.DRAW else CORRECT_WINNER_POINTS
    if (
        predicted_home_score is not None
        and predicted_away_score is not None
        and actual_home_score is not None
        and actual_away_score is not None
        and predicted_home_score == actual_home_score
        and predicted_away_score == actual_away_score
    ):
        points += CORRECT_SCORE_BONUS_POINTS

    return points


def is_outcome_allowed(stage: str, outcome: Outcome | str) -> bool:
    """Draw is allowed only for group-stage matches."""
    try:
        parsed = Outcome(outcome)
    except ValueError:
        return False

    return stage.upper() == "GROUP" or parsed != Outcome.DRAW


def is_score_prediction_allowed(stage: str, home_score: int | None, away_score: int | None) -> bool:
    """Scores are optional, but knockout score predictions cannot be tied."""
    if home_score is None and away_score is None:
        return True
    if home_score is None or away_score is None:
        return False
    if home_score < 0 or away_score < 0 or home_score > 99 or away_score > 99:
        return False
    return stage.upper() == "GROUP" or home_score != away_score
