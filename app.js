const STORAGE_KEY = "andiamo-tip-distribution-v1";
const STAFF_AREAS = ["FOH", "BOH"];
const FOH_ROLES = ["Manager", "Waiter"];
const BOH_CONTRIBUTIONS = ["Lead", "Experienced", "Support"];
const BOH_SHIFT_SIZES = ["full", "reduced"];
const DEFAULT_FOH_ROLE = "Waiter";
const DEFAULT_BOH_CONTRIBUTION = "Support";
const DEFAULT_BOH_SHIFT_SIZE = "full";
const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const currency = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" });
const dateFormat = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short" });
const generatedDateFormat = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const defaultState = {
  staff: [],
  weeks: {},
  completedWeeks: [],
  selectedWeekStart: toDateInput(getMonday(new Date())),
};

let state = loadState();
let editingShiftId = "";

const elements = {
  weekRangeLabel: document.querySelector("#weekRangeLabel"),
  heroTotalTips: document.querySelector("#heroTotalTips"),
  heroSplit: document.querySelector("#heroSplit"),
  exportExcel: document.querySelector("#exportExcel"),
  printSummary: document.querySelector("#printSummary"),
  backupData: document.querySelector("#backupData"),
  restoreData: document.querySelector("#restoreData"),
  restoreBackupFile: document.querySelector("#restoreBackupFile"),
  finishWeek: document.querySelector("#finishWeek"),
  clearCurrentWeek: document.querySelector("#clearCurrentWeek"),
  weekStart: document.querySelector("#weekStart"),
  startSelectWeek: document.querySelector("#startSelectWeek"),
  dailyTipsBody: document.querySelector("#dailyTipsBody"),
  dailyTipsNotice: document.querySelector("#dailyTipsNotice"),
  dailyTipsReviewed: document.querySelector("#dailyTipsReviewed"),
  fohSplit: document.querySelector("#fohSplit"),
  bohSplit: document.querySelector("#bohSplit"),
  staffForm: document.querySelector("#staffForm"),
  staffName: document.querySelector("#staffName"),
  staffFoh: document.querySelector("#staffFoh"),
  staffBoh: document.querySelector("#staffBoh"),
  staffValidation: document.querySelector("#staffValidation"),
  staffList: document.querySelector("#staffList"),
  shiftForm: document.querySelector("#shiftForm"),
  copyPreviousWeekShifts: document.querySelector("#copyPreviousWeekShifts"),
  shiftDate: document.querySelector("#shiftDate"),
  shiftStaff: document.querySelector("#shiftStaff"),
  shiftArea: document.querySelector("#shiftArea"),
  fohFields: document.querySelector("#fohFields"),
  bohFields: document.querySelector("#bohFields"),
  fohRole: document.querySelector("#fohRole"),
  fohLevel: document.querySelector("#fohLevel"),
  fohDuration: document.querySelector("#fohDuration"),
  bohContribution: document.querySelector("#bohContribution"),
  bohShiftSize: document.querySelector("#bohShiftSize"),
  shiftPointsPreview: document.querySelector("#shiftPointsPreview"),
  builderForm: document.querySelector("#builderForm"),
  builderStaff: document.querySelector("#builderStaff"),
  builderArea: document.querySelector("#builderArea"),
  builderFohFields: document.querySelector("#builderFohFields"),
  builderBohFields: document.querySelector("#builderBohFields"),
  builderFohRole: document.querySelector("#builderFohRole"),
  builderFohLevel: document.querySelector("#builderFohLevel"),
  builderFohDuration: document.querySelector("#builderFohDuration"),
  builderBohContribution: document.querySelector("#builderBohContribution"),
  builderBohShiftSize: document.querySelector("#builderBohShiftSize"),
  builderDays: document.querySelector("#builderDays"),
  summaryCard: document.querySelector("#summaryCard"),
  summaryCash: document.querySelector("#summaryCash"),
  summaryTotal: document.querySelector("#summaryTotal"),
  summaryFohPool: document.querySelector("#summaryFohPool"),
  summaryBohPool: document.querySelector("#summaryBohPool"),
  summaryPoints: document.querySelector("#summaryPoints"),
  staffSummaryBody: document.querySelector("#staffSummaryBody"),
  dailyAllocationList: document.querySelector("#dailyAllocationList"),
  shiftList: document.querySelector("#shiftList"),
  weeklyHistoryList: document.querySelector("#weeklyHistoryList"),
  printWeekRange: document.querySelector("#printWeekRange"),
  printCardTips: document.querySelector("#printCardTips"),
  printCashTips: document.querySelector("#printCashTips"),
  printTotalTips: document.querySelector("#printTotalTips"),
  printFohPool: document.querySelector("#printFohPool"),
  printBohPool: document.querySelector("#printBohPool"),
  printTotalPoints: document.querySelector("#printTotalPoints"),
  printDailyTipsBody: document.querySelector("#printDailyTipsBody"),
  printStaffPayoutBody: document.querySelector("#printStaffPayoutBody"),
  printGeneratedDate: document.querySelector("#printGeneratedDate"),
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
    weeks: hydrateWeeks(nextState.weeks),
    completedWeeks: Array.isArray(nextState.completedWeeks) ? nextState.completedWeeks.map(hydrateCompletedWeek) : [],
    selectedWeekStart: nextState.selectedWeekStart || defaultState.selectedWeekStart,
  };
}

function hydrateWeeks(weeks) {
  if (!weeks || typeof weeks !== "object" || Array.isArray(weeks)) return {};
  return Object.fromEntries(Object.entries(weeks).map(([weekStart, week]) => [weekStart, hydrateWeek(week, weekStart)]));
}

function normalizeBohContribution(value) {
  if (BOH_CONTRIBUTIONS.includes(value)) return value;
  if (value === "Senior") return "Lead";
  if (value === "Non-senior") return "Support";
  return DEFAULT_BOH_CONTRIBUTION;
}

function normalizeBohShiftSize(value) {
  if (BOH_SHIFT_SIZES.includes(value)) return value;
  if (value === "half") return "reduced";
  return DEFAULT_BOH_SHIFT_SIZE;
}

function getBohModelFromLegacy(category, duration) {
  if (category === "Senior" && duration === "full") {
    return { bohContribution: "Lead", bohShiftSize: "full" };
  }
  if (category === "Senior" && duration === "half") {
    return { bohContribution: "Experienced", bohShiftSize: "reduced" };
  }
  if (category === "Non-senior" && duration === "full") {
    return { bohContribution: "Support", bohShiftSize: "full" };
  }
  if (category === "Non-senior" && duration === "half") {
    return { bohContribution: "Support", bohShiftSize: "reduced" };
  }
  return {
    bohContribution: normalizeBohContribution(category),
    bohShiftSize: normalizeBohShiftSize(duration),
  };
}

function getBohModel(shift) {
  if (BOH_CONTRIBUTIONS.includes(shift?.bohContribution) || BOH_SHIFT_SIZES.includes(shift?.bohShiftSize)) {
    return {
      bohContribution: normalizeBohContribution(shift.bohContribution || shift.bohCategory),
      bohShiftSize: normalizeBohShiftSize(shift.bohShiftSize || shift.bohDuration),
    };
  }
  return getBohModelFromLegacy(shift?.bohCategory, shift?.bohDuration);
}

function hydrateActiveShift(shift) {
  if (!shift || typeof shift !== "object") return shift;
  if (shift.area !== "BOH") return shift;
  const { bohCategory, bohDuration, ...rest } = shift;
  return {
    ...rest,
    ...getBohModel(shift),
  };
}

function hydrateStaffMember(person) {
  const { defaultBohCategory, ...rest } = person;
  return {
    ...rest,
    id: person.id || uid("staff"),
    name: String(person.name || ""),
    active: person.active !== false,
    areas: getStaffAreas(person),
    defaultFohRole: getStaffDefaultFohRole(person),
    defaultBohContribution: getStaffDefaultBohContribution(person),
  };
}

function hydrateCompletedWeek(week) {
  return {
    ...week,
    id: week.id || uid("week"),
    staffPayouts: Array.isArray(week.staffPayouts) ? week.staffPayouts : [],
    shifts: Array.isArray(week.shifts) ? week.shifts : [],
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getAppLocalStorageKeys() {
  const keys = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key && (key === STORAGE_KEY || key.startsWith("andiamo-tip-distribution-"))) {
      keys.push(key);
    }
  }
  return keys;
}

function getAppLocalStorageEntries() {
  return getAppLocalStorageKeys().reduce((entries, key) => {
    entries[key] = localStorage.getItem(key);
    return entries;
  }, {});
}

function createBackupPayload() {
  return {
    app: "Andiamo Tip Distribution",
    backupVersion: 1,
    storageKey: STORAGE_KEY,
    exportedAt: new Date().toISOString(),
    data: state,
    localStorage: getAppLocalStorageEntries(),
  };
}

function validateRestoreState(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { error: "Backup data is not a valid object." };
  }
  if (!Array.isArray(value.staff)) {
    return { error: "Backup is missing the saved staff list." };
  }
  if (!value.weeks || typeof value.weeks !== "object" || Array.isArray(value.weeks)) {
    return { error: "Backup is missing active week data." };
  }
  if (!Array.isArray(value.completedWeeks)) {
    return { error: "Backup is missing completed weekly history." };
  }
  if (!value.selectedWeekStart) {
    return { error: "Backup has an invalid selected week date." };
  }
  const selectedWeekDate = parseLocalDate(value.selectedWeekStart);
  if (Number.isNaN(selectedWeekDate.getTime()) || toDateInput(selectedWeekDate) !== value.selectedWeekStart) {
    return { error: "Backup has an invalid selected week date." };
  }
  return { state: hydrateState(value) };
}

function getRestoreStateFromBackup(backup) {
  if (!backup || typeof backup !== "object" || Array.isArray(backup)) {
    return { error: "Choose a valid Andiamo backup JSON file." };
  }

  if (backup.storageKey === STORAGE_KEY && backup.data) {
    const result = validateRestoreState(backup.data);
    if (result.error) return result;
    return {
      state: result.state,
      localStorageEntries: {
        ...(backup.localStorage && typeof backup.localStorage === "object" && !Array.isArray(backup.localStorage) ? backup.localStorage : {}),
        [STORAGE_KEY]: JSON.stringify(result.state),
      },
    };
  }

  const storedBackup = backup.localStorage?.[STORAGE_KEY];
  if (storedBackup) {
    try {
      const result = validateRestoreState(typeof storedBackup === "string" ? JSON.parse(storedBackup) : storedBackup);
      if (result.error) return result;
      return {
        state: result.state,
        localStorageEntries: backup.localStorage,
      };
    } catch {
      return { error: "Backup local storage data could not be read." };
    }
  }

  return { error: "This file is not a Tip Distribution backup." };
}

