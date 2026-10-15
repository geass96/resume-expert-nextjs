"use client";

import { useEffect, useState } from "react";
import { useResumeStore } from "@/store/resume-store";
import type { AnalysisResult, FinalResume, UserInput } from "@/types/resume";

const DATABASE = "resume-expert-private-drafts";
const RECORD = "current";
let writesPaused = false;
type LocalDraft = {
  draftResume: FinalResume | null;
  analysisResult: AnalysisResult | null;
  userInput: UserInput;
  proposalDecisions: ReturnType<typeof useResumeStore.getState>["proposalDecisions"];
  currentProfileId: string;
  currentJobId: string;
  parentVersionId: string;
  optimizeStyle: ReturnType<typeof useResumeStore.getState>["optimizeStyle"];
  savedAt: string;
};

function openDraftDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}
async function readDraft(): Promise<LocalDraft | null> {
  const db = await openDraftDb();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction("drafts", "readonly").objectStore("drafts").get(RECORD);
      request.onsuccess = () => resolve((request.result as LocalDraft | undefined) || null);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}
async function writeDraft(value: LocalDraft): Promise<void> {
  const db = await openDraftDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("drafts", "readwrite");
      transaction.objectStore("drafts").put(value, RECORD);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally { db.close(); }
}
export async function clearLocalDraft(): Promise<void> {
  writesPaused = true;
  if (typeof indexedDB === "undefined") return;
  const db = await openDraftDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("drafts", "readwrite");
      transaction.objectStore("drafts").delete(RECORD);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } finally { db.close(); }
}
function usable(value: LocalDraft | null): value is LocalDraft {
  if (!value || !value.userInput || typeof value.userInput !== "object") return false;
  const draft = value.draftResume;
  return draft === null || (!!draft.personalInfo && Array.isArray(draft.workExperience) && Array.isArray(draft.projectExperience));
}
function snapshot(): LocalDraft {
  const state = useResumeStore.getState();
  return {
    draftResume: state.draftResume,
    analysisResult: state.analysisResult,
    userInput: state.userInput,
    proposalDecisions: state.proposalDecisions,
    currentProfileId: state.currentProfileId,
    currentJobId: state.currentJobId,
    parentVersionId: state.parentVersionId,
    optimizeStyle: state.optimizeStyle,
    savedAt: new Date().toISOString(),
  };
}
export function DraftRecovery() {
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let unsubscribe: (() => void) | undefined;
    async function start() {
      try {
        const saved = await readDraft();
        if (!active) return;
        const current = useResumeStore.getState();
        if (usable(saved) && !current.draftResume && !current.userInput.originalResume) {
          useResumeStore.setState({
            draftResume: saved.draftResume,
            analysisResult: saved.analysisResult || null,
            userInput: { ...current.userInput, ...saved.userInput },
            proposalDecisions: saved.proposalDecisions || {},
            currentProfileId: saved.currentProfileId || "",
            currentJobId: saved.currentJobId || "",
            parentVersionId: saved.parentVersionId || "",
            optimizeStyle: saved.optimizeStyle || "ai-product",
            currentStep: saved.draftResume ? "final-resume" : "input",
          });
          setNotice("已恢复此浏览器中的未定稿草稿。请到「历史版本」确认保存，才能长期保留。");
        }
        unsubscribe = useResumeStore.subscribe(() => {
          if (writesPaused) return;
          if (timeout) clearTimeout(timeout);
          timeout = setTimeout(() => {
            if (writesPaused) return;
            const value = snapshot();
            if (!value.draftResume && !value.userInput.originalResume && !value.userInput.jobDescription) return;
            void writeDraft(value).catch(() => {
              if (active) setNotice("本地草稿保存失败，请立即到「历史版本」保存定稿。");
            });
          }, 650);
        });
      } catch {
        if (active) setNotice("无法使用浏览器草稿备份。请及时保存正式历史版本。");
      }
    }
    void start();
    return () => {
      active = false;
      unsubscribe?.();
      if (timeout) clearTimeout(timeout);
    };
  }, []);
  return notice ? <div role="status" className="border-b border-blue-100 bg-blue-50 px-4 py-2 text-xs text-blue-900">
    {notice} <button type="button" className="underline ml-2" onClick={() => setNotice("")}>知道了</button>
  </div> : null;
}
