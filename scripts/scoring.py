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


CORRECT_PICK_POINTS = 3


@dataclass(frozen=True)
class MatchPrediction:
    match_id: str
    predicted_outcome: Outcome
    actual_outcome: Outcome | None


def calculate_match_points(predicted_outcome: Outcome | str | None, actual_outcome: Outcome | str | None) -> int:
    """Return 3 points for a correct pick, otherwise 0."""
    if not predicted_outcome or not actual_outcome:
        return 0

    try:
        predicted = Outcome(predicted_outcome)
        actual = Outcome(actual_outcome)
    except ValueError:
        return 0

    return CORRECT_PICK_POINTS if predicted == actual else 0


def is_outcome_allowed(stage: str, outcome: Outcome | str) -> bool:
    """Draw is allowed only for group-stage matches."""
    try:
        parsed = Outcome(outcome)
    except ValueError:
        return False

    return stage.upper() == "GROUP" or parsed != Outcome.DRAW
