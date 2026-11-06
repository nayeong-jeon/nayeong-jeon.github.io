import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { BENEFIT_RULES, getBenefitRule } from "../benefit-rules.mjs";
import {
  assessSixPlusSix,
  calculateFullMonths,
  calculateLeaveEstimate,
  calculateMonthlyAmount,
} from "../calculator-core.mjs";

const sixMonths = [
  { startDate: "2025-01-01", endDate: "2025-06-30" },
];

test("general benefit: 3.5 million won for 12 full months totals 23.1 million won", () => {
  assert.equal(calculateFullMonths(3_500_000, 12).total, 23_100_000);
});

test("general 7th month is 80 percent of 1.8 million won", () => {
  assert.equal(calculateMonthlyAmount(1_800_000, 7).amount, 1_440_000);
});

test("general 7th month is 80 percent of 1 million won", () => {
  assert.equal(calculateMonthlyAmount(1_000_000, 7).amount, 800_000);
});

test("minimum applies only to a valid full benefit month", () => {
  assert.equal(calculateMonthlyAmount(500_000, 1).amount, 700_000);
});

test("single-parent first three months use a 3 million won cap", () => {
  assert.deepEqual(
    calculateFullMonths(3_500_000, 3, "singleParent").monthly.map(({ amount }) => amount),
    [3_000_000, 3_000_000, 3_000_000],
  );
});

test("6+6 special first six months total 20 million won per parent", () => {
  const result = calculateLeaveEstimate({
    ordinaryWage: 5_000_000,
    periods: sixMonths,
    spousePeriods: sixMonths,
    childBirthDate: "2024-12-01",
    scheme: "sixPlusSix",
    sixPlusSixApplies: true,
  });
  assert.equal(result.hypothetical.total, 20_000_000);
  const spouseResult = calculateLeaveEstimate({
    ordinaryWage: 5_000_000,
    periods: sixMonths,
    spousePeriods: sixMonths,
    childBirthDate: "2024-12-01",
    scheme: "sixPlusSix",
    sixPlusSixApplies: true,
  });
  assert.equal(spouseResult.hypothetical.total, 20_000_000);
  assert.equal(result.status, "conditional");
  assert.equal(result.sixPlusSixAssessment.verified, false);
});

test("6+6 first month is 2.5 million won per parent", () => {
  const month = [{ startDate: "2025-01-01", endDate: "2025-01-31" }];
  const result = calculateLeaveEstimate({
    ordinaryWage: 3_500_000,
    periods: month,
    spousePeriods: month,
    childBirthDate: "2024-12-01",
    scheme: "sixPlusSix",
    sixPlusSixApplies: true,
  });
  assert.equal(result.hypothetical.total, 2_500_000);
  assert.equal(result.hypotheticalDifference, 0);
  const spouseResult = calculateLeaveEstimate({
    ordinaryWage: 3_500_000,
    periods: month,
    spousePeriods: month,
    childBirthDate: "2024-12-01",
    scheme: "sixPlusSix",
    sixPlusSixApplies: true,
  });
  assert.equal(spouseResult.hypothetical.total, 2_500_000);
});

test("sequential parents are shown as a conditional estimate, not confirmed eligibility", () => {
  const result = calculateLeaveEstimate({
    ordinaryWage: 3_500_000,
    periods: [{ startDate: "2025-01-01", endDate: "2025-03-31" }],
    spousePeriods: [{ startDate: "2025-05-01", endDate: "2025-07-31" }],
    childBirthDate: "2024-12-01",
    scheme: "sixPlusSix",
  });
  assert.equal(result.status, "conditional");
  assert.equal(result.sixPlusSixAssessment.verified, false);
  assert.match(result.message, /조건 충족을 가정/);
});

test("starting on the child's 18-month boundary is treated as within the window, pending official eligibility review", () => {
  const result = assessSixPlusSix({
    childBirthDate: "2024-01-01",
    ownPeriods: [{ startDate: "2025-07-01", endDate: "2025-09-30" }],
    spousePeriods: [{ startDate: "2025-07-01", endDate: "2025-09-30" }],
  });
  assert.equal(result.ageWindowAppearsMet, true);
  assert.equal(result.verified, false);
});

test("split leave periods accumulate legal-month use after a break", () => {
  const result = calculateLeaveEstimate({
    ordinaryWage: 3_500_000,
    periods: [
      { startDate: "2025-01-01", endDate: "2025-01-30" },
      { startDate: "2025-03-01", endDate: "2025-03-29" },
    ],
  });
  assert.equal(result.total, 5_000_000);
  assert.deepEqual([...new Set(result.months.flatMap(({ legalMonths }) => legalMonths))], [1, 2]);
});