function getRestoreConfirmationMessage(nextState) {
  return [
    "Restore this backup?",
    "",
    `Staff records: ${nextState.staff.length}`,
    `Active weeks saved: ${Object.keys(nextState.weeks).length}`,
    `Completed weeks: ${nextState.completedWeeks.length}`,
    `Selected week: ${nextState.selectedWeekStart}`,
    "",
    "This will replace the current Tip Distribution data in this browser.",
  ].join("\n");
}

function downloadBackupData() {
  const payload = createBackupPayload();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `andiamo-tip-distribution-backup-${toDateInput(new Date())}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  showToast("Backup JSON created");
}

async function restoreBackupData(file) {
  if (!file) return;

  try {
    const backup = JSON.parse(await file.text());
    const result = getRestoreStateFromBackup(backup);
    if (result.error) {
      showToast(result.error);
      return;
    }

    const confirmed = window.confirm(getRestoreConfirmationMessage(result.state));
    if (!confirmed) return;

    getAppLocalStorageKeys().forEach((key) => localStorage.removeItem(key));
    Object.entries(result.localStorageEntries || {}).forEach(([key, value]) => {
      if (key === STORAGE_KEY || key.startsWith("andiamo-tip-distribution-")) {
        localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
      }
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(result.state));
    state = result.state;
    showToast("Backup restored");
    render();
  } catch {
    showToast("Could not read backup JSON. Nothing was restored.");
  }
}

function getCurrentWeek() {
  const key = state.selectedWeekStart;
  if (!state.weeks[key]) {
    state.weeks[key] = createBlankWeek();
  }
  state.weeks[key] = hydrateWeek(state.weeks[key], key);
  return state.weeks[key];
}

function hydrateWeek(week, weekStart) {
  const savedWeek = week && typeof week === "object" ? week : {};
  const nextWeek = {
    cardTips: 0,
    cashTips: 0,
    fohSplit: 70,
    bohSplit: 30,
    shifts: [],
    dailyTipsMigratedFromWeekly: false,
    dailyTipsReviewed: true,
    ...savedWeek,
  };
  const hadDailyTips = Array.isArray(savedWeek.dailyTips) && savedWeek.dailyTips.length > 0;
  nextWeek.shifts = Array.isArray(nextWeek.shifts) ? nextWeek.shifts.map(hydrateActiveShift) : [];
  nextWeek.dailyTips = normalizeDailyTips(nextWeek, weekStart, hadDailyTips);
  const weeklyTotals = getDailyTipTotals(nextWeek.dailyTips);
  nextWeek.cardTips = centsToDollars(weeklyTotals.cardTipsCents);
  nextWeek.cashTips = centsToDollars(weeklyTotals.cashTipsCents);
  return nextWeek;
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

function getWeekDates(weekStart) {
  return WEEKDAY_NAMES.map((weekday, index) => ({
    weekday,
    date: toDateInput(addDays(weekStart, index)),
  }));
}

function createDailyTips(weekStart, mondayCardTips = 0, mondayCashTips = 0) {
  return getWeekDates(weekStart).map((day, index) => ({
    ...day,
    cardTips: index === 0 ? mondayCardTips : 0,
    cashTips: index === 0 ? mondayCashTips : 0,
  }));
}

function normalizeDailyTips(week, weekStart, hadDailyTips) {
  const savedDailyTips = Array.isArray(week.dailyTips) ? week.dailyTips : [];
  const tipsByDate = new Map(savedDailyTips.map((day) => [day.date, day]));
  const legacyCardTips = Number(week.cardTips) || 0;
  const legacyCashTips = Number(week.cashTips) || 0;
  const hasLegacyWeeklyTips = !hadDailyTips && (dollarsToCents(legacyCardTips) > 0 || dollarsToCents(legacyCashTips) > 0);

  if (hasLegacyWeeklyTips) {
    week.dailyTipsMigratedFromWeekly = true;
    week.dailyTipsReviewed = false;
  }

  return getWeekDates(weekStart).map((day, index) => {
    const saved = tipsByDate.get(day.date) || {};
    return {
      ...day,
      cardTips: hasLegacyWeeklyTips && index === 0 ? legacyCardTips : Number(saved.cardTips) || 0,
      cashTips: hasLegacyWeeklyTips && index === 0 ? legacyCashTips : Number(saved.cashTips) || 0,
    };
  });
}

function dollarsToCents(value) {
  return Math.round((Number(value) || 0) * 100);
}

function centsToDollars(cents) {
  return (Number(cents) || 0) / 100;
}

function getDailyTipTotals(dailyTips) {
  return dailyTips.reduce(
    (totals, day) => {
      const cardTipsCents = dollarsToCents(day.cardTips);
      const cashTipsCents = dollarsToCents(day.cashTips);
      return {
        cardTipsCents: totals.cardTipsCents + cardTipsCents,
        cashTipsCents: totals.cashTipsCents + cashTipsCents,
        totalTipsCents: totals.totalTipsCents + cardTipsCents + cashTipsCents,
      };
    },
    { cardTipsCents: 0, cashTipsCents: 0, totalTipsCents: 0 }
  );
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

function getBohPoints(contribution, shiftSize) {
  const map = {
    Lead: { full: 4, reduced: 3 },
    Experienced: { full: 3, reduced: 2 },
    Support: { full: 2, reduced: 1 },
  };
  return map[contribution]?.[shiftSize] || 0;
}

function calculateShiftPoints(shift) {
  if (shift.area === "FOH") {
    return getFohPoints(shift.fohRole, shift.fohLevel, shift.fohDuration);
  }
  if (shift.area === "BOH") {
    const { bohContribution, bohShiftSize } = getBohModel(shift);
    return getBohPoints(bohContribution, bohShiftSize);
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
  const fohSplitBasisPoints = percentToBasisPoints(week.fohSplit);
  const bohSplitBasisPoints = percentToBasisPoints(week.bohSplit);
  const weeklyStaffTotals = new Map();
  const validationErrors = [];
  let cardTipsCents = 0;
  let cashTipsCents = 0;
  let totalTipsCents = 0;
  let fohPoolCents = 0;
  let bohPoolCents = 0;
  let fohPoints = 0;
  let bohPoints = 0;

  const dailyAllocations = week.dailyTips.map((day) => {
    const dayCardTipsCents = dollarsToCents(day.cardTips);
    const dayCashTipsCents = dollarsToCents(day.cashTips);
    const dayTotalTipsCents = dayCardTipsCents + dayCashTipsCents;
    const dayFohPoolCents = Math.round((dayTotalTipsCents * fohSplitBasisPoints) / 10000);
    const dayBohPoolCents = dayTotalTipsCents - dayFohPoolCents;
    const dayRows = new Map();
    let dayFohPoints = 0;
    let dayBohPoints = 0;

    week.shifts
      .filter((shift) => shift.date === day.date)
      .forEach((shift) => {
        const points = calculateShiftPoints(shift);
        const row = dayRows.get(shift.staffId) || {
          staffId: shift.staffId,
          name: shift.staffName || getStaffName(shift.staffId),
          fohPoints: 0,
          bohPoints: 0,
          totalPoints: 0,
          fohPayoutCents: 0,
          bohPayoutCents: 0,
          payoutCents: 0,
          payout: 0,
        };
        if (shift.area === "FOH") {
          row.fohPoints += points;
          dayFohPoints += points;
        } else {
          row.bohPoints += points;
          dayBohPoints += points;
        }
        row.totalPoints = row.fohPoints + row.bohPoints;
        dayRows.set(shift.staffId, row);
      });

    const staffPayouts = Array.from(dayRows.values());
    distributePoolCents(staffPayouts, dayFohPoolCents, "fohPoints", "fohPayoutCents");
    distributePoolCents(staffPayouts, dayBohPoolCents, "bohPoints", "bohPayoutCents");
    staffPayouts.forEach((row) => {
      row.payoutCents = row.fohPayoutCents + row.bohPayoutCents;
      row.payout = centsToDollars(row.payoutCents);

      const weeklyRow = weeklyStaffTotals.get(row.staffId) || {
        staffId: row.staffId,
        name: row.name,
        fohPoints: 0,
        bohPoints: 0,
        totalPoints: 0,
        fohPayoutCents: 0,
        bohPayoutCents: 0,
        payoutCents: 0,
        payout: 0,
      };
      weeklyRow.fohPoints += row.fohPoints;
      weeklyRow.bohPoints += row.bohPoints;
      weeklyRow.totalPoints = weeklyRow.fohPoints + weeklyRow.bohPoints;
      weeklyRow.fohPayoutCents += row.fohPayoutCents;
      weeklyRow.bohPayoutCents += row.bohPayoutCents;
      weeklyRow.payoutCents += row.payoutCents;
      weeklyRow.payout = centsToDollars(weeklyRow.payoutCents);
      weeklyStaffTotals.set(row.staffId, weeklyRow);
    });

    const dayErrors = [];
    if (dayFohPoolCents > 0 && dayFohPoints === 0) {
      dayErrors.push(`${day.weekday} ${formatShiftDate(day.date)} has a positive FOH pool but no FOH points.`);
    }
    if (dayBohPoolCents > 0 && dayBohPoints === 0) {
      dayErrors.push(`${day.weekday} ${formatShiftDate(day.date)} has a positive BOH pool but no BOH points.`);
    }
    validationErrors.push(...dayErrors);

    cardTipsCents += dayCardTipsCents;
    cashTipsCents += dayCashTipsCents;
    totalTipsCents += dayTotalTipsCents;
    fohPoolCents += dayFohPoolCents;
    bohPoolCents += dayBohPoolCents;
    fohPoints += dayFohPoints;
    bohPoints += dayBohPoints;

    staffPayouts.sort((a, b) => a.name.localeCompare(b.name));

    return {
      weekday: day.weekday,
      date: day.date,
      cardTips: centsToDollars(dayCardTipsCents),
      cashTips: centsToDollars(dayCashTipsCents),
      totalTips: centsToDollars(dayTotalTipsCents),
      fohPool: centsToDollars(dayFohPoolCents),
      bohPool: centsToDollars(dayBohPoolCents),
      cardTipsCents: dayCardTipsCents,
      cashTipsCents: dayCashTipsCents,
      totalTipsCents: dayTotalTipsCents,
      fohPoolCents: dayFohPoolCents,
      bohPoolCents: dayBohPoolCents,
      fohPoints: dayFohPoints,
      bohPoints: dayBohPoints,
      totalPoints: dayFohPoints + dayBohPoints,
      staffPayouts,
      validationErrors: dayErrors,
    };
  });

  const staffRows = Array.from(weeklyStaffTotals.values()).sort((a, b) => a.name.localeCompare(b.name));

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
    hasUndistributedFoh: validationErrors.some((error) => error.includes("FOH pool")),
    hasUndistributedBoh: validationErrors.some((error) => error.includes("BOH pool")),
    validationErrors,
    dailyAllocations,
    staffRows,
  };
}

function createBlankWeek(fohSplit = 70, bohSplit = 30, weekStart = state.selectedWeekStart) {
  return {
    cardTips: 0,
    cashTips: 0,
    fohSplit,
    bohSplit,
    dailyTips: createDailyTips(weekStart),
    dailyTipsMigratedFromWeekly: false,
    dailyTipsReviewed: true,
    shifts: [],
  };
}

function createWeekFromCompletedRecord(record) {
  const hasDailyTips = Array.isArray(record.dailyTips) && record.dailyTips.length > 0;
  const dailyTips = hasDailyTips
    ? record.dailyTips.map((day) => ({
        weekday: day.weekday,
        date: day.date,
        cardTips: day.cardTips,
        cashTips: day.cashTips,
      }))
    : createDailyTips(record.weekStart, record.cardTips, record.cashTips);
  return {
    cardTips: hasDailyTips ? record.cardTips : 0,
    cashTips: hasDailyTips ? record.cashTips : 0,
    fohSplit: record.fohSplit,
    bohSplit: record.bohSplit,
    dailyTips,
    dailyTipsMigratedFromWeekly: !hasDailyTips,
    dailyTipsReviewed: hasDailyTips,
    shifts: record.shifts.map(({ points, detail, ...shift }) => ({ ...shift })),
  };
}

function isCurrentWeekEmpty() {
  const week = getCurrentWeek();
  const totals = getDailyTipTotals(week.dailyTips);
  return totals.cardTipsCents === 0 && totals.cashTipsCents === 0 && week.shifts.length === 0;
}

function getPayoutCentsSummary(staffRows) {
  return staffRows.reduce(
    (totals, row) => ({
      foh: totals.foh + row.fohPayoutCents,
      boh: totals.boh + row.bohPayoutCents,
      total: totals.total + row.payoutCents,
    }),
    { foh: 0, boh: 0, total: 0 }
  );
}

function validateWeekForExport(week, calc, actionLabel = "exporting") {
  if (week.dailyTipsMigratedFromWeekly && !week.dailyTipsReviewed) {
    return "Review and confirm the migrated daily tip allocation before exporting or finishing.";
  }
  if (calc.validationErrors.length) {
    return calc.validationErrors[0];
  }
  if (!week.shifts.length) {
    return `Add shifts before ${actionLabel}`;
  }
  return "";
}

function validateWeekForCompletion(week, calc) {
  const duplicateWeek = state.completedWeeks.some((completedWeek) => completedWeek.weekStart === state.selectedWeekStart);
  if (duplicateWeek) {
    return "This week is already in Weekly History";
  }

  const exportValidation = validateWeekForExport(week, calc, "finishing");
  if (exportValidation) {
    return exportValidation;
  }

  const payoutTotals = getPayoutCentsSummary(calc.staffRows);
  if (payoutTotals.foh !== calc.fohPoolCents || payoutTotals.boh !== calc.bohPoolCents || payoutTotals.total !== calc.totalTipsCents) {
    return "Payouts do not reconcile exactly with total tips";
  }

  return "";
}

function getCurrentWeekSnapshot(calc, completedAt = "") {
  const week = getCurrentWeek();
  const weekEnd = toDateInput(addDays(state.selectedWeekStart, 6));

  return {
    weekStart: state.selectedWeekStart,
    weekEnd,
    cardTips: calc.cardTips,
    cashTips: calc.cashTips,
    totalTips: calc.totalTips,
    cardTipsCents: calc.cardTipsCents,
    cashTipsCents: calc.cashTipsCents,
    totalTipsCents: calc.totalTipsCents,
    fohSplit: week.fohSplit,
    bohSplit: week.bohSplit,
    fohSplitBasisPoints: calc.fohSplitBasisPoints,
    bohSplitBasisPoints: calc.bohSplitBasisPoints,
    fohPool: calc.fohPool,
    bohPool: calc.bohPool,
    fohPoolCents: calc.fohPoolCents,
    bohPoolCents: calc.bohPoolCents,
    fohPoints: calc.fohPoints,
    bohPoints: calc.bohPoints,
    totalPoints: calc.totalPoints,
    dailyTips: week.dailyTips.map((day) => ({
      weekday: day.weekday,
      date: day.date,
      cardTips: day.cardTips,
      cashTips: day.cashTips,
    })),
    dailyAllocations: calc.dailyAllocations,
    allocationMethod: "daily",
    staffPayouts: calc.staffRows.map((row) => ({
      staffId: row.staffId,
      name: row.name,
      fohPoints: row.fohPoints,
      bohPoints: row.bohPoints,
      totalPoints: row.totalPoints,
      fohPayoutCents: row.fohPayoutCents,
      bohPayoutCents: row.bohPayoutCents,
      payoutCents: row.payoutCents,
      payout: row.payout,
    })),
    shifts: week.shifts.map((shift) => ({
      ...shift,
      staffName: getStaffName(shift.staffId),
      points: calculateShiftPoints(shift),
      detail: getShiftDetail(shift),
    })),
    completedAt,
  };
}

function createCompletedWeekRecord(calc) {
  return {
    id: uid("completed-week"),
    ...getCurrentWeekSnapshot(calc, new Date().toISOString()),
  };
}

function recordCents(record, centsKey, dollarKey) {
  return Number.isFinite(record[centsKey]) ? record[centsKey] : dollarsToCents(record[dollarKey]);
}

function formatWeekRange(weekStart, weekEnd) {
  if (!weekStart || !weekEnd) return "Unknown week";
  return `${dateFormat.format(parseLocalDate(weekStart))} - ${dateFormat.format(parseLocalDate(weekEnd))}`;
}

function getShiftDetail(shift) {
  if (shift.area === "FOH") {
    return `${shift.fohRole}, ${capitalize(shift.fohLevel)}, ${shift.fohDuration === "over" ? "Over 7h" : "Under 7h"}`;
  }
  const { bohContribution, bohShiftSize } = getBohModel(shift);
  return `${bohContribution}, ${capitalize(bohShiftSize)}`;
}

function hasDailyAllocationData(record) {
  return Array.isArray(record.dailyAllocations) && record.dailyAllocations.length > 0;
}

function renderHistoryDailyDetails(record) {
  if (!hasDailyAllocationData(record)) {
    return `
      <div class="legacy-history-note">
        <strong>Legacy weekly allocation record</strong>
        <p>This completed week was created before daily tip allocation existed. It remains readable and exportable using the saved weekly totals.</p>
      </div>
    `;
  }

  return `
    <div class="history-table-wrap">
      <h4>Daily allocation</h4>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Card/Tyro</th>
            <th>Cash</th>
            <th>Total</th>
            <th>FOH pool</th>
            <th>BOH pool</th>
            <th>Points</th>
            <th>Staff payouts</th>
          </tr>
        </thead>
        <tbody>
          ${record.dailyAllocations
            .map(
              (day) => `
                <tr>
                  <td>${escapeHtml(day.weekday)} ${formatShiftDate(day.date)}</td>
                  <td>${moneyFromCents(day.cardTipsCents)}</td>
                  <td>${moneyFromCents(day.cashTipsCents)}</td>
                  <td>${moneyFromCents(day.totalTipsCents)}</td>
                  <td>${moneyFromCents(day.fohPoolCents)}</td>
                  <td>${moneyFromCents(day.bohPoolCents)}</td>
                  <td>FOH ${day.fohPoints} / BOH ${day.bohPoints}</td>
                  <td>${
                    day.staffPayouts.length
                      ? day.staffPayouts.map((row) => `${escapeHtml(row.name)} ${moneyFromCents(row.payoutCents)}`).join(", ")
                      : "No staff payouts"
                  }</td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
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
  const fohRoleSelect = row.querySelector("[data-staff-default-foh]");
  const bohContributionSelect = row.querySelector("[data-staff-default-boh]");
  const savedAreas = getStaffAreas(person);
  if (nameInput) nameInput.value = person.name;
  areaInputs.forEach((input) => {
    input.checked = savedAreas.includes(input.value);
  });
  if (fohRoleSelect) fohRoleSelect.value = getStaffDefaultFohRole(person);
  if (bohContributionSelect) bohContributionSelect.value = getStaffDefaultBohContribution(person);
}

function countActiveWeekShiftsForStaff(staffId) {
  return Object.values(state.weeks).reduce((count, week) => {
    const shifts = Array.isArray(week?.shifts) ? week.shifts : [];
    return count + shifts.filter((shift) => shift.staffId === staffId).length;
  }, 0);
}

function getDeleteStaffConfirmationMessage(person) {
  const shiftCount = countActiveWeekShiftsForStaff(person.id);
  const warning = shiftCount
    ? [
        "",
        `Warning: ${person.name} is linked to ${shiftCount} active week shift${shiftCount === 1 ? "" : "s"}.`,
        "Those shifts will remain, but deleting this staff record may affect active week shift names and calculations.",
      ]
    : [];

  return [
    `Delete staff member ${person.name}?`,
    "",
    "This permanently removes the staff record from the active staff list.",
    "Completed Weekly History will not be changed.",
    ...warning,
  ].join("\n");
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

function getStaffDefaultFohRole(person) {
  return FOH_ROLES.includes(person?.defaultFohRole) ? person.defaultFohRole : DEFAULT_FOH_ROLE;
}

function getStaffDefaultBohContribution(person) {
  return normalizeBohContribution(person?.defaultBohContribution || person?.defaultBohCategory);
}

function applyShiftStaffDefaults() {
  const selectedStaff = getSelectedStaffMember();
  if (!selectedStaff) return;
  elements.fohRole.value = getStaffDefaultFohRole(selectedStaff);
  elements.bohContribution.value = getStaffDefaultBohContribution(selectedStaff);
}

function applyBuilderStaffDefaults() {
  const selectedStaff = getSelectedBuilderStaffMember();
  if (!selectedStaff) return;
  elements.builderFohRole.value = getStaffDefaultFohRole(selectedStaff);
  elements.builderBohContribution.value = getStaffDefaultBohContribution(selectedStaff);
}

function getSelectedStaffMember() {
  return state.staff.find((person) => person.id === elements.shiftStaff.value);
}

function currentShiftDraft() {
  return {
    area: elements.shiftArea.value,
    fohRole: elements.fohRole.value || DEFAULT_FOH_ROLE,
    fohLevel: elements.fohLevel.value || "high",
    fohDuration: elements.fohDuration.value || "over",
    bohContribution: elements.bohContribution.value || DEFAULT_BOH_CONTRIBUTION,
    bohShiftSize: elements.bohShiftSize.value || DEFAULT_BOH_SHIFT_SIZE,
  };
}

function getSelectedBuilderStaffMember() {
  return state.staff.find((person) => person.id === elements.builderStaff.value);
}

function currentBuilderDefaultDraft() {
  return {
    area: elements.builderArea.value,
    fohRole: elements.builderFohRole.value || DEFAULT_FOH_ROLE,
    fohLevel: elements.builderFohLevel.value || "high",
    fohDuration: elements.builderFohDuration.value || "over",
    bohContribution: elements.builderBohContribution.value || DEFAULT_BOH_CONTRIBUTION,
    bohShiftSize: elements.builderBohShiftSize.value || DEFAULT_BOH_SHIFT_SIZE,
  };
}

function getBuilderDayDraft(row) {
  const defaultDraft = currentBuilderDefaultDraft();
  const overrideToggle = row.querySelector("[data-builder-override]");
  if (!overrideToggle?.checked) return defaultDraft;

  return {
    area: row.querySelector("[data-builder-area]")?.value || defaultDraft.area,
    fohRole: row.querySelector("[data-builder-foh-role]")?.value || defaultDraft.fohRole,
    fohLevel: row.querySelector("[data-builder-foh-level]")?.value || defaultDraft.fohLevel,
    fohDuration: row.querySelector("[data-builder-foh-duration]")?.value || defaultDraft.fohDuration,
    bohContribution: row.querySelector("[data-builder-boh-contribution]")?.value || defaultDraft.bohContribution,
    bohShiftSize: row.querySelector("[data-builder-boh-shift-size]")?.value || defaultDraft.bohShiftSize,
  };
}

function getComparableShiftKey(shift) {
  const bohModel = shift.area === "BOH" ? getBohModel(shift) : {};
  const roleOrContribution = shift.area === "FOH" ? shift.fohRole : bohModel.bohContribution;
  const level = shift.area === "FOH" ? shift.fohLevel : "";
  const durationOrSize = shift.area === "FOH" ? shift.fohDuration : bohModel.bohShiftSize;
  return [shift.staffId, shift.date, shift.area, roleOrContribution, level, durationOrSize].join("|");
}

function getShiftDescription(shift) {
  const bohModel = shift.area === "BOH" ? getBohModel(shift) : {};
  return shift.area === "FOH"
    ? `${shift.area} ${shift.fohRole}, ${capitalize(shift.fohLevel)}, ${shift.fohDuration === "over" ? "Over 7h" : "Under 7h"}`
    : `${shift.area} ${bohModel.bohContribution}, ${capitalize(bohModel.bohShiftSize)}`;
}

function renderShiftStaffOptions(selectedStaffId) {
  const staffOptions = state.staff.filter((person) => person.active !== false || person.id === selectedStaffId);
  return staffOptions.length
    ? staffOptions
        .map((person) => {
          const inactiveLabel = person.active === false ? " (inactive)" : "";
          return `<option value="${person.id}" ${person.id === selectedStaffId ? "selected" : ""}>${escapeHtml(person.name)}${inactiveLabel}</option>`;
        })
        .join("")
    : `<option value="">Add staff first</option>`;
}

function renderShiftAreaOptionsForStaff(staffId, selectedArea) {
  const staffMember = state.staff.find((person) => person.id === staffId);
  const areas = getStaffAreas(staffMember);
  return areas.length
    ? areas.map((area) => `<option value="${area}" ${area === selectedArea ? "selected" : ""}>${areaLabel(area)}</option>`).join("")
    : `<option value="">Choose eligible staff first</option>`;
}

function getShiftDraftFromEditRow(row) {
  return {
    date: row.querySelector("[data-edit-date]")?.value || "",
    staffId: row.querySelector("[data-edit-staff]")?.value || "",
    area: row.querySelector("[data-edit-area]")?.value || "",
    fohRole: row.querySelector("[data-edit-foh-role]")?.value || "Manager",
    fohLevel: row.querySelector("[data-edit-foh-level]")?.value || "high",
    fohDuration: row.querySelector("[data-edit-foh-duration]")?.value || "over",
    bohContribution: row.querySelector("[data-edit-boh-contribution]")?.value || DEFAULT_BOH_CONTRIBUTION,
    bohShiftSize: row.querySelector("[data-edit-boh-shift-size]")?.value || DEFAULT_BOH_SHIFT_SIZE,
  };
}

function validateShiftForSave(shift, ignoreId = "") {
  const weekDates = new Set(getWeekDates(state.selectedWeekStart).map((day) => day.date));
  if (!weekDates.has(shift.date)) {
    return "Choose a date inside the selected week.";
  }

  const staffMember = state.staff.find((person) => person.id === shift.staffId);
  if (!staffMember) {
    return "Choose a staff member for this shift.";
  }

  if (!getStaffAreas(staffMember).includes(shift.area)) {
    return `${staffMember.name} is not eligible for that area.`;
  }

  const duplicate = getCurrentWeek().shifts.some((existingShift) => existingShift.id !== ignoreId && getComparableShiftKey(existingShift) === getComparableShiftKey(shift));
  if (duplicate) {
    return `Duplicate shift blocked for ${formatShiftDate(shift.date)}: ${getShiftDescription(shift)}`;
  }

  return "";
}

function updateShiftEditRow(row) {
  const staffSelect = row.querySelector("[data-edit-staff]");
  const areaSelect = row.querySelector("[data-edit-area]");
  const selectedStaff = state.staff.find((person) => person.id === staffSelect?.value);
  const areas = getStaffAreas(selectedStaff);
  const selectedArea = areas.includes(areaSelect?.value) ? areaSelect.value : areas[0] || "";

  if (areaSelect) {
    areaSelect.innerHTML = renderShiftAreaOptionsForStaff(staffSelect?.value || "", selectedArea);
    areaSelect.value = selectedArea;
  }

  const draft = getShiftDraftFromEditRow(row);
  row.querySelector("[data-edit-foh-fields]")?.classList.toggle("hidden", draft.area !== "FOH");
  row.querySelector("[data-edit-boh-fields]")?.classList.toggle("hidden", draft.area === "FOH");
  const points = row.querySelector("[data-edit-points]");
  if (points) points.value = draft.area ? calculateShiftPoints(draft) : 0;
}

function renderShiftEditForm(shift) {
  const sunday = toDateInput(addDays(state.selectedWeekStart, 6));
  const isFoh = shift.area === "FOH";
  const bohModel = getBohModel(shift);
  const points = calculateShiftPoints(shift);

  return `
    <form class="shift-edit-form" data-shift-edit-form="${shift.id}">
      <label>
        Date
        <input type="date" min="${state.selectedWeekStart}" max="${sunday}" value="${shift.date}" data-edit-date required />
      </label>
      <label>
        Staff
        <select data-edit-staff required>${renderShiftStaffOptions(shift.staffId)}</select>
      </label>
      <label>
        Area
        <select data-edit-area required>${renderShiftAreaOptionsForStaff(shift.staffId, shift.area)}</select>
      </label>
      <div class="conditional-fields shift-edit-foh ${isFoh ? "" : "hidden"}" data-edit-foh-fields>
        <label>
          Role
          <select data-edit-foh-role>
            <option value="Manager" ${shift.fohRole === "Manager" ? "selected" : ""}>Manager</option>
            <option value="Waiter" ${shift.fohRole === "Waiter" ? "selected" : ""}>Waiter</option>
          </select>
        </label>
        <label>
          Shift level
          <select data-edit-foh-level>
            <option value="high" ${shift.fohLevel === "high" ? "selected" : ""}>High</option>
            <option value="low" ${shift.fohLevel === "low" ? "selected" : ""}>Low</option>
          </select>
        </label>
        <label>
          Duration
          <select data-edit-foh-duration>
            <option value="over" ${shift.fohDuration === "over" ? "selected" : ""}>Over 7h</option>
            <option value="under" ${shift.fohDuration === "under" ? "selected" : ""}>Under 7h</option>
          </select>
        </label>
      </div>
      <div class="conditional-fields shift-edit-boh ${isFoh ? "hidden" : ""}" data-edit-boh-fields>
        <label>
          Contribution
          <select data-edit-boh-contribution>
            ${BOH_CONTRIBUTIONS.map(
              (contribution) => `<option value="${contribution}" ${bohModel.bohContribution === contribution ? "selected" : ""}>${contribution}</option>`
            ).join("")}
          </select>
        </label>
        <label>
          Shift size
          <select data-edit-boh-shift-size>
            <option value="full" ${bohModel.bohShiftSize === "full" ? "selected" : ""}>Full</option>
            <option value="reduced" ${bohModel.bohShiftSize === "reduced" ? "selected" : ""}>Reduced</option>
          </select>
        </label>
      </div>
      <label>
        Points
        <input type="number" value="${points}" data-edit-points readonly />
      </label>
      <div class="shift-actions shift-edit-actions">
        <button type="submit" data-shift-save="${shift.id}">Save</button>
        <button type="button" data-shift-cancel="${shift.id}">Cancel</button>
      </div>
    </form>
  `;
}

function getWeekTime(weekStart) {
  if (typeof weekStart !== "string" || !weekStart) return NaN;
  const date = parseLocalDate(weekStart);
  return Number.isNaN(date.getTime()) ? NaN : date.getTime();
}

function getPreviousShiftSource() {
  const currentWeekTime = getWeekTime(state.selectedWeekStart);
  const sources = [];

  state.completedWeeks.forEach((week) => {
    const weekTime = getWeekTime(week.weekStart);
    if (weekTime < currentWeekTime && Array.isArray(week.shifts) && week.shifts.length) {
      sources.push({
        weekStart: week.weekStart,
        weekEnd: week.weekEnd || toDateInput(addDays(week.weekStart, 6)),
        shifts: week.shifts,
      });
    }
  });

  Object.entries(state.weeks).forEach(([weekStart, week]) => {
    const weekTime = getWeekTime(weekStart);
    if (weekStart !== state.selectedWeekStart && weekTime < currentWeekTime && Array.isArray(week.shifts) && week.shifts.length) {
      sources.push({
        weekStart,
        weekEnd: toDateInput(addDays(weekStart, 6)),
        shifts: week.shifts,
      });
    }
  });

  return sources.sort((a, b) => getWeekTime(b.weekStart) - getWeekTime(a.weekStart))[0] || null;
}

function createShiftCopyForCurrentWeek(shift, sourceWeekStart) {
  if (!shift.date || !sourceWeekStart) return null;
  const sourceDate = parseLocalDate(shift.date);
  const sourceStartDate = parseLocalDate(sourceWeekStart);
  const dayOffset = Math.round((sourceDate.getTime() - sourceStartDate.getTime()) / 86400000);
  if (!Number.isFinite(dayOffset) || dayOffset < 0 || dayOffset > 6) return null;
  const bohModel = getBohModel(shift);

  return hydrateActiveShift({
    id: uid("shift"),
    date: toDateInput(addDays(state.selectedWeekStart, dayOffset)),
    staffId: shift.staffId,
    area: shift.area,
    fohRole: shift.fohRole || "Manager",
    fohLevel: shift.fohLevel || "high",
    fohDuration: shift.fohDuration || "over",
    ...bohModel,
  });
}

function getCopyPreviousWeekConfirmationMessage(source, shifts) {
  return [
    "Copy previous week shifts?",
    "",
    `From: ${formatWeekRange(source.weekStart, source.weekEnd)}`,
    `To: ${formatWeekRange(state.selectedWeekStart, toDateInput(addDays(state.selectedWeekStart, 6)))}`,
    `Shifts to add: ${shifts.length}`,
    "",
    "Only staff shift setup will be copied. Tip amounts, payouts, and calculations will not be copied.",
  ].join("\n");
}

function copyPreviousWeekShifts() {
  const source = getPreviousShiftSource();
  if (!source) {
    showToast("No previous week with shifts found");
    return;
  }

  const currentWeek = getCurrentWeek();
  const existingKeys = new Set(currentWeek.shifts.map(getComparableShiftKey));
  const batchKeys = new Set();
  const shiftsToCopy = [];

  source.shifts.forEach((shift) => {
    const copiedShift = createShiftCopyForCurrentWeek(shift, source.weekStart);
    if (!copiedShift) return;
    const key = getComparableShiftKey(copiedShift);
    if (existingKeys.has(key) || batchKeys.has(key)) return;
    batchKeys.add(key);
    shiftsToCopy.push(copiedShift);
  });

  if (!shiftsToCopy.length) {
    showToast("Previous week shifts are already copied here");
    return;
  }

  const confirmed = window.confirm(getCopyPreviousWeekConfirmationMessage(source, shiftsToCopy));
  if (!confirmed) return;

  currentWeek.shifts.push(...shiftsToCopy);
  showToast(`${shiftsToCopy.length} previous week shift${shiftsToCopy.length === 1 ? "" : "s"} copied`);
  render();
}

function getBuilderSelectedShifts() {
  const staffMember = getSelectedBuilderStaffMember();
  if (!staffMember || staffMember.active === false) {
    return { error: "Choose an active staff member", shifts: [] };
  }

  const weekDates = new Set(getWeekDates(state.selectedWeekStart).map((day) => day.date));
  const eligibleAreas = getStaffAreas(staffMember);
  const selectedRows = Array.from(elements.builderDays.querySelectorAll("[data-builder-worked]:checked")).map((input) => input.closest(".builder-day-row"));
  if (!selectedRows.length) {
    return { error: "Tick at least one worked day", shifts: [] };
  }

  const shifts = [];
  const batchKeys = new Set();
  const existingKeys = new Set(getCurrentWeek().shifts.map(getComparableShiftKey));

  for (const row of selectedRows) {
    const date = row.dataset.builderDate;
    if (!weekDates.has(date)) {
      return { error: `${date} is outside the active reporting week`, shifts: [] };
    }

    const draft = getBuilderDayDraft(row);
    if (!eligibleAreas.includes(draft.area)) {
      return { error: `${staffMember.name} is not eligible for ${draft.area} on ${formatShiftDate(date)}`, shifts: [] };
    }

    const shift = {
      id: uid("shift"),
      date,
      staffId: staffMember.id,
      ...draft,
    };
    const key = getComparableShiftKey(shift);
    if (existingKeys.has(key) || batchKeys.has(key)) {
      return { error: `Duplicate shift blocked for ${formatShiftDate(date)}: ${getShiftDescription(shift)}`, shifts: [] };
    }

    batchKeys.add(key);
    shifts.push(shift);
  }

  return { error: "", shifts, staffMember };
}

function render() {
  const week = getCurrentWeek();
  const sunday = addDays(state.selectedWeekStart, 6);
  const calc = getCalculations();

  elements.weekStart.value = state.selectedWeekStart;
  elements.shiftDate.min = state.selectedWeekStart;
  elements.shiftDate.max = toDateInput(sunday);
  if (!elements.shiftDate.value) elements.shiftDate.value = state.selectedWeekStart;
  elements.weekRangeLabel.textContent = formatWeekRange(state.selectedWeekStart, toDateInput(sunday));
  elements.fohSplit.value = week.fohSplit;
  elements.bohSplit.value = week.bohSplit;
  elements.heroTotalTips.textContent = moneyFromCents(calc.totalTipsCents);
  elements.heroSplit.textContent = `FOH ${week.fohSplit}% / BOH ${week.bohSplit}%`;

  renderDailyTips(week, calc);
  renderStaff();
  renderShiftForm();
  renderBuilderForm();
  renderSummary(calc);
  renderPrintReport(calc);
  renderShifts();
  renderWeeklyHistory();
  saveState();
}

function renderDailyTips(week, calc) {
  elements.dailyTipsBody.innerHTML = week.dailyTips
    .map((day) => {
      const allocation = calc.dailyAllocations.find((dailyAllocation) => dailyAllocation.date === day.date);
      return `
        <tr>
          <td>
            <strong>${escapeHtml(day.weekday)}</strong>
            <span class="subtle-date">${formatShiftDate(day.date)}</span>
          </td>
          <td>
            <input type="number" min="0" step="0.01" inputmode="decimal" value="${day.cardTips || ""}" data-daily-tip-date="${day.date}" data-daily-tip-type="cardTips" aria-label="${escapeHtml(day.weekday)} Card/Tyro tips" />
          </td>
          <td>
            <input type="number" min="0" step="0.01" inputmode="decimal" value="${day.cashTips || ""}" data-daily-tip-date="${day.date}" data-daily-tip-type="cashTips" aria-label="${escapeHtml(day.weekday)} cash tips" />
          </td>
          <td><strong data-daily-total="${day.date}">${moneyFromCents(allocation?.totalTipsCents || 0)}</strong></td>
        </tr>
      `;
    })
    .join("");

  const showReviewNotice = week.dailyTipsMigratedFromWeekly === true;
  elements.dailyTipsNotice.classList.toggle("hidden", !showReviewNotice);
  elements.dailyTipsReviewed.checked = week.dailyTipsReviewed === true;
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
  if (elements.shiftStaff.value && elements.shiftStaff.value !== selectedStaffId) {
    applyShiftStaffDefaults();
  }

  elements.staffList.innerHTML = state.staff.length
    ? state.staff
        .map(
          (person) => {
            const areas = getStaffAreas(person);
            const isActive = person.active !== false;
            const fohDefault = getStaffDefaultFohRole(person);
            const bohDefault = getStaffDefaultBohContribution(person);
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
                ${
                  isActive && areas.includes("FOH")
                    ? `<label class="staff-default-field">
                        Default FOH Role
                        <select data-staff-default-foh="${person.id}" aria-label="Default FOH role for ${escapeHtml(person.name)}">
                          ${FOH_ROLES.map((role) => `<option value="${role}" ${role === fohDefault ? "selected" : ""}>${role}</option>`).join("")}
                        </select>
                      </label>`
                    : ""
                }
                ${
                  isActive && areas.includes("BOH")
                    ? `<label class="staff-default-field">
                        Default BOH Contribution
                        <select data-staff-default-boh="${person.id}" aria-label="Default BOH contribution for ${escapeHtml(person.name)}">
                          ${BOH_CONTRIBUTIONS.map(
                            (contribution) => `<option value="${contribution}" ${contribution === bohDefault ? "selected" : ""}>${contribution}</option>`
                          ).join("")}
                        </select>
                      </label>`
                    : ""
                }
                <p class="validation-message staff-card-validation hidden" data-staff-validation="${person.id}" role="alert"></p>
              </div>
              <div class="staff-row-actions">
                <button type="button" data-staff-save="${person.id}">Save</button>
                <button type="button" data-staff-toggle="${person.id}">
                  ${person.active === false ? "Reactivate" : "Deactivate"}
                </button>
                <button class="staff-delete-button" type="button" data-staff-delete="${person.id}">Delete</button>
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

function renderBuilderForm() {
  const activeStaff = state.staff.filter((person) => person.active !== false);
  const selectedStaffId = elements.builderStaff.value;
  elements.builderStaff.innerHTML = activeStaff.length
    ? activeStaff.map((person) => `<option value="${person.id}">${escapeHtml(person.name)}</option>`).join("")
    : `<option value="">Add staff first</option>`;
  if (activeStaff.some((person) => person.id === selectedStaffId)) {
    elements.builderStaff.value = selectedStaffId;
  }
  if (elements.builderStaff.value && elements.builderStaff.value !== selectedStaffId) {
    applyBuilderStaffDefaults();
  }

  renderBuilderAreaOptions();
  renderBuilderDefaultFields();
  renderBuilderDays();
}

function renderBuilderAreaOptions() {
  const selectedStaff = getSelectedBuilderStaffMember();
  const areas = getStaffAreas(selectedStaff);
  const selectedArea = elements.builderArea.value;
  elements.builderArea.innerHTML = areas.length
    ? areas.map((area) => `<option value="${area}">${areaLabel(area)}</option>`).join("")
    : `<option value="">Choose eligible staff first</option>`;
  if (areas.includes(selectedArea)) {
    elements.builderArea.value = selectedArea;
  }
}

function renderBuilderDefaultFields() {
  const isFoh = elements.builderArea.value === "FOH";
  elements.builderFohFields.classList.toggle("hidden", !isFoh);
  elements.builderBohFields.classList.toggle("hidden", isFoh);
}

function renderBuilderDays() {
  const selectedStaff = getSelectedBuilderStaffMember();
  const eligibleAreas = getStaffAreas(selectedStaff);
  const defaultDraft = currentBuilderDefaultDraft();
  const previousRows = new Map(
    Array.from(elements.builderDays.querySelectorAll(".builder-day-row")).map((row) => [
      row.dataset.builderDate,
      {
        worked: row.querySelector("[data-builder-worked]")?.checked || false,
        override: row.querySelector("[data-builder-override]")?.checked || false,
        draft: getBuilderDayDraft(row),
      },
    ])
  );

  elements.builderDays.innerHTML = getWeekDates(state.selectedWeekStart)
    .map((day) => {
      const saved = previousRows.get(day.date);
      const worked = saved?.worked || false;
      const override = saved?.override || false;
      const draft = override ? saved.draft : defaultDraft;
      const points = worked ? calculateShiftPoints(draft) : 0;
      return `
        <article class="builder-day-row ${worked ? "selected" : ""}" data-builder-date="${day.date}">
          <div class="builder-day-main">
            <label class="builder-worked">
              <input type="checkbox" data-builder-worked ${worked ? "checked" : ""} />
              <span>
                <strong>${escapeHtml(day.weekday)}</strong>
                <small>${formatShiftDate(day.date)}</small>
              </span>
            </label>
            <b data-builder-points>${points} pts</b>
            <label class="builder-override-toggle">
              <input type="checkbox" data-builder-override ${override ? "checked" : ""} />
              Override
            </label>
          </div>
          <div class="builder-override-fields ${override ? "" : "hidden"}">
            <label>
              Area
              <select data-builder-area ${eligibleAreas.length < 2 ? "disabled" : ""}>
                ${eligibleAreas.map((area) => `<option value="${area}" ${draft.area === area ? "selected" : ""}>${area}</option>`).join("")}
              </select>
            </label>
            <div class="builder-foh-override ${draft.area === "FOH" ? "" : "hidden"}">
              <label>
                Role
                <select data-builder-foh-role>
                  <option value="Manager" ${draft.fohRole === "Manager" ? "selected" : ""}>Manager</option>
                  <option value="Waiter" ${draft.fohRole === "Waiter" ? "selected" : ""}>Waiter</option>
                </select>
              </label>
              <label>
                Shift level
                <select data-builder-foh-level>
                  <option value="high" ${draft.fohLevel === "high" ? "selected" : ""}>High</option>
                  <option value="low" ${draft.fohLevel === "low" ? "selected" : ""}>Low</option>
                </select>
              </label>
              <label>
                Duration
                <select data-builder-foh-duration>
                  <option value="over" ${draft.fohDuration === "over" ? "selected" : ""}>Over 7h</option>
                  <option value="under" ${draft.fohDuration === "under" ? "selected" : ""}>Under 7h</option>
                </select>
              </label>
            </div>
            <div class="builder-boh-override ${draft.area === "BOH" ? "" : "hidden"}">
              <label>
                Contribution
                <select data-builder-boh-contribution>
                  ${BOH_CONTRIBUTIONS.map(
                    (contribution) => `<option value="${contribution}" ${draft.bohContribution === contribution ? "selected" : ""}>${contribution}</option>`
                  ).join("")}
                </select>
              </label>
              <label>
                Shift size
                <select data-builder-boh-shift-size>
                  <option value="full" ${draft.bohShiftSize === "full" ? "selected" : ""}>Full</option>
                  <option value="reduced" ${draft.bohShiftSize === "reduced" ? "selected" : ""}>Reduced</option>
                </select>
              </label>
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

function updateBuilderDayRow(row) {
  const worked = row.querySelector("[data-builder-worked]")?.checked || false;
  const override = row.querySelector("[data-builder-override]")?.checked || false;
  const draft = getBuilderDayDraft(row);
  row.classList.toggle("selected", worked);
  row.querySelector(".builder-override-fields")?.classList.toggle("hidden", !override);
  row.querySelector(".builder-foh-override")?.classList.toggle("hidden", draft.area !== "FOH");
  row.querySelector(".builder-boh-override")?.classList.toggle("hidden", draft.area !== "BOH");
  const points = row.querySelector("[data-builder-points]");
  if (points) points.textContent = `${worked ? calculateShiftPoints(draft) : 0} pts`;
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

  renderDailyAllocation(calc);
}

function renderPrintReport(calc) {
  const week = getCurrentWeek();
  const weekEnd = toDateInput(addDays(state.selectedWeekStart, 6));

  elements.printWeekRange.textContent = formatWeekRange(state.selectedWeekStart, weekEnd);
  elements.printCardTips.textContent = moneyFromCents(calc.cardTipsCents);
  elements.printCashTips.textContent = moneyFromCents(calc.cashTipsCents);
  elements.printTotalTips.textContent = moneyFromCents(calc.totalTipsCents);
  elements.printFohPool.textContent = `${week.fohSplit}% / ${moneyFromCents(calc.fohPoolCents)}`;
  elements.printBohPool.textContent = `${week.bohSplit}% / ${moneyFromCents(calc.bohPoolCents)}`;
  elements.printTotalPoints.textContent = calc.totalPoints;
  elements.printGeneratedDate.textContent = generatedDateFormat.format(new Date());

  elements.printDailyTipsBody.innerHTML = calc.dailyAllocations
    .map(
      (day) => `
        <tr>
          <td>${escapeHtml(day.weekday)} ${formatShiftDate(day.date)}</td>
          <td>${moneyFromCents(day.cardTipsCents)}</td>
          <td>${moneyFromCents(day.cashTipsCents)}</td>
          <td>${moneyFromCents(day.totalTipsCents)}</td>
        </tr>
      `
    )
    .join("");

  elements.printStaffPayoutBody.innerHTML = calc.staffRows.length
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
    : `<tr><td colspan="5">No staff payouts for this week.</td></tr>`;
}

function renderDailyAllocation(calc) {
  elements.dailyAllocationList.innerHTML = calc.dailyAllocations
    .map((day) => {
      const payoutText = day.staffPayouts.length
        ? day.staffPayouts
            .map((row) => `${escapeHtml(row.name)} ${moneyFromCents(row.payoutCents)}`)
            .join(", ")
        : "No staff payouts";
      const errorHtml = day.validationErrors.length
        ? `<p class="allocation-error">${day.validationErrors.map(escapeHtml).join("<br />")}</p>`
        : "";
      return `
        <article class="daily-allocation-card">
          <div class="daily-allocation-heading">
            <strong>${escapeHtml(day.weekday)} ${formatShiftDate(day.date)}</strong>
            <span>${moneyFromCents(day.totalTipsCents)} total</span>
          </div>
          <div class="daily-allocation-metrics">
            <span>Card/Tyro ${moneyFromCents(day.cardTipsCents)}</span>
            <span>Cash ${moneyFromCents(day.cashTipsCents)}</span>
            <span>FOH ${moneyFromCents(day.fohPoolCents)} / ${day.fohPoints} pts</span>
            <span>BOH ${moneyFromCents(day.bohPoolCents)} / ${day.bohPoints} pts</span>
          </div>
          <p>${payoutText}</p>
          ${errorHtml}
        </article>
      `;
    })
    .join("");
}

function renderShifts() {
  const week = getCurrentWeek();
  elements.shiftList.innerHTML = week.shifts.length
    ? week.shifts
        .map((shift) => {
          const points = calculateShiftPoints(shift);
          const detail = getShiftDetail(shift);
          if (editingShiftId === shift.id) {
            return `
              <article class="shift-row editing-shift-row">
                ${renderShiftEditForm(shift)}
              </article>
            `;
          }
          return `
            <article class="shift-row">
              <div>
                <strong>${escapeHtml(getStaffName(shift.staffId))}</strong>
                <span>${formatShiftDate(shift.date)} | ${shift.area} | ${detail}</span>
              </div>
              <div class="shift-actions">
                <b>${points} pts</b>
                <button type="button" data-shift-edit="${shift.id}">Edit</button>
                <button type="button" data-shift-delete="${shift.id}">Delete</button>
              </div>
            </article>
          `;
        })
        .join("")
    : `<p class="empty-state">No shifts entered for this week.</p>`;
}

function renderWeeklyHistory() {
  const completedWeeks = [...state.completedWeeks].sort((a, b) => String(b.completedAt || "").localeCompare(String(a.completedAt || "")));
  elements.weeklyHistoryList.innerHTML = completedWeeks.length
    ? completedWeeks
        .map((week) => {
          const staffReceivingPayouts = week.staffPayouts.filter((row) => Number(row.payoutCents) > 0).length;
          const completedDate = week.completedAt ? new Date(week.completedAt).toLocaleString("en-AU") : "Unknown completion time";
          return `
            <article class="history-week">
              <div class="history-week-heading">
                <div>
                  <strong>${escapeHtml(formatWeekRange(week.weekStart, week.weekEnd))}</strong>
                  <span>${moneyFromCents(recordCents(week, "totalTipsCents", "totalTips"))} total tips | ${week.shifts.length} shifts | ${staffReceivingPayouts} staff paid</span>
                  <span>${hasDailyAllocationData(week) ? "Daily tip allocation" : "Legacy weekly allocation"}</span>
                  <span>Completed ${escapeHtml(completedDate)}</span>
                </div>
                <div class="history-week-actions">
                  <button type="button" data-history-reopen="${week.id}">Reopen Week</button>
                  <button type="button" data-history-export="${week.id}">Export Excel</button>
                  <button type="button" data-history-delete="${week.id}">Delete</button>
                </div>
              </div>

              <details>
                <summary>View payouts and detailed shifts</summary>
                <div class="history-detail-grid">
                  ${renderHistoryDailyDetails(week)}

                  <div class="history-table-wrap">
                    <h4>Staff payouts</h4>
                    <table>
                      <thead>
                        <tr>
                          <th>Staff</th>
                          <th>FOH points</th>
                          <th>BOH points</th>
                          <th>Total points</th>
                          <th>Final payout</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${week.staffPayouts
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
                          .join("")}
                      </tbody>
                    </table>
                  </div>

                  <div class="history-table-wrap">
                    <h4>Detailed shifts</h4>
                    <table>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Staff</th>
                          <th>Area</th>
                          <th>Details</th>
                          <th>Points</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${week.shifts
                          .map(
                            (shift) => `
                              <tr>
                                <td>${escapeHtml(shift.date)}</td>
                                <td>${escapeHtml(shift.staffName || getStaffName(shift.staffId))}</td>
                                <td>${escapeHtml(shift.area)}</td>
                                <td>${escapeHtml(shift.detail || getShiftDetail(shift))}</td>
                                <td>${Number.isFinite(shift.points) ? shift.points : calculateShiftPoints(shift)}</td>
                              </tr>
                            `
                          )
                          .join("")}
                      </tbody>
                    </table>
                  </div>
                </div>
              </details>
            </article>
          `;
        })
        .join("")
    : `<p class="empty-state">No completed weeks yet.</p>`;
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
  const weeklyTotals = getDailyTipTotals(week.dailyTips);
  week.cardTips = centsToDollars(weeklyTotals.cardTipsCents);
  week.cashTips = centsToDollars(weeklyTotals.cashTipsCents);
  elements.heroTotalTips.textContent = moneyFromCents(calc.totalTipsCents);
  elements.heroSplit.textContent = `FOH ${week.fohSplit}% / BOH ${week.bohSplit}%`;
  calc.dailyAllocations.forEach((day) => {
    const totalElement = document.querySelector(`[data-daily-total="${day.date}"]`);
    if (totalElement) totalElement.textContent = moneyFromCents(day.totalTipsCents);
  });
  renderSummary(calc);
  saveState();
}

function updateDailyTipValue(date, key, field) {
  const week = getCurrentWeek();
  const day = week.dailyTips.find((dailyTip) => dailyTip.date === date);
  if (!day) return;
  const rawValue = field.value.trim();
  const numericValue = Number(field.value);
  if (rawValue.startsWith("-") || numericValue < 0) {
    field.value = "0";
    day[key] = 0;
  } else {
    day[key] = Number.isFinite(numericValue) ? numericValue : 0;
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

function startOrSelectWeek() {
  const selectedDate = parseLocalDate(elements.weekStart.value);
  if (Number.isNaN(selectedDate.getTime())) {
    elements.weekStart.value = state.selectedWeekStart;
    showToast("Choose a valid week date");
    return;
  }

  const monday = toDateInput(getMonday(selectedDate));
  if (monday === state.selectedWeekStart) {
    elements.weekStart.value = state.selectedWeekStart;
    showToast("This week is already selected");
    return;
  }

  const existingWeek = Boolean(state.weeks[monday]);
  const confirmed = window.confirm(getWeekSwitchConfirmationMessage(monday, existingWeek));
  if (!confirmed) {
    elements.weekStart.value = state.selectedWeekStart;
    return;
  }

  const currentWeek = getCurrentWeek();
  if (!existingWeek) {
    state.weeks[monday] = createBlankWeek(currentWeek.fohSplit, currentWeek.bohSplit, monday);
  }

  state.selectedWeekStart = monday;
  editingShiftId = "";
  render();
  showToast(existingWeek ? "Saved week loaded" : "Blank week started");
}

elements.startSelectWeek.addEventListener("click", startOrSelectWeek);

elements.dailyTipsBody.addEventListener("input", (event) => {
  const date = event.target.dataset.dailyTipDate;
  const type = event.target.dataset.dailyTipType;
  if (!date || !type) return;
  updateDailyTipValue(date, type, event.target);
});

elements.dailyTipsReviewed.addEventListener("change", () => {
  const week = getCurrentWeek();
  week.dailyTipsReviewed = elements.dailyTipsReviewed.checked;
  renderCalculatedMoney();
});

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
  state.staff.push({
    id: uid("staff"),
    name,
    active: true,
    areas,
    defaultFohRole: DEFAULT_FOH_ROLE,
    defaultBohContribution: DEFAULT_BOH_CONTRIBUTION,
  });
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
  const deleteId = event.target.dataset.staffDelete;

  if (saveId) {
    const person = state.staff.find((staff) => staff.id === saveId);
    const row = event.target.closest(".staff-row");
    if (!person || !row) return;
    const nameInput = row.querySelector("[data-staff-name]");
    const areaInputs = Array.from(row.querySelectorAll("[data-staff-area]"));
    const fohRoleSelect = row.querySelector("[data-staff-default-foh]");
    const bohContributionSelect = row.querySelector("[data-staff-default-boh]");
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
    person.defaultFohRole = FOH_ROLES.includes(fohRoleSelect?.value) ? fohRoleSelect.value : getStaffDefaultFohRole(person);
    person.defaultBohContribution = BOH_CONTRIBUTIONS.includes(bohContributionSelect?.value)
      ? bohContributionSelect.value
      : getStaffDefaultBohContribution(person);
    delete person.defaultBohCategory;
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
    return;
  }

  if (deleteId) {
    const person = state.staff.find((staff) => staff.id === deleteId);
    if (!person) return;
    const confirmed = window.confirm(getDeleteStaffConfirmationMessage(person));
    if (!confirmed) return;
    state.staff = state.staff.filter((staff) => staff.id !== deleteId);
    showToast("Staff deleted");
    render();
  }
});

elements.shiftStaff.addEventListener("change", () => {
  applyShiftStaffDefaults();
  renderShiftForm();
});

["change", "input"].forEach((eventName) => {
  [elements.shiftArea, elements.fohRole, elements.fohLevel, elements.fohDuration, elements.bohContribution, elements.bohShiftSize].forEach((field) => {
    field.addEventListener(eventName, renderShiftForm);
  });
});

elements.builderStaff.addEventListener("change", () => {
  applyBuilderStaffDefaults();
  renderBuilderForm();
});
elements.builderArea.addEventListener("change", () => {
  renderBuilderDefaultFields();
  renderBuilderDays();
});
[elements.builderFohRole, elements.builderFohLevel, elements.builderFohDuration, elements.builderBohContribution, elements.builderBohShiftSize].forEach((field) => {
  field.addEventListener("change", renderBuilderDays);
});

elements.builderDays.addEventListener("change", (event) => {
  const row = event.target.closest(".builder-day-row");
  if (!row) return;
  updateBuilderDayRow(row);
});

elements.builderForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const result = getBuilderSelectedShifts();
  if (result.error) {
    showToast(result.error);
    return;
  }

  const confirmed = window.confirm(getBuilderConfirmationMessage(result.staffMember, result.shifts));
  if (!confirmed) return;

  const week = getCurrentWeek();
  const nextWeek = {
    ...week,
    shifts: [...week.shifts, ...result.shifts],
  };
  const nextState = hydrateState({
    ...state,
    weeks: {
      ...state.weeks,
      [state.selectedWeekStart]: nextWeek,
    },
  });

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
    state = nextState;
    elements.builderDays.querySelectorAll("[data-builder-worked]").forEach((input) => {
      input.checked = false;
    });
    showToast(`${result.shifts.length} shifts added`);
    render();
  } catch {
    showToast("Could not save selected shifts");
  }
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
  const validationMessage = validateShiftForSave(shift);
  if (validationMessage) {
    showToast(validationMessage);
    return;
  }
  getCurrentWeek().shifts.push(shift);
  showToast("Shift added");
  render();
});

