import type { IntakeData, PreparationGoal } from "../types";

interface Props {
  intake: IntakeData;
  onChooseGoal: (goal: PreparationGoal) => void;
  onContinue: () => void;
}

const goals: {
  id: PreparationGoal;
  number: string;
  title: string;
  description: string;
  action: string;
}[] = [
  {
    id: "review",
    number: "01",
    title: "Improve my CV",
    description:
      "Get practical feedback and suggested wording based on your experience.",
    action: "Review my CV",
  },
  {
    id: "interview",
    number: "02",
    title: "Practise an interview",
    description:
      "Answer one question at a time and get feedback for your target role.",
    action: "Start practising",
  },
  {
    id: "jobs",
    number: "03",
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
}: Props) {
  const hasPreparation =
    Boolean(intake.workspaceId) && intake.profileConfirmed;

  return (
    <section className="coach-home">
      <div className="coach-welcome">
        <span className="coach-avatar" aria-hidden="true">
          ✦
        </span>

        <div>
          <p className="eyebrow">YOUR AI CAREER COACH</p>

          <h2>What would you like to work on today?</h2>

          <p className="muted">
            Improve your CV, practise interview answers, or check
            your job match. Choose a goal and I’ll guide you
            through the details.
          </p>
        </div>
      </div>

      {hasPreparation && (
        <article className="continue-preparation">
          <div>
            <p className="eyebrow">YOUR CURRENT PREPARATION</p>
            <h3>{intake.targetRole}</h3>

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
            <span className="goal-number" aria-hidden="true">
              {goal.number}
            </span>

            <h3>{goal.title}</h3>
            <p className="muted">{goal.description}</p>

            <button
              type="button"
              className="primary-button home-goal-button"
              onClick={() => onChooseGoal(goal.id)}
            >
              {goal.action}
              <span aria-hidden="true"> →</span>
            </button>
          </article>
        ))}
      </div>

      <div className="home-bottom-row">
        <div className="home-next-steps">
          <h3>Your next steps</h3>

          <p>
            Choose a goal, add your details, then get feedback.
          </p>

          <p>
            Use <strong>Start new preparation</strong> for another
            application. Reopen saved work through{" "}
            <strong>My preparations</strong> in the header.
          </p>

          <p className="field-help">
            Saved preparations are listed in this browser.
          </p>
        </div>
      </div>
    </section>
  );
}