test("unconfirmed leave beyond 12 months calculates the first 12 months and treats the rest as zero", () => {
  const periods = [{ startDate: "2025-01-01", endDate: "2026-06-30" }];
  const unconfirmed = calculateLeaveEstimate({ ordinaryWage: 3_500_000, periods });
  const confirmed = calculateLeaveEstimate({ ordinaryWage: 3_500_000, periods, extensionEligible: true });
  assert.equal(unconfirmed.status, "estimate");
  assert.equal(unconfirmed.total, 23_100_000);
  assert.equal(unconfirmed.paymentMonths.length, 12);
  assert.equal(unconfirmed.paymentMonths.at(-1).month, 12);
  assert.equal(unconfirmed.ignoredDays, 181);
  assert.equal(confirmed.total, 32_700_000);
  assert.equal(confirmed.ignoredDays, 0);
});

test("partial final month is prorated and displayed by calendar month and legal month", () => {
  const result = calculateLeaveEstimate({
    ordinaryWage: 3_500_000,
    periods: [{ startDate: "2025-01-01", endDate: "2025-01-15" }],
  });
  assert.equal(result.months[0].calendarMonth, "2025.01");
  assert.deepEqual(result.months[0].legalMonths, [1]);
  assert.equal(result.months[0].eligibleDays, 15);
  assert.equal(result.total, 1_209_677);
});

test("2 million won wage pays 2 million for each complete first-three-month period", () => {
  const result = calculateLeaveEstimate({
    ordinaryWage: 2_000_000,
    periods: [{ startDate: "2026-08-07", endDate: "2026-11-05" }],
    asOfDate: "2026-11-05",
  });
  assert.deepEqual(result.paymentMonths.map(({ amount, complete, eligibleDays, periodDays }) => ({
    amount, complete, eligibleDays, periodDays,
  })), [
    { amount: 2_000_000, complete: true, eligibleDays: 31, periodDays: 31 },
    { amount: 2_000_000, complete: true, eligibleDays: 30, periodDays: 30 },
    { amount: 1_935_484, complete: false, eligibleDays: 30, periodDays: 31 },
  ]);
  assert.equal(result.total, 5_935_484);
});

test("a past leave start in 2025 is calculated independently of the child's birth date", () => {
  const result = calculateLeaveEstimate({
    ordinaryWage: 2_000_000,
    periods: [{ startDate: "2025-08-07", endDate: "2025-09-06" }],
    asOfDate: "2026-11-05",
  });
  assert.equal(result.status, "estimate");
  assert.equal(result.total, 2_000_000);
  assert.equal(result.paymentMonths[0].month, 1);
  assert.equal(result.remaining, 0);
});

test("prorated benefit can be below the monthly minimum for a partial eligible month", () => {
  const result = calculateLeaveEstimate({
    ordinaryWage: 500_000,
    periods: [{ startDate: "2026-08-07", endDate: "2026-08-21" }],
  });
  assert.equal(result.paymentMonths[0].amount, 338_710);
  assert.equal(result.paymentMonths[0].complete, false);
  assert.equal(result.paymentMonths[0].floor, 700_000);
});

test("year boundary uses leave month sequence, not calendar-year reset", () => {
  const result = calculateLeaveEstimate({
    ordinaryWage: 3_500_000,
    periods: [{ startDate: "2025-12-01", endDate: "2026-02-28" }],
  });
  assert.equal(result.total, 7_500_000);
  assert.deepEqual(result.months.map(({ legalMonths }) => legalMonths[0]), [1, 2, 3]);
});

test("leap day is handled in the start-date-based legal month", () => {
  const result = calculateLeaveEstimate({
    ordinaryWage: 3_500_000,
    periods: [{ startDate: "2028-01-31", endDate: "2028-02-28" }],
  });
  assert.equal(result.total, 2_500_000);
  assert.equal(result.months.reduce((sum, month) => sum + month.eligibleDays, 0), 29);
});

test("pre-2025 starts require review instead of applying current rates", () => {
  const result = calculateLeaveEstimate({
    ordinaryWage: 3_500_000,
    periods: [{ startDate: "2024-12-01", endDate: "2024-12-31" }],
  });
  assert.equal(result.status, "review-required");
  assert.equal(result.total, null);
});

test("calculator monthly rates, caps, and floors match the shared published rules", () => {
  for (const [scheme, rules] of [
    ["standard", BENEFIT_RULES.standard],
    ["singleParent", BENEFIT_RULES.singleParent],
  ]) {
    for (const band of rules.bands) {
      for (let month = band.from; month <= band.through; month += 1) {
        assert.deepEqual(
          getBenefitRule(scheme, month),
          { rate: band.rate, cap: band.cap, floor: BENEFIT_RULES.monthlyFloor },
        );
        assert.deepEqual(
          calculateMonthlyAmount(10_000_000, month, scheme),
          {
            amount: band.cap,
            wageBasedAmount: 10_000_000 * band.rate,
            rate: band.rate,
            cap: band.cap,
            floor: BENEFIT_RULES.monthlyFloor,
            scheme,
            conditional: false,
          },
        );
      }
    }
  }
  for (const [index, cap] of BENEFIT_RULES.sixPlusSix.caps.entries()) {
    const month = index + 1;
    assert.deepEqual(
      calculateMonthlyAmount(10_000_000, month, "sixPlusSix", { sixPlusSixApplies: true }),
      {
        amount: cap,
        wageBasedAmount: 10_000_000,
        rate: 1,
        cap,
        floor: BENEFIT_RULES.monthlyFloor,
        scheme: "sixPlusSix",
        conditional: true,
      },
    );
  }
});

