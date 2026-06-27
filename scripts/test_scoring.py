import unittest

from scoring import (
    Outcome,
    calculate_bracket_points,
    calculate_match_points,
    is_outcome_allowed,
    validate_double_tokens,
    BracketPrediction,
    MAX_DOUBLE_TOKENS,
)


class MatchScoringTests(unittest.TestCase):
    def test_correct_winner_pick_gets_two_points(self):
        self.assertEqual(calculate_match_points(Outcome.HOME_WIN, Outcome.HOME_WIN), 2)

    def test_correct_draw_pick_gets_two_and_half_points(self):
        self.assertEqual(calculate_match_points(Outcome.DRAW, Outcome.DRAW), 2.5)

    def test_wrong_winner_pick_gets_zero_points(self):
        self.assertEqual(calculate_match_points(Outcome.AWAY_WIN, Outcome.HOME_WIN), 0)

    def test_wrong_draw_pick_gets_zero_points(self):
        self.assertEqual(calculate_match_points(Outcome.DRAW, Outcome.HOME_WIN), 0)

    def test_missing_actual_result_gets_zero_points(self):
        self.assertEqual(calculate_match_points(Outcome.AWAY_WIN, None), 0)


class BracketScoringTests(unittest.TestCase):
    def test_correct_bracket_pick_gets_two_points(self):
        self.assertEqual(
            calculate_bracket_points(Outcome.HOME_WIN, Outcome.HOME_WIN, "ROUND_OF_32"),
            2,
        )

    def test_wrong_bracket_pick_gets_zero_points(self):
        self.assertEqual(
            calculate_bracket_points(Outcome.HOME_WIN, Outcome.AWAY_WIN, "ROUND_OF_32"),
            0,
        )

    def test_correct_final_pick_gets_champion_bonus(self):
        self.assertEqual(
            calculate_bracket_points(Outcome.HOME_WIN, Outcome.HOME_WIN, "FINAL"),
            6,
        )

    def test_correct_pick_doubled_gives_four_points(self):
        self.assertEqual(
            calculate_bracket_points(Outcome.HOME_WIN, Outcome.HOME_WIN, "ROUND_OF_16", is_doubled=True),
            4,
        )

    def test_correct_final_doubled_gives_sixteen_points(self):
        self.assertEqual(
            calculate_bracket_points(Outcome.HOME_WIN, Outcome.HOME_WIN, "FINAL", is_doubled=True),
            12,
        )

    def test_wrong_pick_doubled_gives_zero_points(self):
        self.assertEqual(
            calculate_bracket_points(Outcome.HOME_WIN, Outcome.AWAY_WIN, "QUARTER_FINAL", is_doubled=True),
            0,
        )

    def test_missing_result_gives_zero_points(self):
        self.assertEqual(
            calculate_bracket_points(Outcome.HOME_WIN, None, "SEMI_FINAL"),
            0,
        )


class OutcomeValidationTests(unittest.TestCase):
    def test_group_draw_is_allowed(self):
        self.assertTrue(is_outcome_allowed("GROUP", Outcome.DRAW))

    def test_knockout_draw_is_not_allowed(self):
        self.assertFalse(is_outcome_allowed("FINAL", Outcome.DRAW))

    def test_knockout_home_win_is_allowed(self):
        self.assertTrue(is_outcome_allowed("ROUND_OF_32", Outcome.HOME_WIN))


class DoubleTokenTests(unittest.TestCase):
    def test_within_limit_is_valid(self):
        predictions = [
            BracketPrediction(f"m_{i}", "ROUND_OF_32", Outcome.HOME_WIN, None, is_doubled=(i < 5))
            for i in range(10)
        ]
        self.assertTrue(validate_double_tokens(predictions))

    def test_exceeding_limit_is_invalid(self):
        predictions = [
            BracketPrediction(f"m_{i}", "ROUND_OF_32", Outcome.HOME_WIN, None, is_doubled=True)
            for i in range(MAX_DOUBLE_TOKENS + 1)
        ]
        self.assertFalse(validate_double_tokens(predictions))


if __name__ == "__main__":
    unittest.main()
