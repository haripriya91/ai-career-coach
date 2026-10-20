import { useState } from "react";
import type { ComponentPropsWithoutRef } from "react";

import { updateWorkspace } from "../api";
import type { PageProps } from "../types";

type SubmitHandler = NonNullable<
  ComponentPropsWithoutRef<"form">["onSubmit"]
>;

interface Props extends PageProps {
  disabled?: boolean;
}

export default function PreparationDetails({
  intake,
  setIntake,
  disabled = false,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [role, setRole] = useState(intake.targetRole);
  const [company, setCompany] = useState(intake.company);
  const [jd, setJd] = useState(intake.jobDescription);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function openEditor() {
    setRole(intake.targetRole);
    setCompany(intake.company);
    setJd(intake.jobDescription);
    setError("");
    setEditing(true);
  }

  const handleSave: SubmitHandler = async (event) => {
    event.preventDefault();

    if (
      !intake.workspaceId ||
      intake.intakeVersion === null ||
      saving ||
      disabled
    ) {
      return;
    }

    setSaving(true);
    setError("");

    try {
      const workspace = await updateWorkspace(
        intake.workspaceId,
        {
          target_role: role.trim(),
          company: company.trim(),
          cv_text: intake.cvText,
          job_description: jd.trim(),
        },
        intake.intakeVersion,
      );

      setIntake({
        workspaceId: workspace.id,
        intakeVersion: workspace.intake_version,
        targetRole: workspace.intake.target_role,
        company: workspace.intake.company,
        cvText: workspace.intake.cv_text,
        jobDescription: workspace.intake.job_description,
        profileConfirmed: true,
      });

      setEditing(false);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not save details.",
      );
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div className="notice">
        <p>
          {intake.jobDescription.trim()
            ? "A job description is included in your preparation."
            : "Add a job description for more specific feedback."}
        </p>

        <button
          type="button"
          className="secondary-button"
          disabled={disabled}
          onClick={openEditor}
        >
          Edit role, company or job description
        </button>
      </div>
    );
  }

  return (
    <form className="card intake-form" onSubmit={handleSave}>
      <h3>Update preparation details</h3>

      {error && <p role="alert">{error}</p>}

      <label htmlFor="updated-role">Target role *</label>
      <input
        id="updated-role"
        value={role}
        maxLength={150}
        required
        disabled={saving}
        onChange={(event) => setRole(event.target.value)}
      />

      <label htmlFor="updated-company">Company</label>
      <input
        id="updated-company"
        value={company}
        maxLength={150}
        disabled={saving}
        onChange={(event) => setCompany(event.target.value)}
      />

      <label htmlFor="updated-jd">Job description</label>
      <textarea
        id="updated-jd"
        rows={7}
        value={jd}
        maxLength={20000}
        disabled={saving}
        onChange={(event) => setJd(event.target.value)}
      />

      <p className="field-help">
        Saving requires a new review for these updated details.
        Existing interviews keep their original details.
      </p>

      <div className="button-row">
        <button
          type="submit"
          className="primary-button"
          disabled={saving || !role.trim()}
        >
          {saving ? "Saving…" : "Save updated details"}
        </button>

        <button
          type="button"
          className="secondary-button"
          disabled={saving}
          onClick={() => setEditing(false)}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}