
# Reads the target role, CV, and job description from the saved workspace data.
# Sends those details to OpenAI.
# Requests exactly one opening interview question in JSON format.
# Validates the returned question and topic.
# Reports a retryable error if the AI request fails.

import json
import os

from openai import OpenAI, OpenAIError

import json
import logging

logger = logging.getLogger(__name__)

from pathlib import Path
from dotenv import load_dotenv

BACKEND_ENV = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(BACKEND_ENV)


class InterviewGenerationError(Exception):
    """Raised when an interview question cannot be generated."""


def generate_first_question(intake: dict) -> dict:
    """
    Generate the first interview question using the saved workspace intake.

    Returns:
        A dictionary containing the question text and topic.
        The backend will assign the question ID and kind.
    """

    target_role = intake.get("target_role", "").strip()

    if not target_role:
        raise ValueError("The target role is required.")

    cv_text = intake.get("cv_text", "").strip()
    job_description = intake.get("job_description", "").strip()

    model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

    prompt = f"""
You are a professional job interviewer.

Prepare exactly ONE opening interview question for this role:
{target_role}

Candidate CV (may be empty):
{cv_text or "Not provided"}

Job description (may be empty):
{job_description or "Not provided"}

Rules:
- Tailor the question to the role.
- If CV or job description information is available, use it where relevant.
- Do not invent the candidate's experience or qualifications.
- Ask one clear, open-ended question.
- Do not include an answer, explanation, or additional questions.

Return only a valid JSON object with these fields:
- "text": the interview question
- "topic": a short topic label
"""

    try:
        client = OpenAI(timeout=30.0, max_retries=1)

        response = client.chat.completions.create(
            model=model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You generate realistic interview questions. "
                        "Follow the requested JSON format."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            response_format={"type": "json_object"},
            reasoning_effort="none",
        )

        content = response.choices[0].message.content

        if not content:
            raise InterviewGenerationError(
                "The AI returned an empty interview question."
            )

        result = json.loads(content)
        question_text = result.get("text")
        topic = result.get("topic")

        if not isinstance(question_text, str) or not question_text.strip():
            raise InterviewGenerationError(
                "The AI did not return a valid question."
            )

        if not isinstance(topic, str) or not topic.strip():
            raise InterviewGenerationError(
                "The AI did not return a valid question topic."
            )

        return {
            "text": question_text.strip(),
            "topic": topic.strip(),
        }

    except OpenAIError as exc:
        raise InterviewGenerationError(
            "The AI service could not generate a question. "
            "Please try again."
        ) from exc
    except (json.JSONDecodeError, TypeError, KeyError) as exc:
        raise InterviewGenerationError(
            "The AI returned an invalid question format. "
            "Please try again."
        ) from exc



def generate_next_question(
    intake: dict,
    turns: list[dict],
    next_question_number: int,
) -> dict:
    """Generate the next main interview question using prior answers."""

    target_role = intake.get("target_role", "").strip()

    if not target_role:
        raise ValueError("The target role is required.")

    history = [
        {
            "question": turn["question"]["text"],
            "answer": turn["answer"],
        }
        for turn in turns
    ]

    prompt = f"""
You are a professional interviewer conducting a mock interview.

Target role: {target_role}
Company: {intake.get("company") or "Not specified"}
CV: {intake.get("cv_text") or "Not provided"}
Job description: {intake.get("job_description") or "Not provided"}

Previous interview questions and answers:
{json.dumps(history, ensure_ascii=False)}

Generate exactly ONE new main interview question.
This is main question number {next_question_number}.

Rules:
- Make the question relevant to the target role.
- Use the previous answers to avoid repeating questions.
- Do not invent candidate experience.
- Ask one clear question only.
- Do not ask a follow-up question in this function.
- Return a JSON object with "text" and "topic".
"""

    try:
        client = OpenAI(timeout=30.0, max_retries=1)

        response = client.chat.completions.create(
            model=os.getenv("OPENAI_MODEL", "gpt-6-luna"),
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You generate realistic, role-specific interview "
                        "questions. Return valid JSON only."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            response_format={"type": "json_object"},
            reasoning_effort="none",
        )

        content = response.choices[0].message.content
        if not content:
            raise InterviewGenerationError(
                "The AI returned an empty interview question."
            )

        result = json.loads(content)
        text = result.get("text")
        topic = result.get("topic")

        if not isinstance(text, str) or not text.strip():
            raise InterviewGenerationError(
                "The AI did not return a valid question."
            )

        if not isinstance(topic, str) or not topic.strip():
            raise InterviewGenerationError(
                "The AI did not return a valid question topic."
            )

        return {
            "text": text.strip(),
            "topic": topic.strip(),
        }

    except OpenAIError as exc:
        raise InterviewGenerationError(
            "The AI service could not generate the next question. "
            "Please try again."
        ) from exc
    except (json.JSONDecodeError, TypeError, KeyError) as exc:
        raise InterviewGenerationError(
            "The AI returned an invalid question format."
        ) from exc


