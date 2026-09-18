import unittest
import copy
from app.game import resolve_shot, record, public_game

D = dict(
    choice="left_low",
    probabilities={"left_low": 1},
    confidence=1,
    model="test",
    durationMs=1,
    history=[],
)


def state():
    return dict(shots=[dict(number=1, decision=copy.deepcopy(D))], finished=False)


class GameTests(unittest.TestCase):
    def test_save_and_goal(self):
        self.assertEqual(
            resolve_shot(dict(x=-0.62, y=0.25), "left_low")["outcome"], "saved"
        )
        self.assertEqual(
            resolve_shot(dict(x=0.8, y=0.8), "left_low")["outcome"], "goal"
        )

    def test_wide_stays(self):
        for aim in [dict(x=1.2, y=0.5), dict(x=0, y=1.1), dict(x=0, y=-0.1)]:
            self.assertEqual(
                resolve_shot(aim, "left_high"),
                dict(outcome="wide", keeper=dict(x=0, y=0.4)),
            )

    def test_retry_preserves_shot(self):
        s = state()
        a = copy.deepcopy(record(s, 1, dict(x=0.8, y=0.8)))
        self.assertEqual(record(s, 1, dict(x=0.8, y=0.8)), a)
        self.assertEqual(len(s["shots"]), 1)

    def test_conflicting_retry(self):
        s = state()
        record(s, 1, dict(x=0.8, y=0.8))
        with self.assertRaises(ValueError):
            record(s, 1, dict(x=0, y=0.5))
        with self.assertRaises(ValueError):
            record(s, 2, dict(x=0, y=0.5))

    def test_hidden_future(self):
        m = dict(id="test", name="Guest", owner_hash="hidden", state=state())
        g = public_game(m, dict(attempts=0, goals=0))
        self.assertEqual(g["shots"], [])
        self.assertTrue(g["ready"])
        self.assertNotIn("owner_hash", g)


if __name__ == "__main__":
    unittest.main()
