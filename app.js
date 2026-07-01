const STORAGE_KEY = "andiamo-tip-distribution-v1";
const STAFF_AREAS = ["FOH", "BOH"];
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
  staffFoh: document.querySelector("#staffFoh"),
  staffBoh: document.querySelector("#staffBoh"),
  staffValidation: document.querySelector("#staffValidation"),
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
    return hydrateState({ ...defaultState, ...saved });
  } catch {
    return hydrateState({ ...defaultState });
  }
}

function hydrateState(nextState) {
  return {
    ...defaultState,
    ...nextState,
    staff: Array.isArray(nextState.staff) ? nextState.staff.map(hydrateStaffMember) : [],
    weeks: nextState.weeks && typeof nextState.weeks === "object" ? nextState.weeks : {},
    selectedWeekStart: nextState.selectedWeekStart || defaultState.selectedWeekStart,
  };
}

function hydrateStaffMember(person) {
  return {
    ...person,
    id: person.id || uid("staff"),
    name: String(person.name || ""),
    active: person.active !== false,
    areas: getStaffAreas(person),
  };
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
  if (shift.area === "BOH") {
    return getBohPoints(shift.bohCategory, shift.bohDuration);
  }
  return 0;
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

function cleanStaffName(name) {
  return String(name).trim().replace(/\s+/g, " ");
}

function normalizeStaffName(name) {
  return cleanStaffName(String(name).normalize("NFKC").replace(/[\u200B-\u200D\uFEFF]/g, "")).toLocaleLowerCase("en-AU");
}

function findDuplicateStaff(name, ignoreId = "") {
  const normalizedName = normalizeStaffName(name);
  if (!normalizedName) return null;
  return state.staff.find((person) => person.id !== ignoreId && normalizeStaffName(person.name) === normalizedName) || null;
}

function validateStaffDetails(name, areas, ignoreId = "") {
  if (!name) {
    return "Enter a staff name before saving.";
  }
  if (!areas.length) {
    return "Choose FOH, BOH, or both for this staff member.";
  }
  const duplicate = findDuplicateStaff(name, ignoreId);
  if (duplicate) {
    return `${cleanStaffName(name)} is already in the staff list.`;
  }
  return "";
}

function setStaffValidation(message = "") {
  elements.staffValidation.textContent = message;
  elements.staffValidation.classList.toggle("hidden", !message);
}

function setStaffRowValidation(row, message = "") {
  const validation = row.querySelector("[data-staff-validation]");
  if (!validation) return;
  validation.textContent = message;
  validation.classList.toggle("hidden", !message);
}

function resetStaffRowInputs(row, person) {
  const nameInput = row.querySelector("[data-staff-name]");
  const areaInputs = Array.from(row.querySelectorAll("[data-staff-area]"));
  const savedAreas = getStaffAreas(person);
  if (nameInput) nameInput.value = person.name;
  areaInputs.forEach((input) => {
    input.checked = savedAreas.includes(input.value);
  });
}

function getStaffAreas(person) {
  if (!person) return [];
  const savedAreas = Array.isArray(person.areas) ? person.areas : STAFF_AREAS;
  const areas = STAFF_AREAS.filter((area) => savedAreas.includes(area));
  return areas.length ? areas : [...STAFF_AREAS];
}

function areaLabel(area) {
  return area === "FOH" ? "FOH" : "BOH";
}

function getSelectedStaffMember() {
  return state.staff.find((person) => person.id === elements.shiftStaff.value);
}

function currentShiftDraft() {
  return {
    area: elements.shiftArea.value,
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
  const selectedStaffId = elements.shiftStaff.value;
  elements.shiftStaff.innerHTML = activeStaff.length
    ? activeStaff.map((person) => `<option value="${person.id}">${escapeHtml(person.name)}</option>`).join("")
    : `<option value="">Add staff first</option>`;
  if (activeStaff.some((person) => person.id === selectedStaffId)) {
    elements.shiftStaff.value = selectedStaffId;
  }

  elements.staffList.innerHTML = state.staff.length
    ? state.staff
        .map(
          (person) => {
            const areas = getStaffAreas(person);
            return `
            <div class="list-row staff-row ${person.active === false ? "muted-row" : ""}">
              <div class="staff-editor">
                <label>
                  Name
                  <input type="text" value="${escapeHtml(person.name)}" data-staff-name="${person.id}" aria-label="Staff name for ${escapeHtml(person.name)}" />
                </label>
                <div class="eligibility-picker compact-picker" aria-label="Eligible work areas for ${escapeHtml(person.name)}">
                  ${STAFF_AREAS.map(
                    (area) => `
                      <label>
                        <input type="checkbox" value="${area}" data-staff-area="${person.id}" ${areas.includes(area) ? "checked" : ""} />
                        ${areaLabel(area)}
                      </label>
                    `
                  ).join("")}
                </div>
                <p class="validation-message staff-card-validation hidden" data-staff-validation="${person.id}" role="alert"></p>
              </div>
              <div class="staff-row-actions">
                <button type="button" data-staff-save="${person.id}">Save</button>
                <button type="button" data-staff-toggle="${person.id}">
                  ${person.active === false ? "Reactivate" : "Deactivate"}
                </button>
              </div>
            </div>
          `;
          }
        )
        .join("")
    : `<p class="empty-state">No staff added yet.</p>`;
}

function renderShiftAreaOptions() {
  const selectedStaff = getSelectedStaffMember();
  const areas = getStaffAreas(selectedStaff);
  const selectedArea = elements.shiftArea.value;
  elements.shiftArea.innerHTML = areas.length
    ? areas.map((area) => `<option value="${area}">${areaLabel(area)}</option>`).join("")
    : `<option value="">Choose eligible staff first</option>`;
  if (areas.includes(selectedArea)) {
    elements.shiftArea.value = selectedArea;
  }
}

function renderShiftForm() {
  renderShiftAreaOptions();
  const draft = currentShiftDraft();
  const isFoh = draft.area === "FOH";
  elements.fohFields.classList.toggle("hidden", !isFoh);
  elements.bohFields.classList.toggle("hidden", isFoh);
  elements.shiftPointsPreview.textContent = draft.area ? calculateShiftPoints(draft) : 0;
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

function renderCalculatedMoney() {
  const week = getCurrentWeek();
  const calc = getCalculations();
  elements.heroTotalTips.textContent = moneyFromCents(calc.totalTipsCents);
  elements.heroSplit.textContent = `FOH ${week.fohSplit}% / BOH ${week.bohSplit}%`;
  renderSummary(calc);
  saveState();
}

function updateMoneyValue(key, field) {
  const week = getCurrentWeek();
  const rawValue = field.value.trim();
  const numericValue = Number(field.value);
  if (rawValue.startsWith("-") || numericValue < 0) {
    field.value = "0";
    week[key] = 0;
  } else {
    week[key] = Number.isFinite(numericValue) ? numericValue : 0;
  }
  renderCalculatedMoney();
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

elements.cardTips.addEventListener("input", () => updateMoneyValue("cardTips", elements.cardTips));
elements.cashTips.addEventListener("input", () => updateMoneyValue("cashTips", elements.cashTips));
elements.fohSplit.addEventListener("input", () => updateSplit("fohSplit", elements.fohSplit.value));
elements.bohSplit.addEventListener("input", () => updateSplit("bohSplit", elements.bohSplit.value));

elements.staffForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = cleanStaffName(elements.staffName.value);
  const areas = [];
  if (elements.staffFoh.checked) areas.push("FOH");
  if (elements.staffBoh.checked) areas.push("BOH");
  const validationMessage = validateStaffDetails(name, areas);
  if (validationMessage) {
    setStaffValidation(validationMessage === "Enter a staff name before saving." ? "Enter a staff name before adding." : validationMessage);
    return;
  }
  state.staff.push({ id: uid("staff"), name, active: true, areas });
  elements.staffName.value = "";
  elements.staffFoh.checked = true;
  elements.staffBoh.checked = true;
  setStaffValidation();
  showToast("Staff added");
  render();
});

elements.staffName.addEventListener("input", () => setStaffValidation());
[elements.staffFoh, elements.staffBoh].forEach((field) => field.addEventListener("change", () => setStaffValidation()));

elements.staffList.addEventListener("click", (event) => {
  const saveId = event.target.dataset.staffSave;
  const toggleId = event.target.dataset.staffToggle;

  if (saveId) {
    const person = state.staff.find((staff) => staff.id === saveId);
    const row = event.target.closest(".staff-row");
    if (!person || !row) return;
    const nameInput = row.querySelector("[data-staff-name]");
    const areaInputs = Array.from(row.querySelectorAll("[data-staff-area]"));
    const name = cleanStaffName(nameInput.value);
    const areas = areaInputs.filter((input) => input.checked).map((input) => input.value);
    const validationMessage = validateStaffDetails(name, areas, saveId);

    if (validationMessage) {
      resetStaffRowInputs(row, person);
      setStaffValidation();
      setStaffRowValidation(row, validationMessage);
      nameInput.focus();
      return;
    }

    person.name = name;
    person.areas = STAFF_AREAS.filter((area) => areas.includes(area));
    setStaffValidation();
    setStaffRowValidation(row);
    showToast("Staff updated");
    render();
    return;
  }

  if (toggleId) {
    const person = state.staff.find((staff) => staff.id === toggleId);
    if (!person) return;
    person.active = person.active === false;
    showToast(person.active ? "Staff reactivated" : "Staff deactivated");
    render();
  }
});

["change", "input"].forEach((eventName) => {
  [elements.shiftStaff, elements.shiftArea, elements.fohRole, elements.fohLevel, elements.fohDuration, elements.bohCategory, elements.bohDuration].forEach((field) => {
    field.addEventListener(eventName, renderShiftForm);
  });
});

elements.shiftForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!elements.shiftStaff.value) {
    showToast("Add staff before entering shifts");
    return;
  }
  const staffMember = getSelectedStaffMember();
  if (!staffMember || staffMember.active === false) {
    showToast("Choose an active staff member");
    render();
    return;
  }
  const draft = currentShiftDraft();
  if (!getStaffAreas(staffMember).includes(draft.area)) {
    showToast(`${staffMember.name} is not eligible for that area`);
    render();
    return;
  }
  const shift = {
    id: uid("shift"),
    date: elements.shiftDate.value,
    staffId: elements.shiftStaff.value,
    ...draft,
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