elements.shiftList.addEventListener("click", (event) => {
  const editId = event.target.dataset.shiftEdit;
  const cancelId = event.target.dataset.shiftCancel;
  const id = event.target.dataset.shiftDelete;

  if (editId) {
    editingShiftId = editId;
    renderShifts();
    return;
  }

  if (cancelId) {
    editingShiftId = "";
    renderShifts();
    return;
  }

  if (!id) return;
  const week = getCurrentWeek();
  week.shifts = week.shifts.filter((shift) => shift.id !== id);
  if (editingShiftId === id) editingShiftId = "";
  showToast("Shift deleted");
  render();
});

elements.shiftList.addEventListener("submit", (event) => {
  const row = event.target.closest("[data-shift-edit-form]");
  if (!row) return;
  event.preventDefault();

  const shiftId = row.dataset.shiftEditForm;
  const week = getCurrentWeek();
  const shift = week.shifts.find((currentShift) => currentShift.id === shiftId);
  if (!shift) return;

  const nextShift = {
    ...shift,
    ...getShiftDraftFromEditRow(row),
  };
  const validationMessage = validateShiftForSave(nextShift, shiftId);
  if (validationMessage) {
    showToast(validationMessage);
    return;
  }

  Object.assign(shift, nextShift);
  editingShiftId = "";
  showToast("Shift updated");
  render();
});

