import { useState } from "react";
import type { ComponentPropsWithoutRef } from "react";

import { createWorkspace, extractCv } from "../api";
import type { PageProps } from "../types";


type FormSubmitHandler = NonNullable<
  ComponentPropsWithoutRef<"form">["onSubmit"]
>;

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

function getErrorMessage(error: unknown): string {
  if (error instanceof TypeError) {
    return "Cannot reach the backend. Check that it is running on port 8000.";
  }

  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}

export default function IntakePage({
  intake,
  setIntake,
}: PageProps) {
  const [step, setStep] = useState<"upload" | "details">(
    intake.cvText ? "details" : "upload",
  );

  const [isExtracting, setIsExtracting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [filename, setFilename] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState("");

  const isBusy = isExtracting || isSaving;

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
    } catch (error) {
      setError(getErrorMessage(error));
    } finally {
      setIsExtracting(false);
    }
  }

 const handleConfirm: FormSubmitHandler = async (event) => {
      event.preventDefault();

    if (isBusy || intake.workspaceId) return;

    if (!intake.cvText.trim() || !intake.targetRole.trim()) {
      setError("Please provide your CV text and target role.");
      return;
    }

    if (intake.cvText.length > 40000) {
      setError("Please shorten the CV text to 40,000 characters.");
      return;
    }

    setError("");
    setIsSaving(true);

    try {
      // Use the CURRENT edited textarea value.
      const workspace = await createWorkspace({
        target_role: intake.targetRole.trim(),
        company: intake.company.trim(),
        cv_text: intake.cvText.trim(),
        job_description: intake.jobDescription.trim(),
      });

      setIntake({
        workspaceId: workspace.id,
        intakeVersion: workspace.intake_version,
        targetRole: workspace.intake.target_role,
        company: workspace.intake.company,
        cvText: workspace.intake.cv_text,
        jobDescription: workspace.intake.job_description,
        profileConfirmed: true,
      });
    } catch (error) {
      setError(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  if (intake.workspaceId && intake.profileConfirmed) {
    return (
      <section>
        <p className="eyebrow">PREPARATION SESSION CREATED</p>
        <h2>Your details are saved</h2>

        <div className="card">
          <h3>{intake.targetRole}</h3>

          {intake.company && <p>Company: {intake.company}</p>}

          <p>
            Your corrected CV and job details are saved for CV review
            and interview preparation.
          </p>

          <p className="field-help">
            CV review and interview generation will be connected next.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section>
      <p className="eyebrow">
        {step === "upload" ? "STEP 1 OF 2" : "STEP 2 OF 2"}
      </p>

      <h2>
        {step === "upload"
          ? "Upload your resume"
          : "Review your resume and add job details"}
      </h2>

      <p className="muted">
        {step === "upload"
          ? "Upload a PDF or DOCX, or paste your CV text below."
          : "Correct any extraction errors before saving your preparation session."}
      </p>

      {error && (
        <div className="error-notice" role="alert">
          {error}
        </div>
      )}

      {step === "upload" ? (
        <div className="card intake-form">
          <label htmlFor="resume-file">Choose a PDF or DOCX</label>

          <input
            id="resume-file"
            type="file"
            accept=".pdf,.docx"
            disabled={isBusy}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              void handleUpload(file);
            }}
          />

          <p className="field-help">
            Maximum 2 MB. Scanned PDFs may not contain extractable text.
          </p>

          {isExtracting && (
            <p role="status">Extracting your resume text…</p>
          )}

          <label htmlFor="pasted-cv">Or paste your CV text</label>

          <textarea
            id="pasted-cv"
            rows={8}
            value={intake.cvText}
            maxLength={40000}
            disabled={isBusy}
            onChange={(event) =>
              updateField("cvText", event.target.value)
            }
          />

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
            Continue with pasted text
          </button>
        </div>
      ) : (
        <form
          className="card intake-form"
          onSubmit={handleConfirm}
        >
          {filename && (
            <p className="field-help">Uploaded file: {filename}</p>
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

          <label htmlFor="corrected-cv">
            Check and correct your CV text *
          </label>

          <textarea
            id="corrected-cv"
            rows={15}
            value={intake.cvText}
            maxLength={40000}
            required
            disabled={isBusy}
            onChange={(event) =>
              updateField("cvText", event.target.value)
            }
          />

          <p className="field-help">
            {intake.cvText.length.toLocaleString()} / 40,000 characters
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

          <label htmlFor="job-description">
            Job description — optional
          </label>

          <textarea
            id="job-description"
            rows={7}
            value={intake.jobDescription}
            placeholder="Paste the requirements of the job."
            maxLength={20000}
            disabled={isBusy}
            onChange={(event) =>
              updateField("jobDescription", event.target.value)
            }
          />

          <div className="button-row">
            <button
              type="button"
              className="secondary-button"
              disabled={isBusy}
              onClick={() => {
                setError("");
                setStep("upload");
              }}
            >
              Back
            </button>

            <button
              type="submit"
              className="primary-button"
              disabled={
                isBusy ||
                !intake.cvText.trim() ||
                !intake.targetRole.trim() ||
                intake.cvText.length > 40000
              }
            >
              {isSaving ? "Saving…" : "Confirm and save"}
            </button>
          </div>

          <p className="field-help">
            This saves your corrected text and job details.
            It does not generate a review yet.
          </p>
        </form>
      )}
    </section>
  );
}