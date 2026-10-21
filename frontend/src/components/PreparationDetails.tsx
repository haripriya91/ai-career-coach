import { useState } from "react";
import type { ComponentPropsWithoutRef } from "react";

import { extractCv, updateWorkspace } from "../api";
import type { PageProps } from "../types";

type SubmitHandler = NonNullable<
  ComponentPropsWithoutRef<"form">["onSubmit"]
>;

interface Props extends PageProps {
  disabled?: boolean;
  requireCv?: boolean;
  requireJobDescription?: boolean;
}

export default function PreparationDetails({
  intake,
  setIntake,
  disabled = false,
  requireCv = false,
  requireJobDescription = false,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [role, setRole] = useState(intake.targetRole);
  const [company, setCompany] = useState(intake.company);
  const [cv, setCv] = useState(intake.cvText);
  const [jd, setJd] = useState(intake.jobDescription);

  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState("");

  const busy = disabled || saving || extracting;
  const missingCv = requireCv && !intake.cvText.trim();
  const missingJd =
    requireJobDescription && !intake.jobDescription.trim();

  function openEditor() {
    setRole(intake.targetRole);
    setCompany(intake.company);
    setCv(intake.cvText);
    setJd(intake.jobDescription);
    setWarnings([]);
    setError("");
    setEditing(true);
  }

  async function handleUpload(file: File | undefined) {
    if (!file || busy) return;

    setError("");
    setWarnings([]);

    if (!/\.(pdf|docx)$/i.test(file.name)) {
      setError("Choose a PDF or DOCX file.");
      return;
    }

    if (!file.size || file.size > 2 * 1024 * 1024) {
      setError("Choose a non-empty file no larger than 2 MB.");
      return;
    }

    if (
      cv.trim() &&
      !window.confirm(
        "Replace the CV text in this editor with the uploaded file? " +
          "Your saved preparation will change only when you save.",
      )
    ) {
      return;
    }

    setExtracting(true);

    try {
      const result = await extractCv(file);

      if (!result.extracted_text.trim()) {
        throw new Error(
          "No readable text was found. Paste your CV text instead.",
        );
      }

      setCv(result.extracted_text);
      setWarnings(result.warnings);
    } catch (error: unknown) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not extract your CV.",
      );
    } finally {
      setExtracting(false);
    }
  }

  const handleSave: SubmitHandler = async (event) => {
    event.preventDefault();

    if (
      !intake.workspaceId ||
      intake.intakeVersion === null ||
      busy
    ) {
      return;
    }

    if (!role.trim()) {
      setError("Enter your target role.");
      return;
    }

    if (requireCv && !cv.trim()) {
      setError("Upload or paste your CV before saving.");
      return;
    }

    if (requireJobDescription && !jd.trim()) {
      setError("Paste the job description before saving.");
      return;
    }

    if (cv.length > 40000) {
      setError("Shorten your CV text to 40,000 characters.");
      return;
    }

    const updated = {
      target_role: role.trim(),
      company: company.trim(),
      cv_text: cv.trim(),
      job_description: jd.trim(),
    };

    const unchanged =
      updated.target_role === intake.targetRole.trim() &&
      updated.company === intake.company.trim() &&
      updated.cv_text === intake.cvText.trim() &&
      updated.job_description === intake.jobDescription.trim();

    if (unchanged) {
      setEditing(false);
      return;
    }

    setSaving(true);
    setError("");

    try {
      const workspace = await updateWorkspace(
        intake.workspaceId,
        updated,
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
    } catch (error: unknown) {
      setError(
        (error instanceof Error
          ? error.message
          : "Could not save your details.") +
          " Your edits are still here. If this preparation was " +
          "changed elsewhere, copy your edits before reopening it.",
      );
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div className="notice">
        <p>
          {missingCv
            ? "Add your CV to use this feature with your existing preparation."
            : missingJd
              ? "Add a job description to compare its requirements with your CV."
              : "Keep your CV and job details up to date for relevant feedback."}
        </p>

        <button
          type="button"
          className={missingCv || missingJd
            ? "primary-button"
            : "secondary-button"}
          disabled={disabled}
          onClick={openEditor}
        >
          {missingCv
            ? "Add your CV"
            : missingJd
              ? "Add job description"
              : "Edit CV and preparation details"}
        </button>
      </div>
    );
  }

  return (
    <form
      className="card intake-form"
      onSubmit={handleSave}
      aria-busy={saving || extracting}
    >
      <h3>Update your preparation</h3>

      <p className="field-help">
        Changes stay in this editor until you save.
      </p>

      {error && (
        <div className="error-notice" role="alert">
          {error}
        </div>
      )}

      <label htmlFor="updated-role">Target role *</label>
      <input
        id="updated-role"
        value={role}
        maxLength={150}
        required
        disabled={busy}
        onChange={(event) => setRole(event.target.value)}
      />

      <label htmlFor="updated-company">Company — optional</label>
      <input
        id="updated-company"
        value={company}
        maxLength={150}
        disabled={busy}
        onChange={(event) => setCompany(event.target.value)}
      />

      <label htmlFor="updated-cv-file">
        Upload a CV, or paste its text below
      </label>
      <input
        id="updated-cv-file"
        type="file"
        accept=".pdf,.docx"
        disabled={busy}
        aria-describedby="updated-upload-help"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          void handleUpload(file);
        }}
      />

      <p id="updated-upload-help" className="field-help">
        PDF or DOCX, maximum 2 MB. Remove unnecessary personal
        information, such as your phone number or address.
      </p>

      {extracting && (
        <p role="status">Extracting your CV text…</p>
      )}

      {warnings.length > 0 && (
        <div className="notice">
          <ul>
            {warnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      <label htmlFor="updated-cv">
        {requireCv ? "Check and correct your CV text *" : "CV text — optional"}
      </label>
      <textarea
        id="updated-cv"
        rows={10}
        value={cv}
        maxLength={40000}
        required={requireCv}
        disabled={busy}
        onChange={(event) => setCv(event.target.value)}
      />

      <p className="field-help">
        Check extracted names, dates and bullet points.
        {" "}
        {cv.length.toLocaleString()} / 40,000 characters.
      </p>

      <label htmlFor="updated-jd">
        {requireJobDescription
          ? "Job description *"
          : "Job description — optional"}
      </label>
      <textarea
        id="updated-jd"
        rows={7}
        value={jd}
        maxLength={20000}
        required={requireJobDescription}
        disabled={busy}
        onChange={(event) => setJd(event.target.value)}
      />

      <p className="field-help">
        Saving updates this preparation. Previous reviews and job-fit
        results will need regenerating. Existing interviews keep
        their original details.
      </p>

      <div className="button-row">
        <button
          type="submit"
          className="primary-button"
          disabled={
            busy ||
            !role.trim() ||
            (requireCv && !cv.trim()) ||
            (requireJobDescription && !jd.trim()) ||
            cv.length > 40000
          }
        >
          {saving ? "Saving…" : "Save preparation"}
        </button>

        <button
          type="button"
          className="secondary-button"
          disabled={busy}
          onClick={() => setEditing(false)}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}