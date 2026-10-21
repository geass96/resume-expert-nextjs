import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const dir = mkdtempSync(join(tmpdir(), "resume-cards-test-"));
process.env.RESUME_DATA_DIR = dir;
const { knowledgeCards, readCardProgress, updateCardProgress, importCardProgress, CardsConflictError } = await import("../src/lib/knowledge-cards.ts");
const { closeHistoryDb } = await import("../src/lib/history-db.ts");

test("card schedule, persisted answers, concurrent updates and atomic offline import", () => {
  try {
    assert.equal(knowledgeCards.length, 48);
    assert.equal(new Set(knowledgeCards.map(c => c.category)).size, 8);
    assert(!JSON.stringify(knowledgeCards).match(/D:\\|D:\/|notePath|courseQuestion|sourceQuote/));
    assert.deepEqual(readCardProgress(), { progress: {}, revision: 0 });
    const now = 1800000000000, day = 86400000;
    let state = updateCardProgress("K001", { revision: 0, myAnswer: "真实项目中的决定", rating: "known" }, now);
    assert.equal(state.progress.K001.due, now + day);
    assert.equal(state.progress.K001.streak, 1);
    assert.throws(() => updateCardProgress("K001", { revision: 0, myAnswer: "过期页面覆盖" }), CardsConflictError);
    assert.equal(readCardProgress().progress.K001.myAnswer, "真实项目中的决定");
    state = updateCardProgress("K001", { revision: 1, rating: "known" }, now);
    assert.equal(state.progress.K001.due, now + 3 * day);
    assert.equal(state.progress.K001.myAnswer, "真实项目中的决定");
    state = updateCardProgress("K001", { revision: 2, rating: "forgot" }, now);
    assert.equal(state.progress.K001.due, now + 600000); assert.equal(state.progress.K001.streak, 0);
    state = updateCardProgress("K001", { revision: 3, rating: "fuzzy" }, now);
    assert.equal(state.progress.K001.due, now + day);
    assert.throws(() => updateCardProgress("missing", { revision: 4, rating: "known" }));
    assert.throws(() => updateCardProgress("K001", { revision: 4, rating: null }));
    assert.throws(() => updateCardProgress("K001", { revision: 4, myAnswer: "x".repeat(50001) }));
    const before = readCardProgress();
    for (const progress of [null, [], { unknown: {} }, { K001: { due: "bad" } }, { K001: { streak: -1 } }, { K001: { rating: "bad" } }, { K001: { myAnswer: [] } }]) {
      assert.throws(() => importCardProgress({ schema: "ai-pm-recall-v1", revision: 4, progress }));
      assert.deepEqual(readCardProgress(), before, "invalid import preserves the entire saved state");
    }
    state = importCardProgress({ schema: "ai-pm-recall-v1", revision: 4, progress: { K002: { myAnswer: "离线版回答", due: 0, streak: 0 } } });
    assert.equal(state.revision, 5); assert.equal(state.progress.K002.rating, null);
    assert.equal(state.progress.K001, undefined);
    assert.throws(() => importCardProgress({ schema: "ai-pm-recall-v1", revision: 4, progress: {} }), CardsConflictError);
    closeHistoryDb();
    assert.deepEqual(readCardProgress(), state, "SQLite data survives closing and reopening the application database");
  } finally { closeHistoryDb(); rmSync(dir, { recursive: true, force: true }); }
});
