import type { ReactNode } from "react";
import type { IntakeData, PreparationGoal } from "../types";

interface Props {
  intake: IntakeData;
  onChooseGoal: (goal: PreparationGoal) => void;
  onContinue: () => void;
  onOpenFeature: (screen: "company" | "roadmap") => void;
}

type IconName =
  | "document"
  | "interview"
  | "job"
  | "company"
  | "learning";

function FeatureIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    document: (
      <>
        <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z" />
        <path d="M14 3v6h6M8 13h8M8 17h6" />
      </>
    ),
    interview: (
      <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 10 10 0 0 1-4-.8L3 21l1.8-5.5a10 10 0 0 1-.8-4A8.5 8.5 0 0 1 12.5 3 8.5 8.5 0 0 1 21 11.5Z" />
    ),
    job: (
      <>
        <rect x="3" y="7" width="18" height="14" rx="2" />
        <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12a24 24 0 0 0 18 0M12 11v4" />
      </>
    ),
    company: (
      <>
        <path d="M5 21V3h12v18M3 21h18M17 10h3v11M9 7h1M13 7h1M9 11h1M13 11h1M9 15h1M13 15h1M10 21v-3h3v3" />
      </>
    ),
    learning: (
      <>
        <path d="m2 9 10-5 10 5-10 5ZM6 11v6c4 3 8 3 12 0v-6M22 9v7" />
      </>
    ),
  };

  return (
    <svg
      width="26"
      height="26"
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

const goals: {
  id: PreparationGoal;
  icon: IconName;
  title: string;
  description: string;
  action: string;
}[] = [
  {
    id: "review",
    icon: "document",
    title: "Improve my CV",
    description:
      "Get practical feedback and suggested wording based on your experience.",
    action: "Review my CV",
  },
  {
    id: "interview",
    icon: "interview",
    title: "Practise an interview",
    description:
      "Answer one question at a time and get feedback for your target role.",
    action: "Start practising",
  },
  {
    id: "jobs",
    icon: "job",
    title: "Compare with a job",
    description:
      "See which requirements your CV supports and where more detail would help.",
    action: "Check job match",
  },
];

export default function HomePage({
  intake,
  onChooseGoal,
  onContinue,
  onOpenFeature,
}: Props) {
  const hasPreparation =
    Boolean(intake.workspaceId) && intake.profileConfirmed;

  return (
    <section className="coach-home">
      <header className="coach-welcome">
        <span className="coach-avatar" aria-hidden="true">
          ✦
        </span>

        <div>
          <p className="eyebrow">YOUR AI CAREER COACH</p>

          <h2>What would you like to work on today?</h2>

          <p className="muted">
            Improve your CV, practise an interview, check your
            job match, or explore a company. Choose a goal to
            get started.
          </p>
        </div>
      </header>

      {hasPreparation && (
        <article className="continue-preparation">
          <div>
            <p className="eyebrow">YOUR CURRENT PREPARATION</p>
            <h3>{intake.targetRole || "Career preparation"}</h3>

            {intake.company && (
              <p className="muted">{intake.company}</p>
            )}
          </div>

          <button
            type="button"
            className="secondary-button"
            onClick={onContinue}
          >
            Continue preparation
          </button>
        </article>
      )}

      <div className="home-goals">
        {goals.map((goal) => (
          <article className="home-goal" key={goal.id}>
            <div className="home-feature-heading">
              <span className="home-feature-icon">
                <FeatureIcon name={goal.icon} />
              </span>
              <h3>{goal.title}</h3>
            </div>

            <p className="muted">{goal.description}</p>

            <button
              type="button"
              className="primary-button home-goal-button"
              onClick={() => onChooseGoal(goal.id)}
            >
              <span>{goal.action}</span>
              <span aria-hidden="true">→</span>
            </button>
          </article>
        ))}

        <article className="home-goal">
          <div className="home-feature-heading">
            <span className="home-feature-icon">
              <FeatureIcon name="company" />
            </span>
            <h3>Research a company</h3>
          </div>

          <p className="muted">
            Explore the company and prepare relevant talking
            points for your interview.
          </p>

          <button
            type="button"
            className="primary-button home-goal-button"
            onClick={() => onOpenFeature("company")}
          >
            <span>Research company</span>
            <span aria-hidden="true">→</span>
          </button>
        </article>
      </div>

      <article className="home-learning-shortcut">
        <span className="home-feature-icon">
          <FeatureIcon name="learning" />
        </span>

        <div>
          <h3>Your self-paced study plan</h3>
          <p className="muted">
            Turn your available reviews and interview feedback
            into practical learning activities.
          </p>
        </div>

        <button
          type="button"
          className="home-learning-link"
          onClick={() => onOpenFeature("roadmap")}
        >
          Open study plan <span aria-hidden="true">→</span>
        </button>
      </article>

      <p className="home-session-help">
        Preparing for another application? Use{" "}
        <strong>Start new preparation</strong>. Find saved work
        in <strong>My preparations</strong>.
      </p>
    </section>
  );
}