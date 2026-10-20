import { chatCompletionJSON } from "@/lib/ai/client";
import {
  RESUME_AGENT_SYSTEM_PROMPT,
  buildAnalyzeCorePrompt,
  buildAnalyzeDiagnosisPrompt,
  buildAnalyzeInterviewPrompt,
  buildAnalyzeOutputPrompt,
  buildFollowUpBulletPrompt,
  buildOptimizeUserPrompt,
  normalizeAnalysisResult,
  normalizeOptimizedItems,
} from "@/lib/ai/prompts";
import type { AnalysisResult, OptimizeStyle, UserInput } from "@/types/resume";
import {
  validateAnalysisResult,validateJDAnalysisResult,validateDiagnosisMatchResult,
  validateResumeOutputResult,validateInterviewPrepResult,validateGeneratedBullet,validateOptimizedItems,
} from "@/lib/ai/response-validation";

type JDAnalysisResult = Pick<AnalysisResult, "jdAnalysis">;
type DiagnosisMatchResult = Pick<
  AnalysisResult,
  "diagnosis" | "matchItems" | "followUpQuestions"
>;
type OptimizeResumeResult = Pick<AnalysisResult, "optimizedItems" | "finalResume">;
type InterviewResult = Pick<AnalysisResult, "interviewPrep">;

function buildCoreSummary(parts: DiagnosisMatchResult): string {
  return [
    `匹配度：${parts.diagnosis.overallScore}/100`,
    `主要问题：${parts.diagnosis.mainIssues.slice(0, 3).join("；") || "无"}`,
    `优先建议：${parts.diagnosis.prioritySuggestions.slice(0, 3).join("；") || "无"}`,
    `关键缺口：${parts.matchItems
      .filter((item) => item.needsSupplement)
      .slice(0, 4)
      .map((item) => item.jdRequirement)
      .join("；") || "无"}`,
  ].join("\n");
}

export async function runLLMResumeAnalysis(
  input: UserInput,
  optimizeStyle: OptimizeStyle = "ai-product"
): Promise<AnalysisResult> {
  const jd = await chatCompletionJSON<JDAnalysisResult>({
    system: RESUME_AGENT_SYSTEM_PROMPT,
    user: buildAnalyzeCorePrompt(input),
    purpose: "jd_analysis",
    maxTokens: 3000,
  });
  validateJDAnalysisResult(jd);

  const diagnosisMatch = await chatCompletionJSON<DiagnosisMatchResult>({
    system: RESUME_AGENT_SYSTEM_PROMPT,
    user: buildAnalyzeDiagnosisPrompt(input),
    purpose: "resume_diagnosis",
    maxTokens: 4000,
  });
  validateDiagnosisMatchResult(diagnosisMatch);

  const coreSummary = buildCoreSummary(diagnosisMatch);

  const [optimizeResume, interview] = await Promise.all([
    chatCompletionJSON<OptimizeResumeResult>({
      system: RESUME_AGENT_SYSTEM_PROMPT,
      user: buildAnalyzeOutputPrompt(input, optimizeStyle, coreSummary),
    purpose: "initial_optimization",
      maxTokens: 4500,
    }),
    chatCompletionJSON<InterviewResult>({
      system: RESUME_AGENT_SYSTEM_PROMPT,
      user: buildAnalyzeInterviewPrompt(input, coreSummary),
    purpose: "interview_preparation",
      maxTokens: 3500,
    }),
  ]);
  validateResumeOutputResult(optimizeResume);
  validateInterviewPrepResult(interview);

  const raw: AnalysisResult = {
    jdAnalysis: jd.jdAnalysis,
    diagnosis: diagnosisMatch.diagnosis,
    matchItems: diagnosisMatch.matchItems,
    followUpQuestions: diagnosisMatch.followUpQuestions,
    optimizedItems: optimizeResume.optimizedItems,
    finalResume: optimizeResume.finalResume,
    interviewPrep: interview.interviewPrep,
  };

  validateAnalysisResult(raw);
  return normalizeAnalysisResult(raw, input);
}

export async function runLLMRegenerateOptimizedItems(
  input: UserInput,
  style: OptimizeStyle
): Promise<AnalysisResult["optimizedItems"]> {
  const raw = await chatCompletionJSON<{ optimizedItems: AnalysisResult["optimizedItems"] }>({
    system: RESUME_AGENT_SYSTEM_PROMPT,
    user: buildOptimizeUserPrompt(input, style),
    purpose: "regenerate_optimization",
    temperature: 0.5,
    maxTokens: 4000,
  });

  validateOptimizedItems(raw.optimizedItems);
  return normalizeOptimizedItems(raw.optimizedItems);
}

export async function runLLMFollowUpBullet(
  input: UserInput,
  question: string,
  purpose: string,
  userAnswer: string
): Promise<string> {
  const raw = await chatCompletionJSON<{ bullet: string }>({
    system: RESUME_AGENT_SYSTEM_PROMPT,
    user: buildFollowUpBulletPrompt(input, question, purpose, userAnswer),
    purpose: "experience_followup",
    temperature: 0.3,
    maxTokens: 500,
  });

  return validateGeneratedBullet(raw);
}
