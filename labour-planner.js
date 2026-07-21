"use strict";

const SUPABASE_URL = "https://qqiqcienzphskhqdnzil.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_GZ3FRa_0_36wHKyNtDCyLQ_LiEP-bMk";

const formFieldIds = [
  "weekStart",
  "lastYearSales",
  "threeWeekSales",
  "expectedSales",
  "forecastNotes",
  "targetPercent",
  "deputyFohCost",
  "deputyBohCost",
  "outsideDeputyCost",
  "otherCost",
  "decisionDay",
  "service",
  "planMode",
  "changeDirection",
  "changeHours",
  "hourlyCost",
  "fohCount",
  "bohCount",
  "managerPresent",
  "allRounderManager",
  "bartenderPresent",
  "strongTeam",
  "pizzaCovered",
  "pastaCovered",
  "larderCovered",
  "dishwasherCovered",
  "verdictNotes"
];

const checkboxFieldIds = [
  "managerPresent",
  "allRounderManager",
  "bartenderPresent",
  "strongTeam",
  "pizzaCovered",
  "pastaCovered",
  "larderCovered",
  "dishwasherCovered"
];

const elements = {};
const plannerState = {
  user: null,
  venue: null,
  defaults: null,
  checkId: null,
  ready: false,
  loadingSession: false,
  loadingWeek: false,
  saveTimer: null,
  calculationTimer: null,
  calculationSequence: 0,
  lastCalculation: null,
  verdictSavedAt: null
};
let supabaseClient;

document.addEventListener("DOMContentLoaded", initialiseLabourPlanner);

async function initialiseLabourPlanner() {
  cacheElements();
  bindEvents();

  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    showAuthMessage("The secure login service could not load. Check your internet connection and refresh.", "error");
    return;
  }

  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });

  const sessionResult = await supabaseClient.auth.getSession();
  if (sessionResult.error) showAuthMessage(friendlyError(sessionResult.error), "error");
  await handleSession(sessionResult.data.session);

  supabaseClient.auth.onAuthStateChange(function (_event, session) {
    window.setTimeout(function () {
      handleSession(session);
    }, 0);
  });
}

function cacheElements() {
  [
    "accountPanel",
    "accountEmail",
    "signOutButton",
    "authGate",
    "loginForm",
    "loginEmail",
    "sendLoginLink",
    "authMessage",
    "labourApp",
    "budgetSales",
    "useBudget",
    "useThreeWeek",
    "metricSales",
    "metricWages",
    "metricPercent",
    "metricHeadroom",
    "wagePercentCard",
    "headroomCard",
    "headroomLabel",
    "salesScenarioBody",
    "shiftCostChange",
    "projectedPercent",
    "salesNeeded",
    "coverageResult",
    "verdictForm",
    "clearTest",
    "saveMessage",
    "savedVerdictLabel",
    "labourToast"
  ].concat(formFieldIds).forEach(function (id) {
    elements[id] = document.getElementById(id);
  });

  elements.labourOnlyLinks = Array.from(document.querySelectorAll(".labour-only-link"));
}

function bindEvents() {
  elements.loginForm.addEventListener("submit", sendMagicLink);
  elements.signOutButton.addEventListener("click", signOut);
  elements.useBudget.addEventListener("click", useBudgetForecast);
  elements.useThreeWeek.addEventListener("click", useThreeWeekForecast);
  elements.verdictForm.addEventListener("submit", saveVerdict);
  elements.clearTest.addEventListener("click", deleteCurrentTest);

  formFieldIds.forEach(function (id) {
    const field = elements[id];
    if (!field) return;

    if (id === "weekStart") {
      field.addEventListener("change", loadSelectedWeek);
      return;
    }

    field.addEventListener("input", handlePlannerChange);
    field.addEventListener("change", handlePlannerChange);
  });

  document.querySelectorAll('input[name="verdict"]').forEach(function (field) {
    field.addEventListener("change", handlePlannerChange);
  });
}

