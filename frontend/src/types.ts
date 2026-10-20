import type { Dispatch, SetStateAction } from "react";

export type Screen =
  | "intake"
  | "review"
  | "jobs"
  | "company"
  | "interview"
  | "roadmap";

export interface IntakeData {
  workspaceId: string | null;
  intakeVersion: number | null;
  targetRole: string;
  company: string;
  cvText: string;
  jobDescription: string;
  profileConfirmed: boolean;
}

export interface PageProps {
  intake: IntakeData;
  setIntake: Dispatch<SetStateAction<IntakeData>>;
}