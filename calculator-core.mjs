export const MONTHLY_FLOOR = 700_000;

const STANDARD_BRACKETS = [
  { through: 3, rate: 1, cap: 2_500_000 },
  { through: 6, rate: 1, cap: 2_000_000 },
  { through: 18, rate: 0.8, cap: 1_600_000 },
];

const SINGLE_PARENT_BRACKETS = [
  { through: 3, rate: 1, cap: 3_000_000 },
  { through: 6, rate: 1, cap: 2_000_000 },
  { through: 18, rate: 0.8, cap: 1_600_000 },
];

const SIX_PLUS_SIX_CAPS = [2_500_000, 2_500_000, 3_000_000, 3_500_000, 4_000_000, 4_500_000];
const DAY_MS = 24 * 60 * 60 * 1000;

function parseDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? date
    : null;
}

function addCalendarMonths(date, count) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + count;
  const targetYear = year + Math.floor(month / 12);
  const targetMonth = ((month % 12) + 12) % 12;
  const day = Math.min(date.getUTCDate(), new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate());
  return new Date(Date.UTC(targetYear, targetMonth, day));
}

function getBracket(month, scheme, sixPlusSixApplies) {
  if (scheme === "sixPlusSix" && sixPlusSixApplies && month <= 6) {
    return { rate: 1, cap: SIX_PLUS_SIX_CAPS[month - 1] };
  }
  const brackets = scheme === "singleParent" ? SINGLE_PARENT_BRACKETS : STANDARD_BRACKETS;
  return brackets.find((bracket) => month <= bracket.through);
}

export function calculateMonthlyAmount(ordinaryWage, month, scheme = "standard", options = {}) {
  if (!Number.isFinite(ordinaryWage) || ordinaryWage <= 0) {
    throw new RangeError("통상임금은 0보다 커야 합니다.");
  }
  if (!Number.isInteger(month) || month < 1 || month > 18) {
    throw new RangeError("육아휴직 차수는 1~18개월이어야 합니다.");
  }
  if (!["standard", "sixPlusSix", "singleParent"].includes(scheme)) {
    throw new RangeError("지원 제도를 확인해 주세요.");
  }
  const bracket = getBracket(month, scheme, options.sixPlusSixApplies === true);
  return {
    amount: Math.max(MONTHLY_FLOOR, Math.min(ordinaryWage * bracket.rate, bracket.cap)),
    wageBasedAmount: ordinaryWage * bracket.rate,
    rate: bracket.rate,
    cap: bracket.cap,
    floor: MONTHLY_FLOOR,
    scheme: scheme === "sixPlusSix" && options.sixPlusSixApplies !== true ? "standard" : scheme,
    conditional: scheme === "sixPlusSix" && options.sixPlusSixApplies === true,
  };
}

function validatePeriods(periods, label) {
  if (!Array.isArray(periods) || periods.length === 0) {
    throw new RangeError(`${label} 육아휴직 시작일과 종료일을 입력해 주세요.`);
  }
  const parsed = periods.map(({ startDate, endDate }) => {
    const start = parseDate(startDate);
    const end = parseDate(endDate);
    if (!start || !end || end < start) {
      throw new RangeError(`${label} 육아휴직 날짜를 확인해 주세요.`);
    }
    return { start, end };
  }).sort((a, b) => a.start - b.start);
  for (let index = 1; index < parsed.length; index += 1) {
    if (parsed[index].start <= parsed[index - 1].end) {
      throw new RangeError(`${label} 육아휴직 기간이 서로 겹칩니다.`);
    }
  }
  return parsed;
}

function wholeDays(start, end) {
  return Math.round((end - start) / DAY_MS) + 1;
}

function monthsCompleted(anchor, date) {
  let months = (date.getUTCFullYear() - anchor.getUTCFullYear()) * 12
    + date.getUTCMonth() - anchor.getUTCMonth();
  while (months > 0 && addCalendarMonths(anchor, months) > date) months -= 1;
  return months;
}

function addDays(date, days) {
  return new Date(date.getTime() + days * DAY_MS);
}

