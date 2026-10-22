import { useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import { deleteWorkspace, getWorkspace } from "./api";
import type { WorkspaceResponse } from "./api";
import type { IntakeData, PreparationGoal, Screen } from "./types";

import HomePage from "./pages/HomePage";
import AppLayout from "./components/AppLayout";
import IntakePage from "./pages/IntakePage";
import CVReviewPage from "./pages/CVReviewPage";
import JobsFitPage from "./pages/JobsFitPage";
import CompanyPrepPage from "./pages/CompanyPrepPage";
import InterviewPage from "./pages/InterviewPage";
import RoadmapPage from "./pages/RoadmapPage";

interface SavedSession {
  id: string;
  label: string;
}

const HISTORY_KEY = "career-coach-session-history";

function emptyIntake(): IntakeData {
  return {
    workspaceId: null,
    intakeVersion: null,
    targetRole: "",
    company: "",
    cvText: "",
    jobDescription: "",
    profileConfirmed: false,
  };
}

function readHistory(): SavedSession[] {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(HISTORY_KEY) || "[]",
    );

    if (!Array.isArray(value)) return [];

    return value
      .filter(
        (item): item is SavedSession =>
          typeof item === "object" &&
          item !== null &&
          typeof item.id === "string" &&
          typeof item.label === "string",
      )
      .slice(0, 20);
  } catch {
    return [];
  }
}

function writeHistory(sessions: SavedSession[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(sessions));
  } catch {
    // The app can still work without browser persistence.
  }
}

