import { create } from "zustand";
import type {
  AnalysisResult,
  OptimizeStyle,
  StepId,
  StepStatus,
  UserInput,
  FinalResume,
  ProposalDecisions,
  RestoreContext,
} from "@/types/resume";
import { formatResumeAsText } from "../lib/utils.ts";
import type { AIMode } from "@/lib/ai/types";

const STEPS: StepId[] = [
  "input",
  "jd-analysis",
  "diagnosis",
  "match",
  "follow-up",
  "optimize",
  "final-resume",
  "interview",
  "export",
];

interface ResumeStore {
  userInput: UserInput;
  currentStep: StepId;
  isAnalyzing: boolean;
  analysisResult: AnalysisResult | null;
  draftResume: FinalResume | null;
  proposalDecisions: ProposalDecisions;
  currentProfileId: string;
  currentJobId: string;
  parentVersionId: string;
  analysisError: string | null;
  aiMode: AIMode | null;
  optimizeStyle: OptimizeStyle;
  copied: boolean;

  setUserInput: (input: Partial<UserInput>) => void;
  loadExampleData: () => void;
  setCurrentStep: (step: StepId) => void;
  setAnalyzing: (analyzing: boolean) => void;
  setAnalysisResult: (result: AnalysisResult, preserveDraft?: boolean) => void;
  setOptimizedItems: (items: AnalysisResult["optimizedItems"]) => void;
  applyProposal: (id: string, path: string, text: string, edited?: boolean) => void;
  rejectProposal: (id: string, path?: string) => boolean;
  setEvidenceNote: (fieldPath: string, note: string) => void;
  updateDraft: (path: string, text: string) => void;
  addBullet: (id: string, path: string, text: string) => void;
  restoreVersion: (snapshot: FinalResume, versionId: string, profileId: string, jobId: string, role?: string, context?: RestoreContext) => void;
  markSaved: (versionId: string, profileId: string, jobId: string) => void;
  setAnalysisError: (error: string | null) => void;
  setAiMode: (mode: AIMode | null) => void;
  setOptimizeStyle: (style: OptimizeStyle) => void;
  updateFollowUpAnswer: (id: string, answer: string) => void;
  setFollowUpBullet: (id: string, bullet: string) => void;
  getStepStatus: (step: StepId) => StepStatus;
  setCopied: (copied: boolean) => void;
}

const defaultUserInput: UserInput = {
  targetRole: "",
  industry: "",
  companyType: "中型公司",
  jobStage: "社招-中级",
  highlightSkills: "",
  jobDescription: "",
  originalResume: "",
  additionalInfo: "",
};

