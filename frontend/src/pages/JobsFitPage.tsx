import { useEffect, useRef, useState } from "react";

import { generateJobFit, loadJobFit } from "../api";

import type {
  JobFitLookupResponse,
  JobFitRequirement,
} from "../api";
import type { PageProps } from "../types";
import PreparationDetails from "../components/PreparationDetails";

function RequirementCard({
  item,
}: {
  item: JobFitRequirement;
}) {
  const label = {
    matched: "Met",
    partial: "Add more detail",
    not_evidenced: "Not found in CV",
  }[item.status];

  return (
    <article className="jf-requirement">
      <div className="jf-row">
        <h3>{item.requirement}</h3>

        <span className={`jf-badge jf-${item.status}`}>
          {label}
        </span>
      </div>

      <p className="jf-muted jf-importance">
        {item.importance === "required"
          ? "Required by the job"
          : "Preferred by the employer"}
      </p>

      {item.status !== "matched" && (
        <p className="jf-suggestion">
          {item.suggested_action}
        </p>
      )}

      <details className="jf-evidence">
        <summary>Why this result?</summary>

        <p>{item.explanation}</p>

        <p>
          <strong>The job asks for:</strong>
        </p>
        <blockquote>{item.job_evidence}</blockquote>

        <p>
          <strong>Your CV says:</strong>
        </p>

        {item.cv_evidence ? (
          <blockquote>{item.cv_evidence}</blockquote>
        ) : (
          <p>No supporting detail was found.</p>
        )}
      </details>
    </article>
  );
}

