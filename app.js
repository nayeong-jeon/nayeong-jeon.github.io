const RATE_LIMITS = {
  standard: [
    { through: 3, cap: 2_500_000 },
    { through: 6, cap: 2_000_000 },
    { through: 12, cap: 1_600_000 },
  ],
  sixPlusSix: [2_000_000, 2_500_000, 3_000_000, 3_500_000, 4_000_000, 4_500_000],
  singleParent: [
    { through: 3, cap: 3_000_000 },
    { through: 6, cap: 2_000_000 },
    { through: 12, cap: 1_600_000 },
  ],
};

const form = document.querySelector("#calculator-form");
const salaryInput = document.querySelector("#salary");
const startDateInput = document.querySelector("#start-date");
const durationSelect = document.querySelector("#duration");
const currentMonthSelect = document.querySelector("#current-month");
const sixPlusSixCheck = document.querySelector("#six-plus-six-check");
const partnerEligibleInput = document.querySelector("#partner-eligible");
const formError = document.querySelector("#form-error");
const result = document.querySelector("#result");
const emptyResult = document.querySelector("#empty-result");
const calculatedResult = document.querySelector("#calculated-result");
const numberFormat = new Intl.NumberFormat("ko-KR");

salaryInput.addEventListener("input", () => {
  const cursor = salaryInput.selectionStart ?? salaryInput.value.length;
  const digitsBeforeCursor = salaryInput.value.slice(0, cursor).replace(/\D/g, "").length;
  const digits = salaryInput.value.replace(/\D/g, "");
  salaryInput.value = digits ? numberFormat.format(Number(digits)) : "";

  let nextCursor = 0;
  let digitsSeen = 0;
  while (nextCursor < salaryInput.value.length && digitsSeen < digitsBeforeCursor) {
    if (/\d/.test(salaryInput.value[nextCursor])) digitsSeen += 1;
    nextCursor += 1;
  }
  salaryInput.setSelectionRange(nextCursor, nextCursor);
});

function populateMonthOptions(select, first, last) {
  const previous = Number(select.value) || first;
  select.replaceChildren();
  for (let month = first; month <= last; month += 1) {
    const option = document.createElement("option");
    option.value = String(month);
    option.textContent = `${month}개월`;
    select.append(option);
  }
  select.value = String(Math.min(Math.max(previous, first), last));
}

populateMonthOptions(durationSelect, 1, 12);
populateMonthOptions(currentMonthSelect, 1, 12);
startDateInput.value = new Date().toISOString().slice(0, 10);

durationSelect.addEventListener("change", () => {
  populateMonthOptions(currentMonthSelect, 1, Number(durationSelect.value));
});

for (const schemeInput of document.querySelectorAll('input[name="scheme"]')) {
  schemeInput.addEventListener("change", () => {
    const isSixPlusSix = schemeInput.checked && schemeInput.value === "sixPlusSix";
    if (isSixPlusSix) {
      sixPlusSixCheck.hidden = false;
    } else if (schemeInput.checked) {
      sixPlusSixCheck.hidden = true;
      partnerEligibleInput.checked = false;
    }
  });
}

function capForMonth(scheme, month, sixPlusSixEligible) {
  if (scheme === "sixPlusSix" && sixPlusSixEligible && month <= 6) {
    return RATE_LIMITS.sixPlusSix[month - 1];
  }
  const rates = scheme === "singleParent" ? RATE_LIMITS.singleParent : RATE_LIMITS.standard;
  return rates.find((rate) => month <= rate.through).cap;
}

function formatMonth(startDate, monthNumber) {
  const date = new Date(startDate);
  const targetMonth = date.getMonth() + monthNumber - 1;
  const targetYear = date.getFullYear() + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(targetYear, normalizedMonth + 1, 0).getDate();
  date.setFullYear(targetYear, normalizedMonth, Math.min(date.getDate(), lastDay));
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getSchemeLabel(scheme, eligible) {
  if (scheme === "singleParent") return "한부모 특례";
  if (scheme === "sixPlusSix" && eligible) return "6+6 부모육아휴직제";
  if (scheme === "sixPlusSix") return "일반 육아휴직 급여 기준";
  return "일반 육아휴직";
}

function showError(message) {
  formError.textContent = message;
  formError.hidden = false;
}

function calculate(event) {
  event.preventDefault();
  formError.hidden = true;

  const salary = Number(salaryInput.value.replaceAll(",", ""));
  const duration = Number(durationSelect.value);
  const firstMonth = Number(currentMonthSelect.value);
  const scheme = new FormData(form).get("scheme");
  const sixPlusSixEligible = scheme === "sixPlusSix" && partnerEligibleInput.checked;
  const startDate = new Date(`${startDateInput.value}T00:00:00`);

  if (!Number.isFinite(salary) || salary <= 0 || salary > 100_000_000) {
    showError("월 통상임금을 0원 초과, 100,000,000원 이하로 입력해 주세요.");
    salaryInput.focus();
    return;
  }
  if (!startDateInput.value || Number.isNaN(startDate.getTime())) {
    showError("육아휴직 시작일을 확인해 주세요.");
    startDateInput.focus();
    return;
  }
  if (firstMonth > duration) {
    showError("계산 시작 차수는 전체 휴직 기간보다 클 수 없습니다.");
    currentMonthSelect.focus();
    return;
  }

  const months = [];
  for (let month = firstMonth; month <= duration; month += 1) {
    const cap = capForMonth(scheme, month, sixPlusSixEligible);
    months.push({
      month,
      date: formatMonth(startDate, month),
      amount: Math.min(salary, cap),
      cap,
    });
  }

  const total = months.reduce((sum, month) => sum + month.amount, 0);
  document.querySelector("#result-caption").textContent = `${getSchemeLabel(scheme, sixPlusSixEligible)} · ${months.length}개월 예상`;
  document.querySelector("#total-amount").textContent = numberFormat.format(total);
  document.querySelector("#result-meta").textContent = `월 통상임금 ${numberFormat.format(salary)}원 기준`;

  const notice = document.querySelector("#result-notice");
  if (scheme === "sixPlusSix" && !sixPlusSixEligible) {
    notice.textContent = "6+6 적용 조건을 선택하지 않아 일반 급여 상한으로 계산했어요. 자녀 연령과 부모 각각의 사용 조건을 고용24에서 확인해 주세요.";
    notice.hidden = false;
  } else {
    notice.hidden = true;
  }

  const list = document.querySelector("#monthly-list");
  list.replaceChildren();
  for (const month of months) {
    const row = document.createElement("div");
    row.className = "month-row";
    const label = document.createElement("span");
    label.textContent = `${month.month}개월 차 · ${month.date}`;
    const amount = document.createElement("strong");
    amount.textContent = `${numberFormat.format(month.amount)}원`;
    row.append(label, amount);
    list.append(row);
  }

  emptyResult.hidden = true;
  calculatedResult.hidden = false;
  result.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

form.addEventListener("submit", calculate);
