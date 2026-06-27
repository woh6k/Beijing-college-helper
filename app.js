const data = Array.isArray(window.ADMISSION_DATA) ? window.ADMISSION_DATA : [];
const meta = window.ADMISSION_META || {};

const scoreInput = document.querySelector("#scoreInput");
const keywordInput = document.querySelector("#keywordInput");
const acceptCoop = document.querySelector("#acceptCoop");
const acceptOutsideBeijing = document.querySelector("#acceptOutsideBeijing");
const onlyBeijing = document.querySelector("#onlyBeijing");
const levelSelect = document.querySelector("#levelSelect");
const sortSelect = document.querySelector("#sortSelect");
const resultList = document.querySelector("#resultList");
const resultHint = document.querySelector("#resultHint");
const rangeText = document.querySelector("#rangeText");
const totalCount = document.querySelector("#totalCount");
const schoolCount = document.querySelector("#schoolCount");
const rushCount = document.querySelector("#rushCount");
const steadyCount = document.querySelector("#steadyCount");
const safeCount = document.querySelector("#safeCount");
const exportBtn = document.querySelector("#exportBtn");
const sourceNote = document.querySelector("#sourceNote");

let activeBucket = "all";
let currentResults = [];

sourceNote.textContent = (meta.source || "./Excel 数据") + "，已载入 " + (meta.count || data.length) + " 条专业记录。";

function selectedSubjects() {
  return [...document.querySelectorAll("#subjectOptions input:checked")].map((item) => item.value);
}

function subjectMatches(requirement, subjects) {
  const text = requirement || "";
  if (!text || text.includes("不限")) return true;
  const required = [
    ["物理", /物理/],
    ["化学", /化学/],
    ["生物", /生物|生命/],
    ["历史", /历史/],
    ["地理", /地理/],
    ["政治", /政治|思想政治/],
  ].filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
  return required.every((name) => subjects.includes(name));
}

function bucketFor(diff) {
  if (diff >= 0 && diff <= 5) return "冲";
  if (diff >= -10 && diff < 0) return "稳";
  if (diff >= -30 && diff < -10) return "保";
  return "";
}

function getFilters() {
  return {
    score: Number(scoreInput.value) || 0,
    subjects: selectedSubjects(),
    keyword: keywordInput.value.trim().toLowerCase(),
    acceptCoop: acceptCoop.checked,
    acceptOutsideBeijing: acceptOutsideBeijing.checked,
    onlyBeijing: onlyBeijing.checked,
    level: levelSelect.value,
    sort: sortSelect.value,
  };
}

function baseFilteredRows(filters) {
  const low = filters.score - 30;
  const high = filters.score + 5;
  return data.map((item) => {
    const diff = item.score - filters.score;
    return { ...item, diff, bucket: bucketFor(diff) };
  }).filter((item) => {
    if (!item.bucket) return false;
    if (item.score < low || item.score > high) return false;
    if (!subjectMatches(item.subject, filters.subjects)) return false;
    if (!filters.acceptCoop && item.cooperative) return false;
    if (filters.onlyBeijing && !item.inBeijing) return false;
    if (!filters.acceptOutsideBeijing && !item.inBeijing) return false;
    if (filters.level && !(item.level || "").includes(filters.level)) return false;
    if (filters.keyword) {
      const haystack = (item.school + " " + item.major + " " + item.location + " " + item.subject + " " + item.groupName + " " + item.level).toLowerCase();
      if (!haystack.includes(filters.keyword)) return false;
    }
    return true;
  });
}

function groupBy(rows, keyFn) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.entries()].map(([key, items]) => ({ key, items }));
}

function groupRows(rows) {
  return groupBy(rows, (row) => row.school).map(({ key, items }) => ({ school: key, majors: items }));
}

function sortRowsWithinGroup(rows, sort) {
  return [...rows].sort((a, b) => {
    if (sort === "scoreAsc") return a.score - b.score || a.majorCode.localeCompare(b.majorCode, "zh-Hans-CN") || a.major.localeCompare(b.major, "zh-Hans-CN");
    return b.score - a.score || a.majorCode.localeCompare(b.majorCode, "zh-Hans-CN") || a.major.localeCompare(b.major, "zh-Hans-CN");
  });
}

function groupedSortRows(rows, sort) {
  const schools = groupRows(rows).map((schoolGroup) => {
    const majors = sortRowsWithinGroup(schoolGroup.majors, sort);
    const scores = majors.map((item) => item.score);
    return { ...schoolGroup, majors, maxScore: Math.max(...scores), minScore: Math.min(...scores) };
  });

  schools.sort((a, b) => {
    if (sort === "school") return a.school.localeCompare(b.school, "zh-Hans-CN") || b.maxScore - a.maxScore;
    if (sort === "scoreAsc") return a.minScore - b.minScore || a.school.localeCompare(b.school, "zh-Hans-CN");
    return b.maxScore - a.maxScore || a.school.localeCompare(b.school, "zh-Hans-CN");
  });

  return schools.flatMap((group) => group.majors);
}

function filterData() {
  const filters = getFilters();
  const low = filters.score - 30;
  const high = filters.score + 5;
  rangeText.textContent = low + " - " + high;

  let rows = baseFilteredRows(filters);
  const bucketCounts = {
    rush: rows.filter((item) => item.bucket === "冲").length,
    steady: rows.filter((item) => item.bucket === "稳").length,
    safe: rows.filter((item) => item.bucket === "保").length,
  };

  if (activeBucket !== "all") rows = rows.filter((item) => item.bucket === activeBucket);

  rows = groupedSortRows(rows, filters.sort);
  currentResults = rows;
  render(rows, bucketCounts, filters);
}