elements.shiftList.addEventListener("change", (event) => {
  const row = event.target.closest("[data-shift-edit-form]");
  if (row) updateShiftEditRow(row);
});

elements.copyPreviousWeekShifts.addEventListener("click", copyPreviousWeekShifts);

elements.exportExcel.addEventListener("click", () => {
  const week = getCurrentWeek();
  const calc = getCalculations();
  const validationMessage = validateWeekForExport(week, calc, "exporting");
  if (validationMessage) {
    showToast(validationMessage);
    return;
  }
  exportExcel(getCurrentWeekSnapshot(calc));
});

elements.printSummary.addEventListener("click", () => {
  renderPrintReport(getCalculations());
  window.print();
});

elements.backupData.addEventListener("click", downloadBackupData);

elements.restoreData.addEventListener("click", () => {
  elements.restoreBackupFile.click();
});

elements.restoreBackupFile.addEventListener("change", async () => {
  const file = elements.restoreBackupFile.files?.[0];
  await restoreBackupData(file);
  elements.restoreBackupFile.value = "";
});

elements.clearCurrentWeek.addEventListener("click", clearCurrentWeek);
elements.finishWeek.addEventListener("click", finishCurrentWeek);

elements.weeklyHistoryList.addEventListener("click", (event) => {
  const reopenId = event.target.dataset.historyReopen;
  const exportId = event.target.dataset.historyExport;
  const deleteId = event.target.dataset.historyDelete;

  if (reopenId) {
    const completedWeek = state.completedWeeks.find((week) => week.id === reopenId);
    if (!completedWeek) return;
    reopenCompletedWeek(completedWeek);
    return;
  }

  if (exportId) {
    const completedWeek = state.completedWeeks.find((week) => week.id === exportId);
    if (!completedWeek) return;
    exportExcel(completedWeek);
    return;
  }

  if (deleteId) {
    const completedWeek = state.completedWeeks.find((week) => week.id === deleteId);
    if (!completedWeek) return;
    const confirmed = window.confirm(`Delete completed week ${formatWeekRange(completedWeek.weekStart, completedWeek.weekEnd)} from Weekly History?`);
    if (!confirmed) return;
    state.completedWeeks = state.completedWeeks.filter((week) => week.id !== deleteId);
    showToast("Completed week deleted");
    render();
  }
});

