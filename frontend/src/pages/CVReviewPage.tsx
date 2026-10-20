import { useEffect, useState } from "react";

import { generateCvReview, loadCvReview } from "../api";
import type { CVReviewResponse } from "../api";
import type { PageProps } from "../types";

import PreparationDetails from "../components/PreparationDetails";
import CopyButton from "../components/CopyButton";

export default function CVReviewPage({
  intake,
  setIntake,
}: PageProps) {
  const [result, setResult] = useState<CVReviewResponse | null>(null);
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  const workspaceId = intake.workspaceId;
  const intakeVersion = intake.intakeVersion;

  useEffect(() => {
    if (!workspaceId) return;

    let active = true;

    loadCvReview(workspaceId)
      .then((saved) => {
        if (active) {
          setResult(saved);
          setError("");
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setError(
            error instanceof Error
              ? error.message
              : "Could not load the saved review.",
          );
        }
      })
      .finally(() => {
        if (active) {
          setLoadingSaved(false);
        }
      });

    return () => {
      active = false;
    };
  }, [workspaceId, intakeVersion]);

  async function handleGenerate() {
    if (
      !workspaceId ||
      !intake.profileConfirmed ||
      !intake.cvText.trim() ||
      loadingSaved ||
      generating
    ) {
      return;
    }

    setError("");
    setGenerating(true);

    try {
      const generated = await generateCvReview(workspaceId);

      if (
        generated.workspace_id !== workspaceId ||
        generated.intake_version !== intakeVersion
      ) {
        throw new Error(
          "The review does not match these preparation details. " +
            "Reopen the session to load its latest details.",
        );
      }

      setResult(generated);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not generate the review.",
      );
    } finally {
      setGenerating(false);
    }
  }

  if (!workspaceId || !intake.profileConfirmed) {
    return (
      <section>
        <h2>CV Review</h2>

        <div className="card">
          <p>
            Open Intake, check your CV text, and confirm your details first.
          </p>
        </div>
      </section>
    );
  }

  const review =
    result?.workspace_id === workspaceId &&
    result.intake_version === intakeVersion
      ? result.review
      : null;

  return (
    <section>
      <p className="eyebrow">PERSONALIZED CV FEEDBACK</p>
      <h2>CV Review</h2>

      <p className="muted">
        Target role: {intake.targetRole}
        {intake.company ? ` · ${intake.company}` : ""}
      </p>

      <PreparationDetails
        intake={intake}
        setIntake={setIntake}
        disabled={generating || loadingSaved}
      />

      {error && (
        <div className="error-notice" role="alert">
          {error}
        </div>
      )}

      {loadingSaved ? (
        <p role="status">Checking for a saved review…</p>
      ) : (
        <>
          {review && (
            <p className="field-help">
              Regenerating uses the same saved details and makes another
              AI request. Edit your preparation details first if you want
              to add context.
            </p>
          )}

          <button
            type="button"
            className="primary-button"
            disabled={generating || !intake.cvText.trim()}
            onClick={() => void handleGenerate()}
          >
            {generating
              ? "Reviewing your CV…"
              : review
                ? "Regenerate review"
                : "Generate CV review"}
          </button>
        </>
      )}

      {generating && (
        <p className="field-help" role="status">
          Reviewing your confirmed CV and job details…
        </p>
      )}

      {!loadingSaved && !review && !generating && !error && (
        <p className="muted">
          Generate a review to see strengths and practical improvements.
        </p>
      )}

      {!intake.cvText.trim() && (
        <p className="field-help">
          This preparation session has no CV text. Start a new preparation
          with your resume to use CV review.
        </p>
      )}

      {review && (
        <div className="review-sections">
          <article className="card">
            <h3>Overall feedback</h3>
            <p>{review.summary}</p>
          </article>

          {review.strengths.length > 0 && (
            <article className="card">
              <h3>Strengths</h3>

              <ul>
                {review.strengths.map((strength, index) => (
                  <li key={index}>{strength}</li>
                ))}
              </ul>
            </article>
          )}

          {review.findings.length > 0 && (
            <div>
              <h3>Suggested improvements</h3>

              {review.findings.map((finding, index) => (
                <article
                  className="card review-finding"
                  key={`${result?.id}:${index}`}
                >
                  <div className="finding-labels">
                    <span
                      className={`priority priority-${finding.priority}`}
                    >
                      {finding.priority} priority
                    </span>

                    <span className="field-help">
                      {finding.category}
                    </span>
                  </div>

                  <h4>{finding.observation}</h4>

                  {finding.evidence_excerpt && (
                    <blockquote>{finding.evidence_excerpt}</blockquote>
                  )}

                  <p>
                    <strong>Suggested action: </strong>
                    {finding.suggested_action}
                  </p>

                  {finding.suggested_rewrite && (
                    <div className="notice">
                      <strong>Suggested wording</strong>
                      <p>{finding.suggested_rewrite}</p>

                      <CopyButton
                        key={finding.suggested_rewrite}
                        text={finding.suggested_rewrite}
                      />
                    </div>
                  )}

                  {finding.needs_confirmation && (
                    <p className="field-help">
                      Check and confirm the details before using this
                      suggestion.
                    </p>
                  )}
                </article>
              ))}
            </div>
          )}

          {review.next_steps.length > 0 && (
            <article className="card">
              <h3>Next steps</h3>

              <ol>
                {review.next_steps.map((step, index) => (
                  <li key={index}>{step}</li>
                ))}
              </ol>
            </article>
          )}

          {review.limitations.length > 0 && (
            <article className="notice">
              <h3>Review limitations</h3>

              <ul>
                {review.limitations.map((limitation, index) => (
                  <li key={index}>{limitation}</li>
                ))}
              </ul>
            </article>
          )}

          <p className="field-help">
            AI suggestions need your review. Copying suggested wording
            does not change your saved CV.
          </p>
        </div>
      )}
    </section>
  );
}