import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import type { Screen } from "../types";

const navigation: { id: Screen; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "intake", label: "Your details" },
  { id: "review", label: "CV review" },
  { id: "interview", label: "Interview practice" },
  { id: "jobs", label: "Jobs & matching" },
  { id: "company", label: "Company preparation" },
  { id: "roadmap", label: "Learning plan" },
];

interface Props {
  screen: Screen;
  onNavigate: (screen: Screen) => void;
  targetRole: string;
  children: ReactNode;
  sessionControls?: ReactNode;
  onNewPreparation: () => void;
  sessionBusy: boolean;
}

export default function AppLayout({
  screen,
  onNavigate,
  targetRole,
  children,
  sessionControls,
  onNewPreparation,
  sessionBusy,
}: Props) {
    const preparationsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    function handleOutsidePointer(event: PointerEvent) {
      const menu = preparationsRef.current;

      if (
        menu?.open &&
        event.target instanceof Node &&
        !menu.contains(event.target)
      ) {
        menu.open = false;
      }
    }

    function handleEscape(event: KeyboardEvent) {
      const menu = preparationsRef.current;

      if (event.key === "Escape" && menu?.open) {
        menu.open = false;
        menu.querySelector<HTMLElement>("summary")?.focus();
      }
    }

    document.addEventListener("pointerdown", handleOutsidePointer);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointer);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  useEffect(() => {
    if (sessionBusy && preparationsRef.current) {
      preparationsRef.current.open = false;
    }
  }, [sessionBusy])
  const privacyDialogRef = useRef<HTMLDialogElement>(null);
  return (
    <div className="app-layout">
      <aside className="sidebar">
        <h1>Career Coach</h1>
        <p className="sidebar-description">
          Your next career move, one step at a time.
        </p>

        <nav aria-label="Main navigation">
          {navigation.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={sessionBusy}
              className={
                screen === item.id ? "nav-item active" : "nav-item"
              }
              aria-current={screen === item.id ? "page" : undefined}
              onClick={() => onNavigate(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <div className="app-workspace">
        <header className="workspace-header">
          <div className="header-context">
            <span className="field-help">Current preparation</span>
            <p>{targetRole || "Choose a goal to get started"}</p>
          </div>

          <div className="header-actions">
            <details
              ref={preparationsRef}
              className="preparations-menu"
            >              
            <summary className="secondary-button">
                My preparations
              </summary>

              <div className="preparations-panel">
                {sessionControls}
              </div>
            </details>

            <button
              type="button"
              className="primary-button"
              disabled={sessionBusy}
              onClick={onNewPreparation}
            >
              Start new preparation
            </button>
          </div>
        </header>

        <main className="main-content">{children}</main>
        <footer className="app-footer">
  <p>
    AI can make mistakes. Check suggestions before using them.
  </p>

  <button
    type="button"
    className="privacy-link"
    onClick={() => privacyDialogRef.current?.showModal()}
  >
    Privacy &amp; data
  </button>
</footer>

<dialog
  ref={privacyDialogRef}
  className="privacy-dialog"
  aria-labelledby="app-privacy-title"
  onClick={(event) => {
    if (event.target !== event.currentTarget) return;

    const bounds = event.currentTarget.getBoundingClientRect();

    if (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    ) {
      event.currentTarget.close();
    }
  }}
>
  <h2 id="app-privacy-title">Privacy &amp; data</h2>

  <p>
    Your details are processed by an external AI service for
    feedback and saved so you can return later. Remove unnecessary
    personal information, such as your phone number or address,
    before sharing.
  </p>

  <p>
    <strong>AI can make mistakes.</strong> Check suggestions
    before using them.
  </p>

  <form method="dialog" className="privacy-dialog-actions">
    <button
      type="submit"
      className="primary-button"
      autoFocus
    >
      Close
    </button>
  </form>
</dialog>
      </div>
    </div>
  );
}