"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Check, Download, Layers, RotateCcw, Shuffle, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SectionTitle } from "@/components/shared/ui-helpers";
import type { CardRating, CardsReport } from "@/types/knowledge-cards";

const labels = { forgot: "忘了", fuzzy: "模糊", known: "记住" };
const selectClass = "rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm";
async function responseJson(response: Response) {
  const data = await response.json();
  if (!response.ok) throw Error(data.error || "请求失败，请稍后重试");
  return data;
}
function download(name: string, content: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function KnowledgeCardsStep({ active }: { active: boolean }) {
  const [report, setReport] = useState<CardsReport | null>(null);
  const [category, setCategory] = useState("");
  const [mode, setMode] = useState("all");
  const [search, setSearch] = useState("");
  const [currentId, setCurrentId] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const importRef = useRef<HTMLInputElement>(null);
  const loading = useRef(false);

  const refresh = useCallback(() => {
    if (loading.current) return;
    loading.current = true;
    return fetch("/api/knowledge-cards", { cache: "no-store" }).then(responseJson)
      .then(data => { setReport(data); setError(""); })
      .catch(e => { setError(e instanceof Error ? e.message : "无法加载卡片"); })
      .finally(() => { loading.current = false; setBusy(false); });
  }, []);
  useEffect(() => { if (active) void refresh(); }, [active, refresh]);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, [active]);
  const dirty = Object.entries(drafts).some(([id, answer]) => answer !== (report?.progress[id]?.myAnswer || ""));
  useEffect(() => {
    if (!dirty) return;
    const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);

  const due = useCallback((id: string) => !report?.progress[id]?.rating || report.progress[id].due <= now, [report, now]);
  const filtered = useMemo(() => (report?.cards || []).filter(card =>
    (!category || card.category === category) &&
    (!search.trim() || [card.front, card.answer, card.pitfall, card.practice, card.id].join(" ").toLowerCase().includes(search.trim().toLowerCase())) &&
    (mode !== "due" || due(card.id)) &&
    (mode !== "weak" || ["forgot", "fuzzy"].includes(report?.progress[card.id]?.rating || ""))),
    [report, category, search, mode, due]);
  const card = filtered.find(item => item.id === currentId) || filtered[0];
  const progress = card ? report?.progress[card.id] : undefined;
  const answer = card ? drafts[card.id] ?? progress?.myAnswer ?? "" : "";
  const categories = [...new Set(report?.cards.map(item => item.category) || [])];
  const reviewed = report?.cards.filter(item => report.progress[item.id]?.rating).length || 0;
  const dueCount = report?.cards.filter(item => due(item.id)).length || 0;
  function move(delta: number) {
    if (!card || busy) return;
    setCurrentId(filtered[(filtered.indexOf(card) + delta + filtered.length) % filtered.length].id);
    setRevealed(false); setMessage("");
  }
  async function save(rating?: CardRating) {
    if (!card || !report || busy || loading.current) return;
    const id = card.id, savedAnswer = answer;
    loading.current = true; setBusy(true); setError(""); setMessage("");
    try {
      const state = await fetch("/api/knowledge-cards/" + encodeURIComponent(id), {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision: report.revision, myAnswer: savedAnswer, ...(rating ? { rating } : {}) }),
      }).then(responseJson);
      setReport(old => old ? { ...old, ...state } : old);
      setDrafts(old => { if (old[id] !== savedAnswer) return old; const copy = { ...old }; delete copy[id]; return copy; });
      setNow(Date.now());
      setMessage(rating ? `已记录“${labels[rating]}”，回答和复习时间已保存到服务器。` : "项目回答已保存到服务器。");
      if (rating) setRevealed(false);
    } catch (e) { setError(e instanceof Error ? e.message : "保存失败，当前输入保留"); }
    finally { loading.current = false; setBusy(false); }
  }
  async function exportProgress() {
    if (loading.current) return;
    if (dirty) { setError("还有未保存的项目回答，请先保存后导出进度。"); return; }
    loading.current = true; setBusy(true); setError("");
    try {
      const latest: CardsReport = await fetch("/api/knowledge-cards", { cache: "no-store" }).then(responseJson);
      setReport(latest);
      download("知识卡片进度-" + new Date().toISOString().slice(0, 10) + ".json",
        JSON.stringify({ schema: "ai-pm-recall-v1", exported: new Date().toISOString(), progress: latest.progress }, null, 2));
      setMessage("已导出服务器上的复习进度与项目回答。");
    } catch (e) { setError(e instanceof Error ? e.message : "导出失败"); }
    finally { loading.current = false; setBusy(false); }
  }
  async function importProgress(file: File) {
    if (!report || busy || loading.current) return;
    loading.current = true; setBusy(true); setError(""); setMessage("");
    try {
      if (file.size > 8000000) throw Error("进度文件不能超过8MB");
      const data = JSON.parse(await file.text());
      if (!data || data.schema !== "ai-pm-recall-v1" || !data.progress || typeof data.progress !== "object" || Array.isArray(data.progress))
        throw Error("请选择本功能或离线卡片导出的JSON进度文件");
      if (!window.confirm(`导入 ${Object.keys(data.progress).length} 条记录，将覆盖服务器全部卡片进度和项目回答（包括当前未保存输入）。建议先导出备份。是否继续？`)) return;
      setBusy(true);
      const state = await fetch("/api/knowledge-cards", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schema: data.schema, progress: data.progress, revision: report.revision }),
      }).then(responseJson);
      setReport(old => old ? { ...old, ...state } : old); setDrafts({}); setRevealed(false); setNow(Date.now());
      setMessage("进度已导入，其他设备刷新后可继续复习。");
    } catch (e) { setError(e instanceof Error ? e.message : "导入失败，原进度保留"); }
    finally { loading.current = false; setBusy(false); if (importRef.current) importRef.current.value = ""; }
  }
  function exportMarkdown() {
    if (!report) return;
    const text = ["# AI产品经理知识卡片", "", "48张核心融合卡；答案含实践补充，内容归纳置信度中。", "",
      ...report.cards.flatMap(c => [`## ${c.id} · ${c.category} · ${c.front}`, "", `回忆要点：${c.answer}`, "",
        `易错点：${c.pitfall}`, "", `迁移练习：${c.practice}`, "",
        `相关课程：${c.source.course} / ${c.source.item}；题库正文 ${c.source.question}：${c.source.questionTitle}`, ""]),
    ].join("\n");
    download("AI产品经理知识卡片.md", text, "text/markdown;charset=utf-8");
  }
  return <section hidden={!active} className="space-y-5" aria-label="知识卡片复习">
    <SectionTitle title="知识卡片" description="把课程理解练成面试表达：先闭卷回忆，再核对要点，最后迁移到自己的真实项目。" />
    <div className="grid grid-cols-3 gap-3">
      {[["核心卡片", report?.cards.length ?? "—"], ["已评卡片", reviewed], ["待复习", dueCount]].map(([label, value]) =>
        <Card key={label}><CardContent className="p-4"><p className="text-xs text-neutral-500">{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p></CardContent></Card>)}
    </div>
    <div className="flex flex-wrap gap-2">
      <select aria-label="卡片主题" className={selectClass} disabled={busy} value={category} onChange={e => { setCategory(e.target.value); setRevealed(false); setMessage(""); }}>
        <option value="">全部主题</option>{categories.map(c => <option key={c}>{c}</option>)}
      </select>
      <select aria-label="复习模式" className={selectClass} disabled={busy} value={mode} onChange={e => { setMode(e.target.value); setRevealed(false); setMessage(""); }}>
        <option value="all">全部卡片</option><option value="due">只练到期</option><option value="weak">忘了或模糊</option>
      </select>
      <input aria-label="搜索卡片" className={selectClass + " min-w-32 flex-1"} value={search} disabled={busy}
        placeholder="搜索问题、答案、易错点" onChange={e => { setSearch(e.target.value); setRevealed(false); setMessage(""); }} />
      <Button variant="outline" disabled={busy || filtered.length < 2} onClick={() => {
        const other = filtered.filter(c => c.id !== card?.id); setCurrentId(other[Math.floor(Math.random() * other.length)].id); setRevealed(false); setMessage("");
      }}><Shuffle />随机</Button>
      <Button variant="outline" disabled={busy} onClick={() => { setBusy(true); void refresh(); }}><RotateCcw />刷新</Button>
    </div>
    {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
    {dirty && <p className="text-xs text-amber-700">有未保存的项目回答。切换卡片或工作台模块会保留输入；刷新或关闭页面前请保存。</p>}
    {!report && !error && <p role="status" className="text-sm text-neutral-500">正在加载卡片与复习进度…</p>}
    {report && !card && <Card><CardContent className="p-10 text-center text-sm text-neutral-500">当前筛选下没有卡片。请更换主题、搜索词或复习模式。</CardContent></Card>}
    {card && <div className="space-y-3">
      <p className="text-xs text-neutral-500" aria-live="polite">{card.id} · 当前筛选 {filtered.indexOf(card) + 1} / {filtered.length}</p>
      <Card tabIndex={0} aria-label="当前知识卡片" className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400" onKeyDown={e => {
        if (busy || e.ctrlKey || e.altKey || e.metaKey || (e.target as HTMLElement).closest("input,textarea,select,button,summary,a")) return;
        if (e.code === "Space") { e.preventDefault(); setRevealed(v => !v); }
        else if (e.key === "ArrowRight") move(1);
        else if (e.key === "ArrowLeft") move(-1);
        else if (revealed && ["1", "2", "3"].includes(e.key)) void save(({ "1": "forgot", "2": "fuzzy", "3": "known" } as const)[e.key as "1" | "2" | "3"]);
      }}><CardContent className="p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs"><span className="inline-flex items-center gap-2 rounded-full bg-neutral-100 px-3 py-1"><Layers className="h-3 w-3" />{card.category}</span>
          <span className="text-neutral-500">{progress?.rating ? `${labels[progress.rating]} · ${due(card.id) ? "已到期" : new Date(progress.due).toLocaleString("zh-CN", { hour12: false }) + " 复习"}` : "未练习"}</span></div>
        <h3 className="mb-4 mt-7 text-xl font-semibold leading-relaxed sm:text-2xl">{card.front}</h3>
        <p className="mb-6 text-sm text-neutral-500">先口述30–60秒：关键判断是什么？依据是什么？如何用于自己的项目？</p>
        <Button variant={revealed ? "outline" : "default"} disabled={busy} onClick={() => setRevealed(v => !v)}><BookOpen />{revealed ? "收起答案" : "翻看答案"}</Button>
        {revealed && <div className="mt-6 space-y-5 border-t border-neutral-200 pt-5">
          <div><h4 className="mb-2 text-sm font-semibold">回忆要点</h4><p className="text-sm leading-7 text-neutral-700">{card.answer}</p></div>
          <div className="border-l-2 border-amber-400 pl-4"><h4 className="mb-2 text-sm font-semibold">易错点</h4><p className="text-sm leading-7 text-neutral-700">{card.pitfall}</p></div>
          <div><h4 className="mb-2 text-sm font-semibold">迁移到自己的项目</h4><p className="text-sm leading-7 text-neutral-700">{card.practice}</p></div>
          <div className="space-y-2"><label htmlFor="card-project-answer" className="text-sm font-semibold">我的项目回答</label>
            <textarea id="card-project-answer" className="min-h-32 w-full rounded-md border border-neutral-200 p-3 text-sm" maxLength={50000} disabled={busy}
              value={answer} onChange={e => setDrafts(old => ({ ...old, [card.id]: e.target.value }))}
              placeholder="写真实背景、本人决策和验证结果；没测过的指标请标记未测。" />
            <div className="flex flex-wrap items-center gap-3"><Button size="sm" variant="outline" disabled={busy || answer === (progress?.myAnswer || "")} onClick={() => void save()}><Check />保存项目回答</Button>
              <span className="text-xs text-neutral-500">评分时也会一起保存本卡回答。</span></div>
          </div>
          <div className="flex flex-wrap gap-2" aria-label="自评记忆程度">
            <Button variant="outline" disabled={busy} onClick={() => void save("forgot")}>1 · 忘了</Button>
            <Button variant="outline" disabled={busy} onClick={() => void save("fuzzy")}>2 · 模糊</Button>
            <Button disabled={busy} onClick={() => void save("known")}>3 · 记住</Button>
          </div>
          <details key={card.id} className="border-t border-neutral-200 pt-4 text-xs leading-6 text-neutral-500"><summary className="cursor-pointer font-medium text-neutral-700">相关来源与置信度</summary>
            <p className="mt-2">课程：{card.source.course} · 条目 {card.source.item}</p>
            <p>题库正文 {card.source.question}：{card.source.questionTitle}</p>
            <p>内容归纳置信度：{card.confidence}。答案含实践补充，不等于原课程逐字结论；课堂示例参数不能当成通用最优值。完整原文请回查本机课程资料与题库。</p>
          </details>
        </div>}
      </CardContent></Card>
      <div className="flex items-center justify-between gap-3"><Button variant="outline" disabled={busy || filtered.length < 2} onClick={() => move(-1)}><ArrowLeft />上一张</Button>
        <span className="hidden text-xs text-neutral-400 sm:block">聚焦卡片后：空格翻卡 · 方向键切换 · 1/2/3评分</span>
        <Button disabled={busy || filtered.length < 2} onClick={() => move(1)}>下一张<ArrowRight /></Button></div>
    </div>}
    <div className="flex flex-wrap gap-2 border-t border-neutral-200 pt-4">
      <Button variant="outline" size="sm" disabled={!report || busy} onClick={() => void exportProgress()}><Download />导出进度</Button>
      <Button variant="outline" size="sm" disabled={!report || busy} onClick={() => importRef.current?.click()}><Upload />导入进度</Button>
      <Button variant="outline" size="sm" disabled={!report || busy} onClick={exportMarkdown}>导出卡片 Markdown</Button>
      <input ref={importRef} type="file" accept=".json,application/json" className="hidden" aria-label="选择进度文件" onChange={e => { const f = e.target.files?.[0]; if (f) void importProgress(f); }} />
    </div>
    <p className="text-xs leading-6 text-neutral-500">无需调用模型。进度保存在账号所在服务器，可导入原离线版进度。忘了：10分钟；模糊：1天；连续记住：1/3/7/14/30天。此为简单默认安排。48张核心卡覆盖8个主题，并非全题库逐题答案。</p>
  </section>;
}