async function handleSession(session) {
  if (plannerState.loadingSession) return;

  if (!session || !session.user) {
    showSignedOutView();
    return;
  }

  if (plannerState.user && plannerState.user.id === session.user.id && plannerState.venue) return;

  plannerState.loadingSession = true;
  plannerState.ready = false;

  try {
    plannerState.user = session.user;
    plannerState.venue = await loadVenueForUser(session.user.id);
    plannerState.defaults = await loadPrivateDefaults();

    if (!elements.weekStart.value) {
      elements.weekStart.value = formatDateForInput(startOfWeek(new Date()));
    }

    showSignedInView();
    await loadWeek(elements.weekStart.value);
  } catch (error) {
    showSignedOutView();
    showAuthMessage(friendlyError(error), "error");
  } finally {
    plannerState.loadingSession = false;
  }
}

function showSignedOutView() {
  plannerState.user = null;
  plannerState.venue = null;
  plannerState.defaults = null;
  plannerState.checkId = null;
  plannerState.ready = false;
  elements.authGate.classList.remove("hidden");
  elements.labourApp.classList.add("hidden");
  elements.accountPanel.classList.add("hidden");
  elements.labourOnlyLinks.forEach(function (link) {
    link.classList.add("hidden");
  });
}

function showSignedInView() {
  elements.authGate.classList.add("hidden");
  elements.labourApp.classList.remove("hidden");
  elements.accountPanel.classList.remove("hidden");
  elements.accountEmail.textContent = plannerState.user.email || "Signed in";
  elements.labourOnlyLinks.forEach(function (link) {
    link.classList.remove("hidden");
  });
}

async function sendMagicLink(event) {
  event.preventDefault();
  const email = elements.loginEmail.value.trim();

  if (!email) {
    showAuthMessage("Enter your email address first.", "error");
    return;
  }

  setButtonBusy(elements.sendLoginLink, true, "Sending…");
  showAuthMessage("Sending your secure login link…");

  const redirectUrl = new URL("operations-hub.html", window.location.href).href;
  const result = await supabaseClient.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectUrl,
      shouldCreateUser: false
    }
  });

  setButtonBusy(elements.sendLoginLink, false);

  if (result.error) {
    showAuthMessage(friendlyError(result.error), "error");
    return;
  }

  showAuthMessage("Email sent. Open the secure link, then choose Labour Check from the dashboard menu.", "success");
}

async function signOut() {
  setButtonBusy(elements.signOutButton, true, "Signing out…");
  const result = await supabaseClient.auth.signOut();
  setButtonBusy(elements.signOutButton, false);

  if (result.error) {
    showToast(friendlyError(result.error));
    return;
  }

  showSignedOutView();
  showAuthMessage("You are safely signed out.");
}

async function loadVenueForUser(userId) {
  const membershipResult = await supabaseClient
    .from("venue_members")
    .select("venue_id")
    .eq("user_id", userId)
    .limit(1);

  if (membershipResult.error) throw membershipResult.error;
  if (!membershipResult.data.length) {
    throw new Error("Open the Operations Hub once first so your venue can be connected.");
  }

  const venueResult = await supabaseClient
    .from("venues")
    .select("id, name")
    .eq("id", membershipResult.data[0].venue_id)
    .single();

  if (venueResult.error) throw venueResult.error;
  return venueResult.data;
}

async function loadPrivateDefaults() {
  const result = await supabaseClient.rpc("get_labour_planner_defaults", {
    p_venue_id: plannerState.venue.id
  });

  if (result.error) throw result.error;
  return result.data;
}

async function loadSelectedWeek() {
  if (!plannerState.venue || !elements.weekStart.value) return;
  await loadWeek(elements.weekStart.value);
}

async function loadWeek(weekStart) {
  window.clearTimeout(plannerState.saveTimer);
  window.clearTimeout(plannerState.calculationTimer);
  plannerState.calculationSequence += 1;
  plannerState.loadingWeek = true;
  plannerState.ready = false;
  showSaveMessage("Loading private labour check…");

  const result = await supabaseClient
    .from("labour_checks")
    .select("*")
    .eq("venue_id", plannerState.venue.id)
    .eq("week_start", weekStart)
    .maybeSingle();

  if (result.error) {
    plannerState.loadingWeek = false;
    showSaveMessage(friendlyError(result.error), "error");
    return;
  }

  if (result.data) {
    applyLabourCheck(result.data);
  } else {
    resetWeekFields();
  }

  plannerState.loadingWeek = false;
  plannerState.ready = true;
  showSaveMessage(result.data ? "Private labour check loaded." : "Ready for a new private labour check.", "success");
  await updatePrivateCalculations();
}

