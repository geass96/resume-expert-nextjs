import type { AnalysisResult, OptimizedItem } from "../../types/resume.ts";

type JsonObject = Record<string, unknown>;

function object(value: unknown, path: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("模型返回结构无效：" + path + " 必须是对象");
  }
  return value as JsonObject;
}

function string(value: unknown, path: string): string {
  if (typeof value !== "string") throw new Error("模型返回结构无效：" + path + " 必须是字符串");
  return value;
}

function stringArray(value: unknown, path: string, max = 200): string[] {
  if (!Array.isArray(value) || value.length > max || value.some((item) => typeof item !== "string")) {
    throw new Error("模型返回结构无效：" + path + " 必须是字符串数组");
  }
  return value as string[];
}

function recordArray(value: unknown, path: string, max = 100): JsonObject[] {
  if (!Array.isArray(value) || value.length > max) {
    throw new Error("模型返回结构无效：" + path + " 必须是数组");
  }
  return value.map((item, index) => object(item, path + "[" + index + "]"));
}

function score(value: unknown, path: string): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error("模型返回结构无效：" + path + " 必须是 0-100 的有限数字");
  }
}

function requiredStrings(value: JsonObject, keys: string[], path: string): void {
  for (const key of keys) string(value[key], path + "." + key);
}

function validateBullets(value: unknown, path: string): void {
  stringArray(value, path, 200);
}

export function validateAnalysisResult(value: unknown): asserts value is AnalysisResult {
  const root = object(value, "root");
  const jd = object(root.jdAnalysis, "jdAnalysis");
  for (const key of ["responsibilities", "hardRequirements", "implicitRequirements", "keywords"]) {
    stringArray(jd[key], "jdAnalysis." + key);
  }
  string(jd.idealCandidate, "jdAnalysis.idealCandidate");
  for (const [index, item] of recordArray(jd.coreCompetencies, "jdAnalysis.coreCompetencies", 100).entries()) {
    requiredStrings(item, ["name", "description"], "jdAnalysis.coreCompetencies[" + index + "]");
    if (!["high", "medium", "low"].includes(String(item.importance))) {
      throw new Error("模型返回结构无效：coreCompetencies.importance 值无效");
    }
  }

  const diagnosis = object(root.diagnosis, "diagnosis");
  score(diagnosis.overallScore, "diagnosis.overallScore");
  for (const [index, item] of recordArray(diagnosis.dimensionScores, "diagnosis.dimensionScores", 30).entries()) {
    requiredStrings(item, ["dimension", "comment"], "diagnosis.dimensionScores[" + index + "]");
    score(item.score, "diagnosis.dimensionScores[" + index + "].score");
  }
  stringArray(diagnosis.mainIssues, "diagnosis.mainIssues");
  stringArray(diagnosis.prioritySuggestions, "diagnosis.prioritySuggestions");

  const matches = recordArray(root.matchItems, "matchItems", 8);
  if (matches.length < 6) throw new Error("模型返回结构无效：岗位匹配至少需要 6 条");
  for (const [index, item] of matches.entries()) {
    const path = "matchItems[" + index + "]";
    requiredStrings(item, ["jdRequirement", "resumeEvidence", "optimizationSuggestion"], path);
    if (!["strong", "medium", "weak", "none"].includes(String(item.evidenceStrength))) {
      throw new Error("模型返回结构无效：" + path + ".evidenceStrength 值无效");
    }
    if (typeof item.needsSupplement !== "boolean") throw new Error("模型返回结构无效：" + path + ".needsSupplement 必须是布尔值");
  }

  const questions = recordArray(root.followUpQuestions, "followUpQuestions", 10);
  if (questions.length < 5) throw new Error("模型返回结构无效：经历追问至少需要 5 条");
  for (const [index, item] of questions.entries()) {
    requiredStrings(item, ["question", "purpose", "userAnswer", "generatedBullet"], "followUpQuestions[" + index + "]");
    if (item.id !== undefined) string(item.id, "followUpQuestions[" + index + "].id");
  }

  const proposals = recordArray(root.optimizedItems, "optimizedItems", 10);
  if (proposals.length < 5) throw new Error("模型返回结构无效：简历优化建议至少需要 5 条");
  for (const [index, item] of proposals.entries()) {
    requiredStrings(item, ["section", "before", "after", "reason", "riskWarning"], "optimizedItems[" + index + "]");
    if (item.id !== undefined) string(item.id, "optimizedItems[" + index + "].id");
  }

  const resume = object(root.finalResume, "finalResume");
  const personal = object(resume.personalInfo, "finalResume.personalInfo");
  requiredStrings(personal, ["name", "email", "phone", "location"], "finalResume.personalInfo");
  requiredStrings(resume, ["jobIntent", "summary"], "finalResume");
  stringArray(resume.coreSkills, "finalResume.coreSkills");
  for (const [index, item] of recordArray(resume.workExperience, "finalResume.workExperience", 100).entries()) {
    requiredStrings(item, ["company", "role", "period"], "finalResume.workExperience[" + index + "]");
    validateBullets(item.bullets, "finalResume.workExperience[" + index + "].bullets");
  }
  for (const [index, item] of recordArray(resume.projectExperience, "finalResume.projectExperience", 100).entries()) {
    requiredStrings(item, ["name", "role", "period"], "finalResume.projectExperience[" + index + "]");
    validateBullets(item.bullets, "finalResume.projectExperience[" + index + "].bullets");
  }
  stringArray(resume.skillsAndTools, "finalResume.skillsAndTools");
  const education = object(resume.education, "finalResume.education");
  requiredStrings(education, ["school", "degree", "period"], "finalResume.education");

  const interview = object(root.interviewPrep, "interviewPrep");
  const likely = recordArray(interview.likelyQuestions, "interviewPrep.likelyQuestions", 30);
  if (likely.length !== 10) throw new Error("模型返回结构无效：面试准备必须包含 10 条问题");
  for (const [index, item] of likely.entries()) {
    requiredStrings(item, ["question", "suggestedAnswer"], "interviewPrep.likelyQuestions[" + index + "]");
    stringArray(item.evidenceNeeded, "interviewPrep.likelyQuestions[" + index + "].evidenceNeeded");
  }
  stringArray(interview.evidenceToPrepare, "interviewPrep.evidenceToPrepare");
  stringArray(interview.possibleExaggerations, "interviewPrep.possibleExaggerations");
  stringArray(interview.dataToSupplement, "interviewPrep.dataToSupplement");
  string(interview.selfIntroduction, "interviewPrep.selfIntroduction");
}

