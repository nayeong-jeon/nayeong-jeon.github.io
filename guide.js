import { BENEFIT_RULES, formatRuleAmount } from "./benefit-rules.mjs";

const table = document.querySelector("#benefit-rules-table");
const fullMonthFormula = document.querySelector("#full-month-formula");
const partialMonthFormula = document.querySelector("#partial-month-formula");

function appendRow(scheme, period, rate, cap) {
  const row = document.createElement("tr");
  const values = [
    [scheme, "th"],
    [period, "td"],
    [`${rate * 100}% · ${formatRuleAmount(cap)}`, "td"],
    [`월 ${formatRuleAmount(BENEFIT_RULES.monthlyFloor)}`, "td"],
  ];
  for (const [value, tagName] of values) {
    const cell = document.createElement(tagName);
    if (tagName === "th") cell.scope = "row";
    cell.textContent = value;
    row.append(cell);
  }
  table.append(row);
}

for (const band of BENEFIT_RULES.standard.bands) {
  appendRow(
    BENEFIT_RULES.standard.label,
    `${band.from}~${band.through}개월`,
    band.rate,
    band.cap,
  );
}

for (const [index, cap] of BENEFIT_RULES.sixPlusSix.caps.entries()) {
  const month = index + 1;
  appendRow(BENEFIT_RULES.sixPlusSix.label, `${month}개월`, BENEFIT_RULES.sixPlusSix.rate, cap);
}
appendRow(
  BENEFIT_RULES.sixPlusSix.label,
  "7개월 이후",
  BENEFIT_RULES.standard.bands[2].rate,
  BENEFIT_RULES.standard.bands[2].cap,
);

for (const band of BENEFIT_RULES.singleParent.bands) {
  appendRow(
    BENEFIT_RULES.singleParent.label,
    `${band.from}~${band.through}개월`,
    band.rate,
    band.cap,
  );
}

fullMonthFormula.textContent =
  `Math.max(${formatRuleAmount(BENEFIT_RULES.monthlyFloor)}, Math.min(월 통상임금 × 적용 비율, 해당 지급대상 월 상한액))`;
partialMonthFormula.textContent =
  "부분 월 예상액 = 완전한 지급대상 월 산정액 × 지급대상 일수 ÷ 해당 지급대상 월의 총 일수. 실제 지급 자격이 없는 날에는 하한액을 적용하지 않습니다.";