function applyLabourCheck(row) {
  plannerState.checkId = row.id;
  plannerState.verdictSavedAt = row.verdict_saved_at;
  const values = {
    lastYearSales: row.last_year_sales,
    threeWeekSales: row.three_week_sales,
    expectedSales: row.expected_sales,
    forecastNotes: row.forecast_notes,
    targetPercent: row.target_percent,
    deputyFohCost: row.deputy_foh_cost,
    deputyBohCost: row.deputy_boh_cost,
    outsideDeputyCost: row.outside_deputy_cost,
    otherCost: row.other_cost,
    decisionDay: row.decision_day,
    service: row.service,
    planMode: row.plan_mode,
    changeDirection: row.change_direction,
    changeHours: row.change_hours,
    hourlyCost: row.hourly_cost,
    fohCount: row.foh_count,
    bohCount: row.boh_count,
    managerPresent: row.manager_present,
    allRounderManager: row.all_rounder_manager,
    bartenderPresent: row.bartender_present,
    strongTeam: row.strong_team,
    pizzaCovered: row.pizza_covered,
    pastaCovered: row.pasta_covered,
    larderCovered: row.larder_covered,
    dishwasherCovered: row.dishwasher_covered,
    verdictNotes: row.verdict_notes
  };

  formFieldIds.forEach(function (id) {
    if (id === "weekStart" || values[id] === undefined) return;
    if (elements[id].type === "checkbox") elements[id].checked = Boolean(values[id]);
    else elements[id].value = values[id] ?? "";
  });

  document.querySelectorAll('input[name="verdict"]').forEach(function (field) {
    field.checked = Boolean(row.verdict && field.value === row.verdict);
  });
  showSavedVerdict(row.verdict_saved_at);
}

function resetWeekFields() {
  plannerState.checkId = null;
  plannerState.verdictSavedAt = null;
  const textDefaults = {
    lastYearSales: "",
    threeWeekSales: "",
    expectedSales: "",
    forecastNotes: "",
    targetPercent: plannerState.defaults.target_percent,
    deputyFohCost: "",
    deputyBohCost: "",
    outsideDeputyCost: plannerState.defaults.outside_deputy_cost,
    otherCost: "",
    decisionDay: "Monday",
    service: "dinner",
    planMode: "normal",
    changeDirection: "remove",
    changeHours: "",
    hourlyCost: "",
    fohCount: "",
    bohCount: "",
    verdictNotes: ""
  };

  Object.keys(textDefaults).forEach(function (id) {
    elements[id].value = textDefaults[id] ?? "";
  });
  checkboxFieldIds.forEach(function (id) {
    elements[id].checked = false;
  });
  document.querySelectorAll('input[name="verdict"]').forEach(function (field) {
    field.checked = false;
  });
  showSavedVerdict(null);
}

function handlePlannerChange() {
  if (!plannerState.ready || plannerState.loadingWeek) return;

  window.clearTimeout(plannerState.calculationTimer);
  plannerState.calculationTimer = window.setTimeout(updatePrivateCalculations, 120);

  window.clearTimeout(plannerState.saveTimer);
  plannerState.saveTimer = window.setTimeout(function () {
    saveLabourCheck(false);
  }, 650);
}

