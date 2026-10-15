"use client";

import { useState } from "react";
import { ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, SectionTitle } from "@/components/shared/ui-helpers";
import { useResumeStore } from "@/store/resume-store";
import { regenerateOptimizedItems, STYLE_LABELS } from "@/services/ai/resumeAgent";
import type { OptimizeStyle } from "@/types/resume";
import { cn } from "@/lib/utils";

const STYLE_OPTIONS: { value: OptimizeStyle; label: string }[] = [
  { value: "concise", label: "更简洁" },
  { value: "reduce-exaggeration", label: "降低夸张" },
  { value: "ai-product", label: "更偏 AI 产品" },
  { value: "tob-saas", label: "更偏 ToB SaaS" },
];

export function OptimizeStep() {
  const {
    analysisResult,
    userInput,
    optimizeStyle,
    setOptimizeStyle,
    setOptimizedItems,
    applyProposal,
    rejectProposal,
    proposalDecisions,
    draftResume,
    setCurrentStep,
  } = useResumeStore();
  const [regenerating, setRegenerating] = useState(false);
  const [optimizeError, setOptimizeError] = useState<string | null>(null);

  if (!analysisResult) {
    return <EmptyState message="请先完成输入材料并开始分析" />;
  }

  const handleStyleChange = async (style: OptimizeStyle) => {
    setOptimizeStyle(style);
    setRegenerating(true);
    setOptimizeError(null);
    try {
      const items = await regenerateOptimizedItems(userInput, style);
      setOptimizedItems(items);
    } catch (error) {
      setOptimizeError(error instanceof Error ? error.message : "优化生成失败");
    } finally {
      setRegenerating(false);
    }
  };

  const { optimizedItems } = analysisResult;

  return (
    <div>
      <SectionTitle
        title="简历优化"
        description="对照展示修改前/后的表达，附修改理由与风险提示"
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-xs text-neutral-500">优化风格：</span>
        {STYLE_OPTIONS.map((opt) => (
          <Button
            key={opt.value}
            variant={optimizeStyle === opt.value ? "default" : "outline"}
            size="sm"
            disabled={regenerating}
            onClick={() => handleStyleChange(opt.value)}
            className={cn("h-7 text-xs")}
          >
            {opt.label}
          </Button>
        ))}
        {regenerating && <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />}
      </div>

      {optimizeError && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {optimizeError}
        </div>
      )}

      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">
            修改对照表
            <Badge variant="secondary" className="ml-2 font-normal">
              {STYLE_LABELS[optimizeStyle]}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 pb-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">模块</TableHead>
                <TableHead className="min-w-[180px]">修改前</TableHead>
                <TableHead className="min-w-[180px]">修改后</TableHead>
                <TableHead className="min-w-[120px]">修改理由</TableHead>
                <TableHead className="min-w-[120px]">风险提示</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {optimizedItems.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.section}</TableCell>
                  <TableCell className="text-neutral-500">{item.before}</TableCell>
                  <TableCell className="text-neutral-900">{item.after}</TableCell>
                  <TableCell className="text-neutral-600">{item.reason}</TableCell>
                  <TableCell>
                    <span className="text-amber-700">{item.riskWarning}</span>
                    <p className="mt-2 text-xs">决策：{proposalDecisions[item.id]?.decision || "待确认"}</p>
                    <label className="block mt-2 text-xs" htmlFor={"target-"+item.id}>采纳位置</label>
                    <select id={"target-"+item.id} className="w-full border rounded p-1 text-xs"
                      defaultValue="" onChange={(event)=>{
                        const target=event.currentTarget.value;
                        event.currentTarget.dataset.target=target;
                      }}>
                      <option value="">请选择目标条目</option>
                      <option value="summary">职业摘要</option>
                      {draftResume?.workExperience.flatMap((w,i)=>w.bullets.map((b,j)=>(
                        <option key={"w"+i+"-"+j} value={"work:"+i+":"+j}>{w.company} · 工作条目 {j+1}</option>
                      )))}
                      {draftResume?.projectExperience.flatMap((w,i)=>w.bullets.map((b,j)=>(
                        <option key={"p"+i+"-"+j} value={"project:"+i+":"+j}>{w.name} · 项目条目 {j+1}</option>
                      )))}
                    </select>
                    <div className="flex gap-2 mt-2">
                      <Button size="sm" variant="outline" onClick={()=>{
                        const el=document.getElementById("target-"+item.id) as HTMLSelectElement|null;
                        if(!el?.value){window.alert("请先选择采纳位置");return;}
                        applyProposal(item.id,el.value,item.after);
                      }}>采纳</Button>
                      <Button size="sm" variant="ghost" onClick={()=>rejectProposal(item.id)}>拒绝</Button>
                    </div>
                    <p className="mt-2 text-xs text-neutral-500">需要修改措辞时，请先进入最终简历编辑后再定稿。</p>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => setCurrentStep("final-resume")}>
          下一步：最终简历
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
