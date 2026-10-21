"use client";

import {
  Brain,
  Layers,
  BarChart3,
  Check,
  Circle,
  ClipboardList,
  Download,
  FileSearch,
  FileText,
  GitCompare,
  MessageSquare,
  Sparkles,
  Settings2,
  Target,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useResumeStore } from "@/store/resume-store";
import type { StepId } from "@/types/resume";

type StepItem = { id: StepId; label: string; icon: React.ElementType };
type StepGroup = { label: string; items: StepItem[]; numbered?: boolean };

const GROUPS: StepGroup[] = [
  {
    label: "简历优化",
    numbered: true,
    items: [
      { id: "input", label: "输入材料", icon: FileText },
      { id: "jd-analysis", label: "JD 解析", icon: FileSearch },
      { id: "diagnosis", label: "简历诊断", icon: Target },
      { id: "match", label: "匹配分析", icon: GitCompare },
      { id: "follow-up", label: "经历追问", icon: MessageSquare },
      { id: "optimize", label: "简历优化", icon: Sparkles },
      { id: "final-resume", label: "最终简历", icon: ClipboardList },
      { id: "interview", label: "面试准备", icon: Brain },
      { id: "export", label: "导出结果", icon: Download },
    ],
  },
  {
    label: "历史与练习",
    items: [
      { id: "history", label: "历史版本", icon: ClipboardList },
      { id: "sim-interview", label: "模拟面试", icon: Brain },
      { id: "knowledge-cards", label: "知识卡片", icon: Layers },
    ],
  },
  {
    label: "系统管理",
    items: [
      { id: "model-settings", label: "模型配置", icon: Settings2 },
      { id: "ai-usage", label: "AI 用量", icon: BarChart3 },
    ],
  },
];

export function StepSidebar() {
  const { setCurrentStep, getStepStatus, analysisResult } = useResumeStore();

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-neutral-200 bg-white">
      <div className="border-b border-neutral-200 px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wider text-neutral-400">工作台导航</p>
      </div>
      <nav aria-label="工作台导航" className="flex-1 overflow-y-auto p-2">
        {GROUPS.map((group) => (
          <section key={group.label} className="mb-4 last:mb-0">
            <h2 className="px-3 pb-1 pt-2 text-[11px] font-semibold tracking-wide text-neutral-400">
              {group.label}
            </h2>
            {group.items.map((step, index) => {
              const status = getStepStatus(step.id);
              const Icon = step.icon;
              const isDisabled = status === "disabled";

              return (
                <button
                  key={step.id}
                  type="button"
                  disabled={isDisabled}
                  aria-current={status === "active" ? "step" : undefined}
                  onClick={() => {
                    if (!isDisabled) setCurrentStep(step.id);
                  }}
                  className={cn(
                    "mb-0.5 flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors",
                    status === "active" && "bg-neutral-100 font-medium text-neutral-900",
                    status === "completed" && "text-neutral-600 hover:bg-neutral-50",
                    status === "pending" && "text-neutral-500 hover:bg-neutral-50",
                    status === "disabled" && "cursor-not-allowed text-neutral-300"
                  )}
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                    {status === "completed" ? (
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                    ) : status === "active" ? (
                      <Icon className="h-3.5 w-3.5" />
                    ) : (
                      <Circle className="h-3 w-3" />
                    )}
                  </span>
                  <span className="flex-1 truncate">{step.label}</span>
                  {group.numbered && (
                    <span className="text-[10px] tabular-nums text-neutral-400">{index + 1}</span>
                  )}
                </button>
              );
            })}
          </section>
        ))}
      </nav>
      {analysisResult && (
        <div className="border-t border-neutral-200 p-3">
          <p className="text-xs text-neutral-400">整体匹配度</p>
          <p className="text-2xl font-semibold tabular-nums text-neutral-900">
            {analysisResult.diagnosis.overallScore}
            <span className="text-sm font-normal text-neutral-400">/100</span>
          </p>
        </div>
      )}
    </aside>
  );
}