export default function JobsFitPage({ intake,setIntake }: PageProps) {
  const workspaceId = intake.workspaceId;
  const intakeVersion = intake.intakeVersion;

  const hasCv = Boolean(intake.cvText.trim());
  const hasJob = Boolean(intake.jobDescription.trim());

  const ready = Boolean(
    workspaceId &&
      intakeVersion !== null &&
      intake.profileConfirmed &&
      hasCv &&
      hasJob,
  );

  const [saved, setSaved] =
    useState<JobFitLookupResponse | null>(null);
  const [loading, setLoading] = useState(ready);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  const activeRequest = useRef<AbortController | null>(null);
  const requestVersion = useRef(0);
  const busyRef = useRef(false);

  // App.tsx remounts this page when the workspace or intake
  // version changes, so no state resets are needed here.
  useEffect(() => {
    const controller = new AbortController();
    const version = ++requestVersion.current;

    activeRequest.current = controller;

    if (workspaceId && ready) {
      const id = workspaceId;

      async function fetchSavedAnalysis() {
        try {
          const response = await loadJobFit(
            id,
            controller.signal,
          );

          if (
            !controller.signal.aborted &&
            requestVersion.current === version
          ) {
            setSaved(response);
          }
        } catch (err: unknown) {
          if (
            !controller.signal.aborted &&
            requestVersion.current === version
          ) {
            setError(
              err instanceof Error
                ? err.message
                : "Could not load the saved analysis.",
            );
          }
        } finally {
          if (
            !controller.signal.aborted &&
            requestVersion.current === version
          ) {
            setLoading(false);
          }
        }
      }

      void fetchSavedAnalysis();
    }

    return () => {
      controller.abort();
      activeRequest.current?.abort();
      requestVersion.current += 1;
    };
  }, [workspaceId, intakeVersion, ready]);

  async function handleAnalyse() {
    if (
      !workspaceId ||
      !ready ||
      loading ||
      busyRef.current
    ) {
      return;
    }

    busyRef.current = true;
    activeRequest.current?.abort();

    const controller = new AbortController();
    activeRequest.current = controller;

    const version = ++requestVersion.current;

    setGenerating(true);
    setError("");

    try {
      const response = await generateJobFit(
        workspaceId,
        controller.signal,
      );

      if (
        !controller.signal.aborted &&
        requestVersion.current === version
      ) {
        setSaved(response);
      }
    } catch (err: unknown) {
      if (
        !controller.signal.aborted &&
        requestVersion.current === version
      ) {
        setError(
          err instanceof Error
            ? err.message
            : "Could not generate the analysis.",
        );
      }
    } finally {
      if (
        !controller.signal.aborted &&
        requestVersion.current === version
      ) {
        busyRef.current = false;
        setGenerating(false);
      }
    }
  }

  const stale = Boolean(
    saved?.stale ||
      (saved?.found &&
        saved.intake_version !== intakeVersion),
  );

  const result =
    ready && saved?.found && !stale
      ? saved.result
      : null;

  const matchedRequirements =
    result?.requirements.filter(
      (item) => item.status === "matched",
    ) ?? [];

  const partialRequirements =
    result?.requirements.filter(
      (item) => item.status === "partial",
    ) ?? [];

  const notEvidencedRequirements =
    result?.requirements.filter(
      (item) => item.status === "not_evidenced",
    ) ?? [];

  const requirementsToImprove = (
    result?.requirements.filter(
      (item) => item.status !== "matched",
    ) ?? []
  ).sort(
    (a, b) =>
      Number(b.importance === "required") -
      Number(a.importance === "required"),
  );

  return (
    <section className="job-fit-page">
      <header className="jf-header">
        <h2>Job-fit analysis</h2>
        <p className="jf-muted">
          Find out what matches and what to improve in your CV.
        </p>
      </header>

      <div className="jf-panel">
        <div className="jf-row">
          <div>
            <h3>{intake.targetRole || "Your target role"}</h3>

            {intake.company && (
              <p className="jf-muted">{intake.company}</p>
            )}
          </div>

          <span className="jf-preparation-label">
            Current preparation
          </span>
        </div>

        <div className="jf-input-status">
          <span>CV: {hasCv ? "Available" : "Missing"}</span>
          <span>
            Job description: {hasJob ? "Available" : "Missing"}
          </span>
        </div>

      {intake.workspaceId && intake.profileConfirmed && (
        <PreparationDetails
          intake={intake}
          setIntake={setIntake}
          requireCv
          requireJobDescription
          disabled={loading || generating}
        />
      )}

      {!intake.workspaceId && (
        <p className="jf-notice">
          Choose Check job match from Home to add your details.
        </p>
      )}

        {hasJob && (
          <details className="jf-job-preview">
            <summary>View job description</summary>
            <p>{intake.jobDescription}</p>
          </details>
        )}

        {stale && (
          <p className="jf-notice" role="status">
            Your preparation details changed. Generate a new
            analysis.
          </p>
        )}

        {ready && !result && (
          <div className="jf-generate">
            <button
              type="button"
              className="jf-primary-button"
              disabled={!ready || loading || generating}
              onClick={() => void handleAnalyse()}
            >
              {generating
                ? "Analysing job fit…"
                : error
                  ? "Try analysis again"
                  : "Analyse job fit"}
            </button>

            {ready &&
              !loading &&
              !generating &&
              !error &&
              !stale && (
                <p className="jf-muted">
                  {saved?.detail ||
                    "Compare your saved CV with this job."}
                </p>
              )}
          </div>
        )}
      </div>

      {loading && (
        <p role="status">Loading saved analysis…</p>
      )}

      {generating && (
        <p role="status">
          Comparing the job requirements with your CV…
        </p>
      )}

      {error && (
        <p className="jf-error" role="alert">
          {error}
        </p>
      )}

      {result && (
        <div className="jf-results">
          <div className="jf-panel jf-overview">
            <div className="jf-score">
              <strong>
                {Math.round(result.coverage_score)}%
              </strong>
              <span>Job match score</span>
            </div>

            <div>
              <h3>How your CV matches this job</h3>
              <p>{result.summary}</p>
              <p className="jf-muted">
                Based on what your CV demonstrates—not your
                chances of getting hired.
              </p>
            </div>
          </div>

          <dl className="jf-counts">
            <div>
              <dt>Requirements met</dt>
              <dd>{matchedRequirements.length}</dd>
            </div>

            <div>
              <dt>Need stronger evidence</dt>
              <dd>{partialRequirements.length}</dd>
            </div>

            <div>
              <dt>Not found in your CV</dt>
              <dd>{notEvidencedRequirements.length}</dd>
            </div>
          </dl>

          <div className="jf-panel">
            <h3>Improve your CV first</h3>
            <p className="jf-muted">
              Start with these three changes. Only add details
              that reflect your actual experience.
            </p>

            <ol className="jf-improvements">
              {result.priority_improvements.map(
                (improvement, index) => (
                  <li key={index}>{improvement}</li>
                ),
              )}
            </ol>
          </div>

          <div className="jf-panel">
            <h3>What needs attention</h3>

            {requirementsToImprove.length > 0 ? (
              <>
                <p className="jf-muted">
                  These job requirements need more evidence in
                  your CV. They are not necessarily skills you
                  lack.
                </p>

                <div className="jf-requirements">
                  {requirementsToImprove.map((item, index) => (
                    <RequirementCard
                      key={index}
                      item={item}
                    />
                  ))}
                </div>
              </>
            ) : (
              <p>
                Your CV demonstrates all assessed requirements.
              </p>
            )}
          </div>

          {matchedRequirements.length > 0 && (
            <details className="jf-panel">
              <summary>
                What your CV already demonstrates (
                {matchedRequirements.length})
              </summary>

              <div className="jf-requirements">
                {matchedRequirements.map((item, index) => (
                  <RequirementCard key={index} item={item} />
                ))}
              </div>
            </details>
          )}

          <details className="jf-panel">
            <summary>About this score</summary>
            <p>
              We compare the job requirements with evidence in
              your CV. Required requirements count more than
              preferred ones, and partial matches receive half
              credit.
            </p>
            <p>
              This is an AI-assisted estimate. It does not
              simulate an employer’s applicant tracking system
              or predict a hiring decision.
            </p>
          </details>
        </div>
      )}
    </section>
  );
}