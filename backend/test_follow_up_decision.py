
from src.ai_interview import decide_follow_up

intake = {
    "target_role": "AI Engineer",
    "company": "",
    "job_description": "",
}

turns = [
    {
        "question": {
            "text": (
                "How would you evaluate whether an AI model "
                "is ready for production?"
            ),
            "topic": "Model evaluation",
            "kind": "main",
        },
        "answer": "I would train the model and check its accuracy.",
    }
]

result = decide_follow_up(
    intake=intake,
    turns=turns,
    follow_ups_asked=0,
)

print("Decision:", result)

assert result["action"] in ("follow_up", "next_main")

if result["action"] == "follow_up":
    assert result["text"].strip()
    assert result["topic"].strip()

print("Test passed!")
