"use client";

import { ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, ListSection, SectionTitle } from "@/components/shared/ui-helpers";
import { useResumeStore } from "@/store/resume-store";

export function InterviewStep() {
  const { analysisResult, draftResume, parentVersionId, setCurrentStep } = useResumeStore();
  const [duration,setDuration]=useState(1);
  const [introduction,setIntroduction]=useState("");
  const [introError,setIntroError]=useState("");
  const [introMode,setIntroMode]=useState("");
  const [introBusy,setIntroBusy]=useState(false);
  useEffect(()=>{
    if(!parentVersionId)return;
    let active=true;
    fetch("/api/introduction?versionId="+encodeURIComponent(parentVersionId)+"&duration="+duration,{cache:"no-store"})
      .then(r=>r.json()).then(data=>{
        if(active && data.introduction){
          setIntroduction(data.introduction.content||"");
          setIntroMode(data.introduction.model||"");
        }
      }).catch(()=>{});
    return ()=>{active=false;};
  },[parentVersionId,duration]);
  async function intro(generate:boolean){
    if(!parentVersionId)return;
    setIntroBusy(true);setIntroError("");
    try{
      const response=await fetch("/api/introduction",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({versionId:parentVersionId,duration,...(!generate?{content:introduction}:{})})});
      const data=await response.json();
      if(!response.ok)throw Error(data.error||"操作失败");
      setIntroduction(data.content);setIntroMode(data.mode);
    }catch(e){setIntroError((e as Error).message);}finally{setIntroBusy(false);}
  }
  if (!draftResume && !analysisResult) {
    return <EmptyState message="请先完成输入材料并开始分析" />;
  }

  const interviewPrep = analysisResult?.interviewPrep;

  return (
    <div>
      <SectionTitle
        title="面试准备"
        description="基于简历与 JD 生成面试追问、证据准备与自我介绍"
      />

      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">自我介绍（基于已保存定稿版）</CardTitle>
        </CardHeader>
        <CardContent>
          {parentVersionId ? <div className="space-y-3">
            <p className="text-xs text-neutral-500">基于定稿版本 {parentVersionId.slice(0,8)}。简历草稿发生新修改时请先另存版本，再重新生成。</p>
            <select aria-label="自我介绍时长" value={duration} onChange={e=>{setDuration(Number(e.target.value));setIntroduction("");}} className="border rounded p-2 text-sm">
              <option value={1}>1 分钟</option><option value={3}>3 分钟</option>
            </select>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={introBusy} onClick={()=>void intro(true)}>重新生成</Button>
              <Button variant="outline" size="sm" disabled={introBusy||!introduction.trim()} onClick={()=>void intro(false)}>保存人工修改</Button>
            </div>
            {introMode==="mock"&&<p className="text-xs text-amber-700">当前为 Mock 示例草稿，不代表真实 AI 生成。</p>}
            {introError&&<p role="alert" className="text-red-700 text-sm">{introError}</p>}
            <textarea aria-label="编辑自我介绍" value={introduction} onChange={e=>setIntroduction(e.target.value)}
              className="w-full min-h-32 border rounded p-3 text-sm" placeholder="生成或手动输入自我介绍"/>
          </div> : <p className="text-sm text-neutral-500">先前往“历史版本”保存定稿，再生成与当前版本匹配的介绍。</p>}
          {!parentVersionId && interviewPrep && <p className="mt-3 text-sm text-neutral-600">首次分析草稿：{interviewPrep.selfIntroduction}</p>}
        </CardContent>
      </Card>

      {interviewPrep && <><Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">可能追问（10 题）</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {interviewPrep.likelyQuestions.map((q, i) => (
            <div key={i} className="rounded-md border border-neutral-100 p-4">
              <p className="mb-2 text-sm font-medium">
                Q{i + 1}. {q.question}
              </p>
              <p className="mb-2 text-sm text-neutral-600">
                <span className="font-medium text-neutral-700">建议回答：</span>
                {q.suggestedAnswer}
              </p>
              {q.evidenceNeeded.length > 0 && (
                <p className="text-xs text-neutral-500">
                  <span className="font-medium">需准备证据：</span>
                  {q.evidenceNeeded.join("；")}
                </p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">需要准备的证据</CardTitle>
          </CardHeader>
          <CardContent>
            <ListSection title="" items={interviewPrep.evidenceToPrepare} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">可能夸大的表达</CardTitle>
          </CardHeader>
          <CardContent>
            <ListSection title="" items={interviewPrep.possibleExaggerations} />
          </CardContent>
        </Card>

        <Card className="sm:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">建议补充的数据</CardTitle>
          </CardHeader>
          <CardContent>
            <ListSection title="" items={interviewPrep.dataToSupplement} />
          </CardContent>
        </Card>
      </div>

      </>}
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => setCurrentStep("export")}>
          下一步：导出结果
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