function reopenCompletedWeek(completedWeek) {
  if (!isCurrentWeekEmpty()) {
    showToast("Finish or clear the active week before reopening a completed week");
    return;
  }

  const confirmed = window.confirm(getReopenConfirmationMessage(completedWeek));
  if (!confirmed) return;

  const restoredWeek = createWeekFromCompletedRecord(completedWeek);
  const nextState = hydrateState({
    ...state,
    selectedWeekStart: completedWeek.weekStart,
    weeks: {
      ...state.weeks,
      [completedWeek.weekStart]: restoredWeek,
    },
    completedWeeks: state.completedWeeks.filter((week) => week.id !== completedWeek.id),
  });

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
    state = nextState;
    showToast("Week reopened for editing");
    render();
  } catch {
    showToast("Could not reopen completed week");
  }
}

function clearCurrentWeek() {
  if (isCurrentWeekEmpty()) {
    showToast("Current week is already empty");
    return;
  }

  const week = getCurrentWeek();
  const calc = getCalculations();
  const confirmed = window.confirm(getClearCurrentWeekConfirmationMessage(week, calc));
  if (!confirmed) return;

  const clearedWeek = createBlankWeek(week.fohSplit, week.bohSplit, state.selectedWeekStart);
  const nextState = hydrateState({
    ...state,
    selectedWeekStart: state.selectedWeekStart,
    weeks: {
      ...state.weeks,
      [state.selectedWeekStart]: clearedWeek,
    },
  });

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
    state = nextState;
    editingShiftId = "";
    showToast("Current week cleared");
    render();
  } catch {
    showToast("Could not clear current week");
  }
}

