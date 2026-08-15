(() => {
  "use strict";

  const SUPABASE_URL = "https://qqiqcienzphskhqdnzil.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_GZ3FRa_0_36wHKyNtDCyLQ_LiEP-bMk";
  const PRIVATE_RECORD_TITLE = "PRIVATE_BEVERAGE_ORDERING_V1";
  let supabaseClient;
  let currentUser = null;
  let currentVenue = null;
  let privateRecordId = null;
  let saveTimer = null;
  let saveInProgress = false;
  let saveQueued = false;
  let appEventsBound = false;
  let locations = [];
  let catalog = [];
  let products = [];
  let sales = [];
  let supplierDefaults = {};
  let recipes = [];
  let byName = new Map();
  let categoryOptions = [];
  let activeLocation = 0;
  let state = null;

  document.addEventListener("DOMContentLoaded", initialiseSecureBeverage);

  async function initialiseSecureBeverage() {
    document.getElementById("loginForm").addEventListener("submit", sendMagicLink);
    document.getElementById("signOutButton").addEventListener("click", signOut);
    document.getElementById("importPrivateSetup").addEventListener("click", importPrivateSetup);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flushSecureSave();
    });

    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      showAuthMessage("The secure login service could not load. Check your connection and refresh.", true);
      return;
    }

    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });

    const sessionResult = await supabaseClient.auth.getSession();
    if (sessionResult.error) showAuthMessage(friendlyError(sessionResult.error), true);
    await handleSecureSession(sessionResult.data.session);

    supabaseClient.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => handleSecureSession(session), 0);
    });
  }

  async function sendMagicLink(event) {
    event.preventDefault();
    const email = document.getElementById("loginEmail").value.trim();
    if (!email) return;
    setButtonBusy(document.getElementById("sendLoginLink"), true, "Sending…");
    showAuthMessage("Sending your secure sign-in link…");
    const redirectUrl = new URL("beverage-ordering.html", window.location.href).href;
    const result = await supabaseClient.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectUrl, shouldCreateUser: false },
    });
    setButtonBusy(document.getElementById("sendLoginLink"), false);
    if (result.error) {
      showAuthMessage("This email is not authorised for the private venue workspace.", true);
      return;
    }
    showAuthMessage("Secure link sent. Open it from the same email account.");
  }

  async function signOut() {
    setButtonBusy(document.getElementById("signOutButton"), true, "Signing out…");
    await flushSecureSave();
    const result = await supabaseClient.auth.signOut();
    setButtonBusy(document.getElementById("signOutButton"), false);
    if (result.error) {
      showToast(friendlyError(result.error));
      return;
    }
    showSignedOutView();
  }

  async function handleSecureSession(session) {
    if (!session?.user) {
      showSignedOutView();
      return;
    }
    if (currentUser?.id === session.user.id && (privateRecordId || !document.getElementById("privateSetupGate").classList.contains("hidden"))) return;

    currentUser = session.user;
    document.getElementById("accountEmail").textContent = session.user.email || "Signed in";
    document.getElementById("accountPanel").classList.remove("hidden");
    document.getElementById("authGate").classList.add("hidden");
    showAuthMessage("");

    try {
      currentVenue = await fetchAuthorisedVenue(session.user.id);
      await loadPrivateBeverageRecord();
    } catch (error) {
      showSignedOutView();
      showAuthMessage(friendlyError(error), true);
    }
  }

  async function fetchAuthorisedVenue(userId) {
    const membership = await supabaseClient
      .from("venue_members")
      .select("venue_id, member_role")
      .eq("user_id", userId)
      .limit(1);
    if (membership.error) throw membership.error;
    if (!membership.data.length) throw new Error("This account is signed in but is not an authorised venue member.");
    const venueResult = await supabaseClient
      .from("venues")
      .select("id, name")
      .eq("id", membership.data[0].venue_id)
      .single();
    if (venueResult.error) throw venueResult.error;
    return venueResult.data;
  }

  async function loadPrivateBeverageRecord() {
    const result = await supabaseClient
      .from("improvement_notes")
      .select("id, body")
      .eq("venue_id", currentVenue.id)
      .eq("title", PRIVATE_RECORD_TITLE)
      .eq("status", "archived")
      .order("updated_at", { ascending: false })
      .limit(1);
    if (result.error) throw result.error;
    if (!result.data.length) {
      privateRecordId = null;
      document.getElementById("privateSetupGate").classList.remove("hidden");
      document.getElementById("beverageApp").classList.add("hidden");
      return;
    }
    privateRecordId = result.data[0].id;
    hydratePrivatePayload(parsePrivatePayload(result.data[0].body));
  }

  async function importPrivateSetup() {
    const input = document.getElementById("privateSetupFile");
    const file = input.files?.[0];
    if (!file) {
      showSetupMessage("Choose the private setup JSON file first.", true);
      return;
    }
    setButtonBusy(document.getElementById("importPrivateSetup"), true, "Importing…");
    showSetupMessage("Encrypting the connection and saving behind venue access rules…");
    try {
      const payload = validatePrivatePayload(JSON.parse(await file.text()));
      const result = await supabaseClient
        .from("improvement_notes")
        .insert({
          venue_id: currentVenue.id,
          created_by: currentUser.id,
          capture_type: "text",
          title: PRIVATE_RECORD_TITLE,
          body: JSON.stringify(payload),
          category: "Stock",
          priority: "normal",
          status: "archived",
        })
        .select("id")
        .single();
      if (result.error) throw result.error;
      privateRecordId = result.data.id;
      hydratePrivatePayload(payload);
      showToast("Private beverage setup imported.");
    } catch (error) {
      showSetupMessage(`Could not import this setup: ${friendlyError(error)}`, true);
    } finally {
      setButtonBusy(document.getElementById("importPrivateSetup"), false);
    }
  }

  function parsePrivatePayload(body) {
    return validatePrivatePayload(typeof body === "string" ? JSON.parse(body) : body);
  }

  function validatePrivatePayload(payload) {
    if (!payload || !Array.isArray(payload.catalog) || payload.catalog.length < 1 || !Array.isArray(payload.locations)) {
      throw new Error("The file is not a valid Andiamo beverage setup.");
    }
    return payload;
  }

  function hydratePrivatePayload(payload) {
    locations = payload.locations;
    supplierDefaults = payload.supplierDefaults || {};
    recipes = payload.recipes || [];
    sales = payload.drinkSales || [];
    catalog = payload.catalog.map((product) => ({ ...product, id: product.id || `stock-${product.row}` }));
    products = catalog.filter((product) => product.active !== false);
    byName = new Map(products.map((product) => [product.item.toLowerCase(), product]));
    categoryOptions = ["All categories", ...new Set(products.map((product) => product.category))];
    state = {
      ...baseState(),
      ...(payload.state || {}),
      supplierRules: { ...structuredClone(supplierDefaults), ...(payload.state?.supplierRules || {}) },
    };
    document.getElementById("privateSetupGate").classList.add("hidden");
    document.getElementById("beverageApp").classList.remove("hidden");
    document.getElementById("saveStatus").classList.remove("hidden");
    populateFilters();
    if (!appEventsBound) {
      bindEvents();
      appEventsBound = true;
    }
    renderAll();
    setSaveStatus("Saved securely");
  }

  function privatePayload() {
    return {
      version: 1,
      venue: currentVenue?.name || "Andiamo Trattoria Chippendale",
      catalog: catalog.map(({ id: _id, ...product }) => product),
      drinkSales: sales,
      locations,
      supplierDefaults,
      recipes,
      state,
      updatedAt: new Date().toISOString(),
    };
  }

  async function saveSecureState() {
    if (!privateRecordId || !state) return;
    if (saveInProgress) {
      saveQueued = true;
      return;
    }
    saveInProgress = true;
    saveQueued = false;
    const result = await supabaseClient
      .from("improvement_notes")
      .update({ body: JSON.stringify(privatePayload()) })
      .eq("id", privateRecordId)
      .eq("venue_id", currentVenue.id);
    saveInProgress = false;
    if (result.error) {
      setSaveStatus("Save failed — retrying", true);
      saveTimer = window.setTimeout(saveSecureState, 2500);
      return;
    }
    setSaveStatus("Saved securely");
    if (saveQueued) saveTimer = window.setTimeout(saveSecureState, 100);
  }

  async function flushSecureSave() {
    window.clearTimeout(saveTimer);
    if (privateRecordId && state) await saveSecureState();
  }

  function showSignedOutView() {
    currentUser = null;
    currentVenue = null;
    privateRecordId = null;
    state = null;
    catalog = [];
    products = [];
    document.getElementById("authGate").classList.remove("hidden");
    document.getElementById("privateSetupGate").classList.add("hidden");
    document.getElementById("beverageApp").classList.add("hidden");
    document.getElementById("accountPanel").classList.add("hidden");
    document.getElementById("saveStatus").classList.add("hidden");
  }

  function showAuthMessage(message, error = false) {
    const element = document.getElementById("authMessage");
    element.textContent = message;
    element.classList.toggle("error", error);
  }

  function showSetupMessage(message, error = false) {
    const element = document.getElementById("setupMessage");
    element.textContent = message;
    element.classList.toggle("error", error);
  }

  function setSaveStatus(message, error = false) {
    const element = document.getElementById("saveStatus");
    element.textContent = message;
    element.classList.toggle("error", error);
  }

  function setButtonBusy(button, busy, busyText = "Working…") {
    if (busy) {
      button.dataset.originalText = button.textContent;
      button.textContent = busyText;
      button.disabled = true;
    } else {
      button.textContent = button.dataset.originalText || button.textContent;
      button.disabled = false;
    }
  }

  function friendlyError(error) {
    return error?.message || "Something went wrong. Please try again.";
  }

  function baseState() {
    return {
      countStartedAt: null,
      counts: {},
      completedLocations: {},
      productOverrides: {},
      supplierRules: structuredClone(supplierDefaults),
    };
  }

  function saveState() {
    if (!privateRecordId || !currentVenue || !currentUser) return;
    saveQueued = true;
    setSaveStatus("Saving securely…");
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(saveSecureState, 650);
  }

  function overrideFor(product) {
    const stored = state.productOverrides[product.id] || {};
    return {
      supplier: stored.supplier ?? product.supplier,
      unitsPerCase: numberOr(stored.unitsPerCase, product.unitsPerCase || 1),
      unitCost: numberOr(stored.unitCost, product.price || 0),
      par: numberOr(stored.par, product.provisionalPar || 0),
      onOrder: numberOr(stored.onOrder, 0),
    };
  }

  function numberOr(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function currency(value) {
    return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(value || 0);
  }

  function decimal(value) {
    return new Intl.NumberFormat("en-AU", { maximumFractionDigits: 1 }).format(value || 0);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function locationKey(index = activeLocation) {
    return `location-${index}`;
  }

  function countValue(product, index = activeLocation) {
    const value = state.counts[product.id]?.[locationKey(index)];
    return value === undefined ? "" : value;
  }

  function totalOnHand(product) {
    if (!state.countStartedAt) return product.latestCount || 0;
    return locations.reduce((total, _location, index) => total + numberOr(countValue(product, index), 0), 0);
  }

  function recommendation(product) {
    const settings = overrideFor(product);
    const onHand = totalOnHand(product);
    const gap = product.orderable === false ? 0 : Math.max(0, settings.par - onHand - settings.onOrder);
    const pack = Math.max(1, settings.unitsPerCase);
    const units = gap > 0 ? Math.ceil(gap / pack) * pack : 0;
    return { ...settings, onHand, gap, units, cases: units / pack, value: units * settings.unitCost };
  }

  function renderAll() {
    renderTabs();
    renderLocationStepper();
    renderCountTable();
    renderOrders();
    renderRecipes();
    renderSupplierRules();
    renderSetupTable();
    renderKpis();
  }

  function renderTabs() {
    document.querySelectorAll(".workspace-tab").forEach((button) => {
      button.onclick = () => {
        document.querySelectorAll(".workspace-tab").forEach((tab) => tab.classList.toggle("active", tab === button));
        document.querySelectorAll(".workspace-panel").forEach((panel) => panel.classList.toggle("active", panel.dataset.panel === button.dataset.tab));
      };
    });
  }

  function renderLocationStepper() {
    const container = document.getElementById("locationStepper");
    container.innerHTML = locations.map((location, index) => {
      const entered = products.filter((product) => countValue(product, index) !== "").length;
      const complete = Boolean(state.completedLocations[locationKey(index)]);
      return `<button type="button" class="location-step ${index === activeLocation ? "active" : ""} ${complete ? "complete" : ""}" data-location="${index}">
        <span>${escapeHtml(location)}</span><small>${entered}/${products.length} recorded</small>
      </button>`;
    }).join("");
    container.querySelectorAll("[data-location]").forEach((button) => {
      button.addEventListener("click", () => {
        activeLocation = Number(button.dataset.location);
        renderLocationStepper();
        renderCountTable();
      });
    });
    document.getElementById("activeLocationTitle").textContent = locations[activeLocation];
    document.getElementById("previousLocation").disabled = activeLocation === 0;
    document.getElementById("nextLocation").disabled = activeLocation === locations.length - 1;
  }

  function populateFilters() {
    document.getElementById("countCategory").innerHTML = categoryOptions.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("");
    const suppliers = ["All suppliers", ...new Set(products.map((product) => overrideFor(product).supplier))].sort();
    document.getElementById("setupSupplier").innerHTML = suppliers.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("");
  }

  function filteredCountProducts() {
    const query = document.getElementById("countSearch").value.trim().toLowerCase();
    const category = document.getElementById("countCategory").value;
    const status = document.getElementById("countStatus").value;
    return products.filter((product) => {
      const entered = countValue(product) !== "";
      return (!query || `${product.item} ${product.supplier} ${product.category}`.toLowerCase().includes(query))
        && (category === "All categories" || product.category === category)
        && (status === "all" || (status === "entered" && entered) || (status === "missing" && !entered));
    });
  }

  function renderCountTable() {
    const rows = filteredCountProducts();
    const body = document.getElementById("countTableBody");
    body.innerHTML = rows.length ? rows.map((product) => {
      const value = countValue(product);
      const stockMeta = product.orderable === false
        ? `${product.category} · ${product.size || "unit"} · hold stock / no reorder · default ${decimal(product.defaultQuantity ?? product.latestCount)}`
        : `${product.category} · ${product.size || "unit"}`;
      return `<tr>
        <td><span class="product-name">${escapeHtml(product.item)}</span><span class="product-meta">${escapeHtml(stockMeta)}</span></td>
        <td>${escapeHtml(overrideFor(product).supplier)}</td>
        <td>${decimal(overrideFor(product).unitsPerCase)}</td>
        <td class="numeric">${decimal(product.latestCount)}</td>
        <td class="numeric"><input class="table-input qty-input" data-count-product="${product.id}" type="number" min="0" step="0.1" inputmode="decimal" value="${value}" aria-label="${escapeHtml(product.item)} quantity in ${escapeHtml(locations[activeLocation])}" placeholder="0" /></td>
      </tr>`;
    }).join("") : `<tr><td colspan="5" class="empty-state">No products match this filter.</td></tr>`;
    body.querySelectorAll("[data-count-product]").forEach((input) => {
      input.addEventListener("change", () => updateCount(input.dataset.countProduct, input.value));
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          const inputs = [...body.querySelectorAll("[data-count-product]")];
          const next = inputs[inputs.indexOf(input) + 1];
          if (next) next.focus();
        }
      });
    });
  }

  function updateCount(productId, rawValue) {
    if (!state.countStartedAt) state.countStartedAt = new Date().toISOString();
    state.counts[productId] ||= {};
    if (rawValue === "") delete state.counts[productId][locationKey()];
    else state.counts[productId][locationKey()] = Math.max(0, numberOr(rawValue, 0));
    state.completedLocations[locationKey()] = false;
    saveState();
    renderLocationStepper();
    renderOrders();
    renderKpis();
  }

  function finishCurrentLocation() {
    if (!state.countStartedAt) state.countStartedAt = new Date().toISOString();
    products.forEach((product) => {
      state.counts[product.id] ||= {};
      if (state.counts[product.id][locationKey()] === undefined) state.counts[product.id][locationKey()] = 0;
    });
    state.completedLocations[locationKey()] = true;
    saveState();
    showToast(`${locations[activeLocation]} completed. Blank items were recorded as zero.`);
    if (activeLocation < locations.length - 1) activeLocation += 1;
    renderAll();
  }

  function startNewCount() {
    const hasCount = state.countStartedAt || Object.keys(state.counts).length;
    if (hasCount && !window.confirm("Start a new stocktake? The current location counts will be cleared. Your pars and supplier rules will stay.")) return;
    state.countStartedAt = new Date().toISOString();
    state.counts = {};
    state.completedLocations = {};
    activeLocation = 0;
    saveState();
    renderAll();
    document.querySelector('[data-tab="count"]').click();
    showToast("New beverage count started.");
  }

  function supplierOrderGroups() {
    const groups = new Map();
    products.forEach((product) => {
      if (product.orderable === false) return;
      const order = recommendation(product);
      if (!order.units) return;
      if (!groups.has(order.supplier)) groups.set(order.supplier, []);
      groups.get(order.supplier).push({ product, order });
    });
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }

  function supplierStatus(supplier, items) {
    const rule = state.supplierRules[supplier] || { minDollar: 0, minUnits: 0, minCases: 0, delivery: "Confirm delivery window", note: "No protected supplier rule is recorded yet." };
    const value = items.reduce((sum, item) => sum + item.order.value, 0);
    const units = items.reduce((sum, item) => sum + item.order.units, 0);
    const cases = items.reduce((sum, item) => sum + item.order.cases, 0);
    const dollarShort = Math.max(0, numberOr(rule.minDollar, 0) - value);
    const unitShort = Math.max(0, numberOr(rule.minUnits, 0) - units);
    const caseShort = Math.max(0, numberOr(rule.minCases, 0) - cases);
    const ok = dollarShort === 0 && unitShort === 0 && caseShort === 0;
    const message = dollarShort > 0
      ? `${currency(dollarShort)} below minimum`
      : caseShort > 0
        ? `${decimal(caseShort)} cases below minimum`
        : unitShort > 0
          ? `${decimal(unitShort)} bottles below rule`
          : "Rule met";
    return { rule, value, units, cases, ok, message };
  }

  function renderOrders() {
    const groups = supplierOrderGroups();
    const container = document.getElementById("supplierOrders");
    const completed = Object.values(state.completedLocations).filter(Boolean).length;
    const canDraft = completed === locations.length;
    const notice = document.getElementById("orderModeNotice");
    notice.classList.toggle("ready", canDraft);
    notice.textContent = canDraft
      ? "Full count complete. Recommendations and email drafts are ready for review."
      : state.countStartedAt
        ? `Count incomplete: ${completed} of ${locations.length} areas finished. Shortages will be overstated until every area is complete.`
        : "Reference simulation only: these recommendations use the latest protected count. Start and finish a fresh count before copying supplier emails.";
    document.getElementById("copyAllOrders").disabled = !canDraft;
    if (!groups.length) {
      container.innerHTML = `<div class="empty-state">No order is currently recommended. Start a count or adjust the working pars.</div>`;
      return;
    }
    container.innerHTML = groups.map(([supplier, items]) => {
      const status = supplierStatus(supplier, items);
      return `<article class="supplier-order">
        <div class="supplier-order-head">
          <div><h3>${escapeHtml(supplier)}</h3><p>${escapeHtml(status.rule.delivery || "Delivery timing to confirm")}</p></div>
          <div class="supplier-total"><strong>${currency(status.value)}</strong><span class="rule-badge ${status.ok ? "ok" : "warn"}">${escapeHtml(status.message)}</span></div>
        </div>
        <div class="table-shell">
          <table class="bev-table">
            <thead><tr><th>Product</th><th class="numeric">On hand</th><th class="numeric">Par</th><th class="numeric">On order</th><th class="numeric">Order</th><th class="numeric">Est. value</th></tr></thead>
            <tbody>${items.map(({ product, order }) => `<tr>
              <td><span class="product-name">${escapeHtml(product.item)}</span><span class="product-meta">${escapeHtml(product.size || "unit")} · pack ${decimal(order.unitsPerCase)}</span></td>
              <td class="numeric">${decimal(order.onHand)}</td><td class="numeric">${decimal(order.par)}</td><td class="numeric">${decimal(order.onOrder)}</td>
              <td class="numeric"><strong>${order.unitsPerCase > 1 ? `${decimal(order.cases)} cases / ` : ""}${decimal(order.units)} units</strong></td>
              <td class="numeric">${currency(order.value)}</td>
            </tr>`).join("")}</tbody>
          </table>
        </div>
        <div class="supplier-order-footer"><p>${escapeHtml(status.rule.note || "")}</p><button type="button" class="secondary-button" data-copy-supplier="${escapeHtml(supplier)}" ${canDraft ? "" : "disabled"}>Copy draft email</button></div>
      </article>`;
    }).join("");
    container.querySelectorAll("[data-copy-supplier]").forEach((button) => button.addEventListener("click", () => copyText(orderDraft(button.dataset.copySupplier))));
  }

  function nextMonday() {
    const date = new Date();
    const days = (1 - date.getDay() + 7) % 7;
    date.setDate(date.getDate() + days);
    return new Intl.DateTimeFormat("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(date);
  }

  function orderDraft(supplier) {
    const group = supplierOrderGroups().find(([name]) => name === supplier);
    if (!group) return "";
    const [, items] = group;
    const status = supplierStatus(supplier, items);
    const lines = items.map(({ product, order }) => {
      const packText = order.unitsPerCase > 1 ? `${decimal(order.cases)} case${order.cases === 1 ? "" : "s"} (${decimal(order.units)} units)` : `${decimal(order.units)} bottle/unit${order.units === 1 ? "" : "s"}`;
      return `- ${product.item}: ${packText}`;
    });
    return `Subject: Andiamo Chippendale order – ${nextMonday()}\n\nHi ${supplier} team,\n\nPlease arrange the following order for Andiamo Chippendale:\n\n${lines.join("\n")}\n\nEstimated value: ${currency(status.value)}\nRequested delivery: ${status.rule.delivery || "usual delivery window"}\n\nPlease confirm availability and delivery timing.\n\nThank you,\nUbaldo\nAndiamo Trattoria Chippendale`;
  }

  function recipeSales(recipe) {
    const names = [recipe.name, ...(recipe.aliases || [])];
    return sales.filter((item) => names.includes(item.name)).reduce((sum, item) => sum + numberOr(item.weeklyAverage, 0), 0);
  }

  function containerMl(product) {
    const size = String(product.size || "").toLowerCase().replaceAll(" ", "");
    const number = Number.parseFloat(size);
    if (Number.isFinite(number) && /lt|ltr|litre/.test(size)) return number * 1000;
    if (Number.isFinite(number) && /ml/.test(size)) return number;
    if (product.item === "Apple" || product.item === "OJ") return 2000;
    if (product.item === "juice lime and lemon") return 1000;
    if (/tommy's|limoncello|vodka|vermouth|syrup|puree|liquor|liqueur|bitters/i.test(product.item)) return 700;
    return null;
  }

  function recipeDemand() {
    const mapped = new Map();
    const unresolved = new Map();
    recipes.forEach((recipe) => {
      const weeklySales = recipeSales(recipe);
      recipe.ingredients.forEach(([stockName, amount, displayName]) => {
        const label = displayName || stockName;
        if (!stockName) {
          unresolved.set(label, (unresolved.get(label) || 0) + weeklySales * amount);
          return;
        }
        const product = byName.get(stockName.toLowerCase());
        if (!product) {
          unresolved.set(label, (unresolved.get(label) || 0) + weeklySales * amount);
          return;
        }
        const current = mapped.get(product.id) || { product, ml: 0 };
        current.ml += weeklySales * amount;
        mapped.set(product.id, current);
      });
    });
    return { mapped: [...mapped.values()].sort((a, b) => b.ml - a.ml), unresolved: [...unresolved.entries()].sort((a, b) => b[1] - a[1]) };
  }

  function renderRecipes() {
    const demand = recipeDemand();
    const totalWeeklyCocktails = recipes.reduce((sum, recipe) => sum + recipeSales(recipe), 0);
    document.getElementById("recipeSummary").innerHTML = `
      <div class="summary-pill"><span>Recipes loaded</span><strong>${recipes.length}</strong></div>
      <div class="summary-pill"><span>Weekly drinks represented</span><strong>${decimal(totalWeeklyCocktails)}</strong></div>
      <div class="summary-pill"><span>Ingredients mapped</span><strong>${demand.mapped.length}</strong></div>
      <div class="summary-pill"><span>Need stocktake mapping</span><strong>${demand.unresolved.length}</strong></div>`;
    const mappedRows = demand.mapped.map(({ product, ml }) => {
      const capacity = containerMl(product);
      const weeklyUnits = capacity ? ml / capacity : null;
      return `<tr><td><span class="product-name">${escapeHtml(product.item)}</span><span class="product-meta">${escapeHtml(product.size || "container size assumed")}</span></td>
        <td class="numeric">${weeklyUnits === null ? `${decimal(ml)} ml` : `${decimal(weeklyUnits)} units`}</td>
        <td class="numeric">${weeklyUnits === null ? `${decimal(ml * 1.5)} ml` : `${decimal(weeklyUnits * 1.5)} units`}</td>
        <td><span class="status-badge ok">Mapped</span></td></tr>`;
    });
    const unresolvedRows = demand.unresolved.map(([name, ml]) => `<tr><td><span class="product-name">${escapeHtml(name)}</span><span class="product-meta">Appears in a recipe but has no confirmed stocktake match</span></td>
      <td class="numeric">${decimal(ml)} ml</td><td class="numeric">${decimal(ml * 1.5)} ml</td><td><span class="status-badge unmapped">Map item</span></td></tr>`);
    document.getElementById("recipeDemandBody").innerHTML = [...mappedRows, ...unresolvedRows].join("");
  }

  function renderSupplierRules() {
    const suppliers = Object.keys(state.supplierRules).sort();
    const container = document.getElementById("supplierRules");
    container.innerHTML = suppliers.map((supplier) => {
      const rule = state.supplierRules[supplier];
      return `<div class="rule-row"><div><strong>${escapeHtml(supplier)}</strong><span class="product-meta">${escapeHtml(rule.note || "")}</span></div>
        <label><span>Min. order $</span><input class="rule-input working-input" data-supplier-min="${escapeHtml(supplier)}" type="number" min="0" step="1" value="${numberOr(rule.minDollar, 0)}" /></label>
        <label><span>Min. cases</span><input class="rule-input working-input" data-supplier-cases="${escapeHtml(supplier)}" type="number" min="0" step="1" value="${numberOr(rule.minCases, 0)}" /></label></div>`;
    }).join("");
    container.querySelectorAll("[data-supplier-min]").forEach((input) => input.addEventListener("change", () => {
      state.supplierRules[input.dataset.supplierMin].minDollar = Math.max(0, numberOr(input.value, 0));
      saveState();
      renderOrders();
      renderKpis();
      showToast("Supplier rule updated.");
    }));
    container.querySelectorAll("[data-supplier-cases]").forEach((input) => input.addEventListener("change", () => {
      state.supplierRules[input.dataset.supplierCases].minCases = Math.max(0, numberOr(input.value, 0));
      saveState();
      renderOrders();
      renderKpis();
      showToast("Supplier case minimum updated.");
    }));
  }

  function filteredSetupProducts() {
    const query = document.getElementById("setupSearch").value.trim().toLowerCase();
    const supplier = document.getElementById("setupSupplier").value;
    return products.filter((product) => {
      const settings = overrideFor(product);
      return (!query || `${product.item} ${settings.supplier} ${product.category}`.toLowerCase().includes(query))
        && (supplier === "All suppliers" || settings.supplier === supplier);
    });
  }

  function renderSetupTable() {
    const suppliers = Object.keys(state.supplierRules).sort();
    const body = document.getElementById("setupTableBody");
    body.innerHTML = filteredSetupProducts().map((product) => {
      const settings = overrideFor(product);
      return `<tr>
        <td><span class="product-name">${escapeHtml(product.item)}</span><span class="product-meta">${escapeHtml(product.category)} · last ${decimal(product.latestCount)}${product.orderable === false ? " · hold stock / no reorder" : ""}</span></td>
        <td><select class="table-input working-input" data-field="supplier" data-product="${product.id}">${suppliers.map((supplier) => `<option ${supplier === settings.supplier ? "selected" : ""}>${escapeHtml(supplier)}</option>`).join("")}</select></td>
        <td>${escapeHtml(product.size || "—")}</td>
        <td><input class="table-input working-input numeric" data-field="unitsPerCase" data-product="${product.id}" type="number" min="1" step="1" value="${settings.unitsPerCase}" /></td>
        <td><input class="table-input working-input numeric" data-field="unitCost" data-product="${product.id}" type="number" min="0" step="0.01" value="${settings.unitCost}" /></td>
        <td><input class="table-input working-input numeric" data-field="par" data-product="${product.id}" type="number" min="0" step="0.1" value="${settings.par}" /></td>
        <td><input class="table-input numeric" data-field="onOrder" data-product="${product.id}" type="number" min="0" step="1" value="${settings.onOrder}" /></td>
      </tr>`;
    }).join("");
    body.querySelectorAll("[data-field]").forEach((input) => input.addEventListener("change", () => {
      state.productOverrides[input.dataset.product] ||= {};
      state.productOverrides[input.dataset.product][input.dataset.field] = input.dataset.field === "supplier" ? input.value : Math.max(0, numberOr(input.value, 0));
      saveState();
      populateFilters();
      renderCountTable();
      renderOrders();
      renderKpis();
    }));
  }

  function renderKpis() {
    const completeLocations = Object.values(state.completedLocations).filter(Boolean).length;
    const progress = Math.round((completeLocations / locations.length) * 100);
    document.getElementById("countProgress").textContent = `${progress}%`;
    document.getElementById("countProgressDetail").textContent = state.countStartedAt ? `${completeLocations} of ${locations.length} areas complete` : "Using latest July reference count";
    const stockValue = products.reduce((sum, product) => sum + totalOnHand(product) * overrideFor(product).unitCost, 0);
    const orders = supplierOrderGroups();
    const orderValue = orders.reduce((sum, [, items]) => sum + items.reduce((sub, item) => sub + item.order.value, 0), 0);
    const orderLines = orders.reduce((sum, [, items]) => sum + items.length, 0);
    const alerts = orders.filter(([supplier, items]) => !supplierStatus(supplier, items).ok).length;
    document.getElementById("stockValue").textContent = currency(stockValue);
    document.getElementById("orderValue").textContent = currency(orderValue);
    const countReady = Object.values(state.completedLocations).filter(Boolean).length === locations.length;
    document.getElementById("orderLineCount").textContent = `${orderLines} line${orderLines === 1 ? "" : "s"} · ${countReady ? "ready to review" : "reference only"}`;
    document.getElementById("supplierAlertCount").textContent = alerts;
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (_error) {
      const area = document.createElement("textarea");
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    showToast("Draft copied.");
  }

  function backup() {
    const blob = new Blob([JSON.stringify({ ...privatePayload(), exportedAt: new Date().toISOString() }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `andiamo-beverage-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast("Backup downloaded.");
  }

  function restore(file) {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      try {
        const imported = validatePrivatePayload(JSON.parse(reader.result));
        hydratePrivatePayload(imported);
        saveState();
        showToast("Backup restored.");
      } catch (_error) {
        window.alert("That file is not a valid beverage-ordering backup.");
      }
    });
    reader.readAsText(file);
  }

  let toastTimer;
  function showToast(message) {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
  }

  function bindEvents() {
    ["countSearch", "countCategory", "countStatus"].forEach((id) => document.getElementById(id).addEventListener(id === "countSearch" ? "input" : "change", renderCountTable));
    ["setupSearch", "setupSupplier"].forEach((id) => document.getElementById(id).addEventListener(id === "setupSearch" ? "input" : "change", renderSetupTable));
    document.getElementById("finishLocation").addEventListener("click", finishCurrentLocation);
    document.getElementById("mobileFinishLocation").addEventListener("click", finishCurrentLocation);
    document.getElementById("previousLocation").addEventListener("click", () => { if (activeLocation > 0) { activeLocation -= 1; renderLocationStepper(); renderCountTable(); } });
    document.getElementById("nextLocation").addEventListener("click", () => { if (activeLocation < locations.length - 1) { activeLocation += 1; renderLocationStepper(); renderCountTable(); } });
    document.getElementById("newCountButton").addEventListener("click", startNewCount);
    document.getElementById("copyAllOrders").addEventListener("click", () => copyText(supplierOrderGroups().map(([supplier]) => orderDraft(supplier)).join("\n\n----------------------------------------\n\n")));
    document.getElementById("backupButton").addEventListener("click", backup);
    document.getElementById("restoreButton").addEventListener("click", () => document.getElementById("restoreFile").click());
    document.getElementById("restoreFile").addEventListener("change", (event) => { if (event.target.files[0]) restore(event.target.files[0]); event.target.value = ""; });
    document.getElementById("resetAssumptions").addEventListener("click", () => {
      if (!window.confirm("Reset all product pars, costs, pack sizes and supplier minimums to the first-version defaults? Counts will not be deleted.")) return;
      state.productOverrides = {};
      state.supplierRules = structuredClone(supplierDefaults);
      saveState();
      populateFilters();
      renderAll();
      showToast("Assumptions reset.");
    });
  }

})();
