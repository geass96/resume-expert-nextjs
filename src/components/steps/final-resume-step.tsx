"use client";

import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { EmptyState, SectionTitle } from "@/components/shared/ui-helpers";
import { useResumeStore } from "@/store/resume-store";
import { EvidenceAuditPanel } from "@/components/steps/evidence-audit-panel";

export function FinalResumeStep() {
  const { analysisResult, draftResume, updateDraft, setCurrentStep } = useResumeStore();

  if (!draftResume && !analysisResult) {
    return <EmptyState message="请先完成输入材料并开始分析" />;
  }

  const finalResume = draftResume ?? analysisResult!.finalResume;
  const { personalInfo } = finalResume;

  return (
    <div>
      <SectionTitle
        title="最终简历"
        description="基于分析与优化生成的完整简历"
      />

      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs text-neutral-500">当前是可编辑草稿。修改完成后请到“历史版本”定稿保存，历史记录不会被覆盖。</p>
        <Button size="sm" onClick={() => setCurrentStep("history")}>保存新版本</Button>
      </div>
      <EvidenceAuditPanel />
      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="mb-4">
            <h3 className="text-xl font-semibold">{personalInfo.name}</h3>
            <p className="mt-1 text-sm text-neutral-500">
              {personalInfo.email} · {personalInfo.phone} · {personalInfo.location}
            </p>
          </div>

          <Separator className="my-4" />

          <section className="mb-5">
            <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-neutral-400">
              求职意向
            </h4>
            <textarea aria-label="编辑求职意向" value={finalResume.jobIntent}
              onChange={e=>updateDraft("jobIntent",e.target.value)}
              className="w-full border rounded-md p-2 text-sm" rows={1} />
          </section>

          <section className="mb-5">
            <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-neutral-400">
              职业摘要
            </h4>
            <textarea aria-label="编辑职业摘要" value={finalResume.summary}
              onChange={e=>updateDraft("summary",e.target.value)}
              className="w-full min-h-24 border rounded-md p-2 text-sm leading-relaxed" />
          </section>

          <section className="mb-5">
            <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-neutral-400">
              核心能力
            </h4>
            <textarea aria-label="编辑核心能力" value={finalResume.coreSkills.join("、")}
              onChange={e=>updateDraft("coreSkills",e.target.value)}
              className="w-full border rounded-md p-2 text-sm" rows={2} />
            <p className="text-xs text-neutral-500">各项用顿号或换行分隔。</p>
          </section>

          <section className="mb-5">
            <h4 className="mb-3 text-xs font-medium uppercase tracking-wider text-neutral-400">
              工作经历
            </h4>
            <div className="space-y-4">
              {finalResume.workExperience.map((w) => (
                <div key={`${w.company}-${w.period}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-medium">
                      {w.company} · {w.role}
                    </p>
                    <span className="text-xs text-neutral-400">{w.period}</span>
                  </div>
                  <ul className="mt-2 space-y-1">
                    {w.bullets.map((b, i) => (
                      <li key={i} className="flex gap-2 text-sm text-neutral-600">
                        <span className="text-neutral-300">•</span>
                        <textarea aria-label={"编辑工作经历 "+w.company+" 条目 "+(i+1)}
                          value={b} onChange={e=>updateDraft("work:"+finalResume.workExperience.indexOf(w)+":"+i,e.target.value)}
                          className="w-full border rounded-md p-2 text-sm" rows={2} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          <section className="mb-5">
            <h4 className="mb-3 text-xs font-medium uppercase tracking-wider text-neutral-400">
              项目经历
            </h4>
            <div className="space-y-4">
              {finalResume.projectExperience.map((p) => (
                <div key={`${p.name}-${p.period}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-medium">
                      {p.name} · {p.role}
                    </p>
                    <span className="text-xs text-neutral-400">{p.period}</span>
                  </div>
                  <ul className="mt-2 space-y-1">
                    {p.bullets.map((b, i) => (
                      <li key={i} className="flex gap-2 text-sm text-neutral-600">
                        <span className="text-neutral-300">•</span>
                        <textarea aria-label={"编辑项目经历 "+p.name+" 条目 "+(i+1)}
                          value={b} onChange={e=>updateDraft("project:"+finalResume.projectExperience.indexOf(p)+":"+i,e.target.value)}
                          className="w-full border rounded-md p-2 text-sm" rows={2} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          <section className="mb-5">
            <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-neutral-400">
              技能工具
            </h4>
            <textarea aria-label="编辑技能工具" value={finalResume.skillsAndTools.join("、")}
              onChange={e=>updateDraft("skillsAndTools",e.target.value)}
              className="w-full border rounded-md p-2 text-sm" rows={2} />
            <p className="text-xs text-neutral-500">各项用顿号或换行分隔。</p>
          </section>

          <section>
            <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-neutral-400">
              教育背景
            </h4>
            <p className="text-sm">
              {finalResume.education.school} · {finalResume.education.degree} ·{" "}
              {finalResume.education.period}
            </p>
          </section>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => setCurrentStep("interview")}>
          下一步：面试准备
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
