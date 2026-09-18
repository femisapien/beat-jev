import unittest
import copy
from app.game import resolve_shot, record, submit, public_game, keeper_move

D = dict(
    choice="left_low",
    probabilities={"left_low": 1},
    confidence=1,
    model="test",
    durationMs=1,
    state={"ball": {"projectedCrossing": {"x": -0.62, "y": 0.25}}},
)


def state():
    return dict(shots=[], started=True, finished=False)


class GameTests(unittest.TestCase):
    def test_save_and_goal(self):
        self.assertEqual(
            resolve_shot(dict(x=-0.62, y=0.25), "left_low")["outcome"], "saved"
        )
        self.assertEqual(
            resolve_shot(dict(x=0.92, y=0.92), "right_high")["outcome"], "goal"
        )
        self.assertEqual(
            resolve_shot(dict(x=0, y=0.4), "leave_wide")["outcome"], "goal"
        )

    def test_wide_stays(self):
        for aim in [dict(x=1.2, y=0.5), dict(x=0, y=1.1), dict(x=0, y=-0.1)]:
            self.assertEqual(
                resolve_shot(aim, "left_high"),
                dict(outcome="wide", keeper=dict(x=0, y=0.4)),
            )

    def test_retry_locks_target(self):
        s = state()
        aim = dict(x=0.8, y=0.8)
        shot = submit(s, 1, aim)
        self.assertIs(submit(s, 1, aim), shot)
        with self.assertRaises(ValueError):
            submit(s, 1, dict(x=0, y=0.3))
        with self.assertRaises(ValueError):
            record(s, 1, aim)
        shot["decision"] = D
        shot.update(keeper_move(aim, D["choice"]))
        a = copy.deepcopy(record(s, 1, aim))
        self.assertEqual(record(s, 1, aim), a)
        self.assertEqual(len(s["shots"]), 1)

    def test_out_of_order(self):
        s = state()
        with self.assertRaises(ValueError):
            submit(s, 2, dict(x=0, y=0.3))

    def test_pending_is_hidden(self):
        m = dict(id="test", name="Guest", owner_hash="hidden", state=state())
        self.assertTrue(public_game(m, dict(attempts=0, goals=0))["ready"])
        submit(m["state"], 1, dict(x=0.8, y=0.8))
        g = public_game(m, dict(attempts=0, goals=0))
        self.assertEqual(g["shots"], [])
        self.assertFalse(g["ready"])
        self.assertNotIn("owner_hash", g)


if __name__ == "__main__":
    unittest.main()
