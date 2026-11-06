import { calculateLeaveEstimate } from "./calculator-core.mjs?v=2";

const form = document.querySelector("#calculator-form");
const salaryInput = document.querySelector("#salary");
const spouseSalaryInput = document.querySelector("#spouse-salary");
const ownPeriods = document.querySelector("#own-periods");
const spousePeriods = document.querySelector("#spouse-periods");
const sixPlusSixDetails = document.querySelector("#six-plus-six-details");
const formError = document.querySelector("#form-error");
const result = document.querySelector("#result");
const emptyResult = document.querySelector("#empty-result");
const calculatedResult = document.querySelector("#calculated-result");
const numberFormat = new Intl.NumberFormat("ko-KR");

function formatCurrencyInput(input) {
  input.addEventListener("input", () => {
    const cursor = input.selectionStart ?? input.value.length;
    const digitsBeforeCursor = input.value.slice(0, cursor).replace(/\D/g, "").length;
    const digits = input.value.replace(/\D/g, "");
    input.value = digits ? numberFormat.format(Number(digits)) : "";

    let nextCursor = 0;
    let digitsSeen = 0;
    while (nextCursor < input.value.length && digitsSeen < digitsBeforeCursor) {
      if (/\d/.test(input.value[nextCursor])) digitsSeen += 1;
      nextCursor += 1;
    }
    input.setSelectionRange(nextCursor, nextCursor);
  });
}

formatCurrencyInput(salaryInput);
formatCurrencyInput(spouseSalaryInput);

function formatDateInput(input) {
  input.addEventListener("input", () => {
    const cursor = input.selectionStart ?? input.value.length;
    const digitsBeforeCursor = input.value.slice(0, cursor).replace(/\D/g, "").length;
    const digits = input.value.replace(/\D/g, "").slice(0, 8);
    let formatted = digits.slice(0, 4);
    if (digits.length >= 4) formatted += "-";
    if (digits.length > 4) formatted += digits.slice(4, 6);
    if (digits.length >= 6) formatted += "-";
    if (digits.length > 6) formatted += digits.slice(6, 8);
    input.value = formatted;
    input.setSelectionRange(
      digitsBeforeCursor + (digitsBeforeCursor >= 4 ? 1 : 0) + (digitsBeforeCursor >= 6 ? 1 : 0),
      digitsBeforeCursor + (digitsBeforeCursor >= 4 ? 1 : 0) + (digitsBeforeCursor >= 6 ? 1 : 0),
    );
  });
}