function finishCurrentWeek() {
  const week = getCurrentWeek();
  const calc = getCalculations();
  const validationMessage = validateWeekForCompletion(week, calc);
  if (validationMessage) {
    showToast(validationMessage);
    return;
  }

  const completedRecord = createCompletedWeekRecord(calc);
  const confirmed = window.confirm(getFinishConfirmationMessage(completedRecord));
  if (!confirmed) return;

  const nextWeekStart = toDateInput(addDays(state.selectedWeekStart, 7));
  const resetWeek = createBlankWeek(week.fohSplit, week.bohSplit);
  const nextWeeks = {
    ...state.weeks,
    [state.selectedWeekStart]: resetWeek,
  };

  if (!nextWeeks[nextWeekStart]) {
    nextWeeks[nextWeekStart] = createBlankWeek(week.fohSplit, week.bohSplit, nextWeekStart);
  }

  const nextState = hydrateState({
    ...state,
    weeks: nextWeeks,
    completedWeeks: [completedRecord, ...state.completedWeeks],
    selectedWeekStart: nextWeekStart,
  });

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
    state = nextState;
    showToast("Week completed and saved");
    render();
  } catch {
    showToast("Could not save completed week");
  }
}

function getFinishConfirmationMessage(record) {
  const staffReceivingPayouts = record.staffPayouts.filter((row) => row.payoutCents > 0).length;
  return [
    "Finish this week?",
    "",
    `Week: ${record.weekStart} to ${record.weekEnd}`,
    `Total tips: ${moneyFromCents(record.totalTipsCents)}`,
    `FOH pool: ${moneyFromCents(record.fohPoolCents)}`,
    `BOH pool: ${moneyFromCents(record.bohPoolCents)}`,
    `Shifts: ${record.shifts.length}`,
    `Staff receiving payouts: ${staffReceivingPayouts}`,
    "",
    "This will save the completed week, clear current tips and shifts, and move the dashboard forward seven days.",
  ].join("\n");
}

