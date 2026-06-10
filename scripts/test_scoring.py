import unittest

from scoring import Outcome, calculate_match_points, is_outcome_allowed


class ScoringTests(unittest.TestCase):
    def test_correct_pick_gets_three_points(self):
        self.assertEqual(calculate_match_points(Outcome.HOME_WIN, Outcome.HOME_WIN), 3)

    def test_wrong_pick_gets_zero_points(self):
        self.assertEqual(calculate_match_points(Outcome.AWAY_WIN, Outcome.HOME_WIN), 0)

    def test_missing_actual_result_gets_zero_points(self):
        self.assertEqual(calculate_match_points(Outcome.AWAY_WIN, None), 0)

    def test_group_draw_is_allowed(self):
        self.assertTrue(is_outcome_allowed("GROUP", Outcome.DRAW))

    def test_knockout_draw_is_not_allowed(self):
        self.assertFalse(is_outcome_allowed("FINAL", Outcome.DRAW))


if __name__ == "__main__":
    unittest.main()