export const useResumeStore = create<ResumeStore>((set, get) => ({
  userInput: defaultUserInput,
  currentStep: "input",
  isAnalyzing: false,
  analysisResult: null,
  draftResume: null,
  proposalDecisions: {},
  currentProfileId: "",
  currentJobId: "",
  parentVersionId: "",
  analysisError: null,
  aiMode: null,
  optimizeStyle: "ai-product",
  copied: false,

  setUserInput: (input) =>
    set((state) => ({
      userInput: { ...state.userInput, ...input },
    })),

  loadExampleData: () =>
    set({
      userInput: {
        targetRole: "AI 产品经理",
        industry: "企业服务 / SaaS / AI",
        companyType: "中型公司",
        jobStage: "转行",
        highlightSkills: "AI 产品规划、Prompt 设计、数据驱动、ToB 需求分析、跨团队协作",
        jobDescription: `【岗位职责】
1. 负责 AI 功能的产品规划与迭代，包括智能问答、文档理解、工作流自动化等模块
2. 深入理解 B 端客户业务场景，将 AI 能力转化为可落地的产品方案
3. 与算法、工程团队协作，推动 AI 功能从 POC 到规模化上线
4. 建立 AI 产品效果评估体系，通过数据驱动持续优化
5. 跟踪 AI 行业趋势，输出竞品分析与产品策略

【任职要求】
1. 3年以上产品经理经验，有 ToB SaaS 或企业服务产品经验
2. 了解 LLM 基本原理，有 AI 产品或智能化功能落地经验者优先
3. 具备优秀的需求分析和逻辑思维能力，能将复杂业务抽象为产品方案
4. 有数据报表、ERP/WMS 等系统产品经验者优先
5. 良好的跨部门沟通能力和项目管理能力
6. 本科及以上学历，计算机或相关专业优先`,
        originalResume: `张明 | 产品经理 | 3.5年经验

【个人信息】
电话：138****5678 | 邮箱：zhangming@email.com | 上海

【职业摘要】
3.5年 B 端产品经理经验，主导 ERP 库存管理、WMS 仓储系统及经营数据报表平台的产品设计与迭代。擅长需求调研、流程梳理与跨部门协作，具备从 0 到 1 搭建数据产品的经验。

【工作经历】
某 SaaS 公司 | 产品经理 | 2021.06 - 至今
• 负责 WMS 仓储管理系统核心模块，服务 50+ 企业客户
• 主导库存盘点功能重构，盘点效率提升 40%
• 设计经营数据报表平台，支持 20+ 自定义报表模板
• 协调研发、测试、实施团队，按时交付 3 个 major 版本

某软件公司 | 产品助理 | 2020.07 - 2021.05
• 参与 ERP 采购模块需求分析与原型设计
• 编写 PRD 文档，跟进开发进度与 UAT 测试
• 收集客户反馈，优化订单审批流程

【项目经历】
经营数据报表平台 | 产品负责人 | 2022.03 - 2023.06
• 从 0 到 1 搭建 BI 报表平台，覆盖销售、库存、财务三大主题
• 设计拖拽式报表配置器，降低业务人员使用门槛
• 上线后月活用户 200+，报表生成效率提升 60%

WMS 智能补货 | 产品经理 | 2023.01 - 2023.09
• 基于历史销售数据设计补货策略模型
• 推动补货建议功能上线，缺货率下降 25%

【技能】
Axure、Figma、SQL、Jira、Confluence、数据分析

【教育】
某大学 | 信息管理与信息系统 | 本科 | 2016-2020`,
        additionalInfo: "最近自学了 Prompt Engineering 和 LangChain 基础，做过一个内部文档问答 Demo。希望突出数据产品背景和 ToB 经验，弱化纯执行类描述。",
      },
    }),

  setCurrentStep: (step) => set({ currentStep: step }),

  setAnalyzing: (analyzing) => set({ isAnalyzing: analyzing }),

  setAnalysisResult: (result, preserveDraft = false) => set((state) => ({
    analysisResult: preserveDraft ? {
      ...result,
      // Rebuilt suggestions are new proposals; old decisions remain an audit record.
      optimizedItems:result.optimizedItems.map(item=>({...item,id:`analysis:${crypto.randomUUID()}:${item.id}`})),
      followUpQuestions:result.followUpQuestions.map(item=>({...item,id:`analysis:${crypto.randomUUID()}:${item.id}`})),
    } : result,
    draftResume: preserveDraft && state.draftResume ? state.draftResume : structuredClone(result.finalResume),
    ...(preserveDraft ? {} : { proposalDecisions: {}, currentProfileId:"",currentJobId:"",parentVersionId:"" }),
    analysisError: null
  })),
  setOptimizedItems: (items) => set((state) => state.analysisResult
    ? {analysisResult:{...state.analysisResult,optimizedItems:items.map(item=>({
      ...item,id:`optimization:${crypto.randomUUID()}:${item.id}`,
    }))}}
    : {}),
  updateDraft: (path,text) => set((state) => {
    if(!state.draftResume)return {};
    const draft=structuredClone(state.draftResume);
    if(!writeDraft(draft,path,text))return {};
    const decisions={...state.proposalDecisions};
    for(const [id,proposal] of Object.entries(decisions)) {
      if(proposal.fieldPath===path && proposal.decision==="accepted")
        decisions[id]={...proposal,decision:"edited",text,at:new Date().toISOString()};
    }
    return {draftResume:draft,proposalDecisions:decisions};
  }),
  applyProposal: (id,path,text,edited=false) => set((state)=>{
    if(!state.draftResume)return {};
    const draft=structuredClone(state.draftResume);
    const previous=readDraft(draft,path);
    if(!writeDraft(draft,path,text))return {};
    const proposal=state.analysisResult?.optimizedItems.find(item=>item.id===id);
    const prior=state.proposalDecisions[id];
    const beforeProposalId=prior?.fieldPath===path && prior.decision==="accepted" && prior.applied!==false
      ?prior.beforeProposalId:Object.entries(state.proposalDecisions).find(([key,decision])=>
        key!==id && decision.fieldPath===path && decision.decision==="accepted" && decision.applied===true && decision.text===previous)?.[0];
    const beforeText=prior?.fieldPath===path && prior.decision==="accepted" && prior.applied!==false
      ? prior.beforeText ?? proposal?.before ?? previous
      : proposal && previous===proposal.after ? proposal.before : previous;
    const decisions={...state.proposalDecisions};
    for(const [key,decision] of Object.entries(decisions))
      if(key!==id && !key.startsWith("evidence:") && decision.fieldPath===path && decision.decision!=="rejected")
        decisions[key]={...decision,applied:false};
    return {draftResume:draft,proposalDecisions:{...decisions,[id]:{
      decision:edited?"edited":"accepted",fieldPath:path,text,at:new Date().toISOString(),beforeText,applied:true,beforeProposalId,
    }}};
  }),
  rejectProposal: (id,path)=>{
    const state=get(),proposal=state.analysisResult?.optimizedItems.find(item=>item.id===id);
    const prior=state.proposalDecisions[id];
    const target=prior?.decision!=="rejected" && prior?.fieldPath ? prior.fieldPath : path;
    if(!state.draftResume || !proposal || !target)return false;
    const draft=structuredClone(state.draftResume),current=readDraft(draft,target);
    if(current===undefined)return false;
    if(!prior && current!==proposal.after && current!==proposal.before)return false;
    // Undo only the selected field while it still contains this suggestion.
    // A later manual edit or another proposal must never be overwritten.
    const applied=prior?.fieldPath===target && prior.decision==="accepted";
    const anotherOwnsField=Object.entries(state.proposalDecisions).some(([key,decision])=>
      key!==id && !key.startsWith("evidence:") && decision.fieldPath===target &&
      decision.decision==="accepted" && (decision.applied===true||decision.applied===undefined && decision.at>(prior?.at??"")));
    if(anotherOwnsField)return false;
    const beforeText=prior?.beforeText??proposal.before;
    const decisions={...state.proposalDecisions};
    if(prior?.decision!=="edited" &&
      (applied ? current===prior.text : current===proposal.after)){
      // Old decisions can overlap; do not silently resurrect rejected content.
      const rejectedBaseline=Object.entries(state.proposalDecisions).some(([key,decision])=>
        key!==id && decision.fieldPath===target && decision.decision==="rejected" &&
        (!decision.text||decision.text===beforeText));
      if(rejectedBaseline)return false;
      writeDraft(draft,target,beforeText);
      const predecessors=Object.entries(decisions).filter(([key,decision])=>
        key!==id && decision.fieldPath===target && decision.decision==="accepted" && decision.text===beforeText);
      const predecessor=prior?.beforeProposalId
        ?predecessors.find(([key])=>key===prior.beforeProposalId)
        :predecessors.length===1?predecessors[0]:undefined;
      if(predecessor)decisions[predecessor[0]]={...predecessor[1],applied:true};
    }
    set({draftResume:draft,proposalDecisions:{...decisions,[id]:{
      decision:"rejected",fieldPath:target,text:prior?.text||proposal.after,at:new Date().toISOString(),
      beforeText,applied:false,beforeProposalId:prior?.beforeProposalId,
    }}});
    return true;
  },
  setEvidenceNote: (fieldPath,note)=>set(state=>({
    proposalDecisions:{...state.proposalDecisions,["evidence:"+fieldPath]:{
      decision:"edited",fieldPath,text:note.slice(0,1500),at:new Date().toISOString()
    }}
  })),
  addBullet: (id,path,text)=>set((state)=>{
    if(!state.draftResume||!text.trim())return {};
    const prior=state.proposalDecisions[id];
    if(prior?.decision==="accepted"||prior?.decision==="edited")return {};
    const draft=structuredClone(state.draftResume);
    const match=/^(work|project):(\d+)$/.exec(path);
    if(!match)return {};
    const list=match[1]==="work"?draft.workExperience:draft.projectExperience;
    if(!list[Number(match[2])])return {};
    if(!list[Number(match[2])].bullets.some(bullet=>bullet.trim()===text.trim()))
      list[Number(match[2])].bullets.push(text.trim());
    return {draftResume:draft,proposalDecisions:{...state.proposalDecisions,[id]:{
      decision:"accepted",fieldPath:path,text,at:new Date().toISOString()
    }}};
  }),
  restoreVersion:(snapshot,versionId,profileId,jobId,role,context)=>set(()=>({
    draftResume:structuredClone(snapshot),
    analysisResult:structuredClone(context?.workflow?.analysisResult ?? null),
    proposalDecisions:structuredClone(context?.decisions ?? {}),
    userInput:context?.workflow ? {
      ...structuredClone(context.workflow.userInput),targetRole:role||context.workflow.userInput.targetRole,
      jobDescription:context.jobDescription??context.workflow.userInput.jobDescription,
    } : {
      ...defaultUserInput, targetRole:role || snapshot.jobIntent,
      jobDescription:context?.jobDescription || "", originalResume:formatResumeAsText(snapshot),
    },
    optimizeStyle:context?.workflow?.optimizeStyle ?? "ai-product",
    analysisError:null,
    parentVersionId:versionId,currentProfileId:profileId,currentJobId:jobId,currentStep:"final-resume"
  })),
  markSaved:(versionId,profileId,jobId)=>set({parentVersionId:versionId,currentProfileId:profileId,currentJobId:jobId}),

  setAnalysisError: (error) => set({ analysisError: error }),

  setAiMode: (mode) => set({ aiMode: mode }),

  setOptimizeStyle: (style) => set({ optimizeStyle: style }),

  updateFollowUpAnswer: (id, answer) =>
    set((state) => {
      if (!state.analysisResult) return state;
      return {
        analysisResult: {
          ...state.analysisResult,
          followUpQuestions: state.analysisResult.followUpQuestions.map((q) =>
            q.id === id ? { ...q, userAnswer: answer } : q
          ),
        },
      };
    }),

  setFollowUpBullet: (id, bullet) =>
    set((state) => {
      if (!state.analysisResult) return state;
      return {
        analysisResult: {
          ...state.analysisResult,
          followUpQuestions: state.analysisResult.followUpQuestions.map((q) =>
            q.id === id ? { ...q, generatedBullet: bullet } : q
          ),
        },
      };
    }),

  getStepStatus: (step) => {
    const { currentStep, analysisResult } = get();
    const stepIndex = STEPS.indexOf(step);
    const currentIndex = STEPS.indexOf(currentStep);

    if (step === "input") {
      if (currentStep === "input") return "active";
      return analysisResult ? "completed" : "pending";
    }

    if(step==="history"||step==="sim-interview"||step==="model-settings"||step==="ai-usage") return currentStep===step?"active":"pending";
    if(!analysisResult && STEPS.includes(step) && get().draftResume)
      return currentStep===step?"active":"pending";
    if (!analysisResult) return "disabled";

    if (stepIndex < currentIndex) return "completed";
    if (stepIndex === currentIndex) return "active";
    return "pending";
  },

  setCopied: (copied) => set({ copied }),
}));


