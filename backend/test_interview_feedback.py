
from src.ai_interview import (
    generate_interview_feedback,
    InterviewGenerationError,
)


intake = {
    "target_role": "Android Developer",
    "company": "Example Company",
    "job_description": (
        "Develop Android applications using Java or Kotlin, "
        "MVVM, dependency injection, and unit testing."
    ),
}

turns = [
    {
        "question": {
            "text": "How would you structure an Android application?",
            "topic": "Architecture",
            "kind": "main",
        },
        "answer": (
            "I would use MVVM and separate the UI, business logic, "
            "and data access. I would use dependency injection to "
            "make components easier to test."
        ),
    },
    {
        "question": {
            "text": "How would you test the business logic?",
            "topic": "Testing",
            "kind": "follow_up",
        },
        "answer": (
            "I would keep business logic independent of Android-specific "
            "classes and use unit tests with mocked dependencies."
        ),
    },
]

try:
    feedback = generate_interview_feedback(
        intake=intake,
        turns=turns,
        question_count=5,
    )

    print("Feedback generated successfully!")
    print("Overall score:", feedback["overall_score"])
    print("Summary:", feedback["summary"])
    print("Incomplete:", feedback["incomplete"])
    print("Dimensions:")

    for dimension in feedback["dimensions"]:
        print(
            f"- {dimension['name']}: {dimension['score']}/4"
        )

    assert len(feedback["dimensions"]) == 4
    assert 0 <= feedback["overall_score"] <= 100
    assert feedback["incomplete"] is True

    print("Test passed!")

except InterviewGenerationError as exc:
    print("Feedback test failed:", exc)
    raise
