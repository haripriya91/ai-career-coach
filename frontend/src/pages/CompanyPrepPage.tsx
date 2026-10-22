import { useEffect, useState } from "react";

import {
  createWorkspace,
  updateWorkspace,
  generateCompanyPrep,
  loadCompanyPrep,
} from "../api";

import type { CompanyPrepResponse } from "../api";
import type { PageProps } from "../types";

export default function CompanyPrepPage({
  intake,
  setIntake,
}: PageProps) {
  const workspaceId = intake.workspaceId;

  const [company, setCompany] = useState(intake.company || "");
  const [targetRole, setTargetRole] = useState(
    intake.targetRole || "",
  );


  const [report, setReport] = useState<CompanyPrepResponse | null>(
    null,
  );
  const [loading, setLoading] = useState(Boolean(workspaceId));
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  // Load saved research when the page opens.
  useEffect(() => {
  if (!workspaceId) {
    return;
  }

  const controller = new AbortController();

  async function fetchReport() {
    try {
      const response = await loadCompanyPrep(
        workspaceId!,
        controller.signal,
      );

      if (!controller.signal.aborted) {
        setReport(response.found ? response.result : null);
        setError("");
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(
          err instanceof Error
            ? err.message
            : "Unable to load company preparation.",
        );
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }

  void fetchReport();

  return () => controller.abort();
}, [workspaceId]);

 
async function handleGenerate() {
  if (generating) return;

  const selectedCompany = company.trim();
  const selectedRole = targetRole.trim();

  if (!selectedCompany || !selectedRole) {
    setError("Please enter a company and target role.");
    return;
  }

  try {
    setGenerating(true);
    setError("");

    let workspaceId = intake.workspaceId;

    const workspaceDetails = {
      target_role: selectedRole,
      company: selectedCompany,
      cv_text: intake.cvText,
      job_description: intake.jobDescription,
    };

    let savedWorkspace;

    if (!workspaceId) {
      // Create a workspace for first-time users.
      savedWorkspace = await createWorkspace(workspaceDetails);
    } else if (
      selectedCompany !== intake.company ||
      selectedRole !== intake.targetRole
    ) {
      // Update the existing workspace only if details changed.
      if (
        !window.confirm(
          "Changing your company or role will update this preparation workspace and may make existing reports outdated. Continue?",
        )
      ) {
        return;
      }

      if (intake.intakeVersion === null) {
        throw new Error("Workspace version is missing.");
      }

      savedWorkspace = await updateWorkspace(
        workspaceId,
        workspaceDetails,
        intake.intakeVersion,
      );
    }

    if (savedWorkspace) {
      workspaceId = savedWorkspace.id;

      setIntake((previous) => ({
        ...previous,
        workspaceId: savedWorkspace.id,
        intakeVersion: savedWorkspace.intake_version,
        targetRole: savedWorkspace.intake.target_role,
        company: savedWorkspace.intake.company,
        cvText: savedWorkspace.intake.cv_text,
        jobDescription: savedWorkspace.intake.job_description,
        profileConfirmed: true,
      }));
    }

    if (!workspaceId) {
      throw new Error("Unable to create or load workspace.");
    }

    // Generate company research.
    const response = await generateCompanyPrep(workspaceId);

    setReport(response);
  } catch (err) {
    setError(
      err instanceof Error
        ? err.message
        : "Unable to generate company preparation.",
    );
  } finally {
    setGenerating(false);
  }
}


  const result = report?.result;

  return (
    <section>
      <h2>Company Interview Preparation</h2>

      <div className="card">
        <h3>Prepare for a Company Interview</h3>
        <p>
          Enter the company and role you want to prepare for.
        </p>

      <div style={{ marginBottom: "1rem" }}>
        <label htmlFor="company-name">
          Company name
        </label>
        
        <input
          id="company-name"
          type="text"
          value={company}
          onChange={(event) => setCompany(event.target.value)}
          placeholder="e.g. Amazon"/>
      </div>

      <div style={{ marginBottom: "1rem" }}>
        <label htmlFor="target-role">
          Target role
        </label>

      <input
        id="target-role"
        type="text"
        value={targetRole}
        onChange={(event) => setTargetRole(event.target.value)}
        placeholder="e.g. Android Developer"
        />
    </div>

        <button
          type="button"
          className="primary-button"
          onClick={() => void handleGenerate()}
          disabled={ 
            generating || !company.trim() || !targetRole.trim()
          }
        >
          {generating
          ? "Researching company..."
          : "Generate Company Preparation"}
        </button>

{generating && (
  <p role="status">
    Researching company information and preparing interview
    questions. This may take a minute.
  </p>
)}

{error && (
  <p role="alert" style={{ color: "crimson" }}>
    {error}
  </p>
)}
   </div>

     {loading && (
      <p role="status">Loading saved company preparation...</p> 
     )}


      {result && (
        <>
          <div className="card">
            <h3>Company Overview</h3>
            <p>{result.company_overview}</p>
          </div>

          <div className="card">
            <h3>Company Values</h3>
            {result.company_values.length > 0 ? (
              <ul>
                {result.company_values.map((value, index) => (
                  <li key={index}>{value}</li>
                ))}
              </ul>
            ) : (
              <p>No verified company values available.</p>
            )}
          </div>

          <div className="card">
            <h3>Company Culture</h3>
            {result.company_culture.length > 0 ? (
              <ul>
                {result.company_culture.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            ) : (
              <p>No verified culture information available.</p>
            )}
          </div>

          <div className="card">
            <h3>Interview Process</h3>
            {result.interview_process.length > 0 ? (
              <ol>
                {result.interview_process.map((step, index) => (
                  <li key={index}>{step}</li>
                ))}
              </ol>
            ) : (
              <p>
                The interview process could not be verified.
              </p>
            )}
          </div>

          <div className="card">
            <h3>Key Skills</h3>
            <ul>
              {result.key_skills.map((skill, index) => (
                <li key={index}>{skill}</li>
              ))}
            </ul>
          </div>

          <div className="card">
            <h3>Likely Interview Topics</h3>
            <ul>
              {result.likely_interview_topics.map((topic, index) => (
                <li key={index}>{topic}</li>
              ))}
            </ul>
          </div>

          <div className="card">
            <h3>Practice Interview Questions</h3>
            <p>
              These are AI-generated practice questions, not
              confirmed questions from the company.
            </p>

            {result.practice_questions.map((question, index) => (
              <div key={index} style={{ marginBottom: "1.5rem" }}>
                <h4>
                  {index + 1}. {question.question}
                </h4>

                <p>
                  <strong>Category:</strong>{" "}
                  {question.category.replaceAll("_", " ")}
                </p>

                <p>
                  <strong>Preparation tip:</strong>{" "}
                  {question.preparation_tip}
                </p>
              </div>
            ))}
          </div>

          <div className="card">
            <h3>Preparation Tips</h3>
            <ul>
              {result.preparation_tips.map((tip, index) => (
                <li key={index}>{tip}</li>
              ))}
            </ul>
          </div>

          <div className="card">
            <h3>Research Sources</h3>
            {result.sources.length > 0 ? (
              <ul>
                {result.sources.map((source, index) => (
                  <li key={index}>
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {source.title}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No research sources available.</p>
            )}
          </div>

          {result.limitations.length > 0 && (
            <div className="card">
              <h3>Research Limitations</h3>
              <ul>
                {result.limitations.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