test("guide displays the calculator's shared rules dynamically and links official law", async () => {
  const [html, script, mainHtml] = await Promise.all([
    readFile(new URL("../guide.html", import.meta.url), "utf8"),
    readFile(new URL("../guide.js", import.meta.url), "utf8"),
    readFile(new URL("../index.html", import.meta.url), "utf8"),
  ]);
  assert.match(html, /id="benefit-rules-table"/);
  assert.match(html, /src="guide\.js\?v=1"/);
  assert.match(mainHtml, /app\.js\?v=7/);
  assert.match(script, /BENEFIT_RULES\.standard\.bands/);
  assert.match(script, /BENEFIT_RULES\.sixPlusSix\.caps/);
  assert.match(script, /BENEFIT_RULES\.singleParent\.bands/);
  assert.match(mainHtml, /id="child-birth-date" class="date-input" type="text" inputmode="numeric"/);
  assert.equal([...mainHtml.matchAll(/class="(?:period-start|period-end) date-input" type="text"/g)].length, 4);
  assert.match(mainHtml, /연도 4자리, 월 2자리, 일 2자리/);
  assert.match(await readFile(new URL("../app.js", import.meta.url), "utf8"), /function formatDateInput/);
  assert.doesNotMatch(mainHtml, /id="child-birth-date"[^>]*(?:min|max)=/);
  assert.match(html, /제70조/);
  assert.match(html, /제19조제6항/);
  assert.match(html, /7일 이상/);
  assert.match(html, /30일 이내/);
  assert.match(html, /일반 사후지급금과 다른 특례 정산/);
  assert.match(mainHtml, /제19조제6항/);
  assert.match(mainHtml, /첫 이용자 차액을 별도 정산/);
  assert.doesNotMatch(html, /현재 차수 선택|시작일은 달력월별 표시/);
  assert.doesNotMatch(html, /200만~450만 원/);
  assert.match(html, /2026년 11월 5일/);
  assert.match(html, /95조의3/);

  class Element {
    children = [];
    textContent = "";
    append(...children) {
      this.children.push(...children);
    }
  }
  const elements = new Map([
    ["#benefit-rules-table", new Element()],
    ["#full-month-formula", new Element()],
    ["#partial-month-formula", new Element()],
  ]);
  globalThis.document = {
    querySelector: (selector) => elements.get(selector),
    createElement: () => new Element(),
  };
  try {
    await import(`../guide.js?test=${Date.now()}`);
  } finally {
    delete globalThis.document;
  }
  const generatedRows = elements.get("#benefit-rules-table").children;
  assert.equal(generatedRows.length, 13);
  assert.deepEqual(
    generatedRows.slice(3, 9).map((row) => row.children[2].textContent),
    BENEFIT_RULES.sixPlusSix.caps.map((cap) => `100% · ${new Intl.NumberFormat("ko-KR").format(cap)}원`),
  );
  assert.match(elements.get("#full-month-formula").textContent, /700,000원/);
  assert.match(elements.get("#partial-month-formula").textContent, /지급대상 일수/);
});

test("privacy notice matches current input fields, storage, network behavior, and contact link", async () => {
  const [policy, mainHtml, app, styles] = await Promise.all([
    readFile(new URL("../privacy.html", import.meta.url), "utf8"),
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../app.js", import.meta.url), "utf8"),
    readFile(new URL("../styles.css", import.meta.url), "utf8"),
  ]);
  assert.match(policy, /@dalcong_mommy/);
  assert.match(policy, /instagram\.com\/dalcong_mommy/);
  assert.match(policy, /자녀 생년월일/);
  assert.match(policy, /배우자 월 통상임금/);
  assert.match(policy, /배우자의 시작일·종료일/);
  assert.match(policy, /localStorage·sessionStorage/);
  assert.match(policy, /Google Fonts/);
  assert.match(styles, /fonts\.googleapis\.com/);
  assert.doesNotMatch(app, /fetch\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|document\.cookie/);

  const inputNames = [...mainHtml.matchAll(/<input\b[^>]*\bname=["']([^"']+)["'][^>]*>/g)]
    .map((match) => match[1]);
  assert.deepEqual(inputNames, []);
});