function workspaceToIntake(
  workspace: WorkspaceResponse,
): IntakeData {
  return {
    workspaceId: workspace.id,
    intakeVersion: workspace.intake_version,
    targetRole: workspace.intake.target_role,
    company: workspace.intake.company,
    cvText: workspace.intake.cv_text,
    jobDescription: workspace.intake.job_description,
    profileConfirmed: true,
  };
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [intake, setIntakeState] = useState<IntakeData>(emptyIntake);
  const [sessions, setSessions] = useState<SavedSession[]>(readHistory);

  const [selectedId, setSelectedId] = useState("");
  const [sessionBusy, setSessionBusy] = useState(false);
  const [sessionError, setSessionError] = useState("");

  const [preparationGoal, setPreparationGoal] =
  useState<PreparationGoal>("review");
  const pendingGoalRef = useRef<PreparationGoal | null>(null);

  const intakeRef = useRef(intake);
  const historyRef = useRef(sessions);

  // Prevent an old page's delayed response from replacing a new session.
  const epochRef = useRef(0);
  const [renderEpoch, setRenderEpoch] = useState(0);

  function advanceSessionEpoch() {
    epochRef.current += 1;    
    setRenderEpoch(epochRef.current);
  }

  function commitIntake(next: IntakeData) {
    intakeRef.current = next;
    setIntakeState(next);

    if (next.workspaceId && next.profileConfirmed) {
      const entry = {
        id: next.workspaceId,
        label: [next.targetRole || "Preparation", next.company]
          .filter(Boolean)
          .join(" · "),
      };

      const updated = [
        entry,
        ...historyRef.current.filter((item) => item.id !== entry.id),
      ].slice(0, 20);

      historyRef.current = updated;
      setSessions(updated);
      writeHistory(updated);
    }
  }

  const setIntake: Dispatch<SetStateAction<IntakeData>> = (action) => {
    if (renderEpoch !== epochRef.current) return;

    const previous = intakeRef.current;
    const next =
      typeof action === "function" ? action(previous) : action;

    commitIntake(next);

    const hasJustSaved =
      next.profileConfirmed &&
      Boolean(next.workspaceId) &&
      (!previous.profileConfirmed ||
        previous.workspaceId !== next.workspaceId);

    if (hasJustSaved && pendingGoalRef.current) {
      const destination = pendingGoalRef.current;
      pendingGoalRef.current = null;
      setScreen(destination);
    }
  };

 function startNewSession() {
  if (sessionBusy) return;

  if (
    !window.confirm(
      "Start a new preparation? Unsaved text will be cleared. Saved sessions will remain.",
    )
  ) {
    return;
  }

  advanceSessionEpoch();

  pendingGoalRef.current = null;
  setPreparationGoal("review");

  commitIntake(emptyIntake());
  setScreen("home");
  setSelectedId("");
  setSessionError("");
}

async function openSession() {
  if (!selectedId || sessionBusy) return;

  if (
    !window.confirm(
      "Open this saved preparation? Unsaved text in the current screen will be discarded.",
    )
  ) {
    return;
  }

  advanceSessionEpoch();

  pendingGoalRef.current = null;

  setSessionBusy(true);
  setSessionError("");

  try {
    const workspace = await getWorkspace(selectedId);

    commitIntake(workspaceToIntake(workspace));
    setScreen("home");
  } catch (error) {
    setSessionError(
      error instanceof Error
        ? error.message
        : "Could not open session.",
    );
  } finally {
    setSessionBusy(false);
  }
}

async function removeCurrentSession() {
  const id = intake.workspaceId;

  if (!id || sessionBusy) return;

  if (
    !window.confirm(
      "Delete this preparation and all its interviews and results? This cannot be undone.",
    )
  ) {
    return;
  }

  advanceSessionEpoch();
  pendingGoalRef.current = null;

  setSessionBusy(true);
  setSessionError("");

  try {
    await deleteWorkspace(id);

    const updated = historyRef.current.filter(
      (session) => session.id !== id,
    );

    historyRef.current = updated;
    setSessions(updated);
    writeHistory(updated);

    try {
      sessionStorage.removeItem(`career-coach-interview:${id}`);

      if (sessionStorage.getItem("career-coach-workspace-id") === id) {
        sessionStorage.removeItem("career-coach-workspace-id");
      }
    } catch {
      // Database deletion has already succeeded.
    }

    commitIntake(emptyIntake());
    setScreen("home");
    setSelectedId("");
  } catch (error) {
    setSessionError(
      error instanceof Error
        ? error.message
        : "Could not delete session.",
    );
  } finally {
    setSessionBusy(false);
  }
}

function chooseGoal(goal: PreparationGoal) {
  if (sessionBusy) return;

  const current = intakeRef.current;

  if (current.workspaceId && current.profileConfirmed) {
    pendingGoalRef.current = null;
    setScreen(goal);
    return;
  }

  pendingGoalRef.current = goal;
  setPreparationGoal(goal);
  setScreen("intake");
}

function navigate(next: Screen) {
  if (sessionBusy) return;

  if (
    next === "review" ||
    next === "interview" ||
    next === "jobs"
  ) {
    chooseGoal(next);
    return;
  }

  pendingGoalRef.current = null;
  setScreen(next);
}

const pages = {
  review: CVReviewPage,
  jobs: JobsFitPage,
  company: CompanyPrepPage,
  interview: InterviewPage,
  roadmap: RoadmapPage,
};

const CurrentPage =
  screen === "home" || screen === "intake"
    ? null
    : pages[screen];

  const controls = (
  <div className="session-controls">
    <label htmlFor="saved-session">Saved preparations</label>

    <select
      id="saved-session"
      value={selectedId}
      disabled={sessionBusy || sessions.length === 0}
      aria-describedby="saved-session-help"
      onChange={(event) => setSelectedId(event.target.value)}
    >
      <option value="">
        {sessions.length === 0
          ? "No saved preparations yet"
          : "Choose a preparation"}
      </option>

      {sessions.map((session) => (
        <option key={session.id} value={session.id}>
          {session.label}
        </option>
      ))}
    </select>

    <p id="saved-session-help" className="field-help">
      Select a preparation, then click Open.
    </p>

    <button
      type="button"
      className="primary-button open-preparation-button"
      disabled={!selectedId || sessionBusy}
      onClick={() => void openSession()}
    >
      {sessionBusy ? "Opening…" : "Open preparation"}
    </button>

    {intake.workspaceId && (
      <button
        type="button"
        className="danger-button"
        disabled={sessionBusy}
        onClick={() => void removeCurrentSession()}
      >
        Delete current preparation
      </button>
    )}

    {sessionError && (
      <p className="error-notice" role="alert">
        {sessionError}
      </p>
    )}
  </div>
);

  return (
    <AppLayout
      screen={screen}
      onNavigate={navigate}
      targetRole={intake.targetRole}
      sessionControls={controls}
      onNewPreparation={startNewSession}
      sessionBusy={sessionBusy}
    >
      {sessionBusy ? (
        <p role="status">Updating preparation session…</p>
      ) : screen === "home" ? (
          <HomePage
            intake={intake}
            onChooseGoal={chooseGoal}
            onContinue={() =>
              chooseGoal(intake.cvText.trim() ? "review" : "interview")
            }
            onOpenFeature={navigate}
          />
      ) : screen === "intake" ? (
        <IntakePage
          key={`intake:${preparationGoal}:${intake.workspaceId ?? "new"}:${intake.intakeVersion ?? 0}:${renderEpoch}`}
          intake={intake}
          setIntake={setIntake}
          goal={preparationGoal}
          onChooseGoal={chooseGoal}
        />
      ) : CurrentPage ? (
        <CurrentPage
          //key={`${screen}:${intake.workspaceId ?? "new"}:${intake.intakeVersion ?? 0}:${renderEpoch}`}
          key={`${screen}:${renderEpoch}`}
          intake={intake}
          setIntake={setIntake}
        />
      ) : null}
    </AppLayout>
  );
}