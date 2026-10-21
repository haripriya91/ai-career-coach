import unittest

from src.interview_state import (
    InterviewStateError,
    record_answer,
)


class RecordAnswerTests(unittest.TestCase):

    def setUp(self):
        self.question = {
            "id": "question-123",
            "text": "How would you integrate a REST API in React?",
            "topic": "API integration",
            "kind": "main",
        }

        self.state = {
            "question_count": 5,
            "main_questions_asked": 1,
            "follow_ups_asked": 0,
            "current_question": self.question,
            "turns": [],
        }

    def test_records_answer(self):
        updated = record_answer(
            self.state,
            "question-123",
            "I would use fetch or an API client.",
        )

        self.assertEqual(len(updated["turns"]), 1)
        self.assertEqual(
            updated["turns"][0]["answer"],
            "I would use fetch or an API client.",
        )
        self.assertIsNone(updated["current_question"])

    def test_original_state_is_not_modified(self):
        record_answer(
            self.state,
            "question-123",
            "I would use fetch.",
        )

        self.assertEqual(self.state["turns"], [])
        self.assertIsNotNone(self.state["current_question"])

    def test_rejects_wrong_question_id(self):
        with self.assertRaises(InterviewStateError):
            record_answer(
                self.state,
                "wrong-question",
                "My answer",
            )

    def test_rejects_empty_answer(self):
        with self.assertRaises(InterviewStateError):
            record_answer(
                self.state,
                "question-123",
                "   ",
            )

    def test_rejects_answer_when_no_question_is_pending(self):
        state = {
            **self.state,
            "current_question": None,
        }

        with self.assertRaises(InterviewStateError):
            record_answer(state, "question-123", "My answer")


if __name__ == "__main__":
    unittest.main()
