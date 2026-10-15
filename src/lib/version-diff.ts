import type { FinalResume } from "@/types/resume";

export type VersionChange = {
  key: string;
  label: string;
  kind: "added" | "removed" | "modified";
  before: string;
  after: string;
};

type Entry = { title: string; bullets: string[] };
function flatFields(resume: FinalResume): Array<[string, string, string]> {
  return [
    ["name", "姓名", resume.personalInfo.name],
    ["email", "邮箱", resume.personalInfo.email],
    ["phone", "电话", resume.personalInfo.phone],
    ["location", "所在地", resume.personalInfo.location],
    ["intent", "求职意向", resume.jobIntent],
    ["summary", "职业摘要", resume.summary],
    ["skills", "核心技能", resume.coreSkills.join("、")],
    ["tools", "技能工具", resume.skillsAndTools.join("、")],
    ["school", "学校", resume.education.school],
    ["degree", "学历", resume.education.degree],
    ["educationPeriod", "教育时间", resume.education.period],
  ];
}
function entryGroups(resume: FinalResume): Array<[string, string, Entry[]]> {
  return [
    ["work", "工作经历", resume.workExperience.map(e => ({
      title: [e.company, e.role, e.period].join(" · "), bullets: e.bullets,
    }))],
    ["project", "项目经历", resume.projectExperience.map(e => ({
      title: [e.name, e.role, e.period].join(" · "), bullets: e.bullets,
    }))],
  ];
}
function append(changes: VersionChange[], key: string, label: string, before: string, after: string) {
  if (before === after) return;
  changes.push({
    key, label, before, after,
    kind: !before ? "added" : !after ? "removed" : "modified",
  });
}
function bulletChanges(
  changes: VersionChange[], prefix: string, label: string,
  before: string[], after: string[]
) {
  // Longest-common-subsequence matching keeps unchanged bullets aligned even
  // when another bullet was inserted near the beginning.
  const n = before.length, m = after.length;
  const dp = Array.from({ length: n + 1 }, () => Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = before[i] === after[j] ? 1 + dp[i + 1][j + 1] : Math.max(dp[i + 1][j], dp[i][j + 1]);
  let i = 0, j = 0, segment = 0;
  const pendingBefore: string[] = [], pendingAfter: string[] = [];
  function flush() {
    const len = Math.max(pendingBefore.length, pendingAfter.length);
    for (let k = 0; k < len; k++)
      append(changes, prefix + ":" + (segment++), label, pendingBefore[k] || "", pendingAfter[k] || "");
    pendingBefore.length = 0;
    pendingAfter.length = 0;
  }
  while (i < n || j < m) {
    if (i < n && j < m && before[i] === after[j]) {
      flush(); i++; j++;
    } else if (i < n && (j === m || dp[i + 1][j] >= dp[i][j + 1])) {
      pendingBefore.push(before[i++]);
    } else if (j < m) {
      pendingAfter.push(after[j++]);
    }
  }
  flush();
}
export function compareResumeVersions(a: FinalResume, b: FinalResume): VersionChange[] {
  const changes: VersionChange[] = [];
  const before = flatFields(a), after = flatFields(b);
  for (let index = 0; index < before.length; index++)
    append(changes, before[index][0], before[index][1], before[index][2], after[index][2]);

  const oldGroups = entryGroups(a), newGroups = entryGroups(b);
  for (let group = 0; group < oldGroups.length; group++) {
    const [type, kind, oldEntries] = oldGroups[group];
    const newEntries = newGroups[group][2];
    const used = new Set<number>();
    for (const [index, entry] of oldEntries.entries()) {
      const match = newEntries.findIndex((item, j) => !used.has(j) && item.title === entry.title);
      if (match < 0) {
        append(changes, type + ":removed:" + index, kind + " · " + entry.title, entry.bullets.join("\n"), "");
      } else {
        used.add(match);
        bulletChanges(changes, type + ":" + index, kind + " · " + entry.title, entry.bullets, newEntries[match].bullets);
      }
    }
    for (const [index, entry] of newEntries.entries()) {
      if (!used.has(index))
        append(changes, type + ":added:" + index, kind + " · " + entry.title, "", entry.bullets.join("\n"));
    }
  }
  return changes;
}
