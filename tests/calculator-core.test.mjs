import test from "node:test";
import assert from "node:assert/strict";
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

test("18-month extension is refused unless eligibility is confirmed", () => {
  const periods = [{ startDate: "2025-01-01", endDate: "2026-06-30" }];
  const unconfirmed = calculateLeaveEstimate({ ordinaryWage: 3_500_000, periods });
  const confirmed = calculateLeaveEstimate({ ordinaryWage: 3_500_000, periods, extensionEligible: true });
  assert.equal(unconfirmed.status, "extension-unconfirmed");
  assert.equal(confirmed.total, 32_700_000);
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