def decide_follow_up(intake: dict, turns: list, follow_ups_asked: int) -> dict:
    """Decide whether to ask a follow-up or proceed to the next main question."""

    if follow_ups_asked >= 2:
        return {"action": "next_main", "text": "", "topic": ""}

    if not turns:
        raise InterviewGenerationError(
            "At least one answered question is required."
        )

    last_turn = turns[-1]

    prompt = f"""
You are an experienced interviewer conducting a mock interview.

Candidate's target role: {intake.get("target_role", "Not specified")}
Company: {intake.get("company", "Not specified")}
Job description: {intake.get("job_description", "Not provided")}

Latest interview question:
{last_turn["question"]["text"]}

Candidate's answer:
{last_turn["answer"]}

Follow-up questions already asked: {follow_ups_asked}
Maximum follow-up questions for the entire interview: 2

Decide whether a follow-up question would meaningfully improve the interview.

Choose "follow_up" when the answer is vague, lacks an important explanation,
or would benefit from a relevant clarification.

Choose "next_main" when the answer is sufficiently clear, or another
question would add little value.

A follow-up must relate directly to the candidate's answer and target role.
Do not ask a generic question. Do not repeat the original question.

Return only a JSON object with these fields:
{{
    "action": "follow_up" or "next_main",
    "text": "The follow-up question, or an empty string for next_main",
    "topic": "A short topic label, or an empty string for next_main"
}}
"""

    try:
        client = OpenAI(timeout=30.0, max_retries=1)

        response = client.chat.completions.create(
            model=os.getenv("OPENAI_MODEL", "gpt-6-luna"),
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You make careful interview decisions and return "
                        "valid JSON only."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            response_format={"type": "json_object"},
            reasoning_effort="none",
        )

        result = json.loads(response.choices[0].message.content or "{}")

    except Exception as exc:
        logger.exception("Follow-up decision error")
        raise InterviewGenerationError(
            "Could not decide whether to ask a follow-up question."
        ) from exc

    if not isinstance(result, dict):
        raise InterviewGenerationError("The AI returned an invalid response.")

    action = result.get("action")

    if action not in ("follow_up", "next_main"):
        raise InterviewGenerationError("The AI returned an invalid action.")

    if action == "follow_up":
        text = result.get("text")
        topic = result.get("topic")

        if not isinstance(text, str) or not text.strip():
            raise InterviewGenerationError(
                "The AI returned an empty follow-up question."
            )

        if not isinstance(topic, str) or not topic.strip():
            raise InterviewGenerationError(
                "The AI returned an invalid follow-up topic."
            )

        return {
            "action": "follow_up",
            "text": text.strip(),
            "topic": topic.strip(),
        }

    return {"action": "next_main", "text": "", "topic": ""} 