async function updatePrivateCalculations() {
  if (!plannerState.ready || !plannerState.venue) return;

  const sequence = ++plannerState.calculationSequence;
  const calculationInput = collectCalculationRpcInput();
  const coverageInput = collectCoverageRpcInput();

  const results = await Promise.all([
    supabaseClient.rpc("calculate_labour_plan", calculationInput),
    supabaseClient.rpc("evaluate_labour_coverage", coverageInput)
  ]);

  if (sequence !== plannerState.calculationSequence) return;

  if (results[0].error || results[1].error) {
    const error = results[0].error || results[1].error;
    showSaveMessage(friendlyError(error), "error");
    return;
  }

  plannerState.lastCalculation = results[0].data;
  renderCalculation(results[0].data);
  renderCoverage(results[1].data);
}

function collectCalculationRpcInput() {
  return {
    p_venue_id: plannerState.venue.id,
    p_last_year_sales: readNumber(elements.lastYearSales),
    p_expected_sales: readNumber(elements.expectedSales),
    p_target_percent: readNumber(elements.targetPercent),
    p_deputy_foh_cost: readNumber(elements.deputyFohCost),
    p_deputy_boh_cost: readNumber(elements.deputyBohCost),
    p_outside_deputy_cost: readNumber(elements.outsideDeputyCost),
    p_other_cost: readNumber(elements.otherCost),
    p_change_direction: elements.changeDirection.value,
    p_change_hours: readNumber(elements.changeHours),
    p_hourly_cost: readNumber(elements.hourlyCost)
  };
}

function collectCoverageRpcInput() {
  return {
    p_venue_id: plannerState.venue.id,
    p_service: elements.service.value,
    p_plan_mode: elements.planMode.value,
    p_foh_count: Math.floor(readNumber(elements.fohCount)),
    p_boh_count: Math.floor(readNumber(elements.bohCount)),
    p_manager_present: elements.managerPresent.checked,
    p_all_rounder_manager: elements.allRounderManager.checked,
    p_bartender_present: elements.bartenderPresent.checked,
    p_strong_team: elements.strongTeam.checked,
    p_pizza_covered: elements.pizzaCovered.checked,
    p_pasta_covered: elements.pastaCovered.checked,
    p_larder_covered: elements.larderCovered.checked,
    p_dishwasher_covered: elements.dishwasherCovered.checked
  };
}

function renderCalculation(result) {
  const hasForecast = readNumber(elements.expectedSales) > 0;
  elements.budgetSales.textContent = formatCurrency(result.budget_sales);
  elements.metricSales.textContent = formatCurrency(result.expected_sales);
  elements.metricWages.textContent = formatCurrency(result.planned_wages);
  elements.metricPercent.textContent = hasForecast ? formatPercent(result.wage_percent) : "—";
  elements.headroomLabel.textContent = Number(result.headroom) >= 0 ? "Headroom to target" : "Over target by";
  elements.metricHeadroom.textContent = formatCurrency(Math.abs(Number(result.headroom)));
  toggleClass(elements.wagePercentCard, "over", hasForecast && Number(result.headroom) < 0);
  toggleClass(elements.headroomCard, "over", Number(result.headroom) < 0);
  renderScenarios(result.scenarios || [], hasForecast);
  elements.shiftCostChange.textContent = formatSignedCurrency(result.shift_change);
  elements.projectedPercent.textContent = hasForecast ? formatPercent(result.projected_percent) : "—";
  elements.salesNeeded.textContent = formatCurrency(result.sales_needed);
}

function renderScenarios(scenarios, hasForecast) {
  elements.salesScenarioBody.innerHTML = scenarios.map(function (scenario) {
    const withinTarget = Number(scenario.headroom) >= 0;
    const statusClass = withinTarget ? "within-target" : "over-target";
    const result = !hasForecast
      ? "Add forecast"
      : withinTarget
        ? formatCurrency(scenario.headroom) + " room"
        : formatCurrency(Math.abs(Number(scenario.headroom))) + " over";

    return "<tr>" +
      "<td><strong>" + escapeHtml(scenario.label) + "</strong></td>" +
      "<td>" + formatCurrency(scenario.sales) + "</td>" +
      "<td>" + formatCurrency(scenario.wages) + "</td>" +
      "<td class=\"" + statusClass + "\">" + (hasForecast ? formatPercent(scenario.wage_percent) : "—") + "</td>" +
      "<td class=\"" + statusClass + "\">" + result + "</td>" +
      "</tr>";
  }).join("");
}

