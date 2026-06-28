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
MAX_DOUBLE_TOKENS = 8

BRACKET_STAGE_POINTS: dict[str, int] = {
    "ROUND_OF_32": 2,
    "ROUND_OF_16": 4,
    "QUARTER_FINAL": 6,
    "SEMI_FINAL": 8,
    "THIRD_PLACE": 8,
    "FINAL": 10,
}


@dataclass(frozen=True)
class MatchPrediction:
    match_id: str
    predicted_outcome: Outcome
    actual_outcome: Outcome | None


@dataclass(frozen=True)
class BracketPrediction:
    match_id: str
    stage: str
    predicted_outcome: Outcome
    actual_outcome: Outcome | None
    is_doubled: bool = False


def calculate_match_points(
    predicted_outcome: Outcome | str | None,
    actual_outcome: Outcome | str | None,
) -> float:
    """Return points for an individual match prediction."""
    if not predicted_outcome or not actual_outcome:
        return 0

    try:
        predicted = Outcome(predicted_outcome)
        actual = Outcome(actual_outcome)
    except ValueError:
        return 0

    if predicted != actual:
        return 0

    return CORRECT_DRAW_POINTS if actual == Outcome.DRAW else CORRECT_WINNER_POINTS


def calculate_bracket_points(
    predicted_outcome: Outcome | str | None,
    actual_outcome: Outcome | str | None,
    stage: str,
    is_doubled: bool = False,
) -> float:
    """Return points for a bracket prediction.

    Points scale by round: R32=2, R16=4, QF=6, SF/3rd=8, Final=10.
    If doubled and correct: points * 2.
    If wrong: 0 pts (double token wasted).
    """
    if not predicted_outcome or not actual_outcome:
        return 0

    try:
        predicted = Outcome(predicted_outcome)
        actual = Outcome(actual_outcome)
    except ValueError:
        return 0

    if predicted != actual:
        return 0

    base = BRACKET_STAGE_POINTS.get(stage.upper(), 2)

    if is_doubled:
        base *= 2

    return base


def is_outcome_allowed(stage: str, outcome: Outcome | str) -> bool:
    """Draw is allowed only for group-stage matches."""
    try:
        parsed = Outcome(outcome)
    except ValueError:
        return False

    return stage.upper() == "GROUP" or parsed != Outcome.DRAW


def validate_double_tokens(predictions: list[BracketPrediction]) -> bool:
    """Ensure no more than MAX_DOUBLE_TOKENS are used."""
    return sum(1 for p in predictions if p.is_doubled) <= MAX_DOUBLE_TOKENS
