const STORAGE_KEY = "andiamo-tip-distribution-v1";
const currency = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" });
const dateFormat = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short" });

const defaultState = {
  staff: [],
  weeks: {},
  selectedWeekStart: toDateInput(getMonday(new Date())),
};

let state = loadState();

const elements = {
  weekRangeLabel: document.querySelector("#weekRangeLabel"),
  heroTotalTips: document.querySelector("#heroTotalTips"),
  heroSplit: document.querySelector("#heroSplit"),
  exportExcel: document.querySelector("#exportExcel"),
  weekStart: document.querySelector("#weekStart"),
  cardTips: document.querySelector("#cardTips"),
  cashTips: document.querySelector("#cashTips"),
  fohSplit: document.querySelector("#fohSplit"),
  bohSplit: document.querySelector("#bohSplit"),
  staffForm: document.querySelector("#staffForm"),
  staffName: document.querySelector("#staffName"),
  staffList: document.querySelector("#staffList"),
  shiftForm: document.querySelector("#shiftForm"),
  shiftDate: document.querySelector("#shiftDate"),
  shiftStaff: document.querySelector("#shiftStaff"),
  shiftArea: document.querySelector("#shiftArea"),
  fohFields: document.querySelector("#fohFields"),
  bohFields: document.querySelector("#bohFields"),
  fohRole: document.querySelector("#fohRole"),
  fohLevel: document.querySelector("#fohLevel"),
  fohDuration: document.querySelector("#fohDuration"),
  bohCategory: document.querySelector("#bohCategory"),
  bohDuration: document.querySelector("#bohDuration"),
  shiftPointsPreview: document.querySelector("#shiftPointsPreview"),
  summaryCard: document.querySelector("#summaryCard"),
  summaryCash: document.querySelector("#summaryCash"),
  summaryTotal: document.querySelector("#summaryTotal"),
  summaryFohPool: document.querySelector("#summaryFohPool"),
  summaryBohPool: document.querySelector("#summaryBohPool"),
  summaryPoints: document.querySelector("#summaryPoints"),
  staffSummaryBody: document.querySelector("#staffSummaryBody"),
  shiftList: document.querySelector("#shiftList"),
  toast: document.querySelector("#toast"),
};

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return { ...defaultState, ...saved };
  } catch {
    return { ...defaultState };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getCurrentWeek() {
  const key = state.selectedWeekStart;
  if (!state.weeks[key]) {
    state.weeks[key] = {
      cardTips: 0,
      cashTips: 0,
      fohSplit: 70,
      bohSplit: 30,
      shifts: [],
    };
  }
  return state.weeks[key];
}

function getMonday(date) {
  const value = new Date(date);
  const day = value.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  value.setDate(value.getDate() + offset);
  value.setHours(0, 0, 0, 0);
  return value;
}

function addDays(dateInput, days) {
  const value = parseLocalDate(dateInput);
  value.setDate(value.getDate() + days);
  return value;
}

function parseLocalDate(input) {
  const [year, month, day] = input.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dollarsToCents(value) {
  return Math.round((Number(value) || 0) * 100);
}

function centsToDollars(cents) {
  return (Number(cents) || 0) / 100;
}

function money(value) {
  return currency.format(centsToDollars(dollarsToCents(value)));
}

function moneyFromCents(cents) {
  return currency.format(centsToDollars(cents));
}

function percentToBasisPoints(value) {
  return Math.round((Number(value) || 0) * 100);
}

function roundCents(value) {
  return centsToDollars(dollarsToCents(value));
}

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  window.setTimeout(() => elements.toast.classList.remove("visible"), 1800);
}

function getFohPoints(role, level, duration) {
  const map = {
    Manager: { over: { high: 6, low: 4 }, under: { high: 4, low: 3 } },
    Waiter: { over: { high: 4, low: 3 }, under: { high: 3, low: 2 } },
  };
  return map[role][duration][level];
}

function getBohPoints(category, duration) {
  const map = {
    Senior: { full: 4, half: 2 },
    "Non-senior": { full: 2, half: 1 },
  };
  return map[category][duration];
}

function calculateShiftPoints(shift) {
  if (shift.area === "FOH") {
    return getFohPoints(shift.fohRole, shift.fohLevel, shift.fohDuration);
  }
  return getBohPoints(shift.bohCategory, shift.bohDuration);
}

function comparePayoutPriority(a, b, pointsKey) {
  return b[pointsKey] - a[pointsKey] || a.name.localeCompare(b.name) || a.staffId.localeCompare(b.staffId);
}

function distributePoolCents(rows, poolCents, pointsKey, payoutKey) {
  rows.forEach((row) => {
    row[payoutKey] = 0;
  });

  const eligibleRows = rows.filter((row) => row[pointsKey] > 0);
  const totalPoints = eligibleRows.reduce((sum, row) => sum + row[pointsKey], 0);
  if (!poolCents || !totalPoints) return;

  let distributedCents = 0;
  eligibleRows.forEach((row) => {
    const baseCents = Math.floor((poolCents * row[pointsKey]) / totalPoints);
    row[payoutKey] = baseCents;
    distributedCents += baseCents;
  });

  let leftoverCents = poolCents - distributedCents;
  const priorityRows = [...eligibleRows].sort((a, b) => comparePayoutPriority(a, b, pointsKey));
  let index = 0;
  while (leftoverCents > 0) {
    priorityRows[index % priorityRows.length][payoutKey] += 1;
    leftoverCents -= 1;
    index += 1;
  }
}

function getCalculations() {
  const week = getCurrentWeek();
  const cardTipsCents = dollarsToCents(week.cardTips);
  const cashTipsCents = dollarsToCents(week.cashTips);
  const totalTipsCents = cardTipsCents + cashTipsCents;
  const fohSplitBasisPoints = percentToBasisPoints(week.fohSplit);
  const bohSplitBasisPoints = percentToBasisPoints(week.bohSplit);
  const fohPoolCents = Math.round((totalTipsCents * fohSplitBasisPoints) / 10000);
  const bohPoolCents = totalTipsCents - fohPoolCents;
  const totals = new Map();
  let fohPoints = 0;
  let bohPoints = 0;

  week.shifts.forEach((shift) => {
    const points = calculateShiftPoints(shift);
    const row = totals.get(shift.staffId) || { staffId: shift.staffId, fohPoints: 0, bohPoints: 0 };
    if (shift.area === "FOH") {
      row.fohPoints += points;
      fohPoints += points;
    } else {
      row.bohPoints += points;
      bohPoints += points;
    }
    totals.set(shift.staffId, row);
  });

  const staffRows = Array.from(totals.values()).map((row) => ({
    ...row,
    name: getStaffName(row.staffId),
    totalPoints: row.fohPoints + row.bohPoints,
    fohPayoutCents: 0,
    bohPayoutCents: 0,
    payoutCents: 0,
    payout: 0,
  }));

  distributePoolCents(staffRows, fohPoolCents, "fohPoints", "fohPayoutCents");
  distributePoolCents(staffRows, bohPoolCents, "bohPoints", "bohPayoutCents");

  staffRows.forEach((row) => {
    row.payoutCents = row.fohPayoutCents + row.bohPayoutCents;
    row.payout = centsToDollars(row.payoutCents);
  });

  staffRows.sort((a, b) => a.name.localeCompare(b.name));

  return {
    cardTips: centsToDollars(cardTipsCents),
    cashTips: centsToDollars(cashTipsCents),
    totalTips: centsToDollars(totalTipsCents),
    fohPool: centsToDollars(fohPoolCents),
    bohPool: centsToDollars(bohPoolCents),
    cardTipsCents,
    cashTipsCents,
    totalTipsCents,
    fohPoolCents,
    bohPoolCents,
    fohSplitBasisPoints,
    bohSplitBasisPoints,
    fohPoints,
    bohPoints,
    totalPoints: fohPoints + bohPoints,
    hasUndistributedFoh: fohPoolCents > 0 && fohPoints === 0,
    hasUndistributedBoh: bohPoolCents > 0 && bohPoints === 0,
    staffRows,
  };
}

function getStaffName(staffId) {
  return state.staff.find((person) => person.id === staffId)?.name || "Unknown staff";
}

function currentShiftDraft() {
  return {
    area: elements.shiftArea.value || "FOH",
    fohRole: elements.fohRole.value || "Manager",
    fohLevel: elements.fohLevel.value || "high",
    fohDuration: elements.fohDuration.value || "over",
    bohCategory: elements.bohCategory.value || "Senior",
    bohDuration: elements.bohDuration.value || "full",
  };
}

function render() {
  const week = getCurrentWeek();
  const sunday = addDays(state.selectedWeekStart, 6);
  const calc = getCalculations();

  elements.weekStart.value = state.selectedWeekStart;
  elements.shiftDate.min = state.selectedWeekStart;
  elements.shiftDate.max = toDateInput(sunday);
  if (!elements.shiftDate.value) elements.shiftDate.value = state.selectedWeekStart;
  elements.weekRangeLabel.textContent = `${dateFormat.format(parseLocalDate(state.selectedWeekStart))} - ${dateFormat.format(sunday)}`;
  elements.cardTips.value = week.cardTips || "";
  elements.cashTips.value = week.cashTips || "";
  elements.fohSplit.value = week.fohSplit;
  elements.bohSplit.value = week.bohSplit;
  elements.heroTotalTips.textContent = moneyFromCents(calc.totalTipsCents);
  elements.heroSplit.textContent = `FOH ${week.fohSplit}% / BOH ${week.bohSplit}%`;

  renderStaff();
  renderShiftForm();
  renderSummary(calc);
  renderShifts();
  saveState();
}

function renderStaff() {
  const activeStaff = state.staff.filter((person) => person.active !== false);
  elements.shiftStaff.innerHTML = activeStaff.length
    ? activeStaff.map((person) => `<option value="${person.id}">${escapeHtml(person.name)}</option>`).join("")
    : `<option value="">Add staff first</option>`;

  elements.staffList.innerHTML = state.staff.length
    ? state.staff
        .map(
          (person) => `
            <div class="list-row ${person.active === false ? "muted-row" : ""}">
              <span>${escapeHtml(person.name)}</span>
              <button type="button" data-staff-toggle="${person.id}">
                ${person.active === false ? "Reactivate" : "Deactivate"}
              </button>
            </div>
          `
        )
        .join("")
    : `<p class="empty-state">No staff added yet.</p>`;
}

function renderShiftForm() {
  const isFoh = elements.shiftArea.value === "FOH";
  elements.fohFields.classList.toggle("hidden", !isFoh);
  elements.bohFields.classList.toggle("hidden", isFoh);
  elements.shiftPointsPreview.textContent = calculateShiftPoints(currentShiftDraft());
}

function renderSummary(calc) {
  elements.summaryCard.textContent = moneyFromCents(calc.cardTipsCents);
  elements.summaryCash.textContent = moneyFromCents(calc.cashTipsCents);
  elements.summaryTotal.textContent = moneyFromCents(calc.totalTipsCents);
  elements.summaryFohPool.textContent = moneyFromCents(calc.fohPoolCents);
  elements.summaryBohPool.textContent = moneyFromCents(calc.bohPoolCents);
  elements.summaryPoints.textContent = calc.totalPoints;

  elements.staffSummaryBody.innerHTML = calc.staffRows.length
    ? calc.staffRows
        .map(
          (row) => `
            <tr>
              <td>${escapeHtml(row.name)}</td>
              <td>${row.fohPoints}</td>
              <td>${row.bohPoints}</td>
              <td>${row.totalPoints}</td>
              <td>${moneyFromCents(row.payoutCents)}</td>
            </tr>
          `
        )
        .join("")
    : `<tr><td colspan="5">Add shifts to calculate staff payouts.</td></tr>`;
}

function renderShifts() {
  const week = getCurrentWeek();
  elements.shiftList.innerHTML = week.shifts.length
    ? week.shifts
        .map((shift) => {
          const points = calculateShiftPoints(shift);
          const detail =
            shift.area === "FOH"
              ? `${shift.fohRole}, ${capitalize(shift.fohLevel)}, ${shift.fohDuration === "over" ? "Over 7h" : "Under 7h"}`
              : `${shift.bohCategory}, ${capitalize(shift.bohDuration)}`;
          return `
            <article class="shift-row">
              <div>
                <strong>${escapeHtml(getStaffName(shift.staffId))}</strong>
                <span>${formatShiftDate(shift.date)} | ${shift.area} | ${detail}</span>
              </div>
              <div class="shift-actions">
                <b>${points} pts</b>
                <button type="button" data-shift-delete="${shift.id}">Delete</button>
              </div>
            </article>
          `;
        })
        .join("")
    : `<p class="empty-state">No shifts entered for this week.</p>`;
}

function formatShiftDate(dateInput) {
  return dateFormat.format(parseLocalDate(dateInput));
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function updateWeekValue(key, value) {
  const week = getCurrentWeek();
  week[key] = value;
  render();
}

function updateSplit(changedKey, value) {
  const week = getCurrentWeek();
  const cleanValue = Math.min(100, Math.max(0, Number(value) || 0));
  if (changedKey === "fohSplit") {
    week.fohSplit = cleanValue;
    week.bohSplit = roundCents(100 - cleanValue);
  } else {
    week.bohSplit = cleanValue;
    week.fohSplit = roundCents(100 - cleanValue);
  }
  render();
}

elements.weekStart.addEventListener("change", () => {
  const monday = getMonday(parseLocalDate(elements.weekStart.value));
  state.selectedWeekStart = toDateInput(monday);
  render();
});

elements.cardTips.addEventListener("input", () => updateWeekValue("cardTips", Number(elements.cardTips.value)));
elements.cashTips.addEventListener("input", () => updateWeekValue("cashTips", Number(elements.cashTips.value)));
elements.fohSplit.addEventListener("input", () => updateSplit("fohSplit", elements.fohSplit.value));
elements.bohSplit.addEventListener("input", () => updateSplit("bohSplit", elements.bohSplit.value));

elements.staffForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = elements.staffName.value.trim();
  if (!name) return;
  state.staff.push({ id: uid("staff"), name, active: true });
  elements.staffName.value = "";
  showToast("Staff added");
  render();
});