function renderCoverage(result) {
  const safe = Boolean(result.safe);
  const messages = Array.isArray(result.messages) ? result.messages : [];
  elements.coverageResult.className = "coverage-result " + (safe ? "safe" : "warning");

  if (safe) {
    elements.coverageResult.innerHTML = "<strong>Coverage check passed</strong><span>" +
      escapeHtml(result.confirmation || "Minimum coverage is protected.") + "</span>";
    return;
  }

  elements.coverageResult.innerHTML = "<strong>Stop and review coverage</strong><ul>" +
    messages.map(function (message) {
      return "<li>" + escapeHtml(message) + "</li>";
    }).join("") +
    "</ul>";
}

async function saveLabourCheck(explicitVerdict) {
  if (!plannerState.ready || !plannerState.user || !plannerState.venue || !elements.weekStart.value) return;

  const values = collectDatabaseValues(explicitVerdict);
  let result;

  if (plannerState.checkId) {
    result = await supabaseClient
      .from("labour_checks")
      .update(values)
      .eq("id", plannerState.checkId)
      .select("id, updated_at, verdict_saved_at")
      .single();
  } else {
    result = await supabaseClient
      .from("labour_checks")
      .insert(Object.assign({}, values, {
        venue_id: plannerState.venue.id,
        week_start: elements.weekStart.value,
        created_by: plannerState.user.id
      }))
      .select("id, updated_at, verdict_saved_at")
      .single();
  }

  if (result.error) {
    if (!plannerState.checkId && result.error.code === "23505") {
      await loadWeek(elements.weekStart.value);
      return saveLabourCheck(explicitVerdict);
    }
    showSaveMessage(friendlyError(result.error), "error");
    return;
  }

  plannerState.checkId = result.data.id;
  plannerState.verdictSavedAt = result.data.verdict_saved_at;
  showSaveMessage(explicitVerdict ? "Thursday verdict saved privately." : "Saved privately in Supabase.", "success");
  if (explicitVerdict) showSavedVerdict(result.data.verdict_saved_at);
}

function collectDatabaseValues(explicitVerdict) {
  const selectedVerdict = getSelectedVerdict();
  return {
    last_year_sales: readNumber(elements.lastYearSales),
    three_week_sales: readNumber(elements.threeWeekSales),
    expected_sales: readNumber(elements.expectedSales),
    forecast_notes: elements.forecastNotes.value.trim(),
    target_percent: readNumber(elements.targetPercent) || Number(plannerState.defaults.target_percent),
    deputy_foh_cost: readNumber(elements.deputyFohCost),
    deputy_boh_cost: readNumber(elements.deputyBohCost),
    outside_deputy_cost: readNumber(elements.outsideDeputyCost),
    other_cost: readNumber(elements.otherCost),
    decision_day: elements.decisionDay.value,
    service: elements.service.value,
    plan_mode: elements.planMode.value,
    change_direction: elements.changeDirection.value,
    change_hours: readNumber(elements.changeHours),
    hourly_cost: readNumber(elements.hourlyCost),
    foh_count: Math.floor(readNumber(elements.fohCount)),
    boh_count: Math.floor(readNumber(elements.bohCount)),
    manager_present: elements.managerPresent.checked,
    all_rounder_manager: elements.allRounderManager.checked,
    bartender_present: elements.bartenderPresent.checked,
    strong_team: elements.strongTeam.checked,
    pizza_covered: elements.pizzaCovered.checked,
    pasta_covered: elements.pastaCovered.checked,
    larder_covered: elements.larderCovered.checked,
    dishwasher_covered: elements.dishwasherCovered.checked,
    verdict: selectedVerdict || null,
    verdict_notes: elements.verdictNotes.value.trim(),
    verdict_saved_at: explicitVerdict ? new Date().toISOString() : plannerState.verdictSavedAt
  };
}

function useBudgetForecast() {
  if (!plannerState.lastCalculation || !readNumber(elements.lastYearSales)) {
    showToast("Enter last year sales first.");
    elements.lastYearSales.focus();
    return;
  }
  elements.expectedSales.value = plannerState.lastCalculation.budget_sales;
  handlePlannerChange();
}

