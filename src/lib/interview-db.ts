import { randomUUID } from "node:crypto";
import { historyDb, getVersion } from "./history-db.ts";
import { INTERVIEW_MAX_ROUNDS, validKind } from "./interview-engine.ts";
import type { Feedback, InterviewKind } from "./interview-engine.ts";

export type InterviewSession = {
  id: string; versionId: string; jobId: string; role: string; company: string; kind: InterviewKind;
  status: "active" | "paused" | "completed"; roundCount: number; question: string;
  source: "mock" | "llm"; createdAt: string; updatedAt: string;
};
export type InterviewTurn = {
  id: string; round: number; question: string; answer: string; feedback: Feedback;
  createdAt: string;
};

function init() {
  const db = historyDb();
  db.exec(`CREATE TABLE IF NOT EXISTS interview_sessions (
    id TEXT PRIMARY KEY,
    version_id TEXT NOT NULL REFERENCES resume_versions(id),
    role TEXT NOT NULL,
    company TEXT NOT NULL,
    kind TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','completed')),
    round_count INTEGER NOT NULL DEFAULT 0,
    question TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'mock',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS interview_sessions_version ON interview_sessions(version_id,updated_at DESC);
  CREATE TABLE IF NOT EXISTS interview_turns (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES interview_sessions(id),
    round INTEGER NOT NULL,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    feedback_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(session_id,round)
  );
  CREATE INDEX IF NOT EXISTS interview_turns_order ON interview_turns(session_id,round);`);
  return db;
}
function rowToSession(v: Record<string, unknown>): InterviewSession {
  return {
    id: String(v.id), versionId: String(v.version_id), jobId: String(v.jobId), role: String(v.role),
    company: String(v.company), kind: v.kind as InterviewKind,
    status: v.status as InterviewSession["status"], roundCount: Number(v.round_count),
    question: String(v.question), source: v.source as InterviewSession["source"],
    createdAt: String(v.created_at), updatedAt: String(v.updated_at),
  };
}
export function listSessions() {
  const db = init();
  return (db.prepare("SELECT s.*, v.version_no AS versionNo, v.job_id AS jobId FROM interview_sessions s JOIN resume_versions v ON v.id=s.version_id ORDER BY s.updated_at DESC LIMIT 120").all() as Record<string, unknown>[])
    .map(row => ({ ...rowToSession(row), versionNo: Number(row.versionNo) }));
}
export function readSession(id: string): (InterviewSession & { turns: InterviewTurn[]; versionNo: number }) | null {
  const db = init();
  const row = db.prepare("SELECT s.*, v.version_no AS versionNo, v.job_id AS jobId FROM interview_sessions s JOIN resume_versions v ON v.id=s.version_id WHERE s.id=?").get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  const turns = (db.prepare("SELECT * FROM interview_turns WHERE session_id=? ORDER BY round").all(id) as Record<string, unknown>[])
    .map(v => ({
      id: String(v.id), round: Number(v.round), question: String(v.question),
      answer: String(v.answer), feedback: JSON.parse(String(v.feedback_json)) as Feedback,
      createdAt: String(v.created_at),
    }));
  return { ...rowToSession(row), versionNo: Number(row.versionNo), turns };
}
export function startSession(versionId: string, kind: InterviewKind, question: string, source: "mock" | "llm") {
  const version = getVersion(versionId);
  if (!version) throw Error("必须选择有效的已保存简历版本");
  if (!validKind(kind) || !question.trim() || question.length > 1000) throw Error("面试类型或问题无效");
  const db = init(), id = randomUUID(), now = new Date().toISOString();
  db.prepare("INSERT INTO interview_sessions(id,version_id,role,company,kind,status,round_count,question,source,created_at,updated_at) VALUES(?,?,?,?,?,'active',0,?,?,?,?)")
    .run(id,versionId,version.role,version.company,kind,question,source,now,now);
  return readSession(id)!;
}
export function changeSessionState(id: string, action: "pause" | "resume" | "finish") {
  const existing = readSession(id);
  if (!existing) throw Error("练习记录不存在");
  const allowed = action === "pause" ? existing.status === "active"
    : action === "resume" ? existing.status === "paused"
    : existing.status !== "completed";
  if (!allowed) throw Error("当前状态无法进行此操作");
  const next = action === "pause" ? "paused" : action === "resume" ? "active" : "completed";
  init().prepare("UPDATE interview_sessions SET status=?,updated_at=? WHERE id=? AND status=?")
    .run(next,new Date().toISOString(),id,existing.status);
  return readSession(id)!;
}
export function saveRound(id: string, expectedRound: number, answer: string, feedback: Feedback, nextQuestion: string) {
  if (!Number.isInteger(expectedRound) || expectedRound < 1 || expectedRound > INTERVIEW_MAX_ROUNDS)
    throw Error("回合序号无效");
  if (!answer.trim() || answer.length > 6500 || nextQuestion.length > 1000)
    throw Error("回答或后续问题长度无效");
  const db = init(), time = new Date().toISOString();
  db.exec("BEGIN IMMEDIATE");
  try {
    const row = db.prepare("SELECT * FROM interview_sessions WHERE id=?").get(id) as Record<string, unknown> | undefined;
    if (!row || row.status !== "active" || Number(row.round_count) + 1 !== expectedRound)
      throw Error("练习状态已变化，请刷新后重试");
    const finish = expectedRound === INTERVIEW_MAX_ROUNDS || !nextQuestion.trim();
    db.prepare("INSERT INTO interview_turns(id,session_id,round,question,answer,feedback_json,created_at) VALUES(?,?,?,?,?,?,?)")
      .run(randomUUID(), id, expectedRound, String(row.question), answer.trim(), JSON.stringify(feedback), time);
    db.prepare("UPDATE interview_sessions SET round_count=?,question=?,status=?,updated_at=? WHERE id=?")
      .run(expectedRound, finish ? "" : nextQuestion.trim(), finish ? "completed" : "active", time, id);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK"); throw err;
  }
  return readSession(id)!;
}
export function getInterviewContext(versionId: string) {
  const db = init();
  const v = db.prepare("SELECT v.snapshot_json,j.jd_text,j.role,j.company FROM resume_versions v JOIN job_targets j ON j.id=v.job_id WHERE v.id=?").get(versionId) as Record<string, unknown> | undefined;
  if (!v) throw Error("历史简历版本不存在");
  return {
    snapshot: JSON.parse(String(v.snapshot_json)),
    jd: String(v.jd_text), role: String(v.role), company: String(v.company),
  };
}