function getClearCurrentWeekConfirmationMessage(week, calc) {
  return [
    "Clear current week?",
    "",
    `Week: ${formatWeekRange(state.selectedWeekStart, toDateInput(addDays(state.selectedWeekStart, 6)))}`,
    `Total tips currently entered: ${moneyFromCents(calc.totalTipsCents)}`,
    `Shifts that will be removed: ${week.shifts.length}`,
    "",
    "Warning: active week tips and shifts will be permanently cleared.",
    "Saved staff and completed Weekly History will not be changed.",
  ].join("\n");
}

function getWeekSwitchConfirmationMessage(weekStart, existingWeek) {
  const weekEnd = toDateInput(addDays(weekStart, 6));
  return [
    existingWeek ? "Load saved active week?" : "Start a blank active week?",
    "",
    `Current week: ${formatWeekRange(state.selectedWeekStart, toDateInput(addDays(state.selectedWeekStart, 6)))}`,
    `Selected week: ${formatWeekRange(weekStart, weekEnd)}`,
    "",
    "Current week data will stay saved. Completed Weekly History will not be changed.",
  ].join("\n");
}

function getReopenConfirmationMessage(record) {
  return [
    "Reopen this completed week?",
    "",
    `Week: ${record.weekStart} to ${record.weekEnd}`,
    `Total tips: ${moneyFromCents(recordCents(record, "totalTipsCents", "totalTips"))}`,
    `Shifts: ${record.shifts.length}`,
    `Staff payouts: ${record.staffPayouts.length}`,
    "",
    "The completed record will return to active editing.",
  ].join("\n");
}

