import type { PageProps } from "../types";

export default function CVReviewPage({ intake }: PageProps) {
  return (
    <section>
      <h2>CVReview</h2>
      <div className="card">
        <p>This feature is not implemented yet.</p>
        <p>Target role: {intake.targetRole || "Not selected"}</p>
      </div>
    </section>
  );
}
