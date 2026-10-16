"use client";

import { useResumeStore } from "@/store/resume-store";
import { InputStep } from "@/components/steps/input-step";
import { JDAnalysisStep } from "@/components/steps/jd-analysis-step";
import { DiagnosisStep } from "@/components/steps/diagnosis-step";
import { MatchStep } from "@/components/steps/match-step";
import { FollowUpStep } from "@/components/steps/follow-up-step";
import { OptimizeStep } from "@/components/steps/optimize-step";
import { FinalResumeStep } from "@/components/steps/final-resume-step";
import { InterviewStep } from "@/components/steps/interview-step";
import { ExportStep } from "@/components/steps/export-step";
import { HistoryStep } from "@/components/steps/history-step";
import { InterviewSimStep } from "@/components/steps/interview-sim-step";
import { ModelSettingsStep } from "@/components/steps/model-settings-step";
import { AIUsageStep } from "@/components/steps/ai-usage-step";
import { RestoreAnalysisStep } from "@/components/steps/restore-analysis-step";

export function StepContent() {
  const currentStep = useResumeStore((s) => s.currentStep);
  const needsAnalysis = useResumeStore((s) => !!s.draftResume && !s.analysisResult);

  if(needsAnalysis && ["jd-analysis","diagnosis","match","follow-up","optimize"].includes(currentStep))
    return <RestoreAnalysisStep />;

  switch (currentStep) {
    case "input":
      return <InputStep />;
    case "jd-analysis":
      return <JDAnalysisStep />;
    case "diagnosis":
      return <DiagnosisStep />;
    case "match":
      return <MatchStep />;
    case "follow-up":
      return <FollowUpStep />;
    case "optimize":
      return <OptimizeStep />;
    case "final-resume":
      return <FinalResumeStep />;
    case "interview":
      return <InterviewStep />;
    case "export":
      return <ExportStep />;
    case "history":
      return <HistoryStep />;
    case "sim-interview":
      return <InterviewSimStep />;
    case "model-settings":
      return <ModelSettingsStep />;
    case "ai-usage":
      return <AIUsageStep />;
    default:
      return <InputStep />;
  }
}
