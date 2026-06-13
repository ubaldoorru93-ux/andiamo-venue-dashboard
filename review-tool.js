const REVIEW_STORAGE_KEY = "andiamo-review-response-tool-v1";
const RESTAURANT_NAME = "Andiamo Trattoria Chippendale";
const SIGNATURE = "The team at Andiamo Trattoria Chippendale";

let reviewState = loadReviewState();
let currentHistoryId = null;

const els = {
  form: document.querySelector("#reviewForm"),
  customerName: document.querySelector("#customerName"),
  rating: document.querySelector("#rating"),
  platform: document.querySelector("#platform"),
  reviewText: document.querySelector("#reviewText"),
  responseOutput: document.querySelector("#responseOutput"),
  historyList: document.querySelector("#historyList"),
  historyCount: document.querySelector("#historyCount"),
  clearHistory: document.querySelector("#clearHistory"),
  clearForm: document.querySelector("#clearForm"),
  toast: document.querySelector("#toast"),
};

function loadReviewState() {
  try {
    const saved = JSON.parse(localStorage.getItem(REVIEW_STORAGE_KEY));
    return { history: [], ...saved };
  } catch {
    return { history: [] };
  }
}

function saveReviewState() {
  localStorage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(reviewState));
}

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("visible");
  window.setTimeout(() => els.toast.classList.remove("visible"), 1800);
}

function normalizeText(value) {
  return value.trim().replace(/\s+/g, " ");
}

