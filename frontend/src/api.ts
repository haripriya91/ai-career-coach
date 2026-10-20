const API_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:8000"
).replace(/\/$/, "");

export interface ExtractionResponse {
  filename: string;
  extracted_text: string;
  warnings: string[];
}

export interface WorkspaceIntake {
  target_role: string;
  company: string;
  cv_text: string;
  job_description: string;
}

export interface WorkspaceResponse {
  id: string;
  intake: WorkspaceIntake;
  intake_version: number;
  created_at: string;
  updated_at: string;
}

async function readResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `Request failed (${response.status}).`;

    try {
      const body = await response.json();

      if (typeof body.detail === "string") {
        message = body.detail;
      } else if (Array.isArray(body.detail)) {
        message = body.detail
          .map((error: { msg?: string }) => error.msg || "Invalid input")
          .join(". ");
      }
    } catch {
      // Keep the status-based message if the response is not JSON.
    }

    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export async function extractCv(
  file: File,
): Promise<ExtractionResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_URL}/api/cv/extract`, {
    method: "POST",
    body: formData,
  });

  return readResponse<ExtractionResponse>(response);
}

export async function createWorkspace(
  intake: WorkspaceIntake,
): Promise<WorkspaceResponse> {
  const response = await fetch(`${API_URL}/api/workspaces`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(intake),
  });

  return readResponse<WorkspaceResponse>(response);
}

export async function getWorkspace(
  workspaceId: string,
): Promise<WorkspaceResponse> {
  const response = await fetch(
    `${API_URL}/api/workspaces/${encodeURIComponent(workspaceId)}`,
  );

  return readResponse<WorkspaceResponse>(response);
}

export interface CVFinding {
  category:
    | "content"
    | "clarity"
    | "language"
    | "relevance"
    | "skills"
    | "structure";
  priority: "high" | "medium" | "low";
  observation: string;
  evidence_excerpt: string | null;
  suggested_action: string;
  suggested_rewrite: string | null;
  needs_confirmation: boolean;
}

export interface CVReview { 
  summary: string;
  strengths: string[];
  findings: CVFinding[];
  next_steps: string[];
  limitations: string[];
}

export interface CVReviewResponse {
  id: string;
  workspace_id: string;
  intake_version: number;
  review: CVReview;
  created_at: string;
}

export async function generateCvReview(
  workspaceId: string,
): Promise<CVReviewResponse> {
  const response = await fetch(
    `${API_URL}/api/workspaces/${encodeURIComponent(workspaceId)}/review`,
    { method: "POST" },
  );

  return readResponse<CVReviewResponse>(response);
}

interface CVReviewLookupResponse {
  found: boolean;
  message: string;
  result: CVReviewResponse | null;
}
export async function loadCvReview(
  workspaceId: string,
): Promise<CVReviewResponse | null> {
  const response = await fetch(
    `${API_URL}/api/workspaces/${encodeURIComponent(workspaceId)}/review`,
  );

  const data = await readResponse<CVReviewLookupResponse>(response);

  return data.result;
}

export async function updateWorkspace(
  workspaceId: string,
  intake: WorkspaceIntake,
  expectedVersion: number,
): Promise<WorkspaceResponse> {
  const response = await fetch(
    `${API_URL}/api/workspaces/${encodeURIComponent(workspaceId)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        intake,
        expected_version: expectedVersion,
      }),
    },
  );

  return readResponse<WorkspaceResponse>(response);
}

export async function deleteWorkspace(
  workspaceId: string,
): Promise<void> {
  const response = await fetch(
    `${API_URL}/api/workspaces/${encodeURIComponent(workspaceId)}`,
    { method: "DELETE" },
  );

  // DELETE returns no JSON on success.
  if (!response.ok) {
    await readResponse<unknown>(response);
  }
}

export interface InterviewQuestion {
  id: string;
  text: string;
  topic: string;
  kind: "main" | "follow_up";
}

export interface InterviewFeedback {
  summary: string;
  overall_score: number | null;
  strengths: string[];
  improvements: string[];
  incomplete: boolean;
  dimensions: {
    name: string;
    score: number | null;
    reason: string;
    answer_excerpt: string | null;
    improvement: string;
  }[];
}

export interface InterviewResponse {
  id: string;
  workspace_id: string;
  status: "not_started" | "in_progress" | "processing" | "completed";
  version: number;
  main_questions_asked: number;
  follow_ups_asked: number;
  current_question: InterviewQuestion | null;
  turns: {
    question: InterviewQuestion;
    answer: string;
  }[];
  feedback: InterviewFeedback | null;
}

export async function startInterview(
  workspaceId: string,
  questionCount: number,
): Promise<InterviewResponse> {
  const response = await fetch(`${API_URL}/api/interviews`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workspace_id: workspaceId,
      question_count: questionCount,
    }),
  });

  return readResponse<InterviewResponse>(response);
}

export async function getInterview(
  interviewId: string,
): Promise<InterviewResponse> {
  const response = await fetch(
    `${API_URL}/api/interviews/${encodeURIComponent(interviewId)}`,
  );

  return readResponse<InterviewResponse>(response);
}

export async function submitInterviewAnswer(
  interview: InterviewResponse,
  answer: string,
): Promise<InterviewResponse> {
  if (!interview.current_question) {
    throw new Error("No pending question is available.");
  }

  const response = await fetch(
    `${API_URL}/api/interviews/${encodeURIComponent(interview.id)}/answers`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question_id: interview.current_question.id,
        answer,
        expected_version: interview.version,
      }),
    },
  );

  return readResponse<InterviewResponse>(response);
}

export async function finishInterview(
  interviewId: string,
): Promise<InterviewResponse> {
  const response = await fetch(
    `${API_URL}/api/interviews/${encodeURIComponent(interviewId)}/finish`,
    { method: "POST" },
  );

  return readResponse<InterviewResponse>(response);
}

export interface JobFitRequirement {
  requirement: string;
  importance: "required" | "preferred";
  status: "matched" | "partial" | "not_evidenced";
  job_evidence: string;
  cv_evidence: string | null;
  explanation: string;
  suggested_action: string;
}

export interface JobFitResult {
  summary: string;
  requirements: JobFitRequirement[];
  priority_improvements: string[];
  coverage_score: number;
}

export interface JobFitLookupResponse {
  found: boolean;
  stale: boolean;
  detail: string;
  artifact_id: string | null;
  intake_version: number | null;
  created_at: string | null;
  result: JobFitResult | null;
}

export async function loadJobFit(
  workspaceId: string,
  signal?: AbortSignal,
): Promise<JobFitLookupResponse> {
  const response = await fetch(
    `${API_URL}/api/workspaces/${encodeURIComponent(workspaceId)}/fit`,
    { signal },
  );

  return readResponse<JobFitLookupResponse>(response);
}

export async function generateJobFit(
  workspaceId: string,
  signal?: AbortSignal,
): Promise<JobFitLookupResponse> {
  const response = await fetch(
    `${API_URL}/api/workspaces/${encodeURIComponent(workspaceId)}/fit`,
    {
      method: "POST",
      signal,
    },
  );

  return readResponse<JobFitLookupResponse>(response);
}