function isValidDateInput(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

document.querySelectorAll(".date-input").forEach(formatDateInput);

function addPeriod(container) {
  const row = document.createElement("div");
  row.className = "period-row";
  for (const [label, className] of [["시작일", "period-start"], ["종료일", "period-end"]]) {
    const field = document.createElement("label");
    const caption = document.createElement("span");
    const input = document.createElement("input");
    caption.textContent = label;
    input.className = className;
    input.type = "text";
    input.inputMode = "numeric";
    input.maxLength = 10;
    input.placeholder = "YYYY-MM-DD";
    input.classList.add("date-input");
    formatDateInput(input);
    input.required = true;
    field.append(caption, input);
    row.append(field);
  }
  const remove = document.createElement("button");
  remove.className = "remove-period-button";
  remove.type = "button";
  remove.textContent = "기간 삭제";
  remove.setAttribute("aria-label", "추가한 육아휴직 기간 삭제");
  remove.addEventListener("click", () => row.remove());
  row.append(remove);
  container.append(row);
}

document.querySelector("#add-own-period").addEventListener("click", () => addPeriod(ownPeriods));
document.querySelector("#add-spouse-period").addEventListener("click", () => addPeriod(spousePeriods));

for (const input of document.querySelectorAll('.scheme-options input[type="radio"]')) {
  input.addEventListener("change", () => {
    const isSixPlusSix = input.value === "sixPlusSix" && input.checked;
    sixPlusSixDetails.hidden = !isSixPlusSix;
    spouseSalaryInput.required = isSixPlusSix;
  });
}

function collectPeriods(container, required, label) {
  const periods = [];
  for (const [index, row] of [...container.querySelectorAll(".period-row")].entries()) {
    const startDate = row.querySelector(".period-start").value;
    const endDate = row.querySelector(".period-end").value;
    if (!startDate && !endDate && index > 0) continue;
    if (!startDate && !endDate && !required) continue;
    if (!startDate || !endDate) throw new RangeError(`${label} 육아휴직 시작일과 종료일을 모두 입력해 주세요.`);
    if (!isValidDateInput(startDate) || !isValidDateInput(endDate)) {
      throw new RangeError(`${label} 날짜를 연도 4자리-월 2자리-일 2자리로 입력해 주세요.`);
    }
    periods.push({ startDate, endDate });
  }
  if (required && periods.length === 0) throw new RangeError(`${label} 육아휴직 기간을 입력해 주세요.`);
  return periods;
}

function showError(message) {
  formError.textContent = message;
  formError.hidden = false;
  formError.focus();
}

function renderComparison(container, own, spouse) {
  container.replaceChildren();
  const heading = document.createElement("h3");
  heading.textContent = "6+6 특례 조건 충족 가정 비교";
  container.append(heading);

  const list = document.createElement("dl");
  const rows = [
    ["본인 일반 급여 예상액", own.standard.total],
    ["본인 6+6 조건 가정액", own.hypothetical.total],
    ["배우자 일반 급여 예상액", spouse?.standard.total],
    ["배우자 6+6 조건 가정액", spouse?.hypothetical.total],
  ];
  for (const [label, amount] of rows) {
    if (amount === undefined) continue;
    const term = document.createElement("dt");
    const value = document.createElement("dd");
    term.textContent = label;
    value.textContent = `${numberFormat.format(amount)}원`;
    list.append(term, value);
  }
  const difference = document.createElement("p");
  difference.className = "comparison-total";
  difference.textContent = `본인 기준 차이 ${numberFormat.format(own.hypotheticalDifference)}원`;
  if (spouse) {
    const total = document.createElement("p");
    total.className = "comparison-total";
    total.textContent = `부모 합산 조건 가정액 ${numberFormat.format(own.hypothetical.total + spouse.hypothetical.total)}원 · 일반 기준 합산 예상액 ${numberFormat.format(own.standard.total + spouse.standard.total)}원`;
    const spouseDifference = document.createElement("p");
    spouseDifference.className = "comparison-total";
    spouseDifference.textContent = `배우자 기준 차이 ${numberFormat.format(spouse.hypotheticalDifference)}원`;
    container.append(list, difference, spouseDifference, total);
  } else {
    container.append(list, difference);
  }
  for (const [label, estimate] of [["본인", own], ...(spouse ? [["배우자", spouse]] : [])]) {
    const subheading = document.createElement("h4");
    subheading.textContent = `${label} 월별 일반 기준 / 6+6 가정액`;
    const monthlyList = document.createElement("div");
    monthlyList.className = "comparison-monthly-list";
    estimate.standard.months.forEach((month, index) => {
      const specialMonth = estimate.hypothetical.months[index];
      const row = document.createElement("p");
      row.textContent = `${month.calendarMonth} · ${month.legalMonths.map((number) => `${number}개월 차`).join(", ")}: ${numberFormat.format(month.amount)}원 / ${numberFormat.format(specialMonth?.amount ?? 0)}원`;
      monthlyList.append(row);
    });
    container.append(subheading, monthlyList);
  }
  const note = document.createElement("p");
  note.className = "comparison-note";
  note.textContent = "조건 가정액은 수급 확정액이 아닙니다. 첫 이용자에게 나중에 지급될 수 있는 특례 차액은 월별 급여·실제 입금시기와 별개이며, 부모별 지급 구조와 시기는 고용센터에서 확인해야 합니다.";
  container.append(note);
  container.hidden = false;
}

function renderMonths(monthly, list, heading, subheading) {
  heading.textContent = "법정 지급대상 월별 계산";
  subheading.textContent = "달력월별 합계가 아닌 휴직 시작일 기준 월 차수";
  list.replaceChildren();
  for (const month of monthly) {
    const row = document.createElement("div");
    row.className = "month-row";
    const details = document.createElement("div");
    details.className = "month-row-details";
    const label = document.createElement("span");
    label.textContent = `${month.month}개월 차 · 달력월 ${month.calendarMonths.join(", ")}`;
    const formula = document.createElement("small");
    const floorText = month.complete
      ? `월 하한 ${numberFormat.format(month.floor)}원 적용`
      : `부분 월 ${month.eligibleDays}/${month.periodDays}일 · 월 하한 ${numberFormat.format(month.floor)}원도 일할 계산`;
    formula.textContent = `${month.rate * 100}% · 상한 ${numberFormat.format(month.cap)}원 · ${floorText}`;
    const amount = document.createElement("strong");
    amount.textContent = `${numberFormat.format(month.amount)}원`;
    details.append(label, formula);
    row.append(details, amount);
    list.append(row);
  }
}

function calculate(event) {
  event.preventDefault();
  formError.hidden = true;
  calculatedResult.hidden = true;
  emptyResult.hidden = false;
  const salary = Number(salaryInput.value.replaceAll(",", ""));
  const selectedScheme = form.querySelector('.scheme-options input[type="radio"]:checked').value;
  const isSixPlusSix = selectedScheme === "sixPlusSix";

  try {
    if (!Number.isFinite(salary) || salary <= 0 || salary > 100_000_000) {
      throw new RangeError("월 통상임금을 0원 초과, 100,000,000원 이하로 입력해 주세요.");
    }
    const ownSchedule = collectPeriods(ownPeriods, true, "본인");
    const spouseSchedule = collectPeriods(spousePeriods, isSixPlusSix, "배우자");
    const childBirthDate = document.querySelector("#child-birth-date").value;
    if (isSixPlusSix && !childBirthDate) {
      throw new RangeError("6+6 조건 가정액 비교를 위해 자녀 생년월일을 입력해 주세요.");
    }
    const spouseSalary = Number(spouseSalaryInput.value.replaceAll(",", ""));
    if (isSixPlusSix && (!Number.isFinite(spouseSalary) || spouseSalary <= 0 || spouseSalary > 100_000_000)) {
      throw new RangeError("6+6 부모별 예상액을 계산하려면 배우자 월 통상임금을 0원 초과, 100,000,000원 이하로 입력해 주세요.");
    }
    if (childBirthDate && !isValidDateInput(childBirthDate)) {
      throw new RangeError("자녀 생년월일을 연도 4자리-월 2자리-일 2자리로 입력해 주세요.");
    }
    const extensionEligible = [
      "#extension-parent",
      "#extension-single-parent",
      "#extension-disabled-child",
    ].some((selector) => document.querySelector(selector).checked);
    const asOfDate = new Date().toISOString().slice(0, 10);
    const estimate = calculateLeaveEstimate({
      ordinaryWage: salary,
      periods: ownSchedule,
      scheme: selectedScheme,
      extensionEligible,
      childBirthDate,
      spousePeriods: spouseSchedule,
      asOfDate,
    });
    if (estimate.status !== "estimate" && estimate.status !== "conditional") {
      throw new RangeError(estimate.message);
    }

    const standardResult = selectedScheme === "sixPlusSix" ? estimate.standard : estimate;
    document.querySelector("#result-caption").textContent = selectedScheme === "sixPlusSix"
      ? "일반 육아휴직 기준 참고 예상액"
      : selectedScheme === "singleParent"
        ? "한부모 법정 자격 충족 가정 예상액"
        : "일반 육아휴직 예상액";
    document.querySelector("#total-amount").textContent = numberFormat.format(standardResult.total);
    document.querySelector("#result-meta").textContent = `전체 입력 기간 ${numberFormat.format(standardResult.total)}원 · 오늘 이후 잔여 기간 ${numberFormat.format(standardResult.remaining)}원 · 월 통상임금 ${numberFormat.format(salary)}원`;

    const notice = document.querySelector("#result-notice");
    if (isSixPlusSix) {
      const spouseEstimate = calculateLeaveEstimate({
        ordinaryWage: spouseSalary,
        periods: spouseSchedule,
        scheme: "sixPlusSix",
        extensionEligible,
        childBirthDate,
        spousePeriods: ownSchedule,
        asOfDate,
      });
      renderComparison(document.querySelector("#comparison-result"), estimate, spouseEstimate);
      const assessment = estimate.sixPlusSixAssessment;
      const ageMessage = assessment.ageWindowAppearsMet === true
        ? "입력된 부모의 시작일은 생후 18개월 기준일 범위에 있습니다."
        : "입력된 일정이 생후 18개월 요건에 해당하는지 확인이 필요합니다.";
      notice.textContent = `${ageMessage} 6+6 특례 충족 가정 비교입니다. 본인과 배우자 각각의 급여 및 부모 합산 예상액을 표시합니다. 고용보험 피보험단위기간 등 급여 자격은 미확인입니다. 분할·합산 인정, 경과규정, 첫 이용자 차액 지급 시점은 관할 고용센터에서 확인해 주세요.`;
      notice.hidden = false;
    } else {
      document.querySelector("#comparison-result").hidden = true;
      notice.textContent = selectedScheme === "singleParent"
        ? "한부모 특례와 고용보험 급여 자격 충족을 가정한 예상액입니다. 가족 형태 선택만으로 수급 자격이 확인되는 것은 아니며, 피보험단위기간 등은 미확인입니다."
        : extensionEligible
          ? "18개월 계산은 연장 자격을 충족한다고 입력한 경우의 예상액입니다. 고용보험 급여 자격도 미확인입니다. 6+6 급여 특례와는 별도로 판단합니다."
          : "고용보험 피보험단위기간 등 지급 자격이 미확인된 조건 가정 예상액입니다. 최종 자격과 지급액은 관할 고용센터에서 결정합니다.";
      notice.hidden = false;
    }

    renderMonths(
      standardResult.paymentMonths,
      document.querySelector("#monthly-list"),
      document.querySelector(".monthly-heading h3"),
      document.querySelector(".monthly-heading span"),
    );
    if (standardResult.ignoredDays > 0) {
      notice.textContent += ` 법정 계산기간을 넘는 ${numberFormat.format(standardResult.ignoredDays)}일은 0원으로 처리하고 앞의 ${extensionEligible ? 18 : 12}개월까지만 합산했습니다.`;
      notice.hidden = false;
    }
    if (selectedScheme === "sixPlusSix") {
      document.querySelector(".monthly-heading h3").textContent = "일반 기준 월별 비교";
    }
    emptyResult.hidden = true;
    calculatedResult.hidden = false;
    result.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (error) {
    showError(error instanceof Error ? error.message : "입력값을 확인해 주세요.");
  }
}

form.addEventListener("submit", calculate);
