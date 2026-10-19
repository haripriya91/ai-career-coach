import type { PageProps } from "../types";

export default function CompanyPrepPage({ intake }: PageProps) {
  return (
    <section>
      <h2>CompanyPrep</h2>
      <div className="card">
        <p>This feature is not implemented yet.</p>
        <p>Target role: {intake.targetRole || "Not selected"}</p>
      </div>
    </section>
  );
}
