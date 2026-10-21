import deck from "../data/knowledge-cards.json" with { type: "json" };
import { historyDb } from "./history-db.ts";
import type { CardProgress, CardProgressMap, CardRating } from "../types/knowledge-cards.ts";

export const knowledgeCards = deck;
const ids = new Set(deck.map(card => card.id));
const DAY = 86400000;
export class CardsConflictError extends Error {
  constructor() { super("复习记录已在其他页面更新，请刷新后重试；当前输入仍保留。"); }
}
function database() {
  const db = historyDb();
  db.exec(`CREATE TABLE IF NOT EXISTS knowledge_card_progress (
    card_id TEXT PRIMARY KEY, progress_json TEXT NOT NULL
  ); CREATE TABLE IF NOT EXISTS knowledge_card_meta (
    id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL
  ); INSERT OR IGNORE INTO knowledge_card_meta VALUES (1,0);`);
  return db;
}
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function revisionValue(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw Error("复习版本无效，请刷新后重试");
  return value as number;
}
function ratingValue(value: unknown): CardRating {
  if (value !== "forgot" && value !== "fuzzy" && value !== "known") throw Error("评分无效");
  return value;
}
function answerValue(value: unknown): string {
  if (typeof value !== "string" || value.length > 50000) throw Error("项目回答须为不超过50000字的文本");
  return value;
}
export function normalizeCardProgress(value: unknown): CardProgressMap {
  if (!object(value) || Object.keys(value).length > ids.size) throw Error("进度文件结构无效");
  const result: CardProgressMap = {};
  for (const [id, item] of Object.entries(value)) {
    if (!ids.has(id) || !object(item)) throw Error("进度包含未知卡片");
    const rating = item.rating == null ? null : ratingValue(item.rating);
    const due = item.due ?? 0, streak = item.streak ?? 0;
    if (typeof due !== "number" || !Number.isSafeInteger(due) || due < 0 || due > 8640000000000000)
      throw Error("复习时间无效");
    if (typeof streak !== "number" || !Number.isSafeInteger(streak) || streak < 0 || streak > 100000)
      throw Error("连续掌握次数无效");
    result[id] = { rating, due, streak, myAnswer: answerValue(item.myAnswer ?? "") };
  }
  return result;
}
export function readCardProgress() {
  const db = database();
  // A transaction keeps the revision and records in the same SQLite snapshot.
  db.exec("BEGIN");
  try {
    const revision = Number(db.prepare("SELECT revision FROM knowledge_card_meta WHERE id=1").get()!.revision);
    const progress: CardProgressMap = {};
    for (const row of db.prepare("SELECT card_id,progress_json FROM knowledge_card_progress").all())
      if (ids.has(String(row.card_id))) progress[String(row.card_id)] = JSON.parse(String(row.progress_json));
    db.exec("COMMIT");
    return { progress, revision };
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}
function write(expected: unknown, apply: (db: ReturnType<typeof database>) => void) {
  const revision = revisionValue(expected), db = database();
  db.exec("BEGIN IMMEDIATE");
  try {
    if (Number(db.prepare("SELECT revision FROM knowledge_card_meta WHERE id=1").get()!.revision) !== revision)
      throw new CardsConflictError();
    apply(db);
    db.prepare("UPDATE knowledge_card_meta SET revision=revision+1 WHERE id=1").run();
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  return readCardProgress();
}
export function updateCardProgress(id: string, input: unknown, now = Date.now()) {
  if (!ids.has(id)) throw Error("卡片不存在");
  if (!object(input) || (!Object.hasOwn(input, "rating") && !Object.hasOwn(input, "myAnswer")))
    throw Error("请提交评分或项目回答");
  if (Object.keys(input).some(key => !["revision", "rating", "myAnswer"].includes(key))) throw Error("更新字段无效");
  const rating = Object.hasOwn(input, "rating") ? ratingValue(input.rating) : undefined;
  const answer = Object.hasOwn(input, "myAnswer") ? answerValue(input.myAnswer) : undefined;
  return write(input.revision, db => {
    const row = db.prepare("SELECT progress_json FROM knowledge_card_progress WHERE card_id=?").get(id);
    const progress: CardProgress = row ? JSON.parse(String(row.progress_json)) : { rating: null, due: 0, streak: 0, myAnswer: "" };
    if (rating) {
      progress.streak = rating === "known" ? Math.min(progress.streak + 1, 100000) : 0;
      progress.rating = rating;
      progress.due = now + (rating === "forgot" ? 600000 : rating === "fuzzy" ? DAY :
        [1, 3, 7, 14, 30][Math.min(progress.streak - 1, 4)] * DAY);
    }
    if (answer !== undefined) progress.myAnswer = answer;
    db.prepare("INSERT INTO knowledge_card_progress VALUES (?,?) ON CONFLICT(card_id) DO UPDATE SET progress_json=excluded.progress_json")
      .run(id, JSON.stringify(progress));
  });
}
export function importCardProgress(input: unknown) {
  if (!object(input) || input.schema !== "ai-pm-recall-v1") throw Error("不是有效的知识卡片进度文件");
  const progress = normalizeCardProgress(input.progress);
  return write(input.revision, db => {
    db.exec("DELETE FROM knowledge_card_progress");
    const insert = db.prepare("INSERT INTO knowledge_card_progress VALUES (?,?)");
    for (const [id, value] of Object.entries(progress)) insert.run(id, JSON.stringify(value));
  });
}
