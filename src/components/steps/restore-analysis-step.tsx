"use client";

import { useResumeStore } from "@/store/resume-store";
import { runResumeAnalysis } from "@/services/ai/resumeAgent";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function RestoreAnalysisStep() {
  const state=useResumeStore();
  const canAnalyze=state.userInput.targetRole.trim() && state.userInput.jobDescription.trim() && state.userInput.originalResume.trim();

  async function recover() {
    const parentVersionId=state.parentVersionId;
    const input=JSON.stringify(state.userInput);
    state.setAnalyzing(true);
    state.setAnalysisError(null);
    try {
      const result=await runResumeAnalysis(state.userInput,state.optimizeStyle);
      const current=useResumeStore.getState();
      // A response for another restored version must never overwrite the current workflow.
      if(current.parentVersionId!==parentVersionId || JSON.stringify(current.userInput)!==input) return;
      current.setAnalysisResult(result,true);
    } catch(error) {
      if(useResumeStore.getState().parentVersionId===parentVersionId)
        state.setAnalysisError(error instanceof Error ? error.message : "重新分析失败，请重试");
    } finally {
      state.setAnalyzing(false);
    }
  }

  return <Card>
    <CardHeader><CardTitle>补齐历史版本的分析过程</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <p className="text-sm">此历史版本未保存分析过程。已恢复简历和可用的岗位 JD，可重新分析后继续 JD 解析、简历诊断、匹配分析、经历追问和简历优化。</p>
      <p className="text-sm text-neutral-600">旧版原始输入未保存时，将使用该版本简历作为分析材料。重新分析会调用当前模型；当前简历修改与历史版本均会保留，优化建议需手动采纳。</p>
      {!canAnalyze && <p className="text-sm text-amber-700">请先到“输入材料”补齐目标岗位、JD 和简历，再返回此处重新分析。</p>}
      {state.analysisError && <p role="alert" className="text-sm text-red-700">{state.analysisError}</p>}
      <div className="flex gap-2">
        <Button disabled={!canAnalyze || state.isAnalyzing} onClick={()=>void recover()}>{state.isAnalyzing ? "正在重新分析…" : "重新分析并继续"}</Button>
        <Button variant="outline" onClick={()=>state.setCurrentStep("input")}>编辑输入材料</Button>
      </div>
    </CardContent>
  </Card>;
}
