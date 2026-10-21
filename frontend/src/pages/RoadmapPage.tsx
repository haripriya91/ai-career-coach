import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { generateRoadmap, loadRoadmap } from "../api";
import type {
  RoadmapLookupResponse,
  RoadmapResponse,
} from "../api";
import type { PageProps } from "../types";

// ---------- Icons ----------

type IconName = "book" | "bulb" | "check";

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    book: (
      <>
        <path d="M12 6v15" />
        <path d="M12 6C9 4 5 4 3 5v14c3-1 6-1 9 2 3-3 6-3 9-2V5c-2-1-6-1-9 1Z" />
      </>
    ),
    bulb: (
      <>
        <path d="M9 18h6m-5 3h4M8 14a7 7 0 1 1 8 0c-1 1-1 2-1 2H9s0-1-1-2Z" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
  };

  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  );
}

// ---------- Browser drafts ----------

type Draft = {
  answers: string[];
  checks: boolean[];
};

type PracticeState = {
  drafts: Record<string, Draft>;
  completed: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function readPractice(key: string): PracticeState {
  const empty: PracticeState = {
    drafts: {},
    completed: [],
  };

  try {
    const raw = localStorage.getItem(key);
    if (!raw) return empty;

    const value: unknown = JSON.parse(raw);

    if (
      !isRecord(value) ||
      !isRecord(value.drafts) ||
      !Array.isArray(value.completed)
    ) {
      return empty;
    }

    const drafts: Record<string, Draft> = {};

    for (const [id, draft] of Object.entries(value.drafts)) {
      if (!isRecord(draft)) continue;

      const answers = draft.answers;
      const checks = draft.checks;

      if (
        Array.isArray(answers) &&
        answers.every(
          (answer: unknown) => typeof answer === "string",
        ) &&
        Array.isArray(checks) &&
        checks.every(
          (check: unknown) => typeof check === "boolean",
        )
      ) {
        drafts[id] = {
          answers: answers as string[],
          checks: checks as boolean[],
        };
      }
    }

    return {
      drafts,
      completed: value.completed.filter(
        (id: unknown): id is string => typeof id === "string",
      ),
    };
  } catch {
    return empty;
  }
}

// ---------- Page ----------

// Remount the page state when the saved preparation changes.
// This avoids resetting state synchronously inside an effect.
export default function RoadmapPage({ intake }: PageProps) {
  return (
    <RoadmapPageContent
      key={`${intake.workspaceId ?? "new"}:${intake.intakeVersion ?? 0}:${intake.profileConfirmed}`}
      intake={intake}
    />
  );
}

function RoadmapPageContent({
  intake,
}: Pick<PageProps, "intake">) {
  const ready = Boolean(
    intake.workspaceId &&
      intake.intakeVersion !== null &&
      intake.profileConfirmed,
  );

  const [saved, setSaved] =
    useState<RoadmapLookupResponse | null>(null);

  const [hours, setHours] = useState(3);
  const [weeks, setWeeks] = useState(2);
  const [loading, setLoading] = useState(ready);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  const requestRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const sequenceRef = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    const sequence = ++sequenceRef.current;

    requestRef.current = controller;

    const workspaceId = intake.workspaceId;

    if (ready && workspaceId) {
      void loadRoadmap(workspaceId, controller.signal)
        .then((response) => {
          if (
            controller.signal.aborted ||
            sequenceRef.current !== sequence
          ) {
            return;
          }

          setSaved(response);

          if (response.result) {
            setHours(response.result.plan.hours_per_week);
            setWeeks(response.result.plan.duration_weeks);
          }
        })
        .catch((err: unknown) => {
          if (
            controller.signal.aborted ||
            sequenceRef.current !== sequence
          ) {
            return;
          }

          setError(
            err instanceof Error
              ? err.message
              : "Could not load your saved plan.",
          );
        })
        .finally(() => {
          if (
            !controller.signal.aborted &&
            sequenceRef.current === sequence
          ) {
            setLoading(false);
          }
        });
    }

    return () => {
      controller.abort();
      requestRef.current?.abort();
      sequenceRef.current += 1;
    };
  }, [intake.workspaceId, ready]);

  async function createPlan() {
    if (
      !ready ||
      !intake.workspaceId ||
      intake.intakeVersion === null ||
      loading ||
      busyRef.current
    ) {
      return;
    }

    busyRef.current = true;
    requestRef.current?.abort();

    const controller = new AbortController();
    const sequence = ++sequenceRef.current;

    requestRef.current = controller;

    setGenerating(true);
    setError("");

    try {
      const response = await generateRoadmap(
        intake.workspaceId,
        hours,
        weeks,
        intake.intakeVersion,
        controller.signal,
      );

      if (
        !controller.signal.aborted &&
        sequenceRef.current === sequence
      ) {
        setSaved(response);
      }
    } catch (err: unknown) {
      if (
        !controller.signal.aborted &&
        sequenceRef.current === sequence
      ) {
        setError(
          err instanceof Error
            ? err.message
            : "Could not create your learning plan.",
        );
      }
    } finally {
      if (
        !controller.signal.aborted &&
        sequenceRef.current === sequence
      ) {
        busyRef.current = false;
        setGenerating(false);
      }
    }
  }

  const result = saved?.found ? saved.result : null;

  const preferencesChanged = Boolean(
    result &&
      (result.plan.hours_per_week !== hours ||
        result.plan.duration_weeks !== weeks),
  );

  const canUpdate =
    !result || Boolean(saved?.stale) || preferencesChanged;

  let buttonLabel = "Create my learning plan";

  if (generating) {
    buttonLabel = "Creating your plan…";
  } else if (result) {
    buttonLabel = canUpdate
      ? "Update plan"
      : "Plan is up to date";
  }

  return (
    <section className="lr-page">
      <header className="lr-study-header">
        <span className="lr-icon">
          <Icon name="book" />
        </span>

        <div className="lr-study-header-copy">
          <h2>Your self-paced study plan</h2>

          <p>
            Learn at your own pace with activities based on your
            available CV review, job-fit results, and interview feedback.
          </p>

          <p className="lr-study-header-note">
            Save your notes and track your progress.
            Your answers are not reviewed or graded by AI.
          </p>
        </div>
      </header>

      {!ready ? (
        <div className="lr-panel">
          <h3>Start with your preparation details</h3>
          <p>
            Save your target role first. Add your CV or complete
            an interview so the plan can focus on your needs.
          </p>
        </div>
      ) : (
        <div className="lr-panel">
          <h3>Choose a realistic pace</h3>

          <p>
            Target role:{" "}
            <strong>{intake.targetRole || "Not selected"}</strong>
          </p>

          <label htmlFor="lr-hours">
            Hours available each week
          </label>

          <select
            id="lr-hours"
            value={hours}
            disabled={loading || generating}
            onChange={(event) =>
              setHours(Number(event.target.value))
            }
          >
            {Array.from({ length: 10 }, (_, index) => index + 1).map(
              (value) => (
                <option key={value} value={value}>
                  {value} {value === 1 ? "hour" : "hours"}
                </option>
              ),
            )}
          </select>

          <label htmlFor="lr-weeks">Plan duration</label>

          <select
            id="lr-weeks"
            value={weeks}
            disabled={loading || generating}
            onChange={(event) =>
              setWeeks(Number(event.target.value))
            }
          >
            {[1, 2, 3, 4].map((value) => (
              <option key={value} value={value}>
                {value} {value === 1 ? "week" : "weeks"}
              </option>
            ))}
          </select>

          <p className="lr-note">
            Your weekly availability is a maximum. You do not
            need to fill every hour.
          </p>

          {saved?.stale && (
            <p className="lr-banner">{saved.message}</p>
          )}

          {result && preferencesChanged && (
            <p>
              Your saved plan is shown below. Select “Update
              plan” to apply your new pace.
            </p>
          )}

          <button
            type="button"
            className="lr-primary"
            disabled={loading || generating || !canUpdate}
            onClick={() => void createPlan()}
          >
            {buttonLabel}
          </button>

          {result && canUpdate && (
            <p className="lr-note">
              Updating creates a new plan with separate drafts
              and completion progress. Save any current draft
              before updating.
            </p>
          )}
        </div>
      )}

      {loading && (
        <p role="status">Loading your saved plan…</p>
      )}

      {generating && (
        <p role="status">
          Turning your preparation feedback into useful
          activities…
        </p>
      )}

      {error && (
        <p className="lr-error" role="alert">
          {error}
        </p>
      )}

      {result && (
        <RoadmapActivities
          key={result.id}
          result={result}
          jobDescription={intake.jobDescription}
        />
      )}
    </section>
  );
}

