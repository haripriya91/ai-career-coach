import type { PageProps } from "../types";

export default function InterviewPage({ intake }: PageProps) {
  return (
    <section>
      <h2>Interview</h2>
      <div className="card">
        <p>This feature is not implemented yet.</p>
        <p>Target role: {intake.targetRole || "Not selected"}</p>
      </div>
    </section>
  );
}