function getBuilderConfirmationMessage(staffMember, shifts) {
  const totalPoints = shifts.reduce((sum, shift) => sum + calculateShiftPoints(shift), 0);
  const shiftLines = shifts.map((shift) => `${shift.date}: ${getShiftDescription(shift)} - ${calculateShiftPoints(shift)} pts`);
  return [
    "Add selected weekly shifts?",
    "",
    `Employee: ${staffMember.name}`,
    `Shifts being added: ${shifts.length}`,
    `Selected dates: ${shifts.map((shift) => shift.date).join(", ")}`,
    "",
    ...shiftLines,
    "",
    `Total points being added: ${totalPoints}`,
  ].join("\n");
}

function exportExcel(record) {
  const rows = [];
  const isDailyRecord = hasDailyAllocationData(record);

  rows.push(["Andiamo Trattoria Chippendale - Weekly Tip Distribution"]);
  rows.push(["Week", `${record.weekStart} to ${record.weekEnd}`]);
  if (record.completedAt) rows.push(["Completed", new Date(record.completedAt).toLocaleString("en-AU")]);
  rows.push(["Allocation method", isDailyRecord ? "Daily tip allocation" : "Legacy weekly allocation"]);
  rows.push(["Card/Tyro tips", record.cardTips]);
  rows.push(["Cash tips", record.cashTips]);
  rows.push(["Total tips", record.totalTips]);
  rows.push(["FOH split %", record.fohSplit]);
  rows.push(["BOH split %", record.bohSplit]);
  rows.push(["FOH total", record.fohPool]);
  rows.push(["BOH total", record.bohPool]);

  if (isDailyRecord) {
    rows.push([]);
    rows.push(["Daily tips and pools"]);
    rows.push(["Date", "Weekday", "Card/Tyro tips", "Cash tips", "Daily total", "FOH pool", "BOH pool", "FOH points", "BOH points"]);
    record.dailyAllocations.forEach((day) => {
      rows.push([
        day.date,
        day.weekday,
        day.cardTips,
        day.cashTips,
        day.totalTips,
        day.fohPool,
        day.bohPool,
        day.fohPoints,
        day.bohPoints,
      ]);
    });

    rows.push([]);
    rows.push(["Daily staff payout allocations"]);
    rows.push(["Date", "Weekday", "Staff", "FOH points", "BOH points", "Total points", "FOH payout", "BOH payout", "Daily payout"]);
    record.dailyAllocations.forEach((day) => {
      if (!day.staffPayouts.length) {
        rows.push([day.date, day.weekday, "No staff payouts", 0, 0, 0, 0, 0, 0]);
        return;
      }
      day.staffPayouts.forEach((row) => {
        rows.push([
          day.date,
          day.weekday,
          row.name,
          row.fohPoints,
          row.bohPoints,
          row.totalPoints,
          centsToDollars(row.fohPayoutCents),
          centsToDollars(row.bohPayoutCents),
          row.payout,
        ]);
      });
    });
  } else {
    rows.push([]);
    rows.push(["Legacy note", "This completed week was created before daily tip allocation existed. Daily tip records are not available for this saved record."]);
  }

  rows.push([]);
  rows.push(["Weekly staff payout totals"]);
  rows.push(["Staff", "FOH points", "BOH points", "Total points", "Final payout"]);
  record.staffPayouts.forEach((row) => rows.push([row.name, row.fohPoints, row.bohPoints, row.totalPoints, row.payout]));
  rows.push([]);
  rows.push(["Detailed shifts"]);
  rows.push(["Date", "Staff", "Area", "Role/contribution", "High/low", "Duration/shift size", "Points"]);
  record.shifts.forEach((shift) => {
    const bohModel = shift.area === "BOH" ? getBohModel(shift) : {};
    rows.push([
      shift.date,
      shift.staffName || getStaffName(shift.staffId),
      shift.area,
      shift.area === "FOH" ? shift.fohRole : bohModel.bohContribution,
      shift.area === "FOH" ? capitalize(shift.fohLevel) : "",
      shift.area === "FOH" ? (shift.fohDuration === "over" ? "Over 7h" : "Under 7h") : capitalize(bohModel.bohShiftSize),
      Number.isFinite(shift.points) ? shift.points : calculateShiftPoints(shift),
    ]);
  });

  const payoutTotalCents = record.staffPayouts.reduce((sum, row) => sum + row.payoutCents, 0);
  const totalTipsCents = recordCents(record, "totalTipsCents", "totalTips");
  const differenceCents = totalTipsCents - payoutTotalCents;
  rows.push([]);
  rows.push(["Reconciliation"]);
  rows.push(["Total tips", moneyFromCents(totalTipsCents)]);
  rows.push(["Total staff payouts", moneyFromCents(payoutTotalCents)]);
  rows.push(["Difference", moneyFromCents(differenceCents)]);
  rows.push(["Reconciles exactly to cent", payoutTotalCents === totalTipsCents ? "Yes" : "No"]);

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
  link.download = `andiamo-tips-${record.weekStart}.xls`;
  link.click();
  URL.revokeObjectURL(link.href);
  showToast("Excel export created");
}

render();
