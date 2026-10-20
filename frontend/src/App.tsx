import { useState } from "react";
import type { IntakeData, Screen } from "./types";

import AppLayout from "./components/AppLayout";
import IntakePage from "./pages/IntakePage";
import CVReviewPage from "./pages/CVReviewPage";
import JobsFitPage from "./pages/JobsFitPage";
import CompanyPrepPage from "./pages/CompanyPrepPage";
import InterviewPage from "./pages/InterviewPage";
import RoadmapPage from "./pages/RoadmapPage";

export default function App() {
  const [screen, setScreen] = useState<Screen>("intake");

  const [intake, setIntake] = useState<IntakeData>({
    workspaceId: null,
    intakeVersion: null,
    targetRole: "",
    company: "",
    cvText: "",
    jobDescription: "",
    profileConfirmed: false,
  });

  const pages = {
    intake: IntakePage,
    review: CVReviewPage,
    jobs: JobsFitPage,
    company: CompanyPrepPage,
    interview: InterviewPage,
    roadmap: RoadmapPage,
  };

  const CurrentPage = pages[screen];

  return (
    <AppLayout
      screen={screen}
      onNavigate={setScreen}
      targetRole={intake.targetRole}
    >
      <CurrentPage intake={intake} setIntake={setIntake} />
    </AppLayout>
  );
}