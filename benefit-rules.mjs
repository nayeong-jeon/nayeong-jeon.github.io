export const BENEFIT_RULES = {
  monthlyFloor: 700_000,
  standard: {
    label: "일반 육아휴직급여",
    bands: [
      { from: 1, through: 3, rate: 1, cap: 2_500_000 },
      { from: 4, through: 6, rate: 1, cap: 2_000_000 },
      { from: 7, through: 18, rate: 0.8, cap: 1_600_000 },
    ],
  },
  sixPlusSix: {
    label: "6+6 부모육아휴직제",
    caps: [2_500_000, 2_500_000, 3_000_000, 3_500_000, 4_000_000, 4_500_000],
    rate: 1,
    firstMonth: 1,
    lastMonth: 6,
  },
  singleParent: {
    label: "한부모 특례",
    bands: [
      { from: 1, through: 3, rate: 1, cap: 3_000_000 },
      { from: 4, through: 6, rate: 1, cap: 2_000_000 },
      { from: 7, through: 18, rate: 0.8, cap: 1_600_000 },
    ],
  },
};

export function getBenefitRule(scheme, month, sixPlusSixApplies = false) {
  if (scheme === "sixPlusSix" && sixPlusSixApplies && month <= BENEFIT_RULES.sixPlusSix.lastMonth) {
    return {
      rate: BENEFIT_RULES.sixPlusSix.rate,
      cap: BENEFIT_RULES.sixPlusSix.caps[month - 1],
      floor: BENEFIT_RULES.monthlyFloor,
    };
  }
  const activeScheme = scheme === "singleParent" ? "singleParent" : "standard";
  const band = BENEFIT_RULES[activeScheme].bands.find(({ from, through }) => month >= from && month <= through);
  return { rate: band.rate, cap: band.cap, floor: BENEFIT_RULES.monthlyFloor };
}

export function formatRuleAmount(amount) {
  return `${new Intl.NumberFormat("ko-KR").format(amount)}원`;
}
