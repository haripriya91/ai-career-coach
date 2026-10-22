import { useEffect, useRef, useState } from "react";

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
  const generatingRef = useRef(false);
  const [error, setError] = useState("");
  const skipLookupWorkspaceRef = useRef<string | null>(null);

  // Load saved research when the page opens.
  useEffect(() => {
  if (!workspaceId) return;

  // A newly created or updated workspace is about to generate
  // its report. Don't request a report that doesn't exist yet.
  if (skipLookupWorkspaceRef.current === workspaceId) {
    skipLookupWorkspaceRef.current = null;
    return;
  }

  const controller = new AbortController();

  async function fetchReport() {
    try {
      const response = await loadCompanyPrep(
        workspaceId!,
        controller.signal,
      );

      if (!controller.signal.aborted && !generatingRef.current) {
        setReport(response.found ? response.result : null);
        setError("");
      }
    } catch (err) {
      if (!controller.signal.aborted && !generatingRef.current) {
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
  
  if (generatingRef.current) return;

  const selectedCompany = company.trim();
  const selectedRole = targetRole.trim();

  if (!selectedCompany || !selectedRole) {
    setError("Please enter a company and target role.");
    return;
  }

  try {
    generatingRef.current = true;
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

      skipLookupWorkspaceRef.current = savedWorkspace.id;

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
    

  console.log("Starting company preparation generation:", workspaceId);
  const response = await generateCompanyPrep(workspaceId);
  console.log("Company preparation generated successfully:", response);
  setReport(response);
  setError("");
  
  } catch (err) {
    console.error("Company preparation generation failed:", err);
    setError(
      err instanceof Error
        ? err.message
        : "Unable to generate company preparation.",
    );
  } finally {
      generatingRef.current = false;
      setGenerating(false);
  }
}


  const result = report?.result;

  return (
    <section className="company-prep-page">
      <header className="cp-page-header">
        <p className="eyebrow">INTERVIEW READINESS</p>
        <h2>Company Interview Preparation</h2>
        <p className="cp-subtitle">
          Explore the company, understand interview expectations, and prepare with
          role-specific practice questions.
        </p>
      </header>

      <div className="card cp-form-card">
        <div className="cp-form-heading">
          <div>
            <h3>Prepare for your next interview</h3>
            <p>Tell us which company and position you're targeting.</p>
          </div>
          <span className="cp-form-icon" aria-hidden="true">✦</span>
        </div>

        <div className="cp-input-grid">
          <div>
            <label htmlFor="company-name">Company name</label>
            <input id="company-name" type="text" value={company}
              onChange={(event) => setCompany(event.target.value)}
              placeholder="e.g. Amazon" />
          </div>
          <div>
            <label htmlFor="target-role">Target role</label>
            <input id="target-role" type="text" value={targetRole}
              onChange={(event) => setTargetRole(event.target.value)}
              placeholder="e.g. Android Developer" />
          </div>
        </div>

        <button type="button" className="primary-button cp-generate-button"
          onClick={() => void handleGenerate()}
          disabled={generating || !company.trim() || !targetRole.trim()}
          aria-busy={generating}>
          {generating ? (
            <><span className="company-spinner" aria-hidden="true" />Researching company...</>
          ) : "Generate Company Preparation"}
        </button>

        {generating && (
          <div className="company-loading" role="status">
            <span className="company-spinner" aria-hidden="true" />
            <div>
              <strong>Preparing your company interview report</strong>
              <p>Researching the company, identifying interview topics, and generating practice questions. This may take a minute.</p>
            </div>
          </div>
        )}
        {error && <p className="error-notice" role="alert">{error}</p>}
      </div>

      {loading && <p role="status" className="cp-loading-saved">Loading saved company preparation...</p>}

      {result && (
        <div className="cp-results">
          <div className="cp-summary">
            <div className="cp-summary-top">
              <span className="cp-company-icon" aria-hidden="true">🏢</span>
              <div className="cp-summary-title">
                <span className="cp-small-label">YOUR COMPANY RESEARCH</span>
                <h3>{result.company_name}</h3>
                <p>{result.target_role} · Interview preparation</p>
              </div>
              <span className="cp-ready">✓ Report ready</span>
            </div>
            <div className="cp-stats">
              <div><strong>{result.practice_questions.length}</strong><span>Practice questions</span></div>
              <div><strong>{result.likely_interview_topics.length}</strong><span>Interview topics</span></div>
              <div><strong>{result.sources.length}</strong><span>Research sources</span></div>
            </div>
          </div>

          <article className="card cp-report-card">
            <h3><span aria-hidden="true">◈</span> Company overview</h3>
            <p className="cp-overview-text">{result.company_overview}</p>
          </article>

          <div className="cp-report-grid">
            <article className="card cp-report-card">
              <h3><span aria-hidden="true">♡</span> Company values</h3>
              {result.company_values.length ? (
                <div className="cp-tags">
                  {result.company_values.map((value, index) => <span className="cp-tag" key={index}>{value}</span>)}
                </div>
              ) : <p className="cp-empty">No verified company values available.</p>}
            </article>
            <article className="card cp-report-card">
              <h3><span aria-hidden="true">◎</span> Company culture</h3>
              {result.company_culture.length ? (
                <div className="cp-tags">
                  {result.company_culture.map((item, index) => <span className="cp-tag" key={index}>{item}</span>)}
                </div>
              ) : <p className="cp-empty">No verified culture information available.</p>}
            </article>
            <article className="card cp-report-card">
              <h3><span aria-hidden="true">⌘</span> Key skills</h3>
              <div className="cp-tags">
                {result.key_skills.map((skill, index) => <span className="cp-tag cp-tag-blue" key={index}>{skill}</span>)}
              </div>
            </article>
            <article className="card cp-report-card">
              <h3><span aria-hidden="true">◇</span> Likely interview topics</h3>
              <div className="cp-tags">
                {result.likely_interview_topics.map((topic, index) => <span className="cp-tag" key={index}>{topic}</span>)}
              </div>
            </article>
          </div>

          <article className="card cp-report-card">
            <h3><span aria-hidden="true">↗</span> Interview process</h3>
            {result.interview_process.length ? (
              <ol className="cp-steps">
                {result.interview_process.map((step, index) => <li key={index}>{step}</li>)}
              </ol>
            ) : <p className="cp-empty">The interview process could not be verified.</p>}
          </article>

          <section className="cp-questions-section" aria-labelledby="cp-questions-title">
            <div className="cp-section-heading">
              <div>
                <p className="cp-small-label">PRACTICE & PREPARE</p>
                <h3 id="cp-questions-title">Practice interview questions</h3>
                <p>AI-generated practice questions, not confirmed questions from the company.</p>
              </div>
              <span className="cp-count">{result.practice_questions.length} questions</span>
            </div>
            <div className="cp-question-list">
              {result.practice_questions.map((question, index) => (
                <article className="cp-question-card" key={index}>
                  <div className="cp-question-meta">
                    <span className="cp-question-number">Question {index + 1}</span>
                    <span className="cp-category">{question.category.replaceAll("_", " ")}</span>
                  </div>
                  <h4>{question.question}</h4>
                  <div className="cp-tip"><strong>Preparation tip</strong><p>{question.preparation_tip}</p></div>
                </article>
              ))}
            </div>
          </section>

          <article className="card cp-report-card">
            <h3><span aria-hidden="true">✓</span> Preparation tips</h3>
            <ul className="cp-tips-list">
              {result.preparation_tips.map((tip, index) => <li key={index}>{tip}</li>)}
            </ul>
          </article>

          <div className="card cp-report-card cp-references">
            <details>
              <summary>Research sources <span>{result.sources.length} links</span></summary>
              {result.sources.length ? (
                <ul className="cp-source-list">
                  {result.sources.map((source, index) => (
                    <li key={index}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a></li>
                  ))}
                </ul>
              ) : <p>No research sources available.</p>}
            </details>
            {result.limitations.length > 0 && (
              <details>
                <summary>Research limitations <span>{result.limitations.length} notes</span></summary>
                <ul className="cp-source-list">
                  {result.limitations.map((item, index) => <li key={index}>{item}</li>)}
                </ul>
              </details>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