def generate_interview_feedback(
    intake: dict,
    turns: list[dict],
    question_count: int,
) -> dict:
    """Generate structured final feedback for a completed mock interview."""

    if not turns:
        raise InterviewGenerationError(
            "At least one answered question is required for feedback."
        )

    target_role = intake.get("target_role", "").strip()

    if not target_role:
        raise ValueError("The target role is required.")

    history = [
        {
            "question": turn["question"]["text"],
            "question_type": turn["question"].get("kind", "main"),
            "topic": turn["question"].get("topic", ""),
            "answer": turn["answer"],
        }
        for turn in turns
    ]

    main_questions_answered = sum(
        1
        for turn in turns
        if turn["question"].get("kind") == "main"
    )

    incomplete = main_questions_answered < question_count

    prompt = f"""
You are an experienced technical interviewer and career coach.

Evaluate the candidate's interview performance for the target role.

Target role: {target_role}
Company: {intake.get("company") or "Not specified"}
Job description: {intake.get("job_description") or "Not provided"}

Interview questions and candidate answers:
{json.dumps(history, ensure_ascii=False)}

Evaluation rules:
- Evaluate only the evidence in the questions and answers provided.
- Do not invent experience, skills, or qualifications.
- Consider the role and job description when assessing relevance.
- Be constructive, specific, and fair.
- Treat follow-up answers as part of the candidate's overall performance.
- Do not penalize the candidate merely for being asked a follow-up.
- Give each dimension an integer score from 0 to 4.
- 0 means no relevant evidence; 1 means weak; 2 means developing;
  3 means good; 4 means excellent.
- The four dimensions must be:
  relevance, specificity, clarity, role_reasoning.
- Calculate overall_score from 0 to 100, based on the four dimension scores.
- If the interview is incomplete, evaluate the available answers and set
  incomplete to true.
- Summary should briefly describe the overall performance.
- Strengths should list specific things done well.
- Improvements should give actionable suggestions.
- Keep feedback appropriate for a job candidate.

Return a JSON object with exactly these fields:
{{
  "summary": "Overall assessment",
  "dimensions": [
    {{
      "name": "relevance",
      "score": 0,
      "reason": "Why this score was given",
      "answer_excerpt": "A short exact excerpt from an answer",
      "improvement": "How to improve this dimension"
    }},
    {{
      "name": "specificity",
      "score": 0,
      "reason": "Why this score was given",
      "answer_excerpt": "A short exact excerpt from an answer",
      "improvement": "How to improve this dimension"
    }},
    {{
      "name": "clarity",
      "score": 0,
      "reason": "Why this score was given",
      "answer_excerpt": "A short exact excerpt from an answer",
      "improvement": "How to improve this dimension"
    }},
    {{
      "name": "role_reasoning",
      "score": 0,
      "reason": "Why this score was given",
      "answer_excerpt": "A short exact excerpt from an answer",
      "improvement": "How to improve this dimension"
    }}
  ],
  "overall_score": 0,
  "strengths": ["Specific strength"],
  "improvements": ["Actionable improvement"],
  "incomplete": {str(incomplete).lower()}
}}

Use null for answer_excerpt if no suitable excerpt exists.
Return valid JSON only.
"""

    try:
        client = OpenAI(timeout=30.0, max_retries=1)

        response = client.chat.completions.create(
            model=os.getenv("OPENAI_MODEL", "gpt-6-luna"),
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You provide fair, evidence-based interview feedback. "
                        "Return valid JSON only."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            response_format={"type": "json_object"},
            reasoning_effort="none",
        )

        content = response.choices[0].message.content

        if not content:
            raise InterviewGenerationError(
                "The AI returned empty interview feedback."
            )

        result = json.loads(content)

    except Exception as exc:
        logger.exception("Interview feedback generation error")
        raise InterviewGenerationError(
            "Could not generate interview feedback."
        ) from exc

    if not isinstance(result, dict):
        raise InterviewGenerationError(
            "The AI returned an invalid feedback format."
        )

    required_fields = {
        "summary",
        "dimensions",
        "overall_score",
        "strengths",
        "improvements",
        "incomplete",
    }

    if not required_fields.issubset(result):
        raise InterviewGenerationError(
            "The AI feedback is missing required fields."
        )

    if not isinstance(result["summary"], str) or not result["summary"].strip():
        raise InterviewGenerationError(
            "The AI returned an invalid feedback summary."
        )

    if not isinstance(result["dimensions"], list):
        raise InterviewGenerationError(
            "The AI returned invalid feedback dimensions."
        )

    expected_dimensions = {
        "relevance",
        "specificity",
        "clarity",
        "role_reasoning",
    }

    actual_dimensions = {
        item.get("name")
        for item in result["dimensions"]
        if isinstance(item, dict)
    }

    if actual_dimensions != expected_dimensions or len(result["dimensions"]) != 4:
        raise InterviewGenerationError(
            "The AI returned unexpected feedback dimensions."
        )

    for dimension in result["dimensions"]:
        score = dimension.get("score")
        if (
            isinstance(score, bool)
            or not isinstance(score, int)
            or not 0 <= score <= 4
        ):
            raise InterviewGenerationError(
                "The AI returned an invalid dimension score."
            )

        for field in ("reason", "improvement"):
            if not isinstance(dimension.get(field), str):
                raise InterviewGenerationError(
                    "The AI returned invalid dimension details."
                )

        excerpt = dimension.get("answer_excerpt")
        if excerpt is not None and not isinstance(excerpt, str):
            raise InterviewGenerationError(
                "The AI returned an invalid answer excerpt."
            )

    overall_score = result["overall_score"]
    if (
        isinstance(overall_score, bool)
        or not isinstance(overall_score, (int, float))
        or not 0 <= overall_score <= 100
    ):
        raise InterviewGenerationError(
            "The AI returned an invalid overall score."
        )

    for field in ("strengths", "improvements"):
        if not isinstance(result[field], list) or not all(
            isinstance(item, str) for item in result[field]
        ):
            raise InterviewGenerationError(
                f"The AI returned an invalid {field} list."
            )

    if not isinstance(result["incomplete"], bool):
        raise InterviewGenerationError(
            "The AI returned an invalid incomplete flag."
        )

    result["incomplete"] = incomplete

    return result
