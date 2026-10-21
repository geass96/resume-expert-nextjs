import assert from "node:assert/strict";
import { test } from "node:test";
import {
  validateAnalysisResult,
  validateGeneratedBullet,
  validateInterviewResponse,
  validateOptimizedItems,
  validateSelfIntroduction,
} from "../src/lib/ai/response-validation.ts";

function validAnalysis() {
  return {
    jdAnalysis: {
      responsibilities: ["需求分析"], hardRequirements: ["产品经验"], implicitRequirements: [],
      keywords: ["AI"], idealCandidate: "产品经理",
      coreCompetencies: [{ name: "分析", importance: "high", description: "拆解需求" }],
    },
    diagnosis: {
      overallScore: 75,
      dimensionScores: [{ dimension: "岗位匹配", score: 75, comment: "证据基本充分" }],
      mainIssues: ["量化结果较少"], prioritySuggestions: ["补充结果口径"],
    },
    matchItems: Array.from({ length: 6 }, () => ({
      jdRequirement: "数据分析", resumeEvidence: "设计报表", evidenceStrength: "medium",
      needsSupplement: true, optimizationSuggestion: "补充指标口径",
    })),
    followUpQuestions: Array.from({ length: 5 }, (_, i) => ({
      id: "fu-" + (i + 1), question: "如何验证结果？", purpose: "核对证据",
      userAnswer: "", generatedBullet: "",
    })),
    optimizedItems: Array.from({ length: 5 }, (_, i) => ({
      id: "opt-" + (i + 1), section: "工作经历", before: "负责功能", after: "设计并交付功能",
      reason: "突出动作", riskWarning: "待补充结果证据",
    })),
    finalResume: {
      personalInfo: { name: "测试候选人", email: "", phone: "", location: "" },
      jobIntent: "产品经理", summary: "有 B 端产品经验", coreSkills: ["需求分析"],
      workExperience: [{ company: "示例公司", role: "产品经理", period: "2023-2025", bullets: ["设计报表"] }],
      projectExperience: [{ name: "示例项目", role: "负责人", period: "2024", bullets: ["完成验证"] }],
      skillsAndTools: ["SQL"], education: { school: "示例大学", degree: "本科", period: "2019-2023" },
    },
    interviewPrep: {
      likelyQuestions: Array.from({ length: 10 }, () => ({
        question: "如何衡量效果？", suggestedAnswer: "先定义指标，再验证数据。",
        evidenceNeeded: ["指标定义"],
      })),
      evidenceToPrepare: ["项目指标"], possibleExaggerations: ["避免夸大结果"],
      dataToSupplement: ["实际使用数据"], selfIntroduction: "我是一名产品经理。",
    },
  };
}

test("accepts a complete, correctly shaped resume analysis", () => {
  assert.doesNotThrow(() => validateAnalysisResult(validAnalysis()));
});

test("rejects out-of-range scores and incomplete required sections", () => {
  const badScore = validAnalysis();
  badScore.diagnosis.overallScore = 101;
  assert.throws(() => validateAnalysisResult(badScore), /0-100/);

  const missingSection = validAnalysis();
  delete missingSection.finalResume.education;
  assert.throws(() => validateAnalysisResult(missingSection), /finalResume.education/);
});

test("rejects too few optimization proposals or interview questions", () => {
  const tooFew = validAnalysis();
  tooFew.optimizedItems.pop();
  assert.throws(() => validateAnalysisResult(tooFew), /至少需要 5 条/);

  const tooFewInterview = validAnalysis();
  tooFewInterview.interviewPrep.likelyQuestions.pop();
  assert.throws(() => validateAnalysisResult(tooFewInterview), /必须包含 10 条/);
});

test("validates optimized items and generated resume bullets", () => {
  assert.doesNotThrow(() => validateOptimizedItems(validAnalysis().optimizedItems));
  assert.throws(() => validateOptimizedItems([]), /至少需要 5 条/);
  assert.equal(validateGeneratedBullet({ bullet: "  设计并验证指标  " }), "设计并验证指标");
  assert.throws(() => validateGeneratedBullet({ bullet: " " }), /为空或过长/);
});

test("validates interview feedback and self-introduction outputs", () => {
  const feedback = {
    dimensions: { authenticity: 4, relevance: 4, star: 3, clarity: 4, evidence: 2 },
    strengths: ["结构清楚"], improvements: ["补充结果口径"], evidenceGaps: ["缺少样本范围"],
    summary: "回答清晰，仍需补充可核实证据。", nextQuestion: "你如何验证这个结果？",
  };
  assert.doesNotThrow(() => validateInterviewResponse(feedback, true));
  assert.throws(() => validateInterviewResponse({ ...feedback, dimensions: {
    真实性可核实程度: 4, 岗位相关性: 4, STAR结构: 3, 清晰度: 4, 证据口径: 2,
  } }, true), /interview.dimensions.authenticity/);
  assert.throws(() => validateInterviewResponse({ ...feedback, dimensions: { ...feedback.dimensions, authenticity: "4" } }, true), /0-5/);
  assert.throws(() => validateInterviewResponse({ ...feedback, dimensions: { ...feedback.dimensions, evidence: 8 } }, true), /0-5/);
  assert.throws(() => validateInterviewResponse({ ...feedback, nextQuestion: "" }, true), /缺少下一轮/);
  assert.equal(validateSelfIntroduction("  我是一名产品经理。 "), "我是一名产品经理。");
  assert.throws(() => validateSelfIntroduction(""), /为空或过长/);
});
