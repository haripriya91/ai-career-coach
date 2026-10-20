import { useState } from "react";
import type { ComponentPropsWithoutRef } from "react";

import {
  finishInterview,
  getInterview,
  startInterview,
  submitInterviewAnswer,
} from "../api";

import type { InterviewResponse } from "../api";
import type { PageProps } from "../types";

type SubmitHandler = NonNullable<
  ComponentPropsWithoutRef<"form">["onSubmit"]
>;

export default function InterviewPage({ intake }: PageProps) {
  const storageKey = `career-coach-interview:${intake.workspaceId}`;

  const [savedId, setSavedId] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(storageKey);
    } catch {
      return null;
    }
  });

  const [interview, setInterview] =
    useState<InterviewResponse | null>(null);

  const [questionCount, setQuestionCount] = useState(5);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mustReload, setMustReload] = useState(false);

  function applyResult(result: InterviewResponse) {
    if (result.workspace_id !== intake.workspaceId) {
      throw new Error("This interview belongs to another preparation.");
    }

    setInterview(result);
    setSavedId(result.id);

    try {
      sessionStorage.setItem(storageKey, result.id);
    } catch {
      // Interview still works without browser storage.
    }
  }

  function showError(error: unknown) {
    setError(
      error instanceof Error ? error.message : "The request failed.",
    );
  }

  async function handleStart() {
    if (!intake.workspaceId || busy) return;

    setBusy(true);
    setError("");

    try {
      const result = await startInterview(
        intake.workspaceId,
        questionCount,
      );

      applyResult(result);
      setAnswer("");
      setMustReload(false);
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  }

  async function handleLoad() {
    const id = interview?.id || savedId;
    if (!id || busy) return;

    setBusy(true);
    setError("");

    try {
      const result = await getInterview(id);
      applyResult(result);

      if (
        result.current_question?.id !==
        interview?.current_question?.id
      ) {
        setAnswer("");
      }

      setMustReload(false);
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  }

  const handleAnswer: SubmitHandler = async (event) => {
    event.preventDefault();

    if (
      !interview ||
      interview.status !== "in_progress" ||
      !interview.current_question ||
      !answer.trim() ||
      busy ||
      mustReload
    ) {
      return;
    }

    setBusy(true);
    setError("");

    try {
      const result = await submitInterviewAnswer(
        interview,
        answer.trim(),
      );

      applyResult(result);
      setAnswer("");
    } catch (error) {
      showError(error);
      setMustReload(true);
    } finally {
      setBusy(false);
    }
  };

  async function handleFinish() {
    if (!interview || busy || mustReload) return;

    if (
      !window.confirm(
        "Finish this interview? Text still in the answer box will not be submitted.",
      )
    ) {
      return;
    }

    setBusy(true);
    setError("");

    try {
      const result = await finishInterview(interview.id);
      applyResult(result);
    } catch (error) {
      showError(error);
      setMustReload(true);
    } finally {
      setBusy(false);
    }
  }

  if (!intake.workspaceId || !intake.profileConfirmed) {
    return (
      <section>
        <h2>Mock interview</h2>
        <div className="card">
          <p>Confirm your preparation details in Intake first.</p>
        </div>
      </section>
    );
  }

  const question = interview?.current_question;
  const feedback = interview?.feedback;
  const completed = interview?.status === "completed";
  const processing = interview?.status === "processing";

  return (
    <section>
      <p className="eyebrow">INTERVIEW PRACTICE</p>
      <h2>Mock interview</h2>

      <p className="muted">
        Target role: {intake.targetRole}
      </p>

      {error && (
        <div className="error-notice" role="alert">
          <p>{error}</p>
          {mustReload && (
            <p>
              Reload progress before submitting again. Your answer
              may already have been saved.
            </p>
          )}
        </div>
      )}

      {!interview && (
        <div className="card intake-form">
          <h3>Prepare for your target role</h3>
          <p>
            Answer one question at a time. Follow-up questions may
            explore your answers.
          </p>

          <label htmlFor="question-count">Main questions</label>
          <select
            id="question-count"
            value={questionCount}
            disabled={busy}
            onChange={(event) =>
              setQuestionCount(Number(event.target.value))
            }
          >
            {[1, 2, 3, 4, 5].map((count) => (
              <option key={count} value={count}>
                {count}
              </option>
            ))}
          </select>

          <div className="button-row">
            <button
              type="button"
              className="primary-button"
              disabled={busy}
              onClick={() => void handleStart()}
            >
              {busy ? "Please wait…" : "Start interview"}
            </button>

            {savedId && (
              <button
                type="button"
                className="secondary-button"
                disabled={busy}
                onClick={() => void handleLoad()}
              >
                Resume saved interview
              </button>
            )}
          </div>
        </div>
      )}

      {interview && (
        <>
          <div className="interview-toolbar">
            <p className="field-help">
              Main questions asked: {interview.main_questions_asked}
              {" · "}
              Follow-ups: {interview.follow_ups_asked}
            </p>

            <button
              type="button"
              className="secondary-button"
              disabled={busy}
              onClick={() => void handleLoad()}
            >
              Reload progress
            </button>
          </div>

          <div className="interview-history">
            {interview.turns.map((turn) => (
              <article className="card" key={turn.question.id}>
                <h3>{turn.question.text}</h3>
                <p className="answer-label">Your answer</p>
                <p className="interview-answer">{turn.answer}</p>
              </article>
            ))}
          </div>

          {processing && (
            <div className="notice" role="status">
              Your interview is processing. Reload progress to check
              for an update.
            </div>
          )}

          {!completed && !processing && question && (
            <form className="card intake-form" onSubmit={handleAnswer}>
              <p className="eyebrow">
                {question.kind === "follow_up"
                  ? "FOLLOW-UP"
                  : question.topic}
              </p>

              <h3>{question.text}</h3>

              <label htmlFor="answer">Your answer</label>
              <textarea
                id="answer"
                rows={7}
                maxLength={10000}
                value={answer}
                disabled={busy || mustReload}
                onChange={(event) => setAnswer(event.target.value)}
                required
              />

              <div className="button-row">
                <button
                  type="submit"
                  className="primary-button"
                  disabled={busy || mustReload || !answer.trim()}
                >
                  {busy ? "Please wait…" : "Submit answer"}
                </button>

                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy || mustReload}
                  onClick={() => void handleFinish()}
                >
                  Finish interview
                </button>
              </div>
            </form>
          )}

          {!completed && !processing && !question && (
            <div className="card">
              <p>No question is currently available.</p>
              <button
                type="button"
                className="primary-button"
                disabled={busy || mustReload}
                onClick={() => void handleFinish()}
              >
                Finish and request feedback
              </button>
            </div>
          )}

          {completed && !feedback && (
            <div className="notice">
              Interview completed. Feedback is not available yet.
              Reload progress to check again.
            </div>
          )}

          {feedback && (
            <div className="review-sections">
              <article className="card">
                <h3>
                  {feedback.overall_score === null
                    ? "Practice score unavailable"
                    : `Practice score: ${feedback.overall_score}/100`}
                </h3>
                <p>{feedback.summary}</p>

                {feedback.incomplete && (
                  <p className="field-help">
                    This feedback covers a partially completed interview.
                  </p>
                )}
              </article>

              {feedback.dimensions.map((dimension) => (
                <article className="card" key={dimension.name}>
                  <h3>
                    {dimension.name.replaceAll("_", " ")}
                    {" · "}
                    {dimension.score === null
                      ? "Not assessed"
                      : `${dimension.score}/4`}
                  </h3>
                  <p>{dimension.reason}</p>

                  {dimension.answer_excerpt && (
                    <blockquote>
                      {dimension.answer_excerpt}
                    </blockquote>
                  )}

                  <p>
                    <strong>Improve: </strong>
                    {dimension.improvement}
                  </p>
                </article>
              ))}

              <article className="card">
                <h3>Strengths</h3>
                <ul>
                  {feedback.strengths.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>

                <h3>Improvements</h3>
                <ul>
                  {feedback.improvements.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </article>
            </div>
          )}
        </>
      )}
    </section>
  );
}