function useThreeWeekForecast() {
  const threeWeekSales = readNumber(elements.threeWeekSales);
  if (!threeWeekSales) {
    showToast("Enter the last 3 weeks average first.");
    elements.threeWeekSales.focus();
    return;
  }
  elements.expectedSales.value = threeWeekSales;
  handlePlannerChange();
}

async function saveVerdict(event) {
  event.preventDefault();
  if (!getSelectedVerdict()) {
    showSaveMessage("Choose Yes, Maybe or No first.", "error");
    return;
  }
  await saveLabourCheck(true);
}

async function deleteCurrentTest() {
  if (!plannerState.checkId) {
    resetWeekFields();
    await updatePrivateCalculations();
    return;
  }

  const confirmed = window.confirm("Delete this week's private Labour Check from Supabase?");
  if (!confirmed) return;

  const result = await supabaseClient
    .from("labour_checks")
    .delete()
    .eq("id", plannerState.checkId);

  if (result.error) {
    showSaveMessage(friendlyError(result.error), "error");
    return;
  }

  resetWeekFields();
  showSaveMessage("This week's private test was deleted.", "success");
  await updatePrivateCalculations();
}

function showSavedVerdict(savedAt) {
  if (!savedAt) {
    elements.savedVerdictLabel.textContent = "Not tested yet";
    return;
  }

  const date = new Date(savedAt);
  elements.savedVerdictLabel.textContent = "Saved " + date.toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit"
  });
}

function getSelectedVerdict() {
  const selected = document.querySelector('input[name="verdict"]:checked');
  return selected ? selected.value : "";
}

function showAuthMessage(message, type) {
  elements.authMessage.textContent = message || "";
  elements.authMessage.className = "form-message" + (type ? " " + type : "");
}

function showSaveMessage(message, type) {
  elements.saveMessage.textContent = message || "";
  elements.saveMessage.className = "form-message" + (type ? " " + type : "");
}

function showToast(message) {
  elements.labourToast.textContent = message;
  elements.labourToast.classList.add("show");
  window.setTimeout(function () {
    elements.labourToast.classList.remove("show");
  }, 2600);
}

function setButtonBusy(button, busy, busyLabel) {
  if (!button.dataset.defaultLabel) button.dataset.defaultLabel = button.textContent;
  button.disabled = busy;
  button.textContent = busy ? busyLabel : button.dataset.defaultLabel;
}

function friendlyError(error) {
  const message = error && error.message ? error.message : String(error || "Unknown error");
  if (/labour_checks|get_labour_planner_defaults|calculate_labour_plan|schema cache/i.test(message)) {
    return "The private Labour Check setup is not ready yet. Complete the Supabase SQL step first.";
  }
  if (/rate limit/i.test(message)) return "Too many login attempts. Wait a little and try again.";
  if (/signups not allowed/i.test(message)) return "This email is not authorised for the private dashboard.";
  if (/not authorised/i.test(message)) return "Your account is not authorised for this venue.";
  return message;
}

function readNumber(field) {
  const value = Number(field.value);
  return Number.isFinite(value) ? value : 0;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0
  }).format(Number.isFinite(Number(value)) ? Number(value) : 0);
}

function formatSignedCurrency(value) {
  const safeValue = Number.isFinite(Number(value)) ? Number(value) : 0;
  if (Math.abs(safeValue) < 0.005) return "$0";
  return (safeValue > 0 ? "+" : "−") + formatCurrency(Math.abs(safeValue));
}

function formatPercent(value) {
  const safeValue = Number.isFinite(Number(value)) ? Number(value) : 0;
  return safeValue.toFixed(1) + "%";
}

function startOfWeek(date) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = result.getDay();
  const difference = day === 0 ? -6 : 1 - day;
  result.setDate(result.getDate() + difference);
  return result;
}

function formatDateForInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}

function toggleClass(element, className, enabled) {
  element.classList.toggle(className, Boolean(enabled));
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
