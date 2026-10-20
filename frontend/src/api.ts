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