export function validateOptimizedItems(value: unknown): asserts value is OptimizedItem[] {
  const items = recordArray(value, "optimizedItems", 50);
  if (items.length < 5) throw new Error("模型返回结构无效：简历优化建议至少需要 5 条");
  for (const [index, item] of items.entries()) {
    requiredStrings(item, ["section", "before", "after", "reason", "riskWarning"], "optimizedItems[" + index + "]");
    if (item.id !== undefined) string(item.id, "optimizedItems[" + index + "].id");
  }
}

export function validateGeneratedBullet(value: unknown): string {
  const result = object(value, "bullet");
  const bullet = string(result.bullet, "bullet");
  if (!bullet.trim() || bullet.length > 5000) {
    throw new Error("模型返回结构无效：经历改写内容为空或过长");
  }
  return bullet.trim();
}

export type InterviewModelResponse = {
  dimensions: { authenticity: number; relevance: number; star: number; clarity: number; evidence: number };
  strengths: string[];
  improvements: string[];
  evidenceGaps: string[];
  summary: string;
  nextQuestion: string;
};

export function validateInterviewResponse(value: unknown, nextQuestionRequired: boolean): asserts value is InterviewModelResponse {
  const result = object(value, "interview");
  const dimensions = object(result.dimensions, "interview.dimensions");
  for (const key of ["authenticity", "relevance", "star", "clarity", "evidence"]) {
    const item = dimensions[key];
    if (typeof item !== "number" || !Number.isFinite(item) || item < 0 || item > 5) {
      throw new Error("模型返回结构无效：interview.dimensions." + key + " 必须是 0-5 的有限数字");
    }
  }
  stringArray(result.strengths, "interview.strengths", 20);
  stringArray(result.improvements, "interview.improvements", 20);
  stringArray(result.evidenceGaps, "interview.evidenceGaps", 20);
  const summary = string(result.summary, "interview.summary");
  if (!summary.trim() || summary.length > 2000) throw new Error("模型返回结构无效：面试反馈摘要为空或过长");
  const nextQuestion = string(result.nextQuestion, "interview.nextQuestion");
  if (nextQuestionRequired && !nextQuestion.trim()) throw new Error("模型返回结构无效：缺少下一轮面试问题");
  if (nextQuestion.length > 1000) throw new Error("模型返回结构无效：下一轮问题过长");
}

export function validateSelfIntroduction(value: unknown): string {
  const introduction = string(value, "introduction");
  if (!introduction.trim() || introduction.length > 5000) {
    throw new Error("模型返回结构无效：自我介绍为空或过长");
  }
  return introduction.trim();
}
