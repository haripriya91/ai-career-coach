import type { ReactNode } from "react";
import type { Screen } from "../types";

const navigation: { id: Screen; label: string }[] = [
  { id: "intake", label: "Intake" },
  { id: "review", label: "CV Review" },
  { id: "jobs", label: "Jobs & Fit" },
  { id: "company", label: "Company Prep" },
  { id: "interview", label: "Interview" },
  { id: "roadmap", label: "Learning Roadmap" },
];

interface Props {
  screen: Screen;
  onNavigate: (screen: Screen) => void;
  targetRole: string;
  children: ReactNode;
}

export default function AppLayout({
  screen,
  onNavigate,
  targetRole,
  children,
}: Props) {
  return (
    <div className="app-layout">
      <aside className="sidebar">
        <h1>Career Coach</h1>
        <p className="sidebar-description">
          Prepare your next career move.
        </p>

        <nav aria-label="Main navigation">
          {navigation.map((item) => (
            <button
              key={item.id}
              type="button"
              className={screen === item.id ? "nav-item active" : "nav-item"}
              aria-current={screen === item.id ? "page" : undefined}
              onClick={() => onNavigate(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="role-summary">
          <small>Target role</small>
          <p>{targetRole || "Not selected yet"}</p>
        </div>
      </aside>

      <main className="main-content">{children}</main>
    </div>
  );
}