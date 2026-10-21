import { useState } from "react";
import type { ComponentPropsWithoutRef } from "react";

import { createWorkspace, extractCv } from "../api";
import type { PageProps, PreparationGoal } from "../types";
import PreparationDetails from "../components/PreparationDetails";

interface IntakePageProps extends PageProps {
  goal: PreparationGoal;
  onChooseGoal: (goal: PreparationGoal) => void;
}

type FormSubmitHandler = NonNullable<
  ComponentPropsWithoutRef<"form">["onSubmit"]
>;

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const MAX_CV_CHARACTERS = 40000;

const goalLabels: Record<PreparationGoal, string> = {
  review: "CV review",
  interview: "interview practice",
  jobs: "job matching",
};

function getErrorMessage(error: unknown): string {
  if (error instanceof TypeError) {
    return "Could not reach the server. Check your connection and try again.";
  }

  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}

export default function IntakePage({
  intake,
  setIntake,
  goal,
  onChooseGoal,
}: IntakePageProps) {
  const requiresCv = goal !== "interview";
  const requiresJobDescription = goal === "jobs";

  const [step, setStep] = useState<"upload" | "details">(
    intake.cvText.trim() || goal === "interview"
      ? "details"
      : "upload",
  );

  const [isExtracting, setIsExtracting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [filename, setFilename] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState("");

  const isBusy = isExtracting || isSaving;

  const canSave =
    Boolean(intake.targetRole.trim()) &&
    (!requiresCv || Boolean(intake.cvText.trim())) &&
    (!requiresJobDescription ||
      Boolean(intake.jobDescription.trim())) &&
    intake.cvText.length <= MAX_CV_CHARACTERS;

  function updateField(
    field: "cvText" | "targetRole" | "company" | "jobDescription",
    value: string,
  ) {
    setIntake((previous) => ({
      ...previous,
      [field]: value,
      profileConfirmed: false,
    }));
  }

  async function handleUpload(file: File | undefined) {
    if (!file || isBusy) return;

    setError("");
    setWarnings([]);

    if (!/\.(pdf|docx)$/i.test(file.name)) {
      setError("Please select a PDF or DOCX file.");
      return;
    }

    if (file.size === 0) {
      setError("The selected file is empty.");
      return;
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      setError("The maximum upload size is 2 MB.");
      return;
    }

    setIsExtracting(true);

    try {
      const result = await extractCv(file);

      if (!result.extracted_text.trim()) {
        throw new Error(
          "No readable text was found. Please paste your CV text instead.",
        );
      }

      setIntake((previous) => ({
        ...previous,
        cvText: result.extracted_text,
        profileConfirmed: false,
      }));

      setFilename(result.filename);
      setWarnings(result.warnings);
      setStep("details");
    } catch (error: unknown) {
      setError(getErrorMessage(error));
    } finally {
      setIsExtracting(false);
    }
  }

  const handleConfirm: FormSubmitHandler = async (event) => {
    event.preventDefault();

    if (isBusy) return;

    if (intake.workspaceId) {
      setError(
        "This preparation is already saved. Reopen it or start a new preparation.",
      );
      return;
    }

    if (!intake.targetRole.trim()) {
      setError("Enter the role you want to prepare for.");
      return;
    }

    if (requiresCv && !intake.cvText.trim()) {
      setError("Add your CV text to continue.");
      return;
    }

    if (
      requiresJobDescription &&
      !intake.jobDescription.trim()
    ) {
      setError(
        "Paste a job description so we can compare its requirements.",
      );
      return;
    }

    if (intake.cvText.length > MAX_CV_CHARACTERS) {
      setError("Please shorten the CV text to 40,000 characters.");
      return;
    }

    setError("");
    setIsSaving(true);

    try {
      const workspace = await createWorkspace({
        target_role: intake.targetRole.trim(),
        company: intake.company.trim(),
        cv_text: intake.cvText.trim(),
        job_description: intake.jobDescription.trim(),
      });

      // App.tsx uses this confirmed state to open the selected feature.
      setIntake({
        workspaceId: workspace.id,
        intakeVersion: workspace.intake_version,
        targetRole: workspace.intake.target_role,
        company: workspace.intake.company,
        cvText: workspace.intake.cv_text,
        jobDescription: workspace.intake.job_description,
        profileConfirmed: true,
      });
    } catch (error: unknown) {
      setError(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

 if (intake.workspaceId && intake.profileConfirmed) {
  const hasCv = Boolean(intake.cvText.trim());
  const hasJob = Boolean(intake.jobDescription.trim());

  return (
    <section>
      <p className="eyebrow">YOUR PREPARATION</p>
      <h2>Your saved details</h2>

      <div className="card">
        <h3>{intake.targetRole}</h3>

        {intake.company && (
          <p>Company: {intake.company}</p>
        )}

        <p className="field-help">
          CV: {hasCv ? "Added" : "Not added"}
          {" · "}
          Job description: {hasJob ? "Added" : "Not added"}
        </p>

        <p className="muted">
          Use these details across your coaching activities.
          Add or update your CV and job details below.
        </p>

        <PreparationDetails
          intake={intake}
          setIntake={setIntake}
          requireCv={!hasCv}
        />

        {!hasCv && (
          <p className="muted">
            You can practise interviews with your target role alone.
            Add your CV above to use CV review and job matching.
          </p>
        )}

        <div className="button-row">
          <button
            type="button"
            className="primary-button"
            onClick={() => onChooseGoal("review")}
          >
            {hasCv ? "Review my CV" : "Add CV for review"}
          </button>

          <button
            type="button"
            className="secondary-button"
            onClick={() => onChooseGoal("interview")}
          >
            Practise an interview
          </button>

          <button
            type="button"
            className="secondary-button"
            onClick={() => onChooseGoal("jobs")}
          >
            Check job match
          </button>
        </div>
      </div>
    </section>
  );
}

  return (
    <section>
      <p className="eyebrow">
        PREPARING FOR {goalLabels[goal].toUpperCase()}
      </p>

      <h2>
        {step === "upload"
          ? "Let’s start with your CV"
          : goal === "interview"
            ? "Which role are you preparing for?"
            : "Check your CV and add job details"}
      </h2>

      <p className="muted">
        {step === "upload"
          ? "Upload a PDF or DOCX, or paste the text. You can check and correct it before saving."
          : goal === "interview"
            ? "A target role is enough to start. Add your CV or a job description for more tailored questions."
            : "Correct any extraction errors, then tell your coach which role you’re targeting."}
      </p>

      {error && (
        <div className="error-notice" role="alert">
          {error}
        </div>
      )}

      {step === "upload" ? (
        <div className="card intake-form" aria-busy={isExtracting}>
          <label htmlFor="resume-file">
            Choose a PDF or DOCX
          </label>

          <input
            id="resume-file"
            type="file"
            accept=".pdf,.docx"
            disabled={isBusy}
            aria-describedby="upload-help"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              void handleUpload(file);
            }}
          />

          <p id="upload-help" className="field-help">
            Maximum 2 MB. Scanned PDFs may not contain readable
            text; you can paste the text instead.
          </p>

          {isExtracting && (
            <p role="status">Extracting your CV text…</p>
          )}

          <label htmlFor="pasted-cv">
            Or paste your CV text
          </label>

          <textarea
            id="pasted-cv"
            rows={8}
            value={intake.cvText}
            maxLength={MAX_CV_CHARACTERS}
            disabled={isBusy}
            onChange={(event) =>
              updateField("cvText", event.target.value)
            }
          />

          <div className="button-row">
            <button
              type="button"
              className="primary-button"
              disabled={isBusy || !intake.cvText.trim()}
              onClick={() => {
                setError("");
                setWarnings([]);
                setFilename("");
                setStep("details");
              }}
            >
              Continue with this text
            </button>

            {goal === "interview" && (
              <button
                type="button"
                className="secondary-button"
                disabled={isBusy}
                onClick={() => {
                  setError("");
                  setStep("details");
                }}
              >
                Continue without uploading
              </button>
            )}
          </div>
        </div>
      ) : (
        <form
          className="card intake-form"
          onSubmit={handleConfirm}
          aria-busy={isSaving}
        >
          <p className="field-help">
            Fields marked * are required.
          </p>

          <label htmlFor="target-role">Target role *</label>

          <input
            id="target-role"
            value={intake.targetRole}
            placeholder="For example: Frontend Developer"
            maxLength={150}
            required
            disabled={isBusy}
            onChange={(event) =>
              updateField("targetRole", event.target.value)
            }
          />

          <label htmlFor="company">Company — optional</label>

          <input
            id="company"
            value={intake.company}
            placeholder="Company name"
            maxLength={150}
            disabled={isBusy}
            onChange={(event) =>
              updateField("company", event.target.value)
            }
          />

          {filename && (
            <p className="field-help">
              Uploaded file: {filename}
            </p>
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

          {goal === "interview" && (
            <div>
              <button
                type="button"
                className="secondary-button"
                disabled={isBusy}
                onClick={() => {
                  setError("");
                  setStep("upload");
                }}
              >
                Upload a CV — optional
              </button>
            </div>
          )}

          <label htmlFor="corrected-cv">
            {requiresCv
              ? "Check and correct your CV text *"
              : "CV text — optional"}
          </label>

          <textarea
            id="corrected-cv"
            rows={goal === "interview" ? 7 : 15}
            value={intake.cvText}
            maxLength={MAX_CV_CHARACTERS}
            required={requiresCv}
            disabled={isBusy}
            aria-describedby="cv-text-help"
            onChange={(event) =>
              updateField("cvText", event.target.value)
            }
          />

          <p id="cv-text-help" className="field-help">
            Check names, dates and bullet points after extraction.
            {" "}
            {intake.cvText.length.toLocaleString()} / 40,000 characters.
          </p>

          <label htmlFor="job-description">
            {requiresJobDescription
              ? "Job description *"
              : "Job description — optional"}
          </label>

          <textarea
            id="job-description"
            rows={7}
            value={intake.jobDescription}
            placeholder="Paste the responsibilities and requirements of the job."
            maxLength={20000}
            required={requiresJobDescription}
            disabled={isBusy}
            onChange={(event) =>
              updateField("jobDescription", event.target.value)
            }
          />

          <p className="field-help">
            {requiresJobDescription
              ? "The job description is needed to compare its requirements with your CV."
              : "Adding a job description helps tailor the feedback to a specific position."}
          </p>

          <div className="button-row">
            {requiresCv && (
              <button
                type="button"
                className="secondary-button"
                disabled={isBusy}
                onClick={() => {
                  setError("");
                  setStep("upload");
                }}
              >
                Change CV input
              </button>
            )}

            <button
              type="submit"
              className="primary-button"
              disabled={isBusy || !canSave}
            >
              {isSaving
                ? "Saving your details…"
                : `Save and continue to ${goalLabels[goal]}`}
            </button>
          </div>

          <p className="field-help">
            This saves your details and opens {goalLabels[goal]}.
            You’ll start the AI activity from that screen.
          </p>
        </form>
      )}
    </section>
  );
}