import type { FormEvent } from "react";
import type { IntakeData, PageProps } from "../types";

export default function IntakePage({ intake, setIntake }: PageProps) {
  function updateField(
    field: "targetRole" | "company" | "cvText" | "jobDescription",
    value: string,
  ) {
    setIntake((previous: IntakeData) => ({
      ...previous,
      [field]: value,
      profileConfirmed: false,
    }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setIntake((previous) => ({
      ...previous,
      profileConfirmed: true,
    }));
  }

  return (
    <section>
      <p className="eyebrow">YOUR STARTING POINT</p>
      <h2>Tell us what you’re preparing for</h2>
      <p className="muted">
        Add your role and CV. A job description helps tailor the feedback.
      </p>

      <div className="notice">
        Local prototype: data stays in React memory and clears on refresh.
        No AI analysis or database saving happens yet.
      </div>

      <form className="card intake-form" onSubmit={handleSubmit}>
        <label htmlFor="target-role">Target role *</label>
        <input
          id="target-role"
          value={intake.targetRole}
          onChange={(event) =>
            updateField("targetRole", event.target.value)
          }
          placeholder="For example: Frontend Developer"
          required
          maxLength={150}
        />

        <label htmlFor="company">Company — optional</label>
        <input
          id="company"
          value={intake.company}
          onChange={(event) => updateField("company", event.target.value)}
          placeholder="Company name"
          maxLength={150}
        />

        <label htmlFor="cv-text">CV text *</label>
        <textarea
          id="cv-text"
          value={intake.cvText}
          onChange={(event) => updateField("cvText", event.target.value)}
          placeholder="Paste fictional CV text while developing."
          rows={9}
          required
          maxLength={40000}
        />

        <p className="field-help">
          PDF/DOCX upload will be connected after extraction is implemented.
          Interview mode will also support starting without a CV.
        </p>

        <label htmlFor="job-description">
          Job description — optional
        </label>
        <textarea
          id="job-description"
          value={intake.jobDescription}
          onChange={(event) =>
            updateField("jobDescription", event.target.value)
          }
          placeholder="Paste the job description."
          rows={6}
          maxLength={20000}
        />

        <button
          className="primary-button"
          type="submit"
          disabled={!intake.targetRole.trim() || !intake.cvText.trim()}
        >
          Confirm details locally
        </button>

        {intake.profileConfirmed && (
          <p className="success" role="status">
            Details confirmed. Backend integration is the next step.
          </p>
        )}
      </form>
    </section>
  );
}