function formatMonth(date) {
  return `${date.getUTCFullYear()}.${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function calculateForPeriods(ordinaryWage, periods, scheme, sixPlusSixApplies, maxMonths, asOfDate) {
  const firstStart = periods[0].start;
  const rows = new Map();
  let cumulativeDaysBeforePeriod = 0;
  let totalDays = 0;
  let remaining = 0;
  const asOf = asOfDate ? parseDate(asOfDate) : null;

  for (const period of periods) {
    for (let offset = 0; offset < wholeDays(period.start, period.end); offset += 1) {
      const date = addDays(period.start, offset);
      const virtualDate = addDays(firstStart, cumulativeDaysBeforePeriod + offset);
      const month = monthsCompleted(firstStart, virtualDate) + 1;
      if (month > maxMonths) continue;

      const legalMonthStart = addCalendarMonths(firstStart, month - 1);
      const legalMonthEnd = addCalendarMonths(firstStart, month);
      const legalMonthDays = Math.round((legalMonthEnd - legalMonthStart) / DAY_MS);
      const bracket = calculateMonthlyAmount(ordinaryWage, month, scheme, { sixPlusSixApplies });
      const key = formatMonth(date);
      const row = rows.get(key) ?? {
        calendarMonth: key,
        legalMonths: new Map(),
        eligibleDays: 0,
        amount: 0,
      };
      const legalDetail = row.legalMonths.get(month) ?? {
        month,
        eligibleDays: 0,
        amount: 0,
        rate: bracket.rate,
        cap: bracket.cap,
        floor: bracket.floor,
        wageBasedAmount: bracket.wageBasedAmount,
        periodDays: legalMonthDays,
      };
      legalDetail.eligibleDays += 1;
      legalDetail.amount += bracket.amount / legalMonthDays;
      row.legalMonths.set(month, legalDetail);
      row.eligibleDays += 1;
      row.amount += bracket.amount / legalMonthDays;
      if (!asOf || date >= asOf) remaining += bracket.amount / legalMonthDays;
      rows.set(key, row);
      totalDays += 1;
    }
    cumulativeDaysBeforePeriod += wholeDays(period.start, period.end);
  }

  return {
    total: Math.round([...rows.values()].reduce((sum, row) => sum + row.amount, 0)),
    remaining: Math.round(remaining),
    eligibleDays: totalDays,
    months: [...rows.values()].map((row) => ({
      calendarMonth: row.calendarMonth,
      legalMonths: [...row.legalMonths.keys()].sort((a, b) => a - b),
      eligibleDays: row.eligibleDays,
      amount: Math.round(row.amount),
      legalMonthDetails: [...row.legalMonths.values()].map((detail) => ({
        ...detail,
        amount: Math.round(detail.amount),
      })),
    })),
  };
}

function accumulatedUsageMonths(periods) {
  const firstStart = periods[0].start;
  const days = periods.reduce((sum, period) => sum + wholeDays(period.start, period.end), 0);
  return monthsCompleted(firstStart, addDays(firstStart, Math.max(0, days - 1)));
}

export function assessSixPlusSix({ childBirthDate, ownPeriods, spousePeriods }) {
  const birth = parseDate(childBirthDate);
  if (!birth || !Array.isArray(ownPeriods) || !Array.isArray(spousePeriods)
      || ownPeriods.length === 0 || spousePeriods.length === 0) {
    return {
      status: "incomplete",
      verified: false,
      reasons: ["자녀 생년월일과 부모 각각의 육아휴직 기간을 모두 입력해야 합니다."],
    };
  }
  const own = validatePeriods(ownPeriods, "본인");
  const spouse = validatePeriods(spousePeriods, "배우자");
  const ageLimit = addCalendarMonths(birth, 18);
  const ownTimely = own.some((period) => period.start <= ageLimit);
  const spouseTimely = spouse.some((period) => period.start <= ageLimit);
  const reasons = [
    ...(!ownTimely || !spouseTimely
      ? ["부모 각각의 사용 시작일이 자녀 생후 18개월 요건에 해당하는지 확인이 필요합니다."]
      : []),
    "부모 각각 3개월 이상 사용 요건, 분할·합산 인정 여부와 경과규정은 입력만으로 확정할 수 없습니다.",
  ];
  return {
    status: "review-required",
    ageWindowAppearsMet: ownTimely && spouseTimely,
    verified: false,
    reasons,
  };
}

export function calculateLeaveEstimate({
  ordinaryWage,
  periods,
  scheme = "standard",
  extensionEligible = false,
  sixPlusSixApplies = false,
  childBirthDate,
  spousePeriods,
  asOfDate,
}) {
  const parsed = validatePeriods(periods, "본인");
  const firstStart = parsed[0].start;
  if (firstStart < parseDate("2025-01-01")) {
    return {
      status: "review-required",
      total: null,
      message: "2025년 이전 시작 휴직은 적용 법령과 경과규정을 확인할 수 없어 자동 계산하지 않습니다.",
    };
  }
  const maxMonths = extensionEligible ? 18 : 12;
  const usageMonths = accumulatedUsageMonths(parsed);
  if (!extensionEligible && usageMonths >= 12) {
    return {
      status: "extension-unconfirmed",
      total: null,
      message: "12개월 초과 기간은 연장 자격이 확인되지 않아 계산하지 않습니다.",
    };
  }
  if (usageMonths >= 18) {
    return {
      status: "beyond-limit",
      total: null,
      message: "법정 최대 18개월을 넘는 기간은 계산하지 않습니다.",
    };
  }
  if (scheme === "sixPlusSix") {
    const assessment = assessSixPlusSix({ childBirthDate, ownPeriods: periods, spousePeriods });
    const standard = calculateForPeriods(ordinaryWage, parsed, "standard", false, maxMonths, asOfDate);
    const hypothetical = calculateForPeriods(ordinaryWage, parsed, "sixPlusSix", true, maxMonths, asOfDate);
    return {
      status: "conditional",
      total: standard.total,
      standard,
      hypothetical,
      hypotheticalDifference: hypothetical.total - standard.total,
      sixPlusSixAssessment: assessment,
      message: "일반 급여와 6+6 조건 충족을 가정한 예상액입니다. 특례 자격과 첫 육아휴직자 차액 지급 시점은 고용센터 확인이 필요합니다.",
    };
  }
  const result = calculateForPeriods(ordinaryWage, parsed, scheme, false, maxMonths, asOfDate);
  return { status: "estimate", ...result };
}

export function calculateFullMonths(ordinaryWage, months, scheme = "standard", options = {}) {
  if (!Number.isInteger(months) || months < 1 || months > 18) {
    throw new RangeError("계산 개월 수는 1~18개월이어야 합니다.");
  }
  const monthly = Array.from({ length: months }, (_, index) => ({
    month: index + 1,
    ...calculateMonthlyAmount(ordinaryWage, index + 1, scheme, options),
  }));
  return { monthly, total: monthly.reduce((sum, row) => sum + row.amount, 0) };
}