function firstName(name) {
  return normalizeText(name).split(" ")[0] || "there";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function hashText(value) {
  return Array.from(value).reduce((total, char) => total + char.charCodeAt(0), 0);
}

function pick(options, seed, offset = 0) {
  return options[(seed + offset) % options.length];
}

function detectDetails(reviewText) {
  const text = reviewText.toLowerCase();
  const matches = [];
  const detailMap = [
    { keys: ["pasta", "gnocchi", "spaghetti", "ravioli", "lasagne"], positive: "the pasta", issue: "the pasta" },
    { keys: ["pizza", "margherita", "pepperoni"], positive: "the pizza", issue: "the pizza" },
    { keys: ["wine", "vino", "red wine", "white wine", "cocktail"], positive: "the wine", issue: "the drinks" },
    { keys: ["service", "staff", "waiter", "waitress", "server"], positive: "the service", issue: "the service" },
    { keys: ["birthday", "anniversary", "date night", "celebration"], positive: "your special occasion", issue: "your visit" },
    { keys: ["authentic", "italian", "traditional"], positive: "the authentic Italian food", issue: "the Italian dining experience" },
    { keys: ["wait", "slow", "late", "delay"], positive: "your patience", issue: "the wait time" },
    { keys: ["booking", "reservation", "table"], positive: "your booking experience", issue: "the booking experience" },
    { keys: ["price", "expensive", "value"], positive: "the value", issue: "the value" },
    { keys: ["noise", "loud"], positive: "the atmosphere", issue: "the noise level" },
  ];

  detailMap.forEach((item) => {
    if (item.keys.some((key) => text.includes(key))) {
      matches.push(item);
    }
  });

  return matches.slice(0, 3);
}

function detailPhrase(details, sentiment) {
  if (!details.length) return "";
  const words = details.map((detail) => (sentiment === "negative" ? detail.issue : detail.positive));
  if (words.length === 1) return words[0];
  if (words.length === 2) return `${words[0]} and ${words[1]}`;
  return `${words[0]}, ${words[1]} and ${words[2]}`;
}

function keywordPhrase(seed, sentiment) {
  const positive = [
    "Italian restaurant experience",
    "authentic Italian dining",
    "Italian food, pasta, pizza and wine",
    "Sydney Italian dining experience",
  ];
  const balanced = [
    "Italian restaurant experience",
    "Italian food and service",
    "Chippendale dining experience",
    "pasta, pizza, wine and service",
  ];
  return pick(sentiment === "positive" ? positive : balanced, seed, 1);
}

function sentimentForRating(rating) {
  if (rating >= 4) return "positive";
  if (rating === 3) return "mixed";
  return "negative";
}

function generateResponses(input) {
  const seed = hashText(`${input.name}${input.rating}${input.reviewText}`);
  const sentiment = sentimentForRating(input.rating);
  const details = detectDetails(input.reviewText);
  const detailsPositive = detailPhrase(details, "positive");
  const detailsIssue = detailPhrase(details, "negative");
  const name = firstName(input.name);
  const keyword = keywordPhrase(seed, sentiment);

  const contextPositive = detailsPositive ? `We're so pleased ${detailsPositive} stood out during your visit.` : "We're so pleased you enjoyed your visit.";
  const contextMixed = detailsIssue ? `We appreciate you sharing your thoughts about ${detailsIssue}.` : "We appreciate you taking the time to share your experience.";
  const contextNegative = detailsIssue ? `We're sorry that ${detailsIssue} did not meet the standard you expected.` : "We're sorry your experience did not meet expectations.";

  const seo = buildSeoOptions({ name, sentiment, contextPositive, contextMixed, contextNegative, keyword, seed });
  const manager = buildManagerOptions({ name, sentiment, contextPositive, contextMixed, contextNegative, detailsIssue, seed });
  const owner = buildOwnerOptions({ name, sentiment, contextPositive, contextMixed, contextNegative, detailsIssue, seed });

  return [
    { group: "SEO-friendly response", options: seo },
    { group: "Friendly manager response", options: manager },
    { group: "Professional owner response", options: owner },
  ];
}

function buildSeoOptions(data) {
  if (data.sentiment === "positive") {
    return [
      `Thank you, ${data.name}, for your lovely review of ${RESTAURANT_NAME}. ${data.contextPositive} It means a lot to be part of the local Chippendale dining scene and to share ${data.keyword} with our guests.\n\n${SIGNATURE}`,
      `${data.name}, thank you for choosing ${RESTAURANT_NAME} and for taking the time to leave such kind feedback. ${data.contextPositive} We love welcoming guests for Italian food, pasta, pizza and wine in Sydney.\n\n${SIGNATURE}`,
    ];
  }
  if (data.sentiment === "mixed") {
    return [
      `Thank you for reviewing ${RESTAURANT_NAME}, ${data.name}. ${data.contextMixed} We are always working to improve our Italian restaurant experience while keeping the food, wine and service warm and genuine.\n\n${SIGNATURE}`,
      `${data.name}, we appreciate your honest feedback about ${RESTAURANT_NAME}. ${data.contextMixed} Your comments help us refine the Italian dining experience we offer in Chippendale.\n\n${SIGNATURE}`,
    ];
  }
  return [
    `${data.name}, thank you for letting us know about your visit to ${RESTAURANT_NAME}. ${data.contextNegative} We take feedback seriously and would appreciate the chance to understand what happened so we can improve our Italian restaurant experience.\n\n${SIGNATURE}`,
    `Thank you for sharing your feedback, ${data.name}. ${data.contextNegative} We want every guest visiting ${RESTAURANT_NAME} for Italian food, pasta, pizza or wine to feel well looked after, and we would welcome the opportunity to follow this up directly.\n\n${SIGNATURE}`,
  ];
}

function buildManagerOptions(data) {
  if (data.sentiment === "positive") {
    return [
      `Hi ${data.name}, thank you so much for the warm review. ${data.contextPositive} The team will be really happy to hear this, and we hope to welcome you back to ${RESTAURANT_NAME} again soon.\n\n${SIGNATURE}`,
      `Thanks, ${data.name}. We're grateful you took the time to share this. ${data.contextPositive} It is always a pleasure to know guests have enjoyed their time with us.\n\n${SIGNATURE}`,
    ];
  }
  if (data.sentiment === "mixed") {
    return [
      `Hi ${data.name}, thank you for the honest feedback. ${data.contextMixed} We'll share this with the team and use it to keep improving. We'd be glad to welcome you back and make the next visit smoother.\n\n${SIGNATURE}`,
      `Thanks for taking the time to write this, ${data.name}. ${data.contextMixed} We appreciate the balanced feedback and will review it with our managers so we can do better next time.\n\n${SIGNATURE}`,
    ];
  }
  return [
    `Hi ${data.name}, we're sorry to read this. ${data.contextNegative} This is not the experience we want for our guests. Please contact the venue so a manager can understand what happened and follow it up properly.\n\n${SIGNATURE}`,
    `${data.name}, thank you for bringing this to our attention. ${data.contextNegative} We apologise where we fell short and would appreciate the chance to speak with you directly so we can address it with care.\n\n${SIGNATURE}`,
  ];
}

function buildOwnerOptions(data) {
  if (data.sentiment === "positive") {
    return [
      `Dear ${data.name}, thank you for your generous review. ${data.contextPositive} Feedback like this is greatly appreciated by our whole team at ${RESTAURANT_NAME}.\n\n${SIGNATURE}`,
      `${data.name}, thank you for choosing to dine with us and for sharing such positive feedback. ${data.contextPositive} We value your support and look forward to welcoming you again.\n\n${SIGNATURE}`,
    ];
  }
  if (data.sentiment === "mixed") {
    return [
      `Dear ${data.name}, thank you for your thoughtful review. ${data.contextMixed} We value constructive feedback and will use your comments to improve the guest experience at ${RESTAURANT_NAME}.\n\n${SIGNATURE}`,
      `${data.name}, thank you for taking the time to provide this feedback. ${data.contextMixed} We will review your comments with the team and continue working to deliver a more consistent experience.\n\n${SIGNATURE}`,
    ];
  }
  return [
    `Dear ${data.name}, thank you for your feedback. ${data.contextNegative} We apologise for the disappointment and would like the opportunity to discuss your visit directly with you so we can investigate and respond appropriately.\n\n${SIGNATURE}`,
    `${data.name}, we are sorry to hear that your visit did not reflect the standard we aim to provide at ${RESTAURANT_NAME}. ${data.contextNegative} Please contact the venue so we can understand the details and take suitable action.\n\n${SIGNATURE}`,
  ];
}

function renderResponses(groups) {
  els.responseOutput.innerHTML = groups
    .map(
      (group, groupIndex) => `
        <section class="response-group">
          <h4>${escapeHtml(group.group)}</h4>
          ${group.options
            .map(
              (text, optionIndex) => `
                <article class="response-card">
                  <div class="response-card-header">
                    <span>Option ${optionIndex + 1}</span>
                    <button type="button" data-copy-response="${groupIndex}-${optionIndex}">Copy</button>
                  </div>
                  <p>${escapeHtml(text).replaceAll("\n", "<br />")}</p>
                </article>
              `
            )
            .join("")}
        </section>
      `
    )
    .join("");
}

function renderHistory() {
  els.historyCount.textContent = reviewState.history.length;
  els.historyList.innerHTML = reviewState.history.length
    ? reviewState.history
        .map(
          (item) => `
            <article class="history-item">
              <div class="history-heading">
                <div>
                  <strong>${escapeHtml(item.customerName)}</strong>
                  <span>${item.rating} stars | ${escapeHtml(item.platform)} | ${escapeHtml(item.createdAt)}</span>
                </div>
                <button type="button" data-delete-history="${item.id}">Delete</button>
              </div>
              <p>${escapeHtml(item.reviewText)}</p>
              <details>
                <summary>Generated responses${item.copied ? ` | Copied: ${escapeHtml(item.copied)}` : ""}</summary>
                ${item.responses
                  .map(
                    (group) => `
                      <div class="history-responses">
                        <b>${escapeHtml(group.group)}</b>
                        ${group.options.map((text) => `<p>${escapeHtml(text)}</p>`).join("")}
                      </div>
                    `
                  )
                  .join("")}
              </details>
            </article>
          `
        )
        .join("")
    : `<p class="empty-state">No saved review responses yet.</p>`;
  saveReviewState();
}

function copyWithFallback(text) {
  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.top = "-9999px";
  document.body.appendChild(textArea);
  textArea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textArea);
  return copied;
}

