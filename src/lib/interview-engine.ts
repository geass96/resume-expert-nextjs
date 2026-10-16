import type { FinalResume } from "../types/resume";

export const INTERVIEW_KINDS = {
  behavioral: "行为面试",
  project: "项目经历深挖",
  product: "AI 产品与业务",
  hr: "HR 综合",
} as const;
export type InterviewKind = keyof typeof INTERVIEW_KINDS;
export const INTERVIEW_MAX_ROUNDS = 6;

export type Feedback = {
  dimensions: { authenticity: number; relevance: number; star: number; clarity: number; evidence: number };
  overall: number;
  strengths: string[];
  improvements: string[];
  evidenceGaps: string[];
  summary: string;
  source: "mock" | "llm";
};

export function validKind(value: unknown): value is InterviewKind {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(INTERVIEW_KINDS, value);
}
function compact(value: string, max = 100) {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}
export function resumeEvidence(resume: FinalResume): string {
  return compact([
    resume.summary,
    ...resume.workExperience.flatMap(x => [x.role, ...x.bullets]),
    ...resume.projectExperience.flatMap(x => [x.name, ...x.bullets]),
  ].filter(Boolean).join("；"), 250);
}
export function firstQuestion(role: string, kind: InterviewKind, resume: FinalResume, jd: string): string {
  const target = compact(role, 60) || "目标岗位";
  const project = resume.projectExperience[0]?.name || resume.workExperience[0]?.company || "你的代表项目";
  const requirement = compact(jd, 75);
  if (kind === "project") return `请介绍「${compact(project, 60)}」，你具体负责哪部分、为什么这样设计，以及如何验证成果？`;
  if (kind === "behavioral") return `应聘${target}时，请讲一次你推进困难项目或化解跨团队分歧的真实经历，说明你的行动与结果。`;
  if (kind === "product") return `目标岗位关注「${requirement || target}」。你会如何判断其中一项 AI 产品需求是否值得实施，并设计效果评估？`;
  return `请结合已定稿简历，自我介绍为什么适合「${target}」，以及你想在下一份工作中解决什么问题？`;
}
function clipScore(n: unknown): number {
  const value = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return Math.max(0, Math.min(5, Math.round(value)));
}
function strings(raw: unknown, count = 4): string[] {
  return Array.isArray(raw)
    ? raw.filter((s): s is string => typeof s === "string").map(s => compact(s, 240)).filter(Boolean).slice(0, count)
    : [];
}
export function normalizeFeedback(raw: unknown, source: Feedback["source"]): Feedback {
  const obj = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const dim = obj.dimensions && typeof obj.dimensions === "object" ? obj.dimensions as Record<string, unknown> : {};
  const dimensions = {
    authenticity: clipScore(dim.authenticity),
    relevance: clipScore(dim.relevance),
    star: clipScore(dim.star),
    clarity: clipScore(dim.clarity),
    evidence: clipScore(dim.evidence),
  };
  return {
    dimensions,
    overall: Math.round(Object.values(dimensions).reduce((a,b)=>a+b,0) * 4),
    strengths: strings(obj.strengths),
    improvements: strings(obj.improvements),
    evidenceGaps: strings(obj.evidenceGaps),
    summary: typeof obj.summary === "string" ? compact(obj.summary, 400) : "",
    source,
  };
}
export function mockRound(answer: string, kind: InterviewKind, resume: FinalResume, role: string, round: number) {
  const text = compact(answer, 2000);
  const hasNumber = /\d/.test(text);
  const hasAction = /推动|设计|负责|搭建|优化|分析|协调|主导|实施|验证|开发|实现/.test(text);
  const isDetailed = text.length >= 85;
  const score = {
    authenticity: 3, relevance: 3, star: hasAction ? 3 : 1,
    clarity: isDetailed ? 4 : 2, evidence: hasNumber ? 4 : 1,
  };
  const feedback = normalizeFeedback({
    dimensions: score,
    strengths: [hasAction ? "回答包含具体行动，建议进一步说明个人贡献。" : "已经提供初步回答，可继续补充你实际负责的动作。"],
    improvements: [!isDetailed ? "回答较简短，请补充背景、约束、行动与结果。" : "建议按 STAR（情境、任务、行动、结果）明确组织表达。"],
    evidenceGaps: [hasNumber ? "请解释所提数字的统计时间、样本与计算方式。" : "如确有结果数据，请说明口径；没有就描述可核实的定性结果。"],
    summary: "这是规则生成的练习提示，不代表真实 AI 测评或面试录用概率。",
  }, "mock");
  const evidence = resumeEvidence(resume).slice(0, 60) || "个人项目";
  const fragment = compact(text, 42) || "刚才的回答";
  const nextQuestion = kind === "project"
    ? `你刚才提到「${fragment}」。请结合简历中的「${evidence}」解释一个技术或业务取舍，并说出你的真实贡献。`
    : kind === "product"
      ? `围绕你刚才说的「${fragment}」，你会设置哪些指标衡量 ${compact(role, 30)} 相关方案的效果？出现错误输出时如何回退？`
      : kind === "behavioral"
        ? `对于「${fragment}」，有没有出现分歧或失败？请讲明你做过的具体协调或复盘。`
        : `你刚才提到「${fragment}」，请提供一项简历能核实的事例说明为什么你适合这个岗位。`;
  return { feedback, nextQuestion: round >= INTERVIEW_MAX_ROUNDS ? "" : nextQuestion };
}
