import { useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import { deleteWorkspace, getWorkspace } from "./api";
import type { WorkspaceResponse } from "./api";
import type { IntakeData, Screen } from "./types";

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
  const [screen, setScreen] = useState<Screen>("intake");
  const [intake, setIntakeState] = useState<IntakeData>(emptyIntake);
  const [sessions, setSessions] = useState<SavedSession[]>(readHistory);

  const [selectedId, setSelectedId] = useState("");
  const [sessionBusy, setSessionBusy] = useState(false);
  const [sessionError, setSessionError] = useState("");

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
        label: next.targetRole || "Preparation session",
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

    const next =
      typeof action === "function"
        ? action(intakeRef.current)
        : action;

    commitIntake(next);
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

  commitIntake(emptyIntake());
  setScreen("intake");
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

  setSessionBusy(true);
  setSessionError("");

  try {
    const workspace = await getWorkspace(selectedId);

    commitIntake(workspaceToIntake(workspace));
    setScreen("intake");
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
    setScreen("intake");
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

  const pages = {
    intake: IntakePage,
    review: CVReviewPage,
    jobs: JobsFitPage,
    company: CompanyPrepPage,
    interview: InterviewPage,
    roadmap: RoadmapPage,
  };

  const CurrentPage = pages[screen];

  const controls = (
    <div className="session-controls">
      <button
        type="button"
        className="secondary-button"
        disabled={sessionBusy}
        onClick={startNewSession}
      >
        Start new preparation
      </button>

      <label htmlFor="saved-session">Saved preparations</label>

      <select
        id="saved-session"
        value={selectedId}
        disabled={sessionBusy}
        onChange={(event) => setSelectedId(event.target.value)}
      >
        <option value="">Choose a session</option>
        {sessions.map((session) => (
          <option key={session.id} value={session.id}>
            {session.label} · {session.id.slice(0, 8)}
          </option>
        ))}
      </select>

      <button
        type="button"
        className="secondary-button"
        disabled={!selectedId || sessionBusy}
        onClick={() => void openSession()}
      >
        Open saved preparation
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

      {sessionError && <p role="alert">{sessionError}</p>}
    </div>
  );

  return (
    <AppLayout
      screen={screen}
      onNavigate={(next) => {
        if (!sessionBusy) setScreen(next);
      }}
      targetRole={intake.targetRole}
      sessionControls={controls}
    >
      {sessionBusy ? (
        <p role="status">Updating preparation session…</p>
      ) : (
        <CurrentPage
          key={`${screen}:${intake.workspaceId ?? "new"}:${intake.intakeVersion ?? 0}:${renderEpoch}`}
          intake={intake}
          setIntake={setIntake}
        />
      )}
    </AppLayout>
  );
}