// ---------- Generated activities ----------

function RoadmapActivities({
  result,
  jobDescription,
}: {
  result: RoadmapResponse;
  jobDescription: string;
}) {
  const { plan } = result;
  const activities = plan.activities;

  const storageKey =
    `career-coach-learning:${result.workspace_id}:${result.id}`;

  const [practice, setPractice] = useState<PracticeState>(
    () => readPractice(storageKey),
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [notice, setNotice] = useState("");

  const guide = activities[activeIndex];

  const draft = practice.drafts[guide?.id ?? ""] ?? {
    answers: [],
    checks: [],
  };

  const categoryLabels = {
    skill_practice: "Skill practice",
    interview_practice: "Interview practice",
    cv_evidence: "Clarify your experience",
  };

  function persist(next: PracticeState, message: string) {
    setPractice(next);

    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      setNotice(message);
    } catch {
      setNotice(
        "Browser saving is unavailable. Your draft will last " +
          "only while this plan stays open.",
      );
    }
  }

  function updateAnswer(index: number, value: string) {
    if (!guide) return;

    const activityId = guide.id;

    setPractice((previous) => {
      const current = previous.drafts[activityId] ?? {
        answers: [],
        checks: [],
      };

      const answers = [...current.answers];
      answers[index] = value;

      return {
        completed: previous.completed.filter(
          (id) => id !== activityId,
        ),
        drafts: {
          ...previous.drafts,
          [activityId]: {
            ...current,
            answers,
          },
        },
      };
    });

    setNotice("");
  }

  function updateCheck(index: number, value: boolean) {
    if (!guide) return;

    const activityId = guide.id;

    setPractice((previous) => {
      const current = previous.drafts[activityId] ?? {
        answers: [],
        checks: [],
      };

      const checks = [...current.checks];
      checks[index] = value;

      return {
        completed: previous.completed.filter(
          (id) => id !== activityId,
        ),
        drafts: {
          ...previous.drafts,
          [activityId]: {
            ...current,
            checks,
          },
        },
      };
    });

    setNotice("");
  }

  function openActivity(index: number) {
    persist(practice, "Draft saved in this browser.");
    setActiveIndex(index);
  }

  function markCompleted() {
    if (!guide || !canComplete) return;

    persist(
      {
        ...practice,
        completed: [
          ...new Set([...practice.completed, guide.id]),
        ],
      },
      "Saved as completed based on your self-check.",
    );
  }

  const canComplete = Boolean(
    guide &&
      guide.fields.every((_, index) =>
        Boolean(draft.answers[index]?.trim()),
      ) &&
      guide.checklist.every((_, index) => draft.checks[index]),
  );

  const completedCount = activities.filter((activity) =>
    practice.completed.includes(activity.id),
  ).length;

  const isCompleted = Boolean(
    guide && practice.completed.includes(guide.id),
  );

  return (
    <>
      <div className="lr-progress">
        <h3>{plan.title}</h3>
        <p>{plan.summary}</p>

        <p className="lr-note">
          Based on: {plan.based_on.join(" · ")}
        </p>

        <div className="lr-between">
          <strong>
            {completedCount} of {activities.length} completed
          </strong>

          <span>
            {plan.duration_weeks}{" "}
            {plan.duration_weeks === 1 ? "week" : "weeks"}
            {" · "}
            Up to {plan.hours_per_week} hours/week
          </span>
        </div>

        <progress
          aria-label="Learning activities completed"
          value={completedCount}
          max={activities.length || 1}
        />
      </div>

      {activities.length === 0 ? (
        <div className="lr-panel">
          <p>This saved plan contains no activities.</p>
        </div>
      ) : (
        <div className="lr-layout">
          <nav
            className="lr-activities"
            aria-label="Learning activities"
          >
            {activities.map((activity, index) => {
              const complete = practice.completed.includes(
                activity.id,
              );

              return (
                <button
                  type="button"
                  key={activity.id}
                  className={
                    activeIndex === index
                      ? "lr-activity is-active"
                      : "lr-activity"
                  }
                  aria-current={
                    activeIndex === index ? "step" : undefined
                  }
                  onClick={() => openActivity(index)}
                >
                  <span className="lr-step-number">
                    {complete ? (
                      <Icon name="check" />
                    ) : (
                      index + 1
                    )}
                  </span>

                  <span className="lr-activity-copy">
                    <strong>{activity.title}</strong>
                    <small>
                      Week {activity.week}
                      {" · "}
                      {activity.minutes} min
                      {complete ? " · Completed" : ""}
                    </small>
                  </span>
                </button>
              );
            })}
          </nav>

          {guide && (
            <div
              className="lr-panel lr-workspace"
              key={guide.id}
            >
              <p className="lr-eyebrow">
                {categoryLabels[guide.category]}
                {" · "}
                Week {guide.week}
                {" · "}
                About {guide.minutes} minutes
              </p>

              <h3>{guide.title}</h3>
              <p>{guide.purpose}</p>

              <details className="lr-example">
                <summary>Why this activity?</summary>
                <p>{guide.reason}</p>
              </details>

              <ol>
                {guide.instructions.map((step, index) => (
                  <li key={index}>{step}</li>
                ))}
              </ol>

              {guide.hint && (
                <div className="lr-hint">
                  <Icon name="bulb" />
                  <p>{guide.hint}</p>
                </div>
              )}

              {guide.example && (
                <details className="lr-example">
                  <summary>Show an example format</summary>
                  <p className="lr-preserve">
                    {guide.example}
                  </p>
                  <small>
                    Use your own accurate details. This is
                    guidance, not a statement about your
                    experience.
                  </small>
                </details>
              )}

              {jobDescription.trim() && (
                <details className="lr-example">
                  <summary>Your saved job description</summary>
                  <p className="lr-preserve">
                    {jobDescription}
                  </p>
                </details>
              )}

              <div className="lr-fields">
                {guide.fields.map((field, index) => {
                  const fieldId =
                    `lr-answer-${guide.id}-${index}`;

                  return (
                    <div key={fieldId}>
                      <label htmlFor={fieldId}>
                        {field.label}
                      </label>

                      <textarea
                        id={fieldId}
                        rows={4}
                        value={draft.answers[index] ?? ""}
                        placeholder={field.placeholder}
                        onChange={(event) =>
                          updateAnswer(
                            index,
                            event.target.value,
                          )
                        }
                      />
                    </div>
                  );
                })}
              </div>

              <div className="lr-self-check">
                <h4>Check your own work</h4>
                <p>
                  Tick these after completing the activity.
                  Your answers are not graded.
                </p>

                {guide.checklist.map((item, index) => (
                  <label key={`${guide.id}-check-${index}`}>
                    <input
                      type="checkbox"
                      checked={draft.checks[index] ?? false}
                      onChange={(event) =>
                        updateCheck(
                          index,
                          event.target.checked,
                        )
                      }
                    />
                    <span>{item}</span>
                  </label>
                ))}
              </div>

              <div className="lr-actions">
                <button
                  type="button"
                  className="lr-secondary"
                  onClick={() =>
                    persist(
                      practice,
                      "Draft saved in this browser.",
                    )
                  }
                >
                  Save draft
                </button>

                <button
                  type="button"
                  className="lr-primary"
                  disabled={!canComplete || isCompleted}
                  onClick={markCompleted}
                >
                  {isCompleted
                    ? "Completed"
                    : "Mark as completed"}
                </button>

                {isCompleted &&
                  activeIndex < activities.length - 1 && (
                    <button
                      type="button"
                      className="lr-secondary"
                      onClick={() =>
                        openActivity(activeIndex + 1)
                      }
                    >
                      Next activity
                    </button>
                  )}
              </div>

              {!canComplete && (
                <p className="lr-note">
                  {guide.fields.length > 0
                    ? "Fill in the written fields and complete the self-checks first."
                    : "Complete the activity, then tick the self-checks."}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {notice && (
        <p className="lr-notice" role="status">
          {notice}
        </p>
      )}

      <p className="lr-note">
        Your generated plan is saved to your preparation.
        Draft answers and completion progress stay in this
        browser. Save your draft before leaving this page.
        Switching activities also saves your current draft.
      </p>
    </>
  );
}