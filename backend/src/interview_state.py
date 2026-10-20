from copy import deepcopy


class InterviewStateError(Exception):
    """Raised when an answer does not match the interview state."""


def record_answer(
    state: dict,
    question_id: str,
    answer: str,
) -> dict:
    """
    Record an answer to the currently pending question.

    Returns a new state dictionary without modifying the original.
    """

    answer = answer.strip()

    if not answer:
        raise InterviewStateError("The answer cannot be empty.")

    current_question = state.get("current_question")

    if not current_question:
        raise InterviewStateError(
            "There is no pending question to answer."
        )

    if str(current_question.get("id")) != str(question_id):
        raise InterviewStateError(
            "This answer does not match the current question."
        )

    turns = state.get("turns", [])

    # Protect against recording the same question more than once.
    if any(
        str(turn.get("question", {}).get("id")) == str(question_id)
        for turn in turns
    ):
        raise InterviewStateError(
            "An answer has already been recorded for this question."
        )

    # Copy the state so the original is not modified accidentally.
    updated_state = deepcopy(state)

    updated_state["turns"].append(
        {
            "question": deepcopy(current_question),
            "answer": answer,
        }
    )

    # The previous question has been answered.
    # The next question will be assigned by the interview workflow.
    updated_state["current_question"] = None

    return updated_state