elements.staffList.addEventListener("click", (event) => {
  const id = event.target.dataset.staffToggle;
  if (!id) return;
  const person = state.staff.find((staff) => staff.id === id);
  person.active = person.active === false;
  showToast(person.active ? "Staff reactivated" : "Staff deactivated");
  render();
});

["change", "input"].forEach((eventName) => {
  [elements.shiftArea, elements.fohRole, elements.fohLevel, elements.fohDuration, elements.bohCategory, elements.bohDuration].forEach((field) => {
    field.addEventListener(eventName, renderShiftForm);
  });
});

elements.shiftForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!elements.shiftStaff.value) {
    showToast("Add staff before entering shifts");
    return;
  }
  const shift = {
    id: uid("shift"),
    date: elements.shiftDate.value,
    staffId: elements.shiftStaff.value,
    ...currentShiftDraft(),
  };
  getCurrentWeek().shifts.push(shift);
  showToast("Shift added");
  render();
});

elements.shiftList.addEventListener("click", (event) => {
  const id = event.target.dataset.shiftDelete;
  if (!id) return;
  const week = getCurrentWeek();
  week.shifts = week.shifts.filter((shift) => shift.id !== id);
  showToast("Shift deleted");
  render();
});

elements.exportExcel.addEventListener("click", () => {
  const week = getCurrentWeek();
  const calc = getCalculations();
  if (!week.shifts.length) {
    showToast("Add shifts before exporting");
    return;
  }
  if (calc.hasUndistributedFoh) {
    showToast("Add FOH points before exporting");
    return;
  }
  if (calc.hasUndistributedBoh) {
    showToast("Add BOH points before exporting");
    return;
  }
  exportExcel();
});