async function copyResponse(groupIndex, optionIndex) {
  const item = reviewState.history.find((entry) => entry.id === currentHistoryId);
  if (!item) return;
  const group = item.responses[groupIndex];
  const text = group.options[optionIndex];
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
    } else if (!copyWithFallback(text)) {
      throw new Error("Clipboard unavailable");
    }
    item.copied = `${group.group}, option ${optionIndex + 1}`;
    showToast("Response copied");
  } catch {
    if (copyWithFallback(text)) {
      item.copied = `${group.group}, option ${optionIndex + 1}`;
      showToast("Response copied");
    } else {
      alert(text);
    }
  }
  renderHistory();
}

els.form.addEventListener("submit", (event) => {
  event.preventDefault();
  const input = {
    name: normalizeText(els.customerName.value),
    rating: Number(els.rating.value),
    platform: els.platform.value,
    reviewText: normalizeText(els.reviewText.value),
  };
  const responses = generateResponses(input);
  const historyItem = {
    id: uid("review"),
    customerName: input.name,
    rating: input.rating,
    platform: input.platform,
    reviewText: input.reviewText,
    responses,
    copied: "",
    createdAt: new Date().toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" }),
  };
  reviewState.history.unshift(historyItem);
  currentHistoryId = historyItem.id;
  renderResponses(responses);
  renderHistory();
  showToast("Responses generated");
});

els.responseOutput.addEventListener("click", (event) => {
  const responseId = event.target.dataset.copyResponse;
  if (!responseId) return;
  const [groupIndex, optionIndex] = responseId.split("-").map(Number);
  copyResponse(groupIndex, optionIndex);
});

els.historyList.addEventListener("click", (event) => {
  const id = event.target.dataset.deleteHistory;
  if (!id) return;
  reviewState.history = reviewState.history.filter((item) => item.id !== id);
  if (currentHistoryId === id) currentHistoryId = null;
  renderHistory();
  showToast("History item deleted");
});

els.clearHistory.addEventListener("click", () => {
  reviewState.history = [];
  currentHistoryId = null;
  renderHistory();
  showToast("History cleared");
});

els.clearForm.addEventListener("click", () => {
  els.form.reset();
  els.responseOutput.innerHTML = `<p class="empty-state">Enter a review to generate response options.</p>`;
  currentHistoryId = null;
});

renderHistory();