function render(rows, bucketCounts, filters) {
  totalCount.textContent = rows.length;
  schoolCount.textContent = new Set(rows.map((item) => item.school)).size;
  rushCount.textContent = bucketCounts.rush;
  steadyCount.textContent = bucketCounts.steady;
  safeCount.textContent = bucketCounts.safe;  resultHint.textContent = rows.length ? "显示 " + rows.length + " 条结果，同一学校与同一专业组已合并显示。" : "没有找到符合条件的专业，可以放宽筛选条件。";

  if (!rows.length) {
    resultList.innerHTML = '<div class="empty">暂无匹配结果</div>';
    return;
  }

  const groups = groupRows(rows.slice(0, 300));
  resultList.innerHTML = groups.map((group) => renderSchoolGroup(group, filters.sort)).join("");
}

function renderSchoolGroup(group, sort) {
  const majors = group.majors;
  const lead = majors[0];
  const scoreValues = majors.map((item) => item.score);
  const bucketSummary = ["冲", "稳", "保"].map((name) => {
    const count = majors.filter((item) => item.bucket === name).length;
    return count ? name + count : "";
  }).filter(Boolean).join(" · ");
  const schoolTags = [
    lead.level,
    lead.inBeijing ? "北京" : "京外",
    Math.min(...scoreValues) === Math.max(...scoreValues) ? Math.max(...scoreValues) + "分" : Math.min(...scoreValues) + "-" + Math.max(...scoreValues) + "分",
    bucketSummary,
  ].filter(Boolean);
  const groupBlocks = groupBy(majors, (item) => item.groupKey || item.groupName || "专业组未标注").map(({ items }) => {
    const sorted = sortRowsWithinGroup(items, sort);
    return renderMajorGroup(sorted);
  }).join("");

  return '<article class="school-group">' +
    '<header class="school-group-head">' +
      '<div><div class="school-name">' + escapeHtml(group.school) + '</div><div class="meta">' + escapeHtml(lead.location || "位置未标注") + ' · ' + escapeHtml(lead.schoolCode) + ' · 共 ' + majors.length + ' 个专业</div></div>' +
      '<div class="tag-list">' + schoolTags.map((tag) => '<span class="tag">' + escapeHtml(tag) + '</span>').join("") + '</div>' +
    '</header>' +
    '<div class="major-list">' + groupBlocks + '</div>' +
  '</article>';
}

function renderMajorGroup(items) {
  const lead = items[0];
  const scores = items.map((item) => item.score);
  const scoreLabel = Math.min(...scores) === Math.max(...scores) ? Math.max(...scores) + "分" : Math.min(...scores) + "-" + Math.max(...scores) + "分";
  return '<section class="major-group">' +
    '<div class="major-group-head"><strong>' + escapeHtml(lead.groupName || "专业组未标注") + '</strong><span>' + escapeHtml(lead.subject || "不限") + '</span><span>' + scoreLabel + '</span></div>' +
    items.map((item) => renderMajorRow(item)).join("") +
  '</section>';
}

function renderMajorRow(item) {
  const tags = [    item.cooperative ? "合作办学" : "",
    item.plan ? "计划 " + item.plan : "",
    item.page ? "页码 " + item.page : "",
  ].filter(Boolean);
  return '<div class="major-row">' +
    '<div><div class="major-name">' + escapeHtml(item.major) + '</div><div class="meta">' + escapeHtml(item.subject || "不限") + (item.coopSchool ? ' · ' + escapeHtml(item.coopSchool) : '') + '</div></div>' +
    '<div><span class="score-pill">' + item.score + ' 分</span></div>' +
    '<div><span class="bucket-pill ' + bucketClass(item.bucket) + '">' + item.bucket + ' ' + signed(item.diff) + '</span></div>' +
    '<div class="tag-list">' + tags.map((tag) => '<span class="tag">' + escapeHtml(tag) + '</span>').join("") + '</div>' +
  '</div>';
}

function bucketClass(bucket) {
  if (bucket === "冲") return "bucket-rush";
  if (bucket === "稳") return "bucket-steady";
  return "bucket-safe";
}

function signed(num) {
  return num > 0 ? "+" + num : String(num);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;",
  }[char]));
}

function exportCsv() {
  const header = ["分类", "差值", "预测分", "学校", "专业组", "专业", "选科要求", "位置", "层次", "计划", "中外合作", "页码"];
  const lines = [header, ...currentResults.map((item) => [
    item.bucket, signed(item.diff), item.score, item.school, item.groupName, item.major, item.subject, item.location, item.level, item.plan, item.cooperative ? "是" : "否", item.page,
  ])];
  const csv = lines.map((row) => row.map((cell) => '"' + String(cell ?? "").replace(/"/g, '""') + '"').join(",")).join("\n");
  const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "志愿匹配结果.csv";
  link.click();
  URL.revokeObjectURL(url);
}

document.querySelectorAll("input, select").forEach((item) => item.addEventListener("input", filterData));
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((item) => item.classList.remove("active"));
    tab.classList.add("active");
    activeBucket = tab.dataset.bucket;
    filterData();
  });
});
exportBtn.addEventListener("click", exportCsv);
onlyBeijing.addEventListener("input", () => {
  if (onlyBeijing.checked) acceptOutsideBeijing.checked = false;
  filterData();
});
acceptOutsideBeijing.addEventListener("input", () => {
  if (acceptOutsideBeijing.checked) onlyBeijing.checked = false;
  filterData();
});

filterData();