// Field paths are generated from explicit visible fields, never inferred from LLM strings.
function readDraft(draft:FinalResume,path:string):string|undefined {
 if(path==="summary")return draft.summary;
 if(path==="jobIntent")return draft.jobIntent;
 if(path==="coreSkills"||path==="skillsAndTools")return draft[path].join("、");
 const match=/^(work|project):(\d+):(\d+)$/.exec(path);
 if(!match)return undefined;
 const list=match[1]==="work"?draft.workExperience:draft.projectExperience;
 return list[Number(match[2])]?.bullets[Number(match[3])];
}
function writeDraft(draft:FinalResume,path:string,text:string):boolean {
 if(path==="summary"){draft.summary=text;return true;}
 if(path==="jobIntent"){draft.jobIntent=text;return true;}
 if(path==="coreSkills"||path==="skillsAndTools"){
   draft[path]=text.split(/[、\n]/).map(item=>item.trim()).filter(Boolean);return true;
 }
 const match=/^(work|project):(\d+):(\d+)$/.exec(path);
 if(!match)return false;
 const list=match[1]==="work"?draft.workExperience:draft.projectExperience;
 const entry=list[Number(match[2])];
 if(!entry||Number(match[3])>=entry.bullets.length)return false;
 entry.bullets[Number(match[3])]=text;
 return true;
}