function exportExcel() {
  const week = getCurrentWeek();
  const calc = getCalculations();
  const sunday = toDateInput(addDays(state.selectedWeekStart, 6));
  const rows = [];

  rows.push(["Andiamo Trattoria Chippendale - Weekly Tip Distribution"]);
  rows.push(["Week", `${state.selectedWeekStart} to ${sunday}`]);
  rows.push(["Card/Tyro tips", calc.cardTips]);
  rows.push(["Cash tips", calc.cashTips]);
  rows.push(["Total tips", calc.totalTips]);
  rows.push(["FOH split %", week.fohSplit]);
  rows.push(["BOH split %", week.bohSplit]);
  rows.push(["FOH total", calc.fohPool]);
  rows.push(["BOH total", calc.bohPool]);
  rows.push([]);
  rows.push(["Staff totals"]);
  rows.push(["Staff", "FOH points", "BOH points", "Total points", "Final payout"]);
  calc.staffRows.forEach((row) => rows.push([row.name, row.fohPoints, row.bohPoints, row.totalPoints, row.payout]));
  rows.push([]);
  rows.push(["Detailed shifts"]);
  rows.push(["Date", "Staff", "Area", "Role/category", "High/low", "Duration", "Points"]);
  week.shifts.forEach((shift) => {
    rows.push([
      shift.date,
      getStaffName(shift.staffId),
      shift.area,
      shift.area === "FOH" ? shift.fohRole : shift.bohCategory,
      shift.area === "FOH" ? capitalize(shift.fohLevel) : "",
      shift.area === "FOH" ? (shift.fohDuration === "over" ? "Over 7h" : "Under 7h") : capitalize(shift.bohDuration),
      calculateShiftPoints(shift),
    ]);
  });

  const html = `
    <html>
      <head><meta charset="utf-8" /></head>
      <body>
        <table>${rows
          .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
          .join("")}</table>
      </body>
    </html>
  `;
  const blob = new Blob([html], { type: "application/vnd.ms-excel" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `andiamo-tips-${state.selectedWeekStart}.xls`;
  link.click();
  URL.revokeObjectURL(link.href);
  showToast("Excel export created");
}

render();
