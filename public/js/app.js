import {
  SUPPORTED_CURRENCIES,
  calculateTotals,
  dueDateFromDays,
  normalizeAiDraft,
  validateInvoice
} from "/js/domain.js?v=3";

const STORE_KEY = "talk2invoice.workspace.v1";
const app = document.querySelector("#app");
const toast = document.querySelector("#toast");
let currentView = "dashboard";
let openInvoiceId = null;
let editorState = null;
let toastTimer = null;
let modelStatus = { ai: "checking", model: "local model" };
let previewInvoice = null;
let previewMode = false;

function today() {
  return new Date().toISOString().slice(0, 10);
}

function shiftDate(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function newWorkspace() {
  return {
    business: { name: "", email: "", phone: "", address: "", currency: "USD" },
    invoices: [
      {
        id: "sample-2401", number: "INV-2401", clientName: "Sam Rivera",
        clientEmail: "sam@example.test", invoiceDate: shiftDate(-8), dueDate: shiftDate(6),
        currency: "USD", taxRate: 0, items: [
          { description: "Bathroom tap replacement", quantity: 1, unitPrice: 185 },
          { description: "Call-out and travel", quantity: 1, unitPrice: 35 }
        ], note: "Thank you for choosing a local independent business.",
        status: "Sent", isSample: true
      },
      {
        id: "sample-2400", number: "INV-2400", clientName: "Green Path Studio",
        clientEmail: "hello@example.test", invoiceDate: shiftDate(-15), dueDate: shiftDate(-1),
        currency: "USD", taxRate: 0, items: [
          { description: "Website content review", quantity: 3, unitPrice: 80 }
        ], note: "Payment received with thanks.", status: "Paid", isSample: true
      },
      {
        id: "sample-2399", number: "INV-2399", clientName: "Jordan Lee",
        clientEmail: "jordan@example.test", invoiceDate: shiftDate(-20), dueDate: shiftDate(-6),
        currency: "USD", taxRate: 0, items: [
          { description: "Garden fence repair", quantity: 2, unitPrice: 95 }
        ], note: "", status: "Draft", isSample: true
      }
    ]
  };
}

function loadWorkspace() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY));
    if (saved && saved.business && Array.isArray(saved.invoices)) {
      saved.invoices = saved.invoices.map((invoice) => ({ ...invoice, isSample: Boolean(invoice.isSample) }));
      return saved;
    }
  } catch { /* Start with the sample workspace when storage is empty or unreadable. */ }
  const initial = newWorkspace();
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(initial));
  } catch { /* The app can still be explored when browser storage is disabled. */ }
  return initial;
}

let workspace = loadWorkspace();

function persist(next) {
  workspace = next;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(workspace));
  } catch {
    showToast("This browser could not save your changes. Export a backup or clear some storage.", true);
  }
  updateInvoiceCount();
}

function updateInvoiceCount() {
  const count = document.querySelector("#invoice-count");
  if (count) count.textContent = String(workspace.invoices.length);
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function money(amount, currency) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 2
    }).format(Number(amount) || 0);
  } catch {
    return (currency || "USD") + " " + (Number(amount) || 0).toFixed(2);
  }
}

function dateText(value) {
  if (!value) return "—";
  const parsed = new Date(value + "T12:00:00");
  return Number.isNaN(parsed.valueOf()) ? "—" : new Intl.DateTimeFormat(undefined, {
    day: "numeric", month: "short", year: "numeric"
  }).format(parsed);
}

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

function invoiceTotal(invoice) {
  return calculateTotals(invoice.items || [], invoice.taxRate || 0, invoice.currency || "USD").total;
}

function groupedAmounts(invoices) {
  const totals = new Map();
  invoices.forEach((invoice) => {
    const currency = invoice.currency || "USD";
    totals.set(currency, (totals.get(currency) || 0) + invoiceTotal(invoice));
  });
  return Array.from(totals.entries()).map(([currency, amount]) => money(amount, currency)).join(" · ") || "No amount yet";
}

function statusClass(status) {
  return "status status-" + String(status || "Draft").toLowerCase().replaceAll(" ", "-");
}

function showToast(message, isError) {
  toast.textContent = message;
  toast.classList.toggle("error", Boolean(isError));
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3600);
}

function header(eyebrow, title, description, action) {
  return '<header class="page-heading"><div><div class="eyebrow">' + escapeHtml(eyebrow) +
    '</div><h1>' + escapeHtml(title) + '</h1><p>' + escapeHtml(description) +
    '</p></div>' + (action || "") + '</header>';
}

function sampleBanner() {
  if (!workspace.invoices.some((invoice) => invoice.isSample)) return "";
  return '<div class="sample-banner"><span><strong>Sample workspace.</strong> These example invoices are made-up data for your first look around.</span>' +
    '<button type="button" data-action="clear-samples">Clear examples</button></div>';
}

function invoiceRows(invoices) {
  if (!invoices.length) return "";
  return invoices.map((invoice) => '<tr>' +
    '<td><button class="invoice-link" type="button" data-open="' + escapeHtml(invoice.id) + '">' + escapeHtml(invoice.number) +
    '</button><span class="client-sub">' + escapeHtml(invoice.clientName || "Unnamed client") + '</span></td>' +
    '<td>' + dateText(invoice.invoiceDate) + '</td><td>' + dateText(invoice.dueDate) + '</td>' +
    '<td><span class="' + statusClass(invoice.status) + '">' + escapeHtml(invoice.status) + '</span></td>' +
    '<td class="money">' + money(invoiceTotal(invoice), invoice.currency) + '</td></tr>').join("");
}

function emptyInvoices(message) {
  return '<div class="empty-state"><div class="empty-illustration" aria-hidden="true">▤</div><h3>No invoices to show yet</h3><p>' +
    escapeHtml(message) + '</p><button class="button button-secondary" data-action="create" type="button">Create your first invoice</button></div>';
}

function renderDashboard() {
  const invoices = workspace.invoices;
  const sent = invoices.filter((invoice) => invoice.status === "Sent");
  const paid = invoices.filter((invoice) => invoice.status === "Paid");
  const drafts = invoices.filter((invoice) => invoice.status === "Draft");
  const html = header("YOUR WORKSPACE", greeting() + ", whenever you're ready.", "A clear view of the work you’ve done and the payments still to come.",
    '<button class="button button-primary" type="button" data-action="create"><span aria-hidden="true">＋</span> Create invoice</button>');
  app.innerHTML = html +
    '<section class="welcome-card"><div class="welcome-copy"><div class="eyebrow">LESS ADMIN, MORE GOOD WORK</div><h2>Turn a job note into a ready-to-review invoice.</h2>' +
    '<p>Say what you did, check the details, and save a clean invoice for your client. No complicated bookkeeping setup needed.</p>' +
    '<button class="button button-primary" type="button" data-action="create">Start a new invoice <span aria-hidden="true">→</span></button>' +
    '<div class="welcome-note"><span aria-hidden="true">✓</span> Your drafts stay in this browser.</div></div>' +
    '<div class="welcome-visual"><img src="/images/welcome-invoice.svg" alt="Illustration of a neatly prepared invoice and check mark"></div></section>' +
    sampleBanner() +
    '<section class="stats-grid" aria-label="Invoice summary">' +
    '<article class="stat-card"><div class="stat-top"><span>Sent and awaiting</span><span class="stat-icon" aria-hidden="true">↗</span></div><strong>' + sent.length + '</strong><span class="stat-caption">' + groupedAmounts(sent) + '</span></article>' +
    '<article class="stat-card"><div class="stat-top"><span>Paid</span><span class="stat-icon" aria-hidden="true">✓</span></div><strong>' + paid.length + '</strong><span class="stat-caption">' + groupedAmounts(paid) + '</span></article>' +
    '<article class="stat-card"><div class="stat-top"><span>Drafts to finish</span><span class="stat-icon" aria-hidden="true">✎</span></div><strong>' + drafts.length + '</strong><span class="stat-caption">Ready for your review</span></article></section>' +
    '<section class="content-card"><div class="card-heading"><h2>Recent invoices</h2><button class="text-link" type="button" data-view="invoices">View all invoices <span aria-hidden="true">→</span></button></div>' +
    (invoices.length
      ? '<div class="table-scroll"><table class="invoice-table"><thead><tr><th>Invoice</th><th>Created</th><th>Due date</th><th>Status</th><th>Amount</th></tr></thead><tbody>' + invoiceRows(invoices.slice(0, 5)) + '</tbody></table></div>'
      : emptyInvoices("When you finish a job, create an invoice here and keep everything in one place.")) + '</section>';
}

function renderInvoices() {
  app.innerHTML = header("YOUR RECORDS", "Invoices", "Find a draft, check what is due, or open an invoice to print a client copy.",
    '<button class="button button-primary" type="button" data-action="create">＋ Create invoice</button>') +
    sampleBanner() +
    '<section class="content-card"><div class="card-heading"><h2>All invoices</h2><div class="toolbar"><label class="sr-only" for="invoice-search">Search invoices</label>' +
    '<input id="invoice-search" class="filter-input" type="search" placeholder="Search by client or invoice number"></div></div>' +
    (workspace.invoices.length
      ? '<div class="table-scroll"><table class="invoice-table"><thead><tr><th>Invoice</th><th>Created</th><th>Due date</th><th>Status</th><th>Amount</th></tr></thead><tbody id="invoice-rows">' + invoiceRows(workspace.invoices) + '</tbody></table></div>'
      : emptyInvoices("Your saved invoices will appear here. Start with a voice note or enter the details yourself.")) + '</section>';
}

function currencyOptions(selected) {
  return SUPPORTED_CURRENCIES.map((code) => '<option value="' + code + '"' + (code === selected ? " selected" : "") + '>' + code + '</option>').join("");
}

function languageOptions(selected) {
  const languages = [
    ["en-US", "English"], ["hi-IN", "Hindi"], ["bn-IN", "Bengali"],
    ["es-ES", "Spanish"], ["fr-FR", "French"], ["pt-BR", "Portuguese"], ["ar-SA", "Arabic"]
  ];
  return languages.map(([code, label]) => '<option value="' + code + '"' + (code === selected ? " selected" : "") + '>' + label + '</option>').join("");
}

function languageName(code) {
  const found = {
    "en-US": "English", "hi-IN": "Hindi", "bn-IN": "Bengali",
    "es-ES": "Spanish", "fr-FR": "French", "pt-BR": "Portuguese", "ar-SA": "Arabic"
  };
  return found[code] || "English";
}

function lineRows(items) {
  return (items || []).map((item, index) => '<tr data-row="' + index + '"><td><label class="sr-only" for="description-' + index + '">Service or item ' + (index + 1) + '</label>' +
    '<input class="description-input" id="description-' + index + '" name="description" maxlength="160" placeholder="What did you do?" value="' + escapeHtml(item.description) + '"></td>' +
    '<td><label class="sr-only" for="quantity-' + index + '">Quantity for line ' + (index + 1) + '</label><input id="quantity-' + index + '" name="quantity" type="number" min="0.01" step="0.01" value="' + escapeHtml(item.quantity) + '"></td>' +
    '<td><label class="sr-only" for="price-' + index + '">Rate for line ' + (index + 1) + '</label><input class="amount-input" id="price-' + index + '" name="unitPrice" type="number" min="0" step="0.01" value="' + escapeHtml(item.unitPrice) + '"></td>' +
    '<td class="money line-total">' + money(Number(item.quantity || 0) * Number(item.unitPrice || 0), editorState.currency) + '</td>' +
    '<td><button class="remove-row" type="button" data-action="remove-line" data-index="' + index + '" aria-label="Remove line ' + (index + 1) + '">×</button></td></tr>').join("");
}

function blankEditor() {
  const business = workspace.business || {};
  return {
    id: "invoice-" + Date.now(),
    number: "INV-" + String(2402 + workspace.invoices.filter((item) => !item.isSample).length),
    clientName: "",
    clientEmail: "",
    invoiceDate: today(),
    dueDate: shiftDate(14),
    currency: business.currency || "USD",
    taxRate: 0,
    items: [{ description: "", quantity: 1, unitPrice: "" }],
    note: "Thank you for your business.",
    status: "Draft",
    isSample: false
  };
}

function renderEditor() {
  const item = editorState;
  app.innerHTML = header("INVOICE WORKSPACE", item.saved ? "Edit invoice" : "Create an invoice", "Start with a short job note, then check every detail before you save.",
    '<button class="button button-secondary" type="button" data-view="invoices">← Back to invoices</button>') +
    '<div class="editor-stack">' +
    '<section class="ai-callout"><div class="ai-title"><span class="ai-symbol" aria-hidden="true">✦</span><h2>Tell us about the job</h2></div>' +
    '<p>Write or dictate a short note. Your configured open-weight model can turn it into a first draft. You stay in control of every field.</p>' +
    '<div class="ai-input-row"><div class="field"><label for="job-note">Your job note</label><textarea id="job-note" maxlength="4000" placeholder="For example: Replace the kitchen tap for Sam Rivera. One call-out, $185 for the tap and $35 travel. Due in two weeks.">' + escapeHtml(item.jobNote || "") + '</textarea></div>' +
    '<button class="button button-secondary" type="button" data-action="dictate" aria-describedby="voice-note">🎙 Dictate</button></div>' +
    '<div id="voice-note" class="field-help" style="margin-top:7px">Dictation availability depends on your browser. Its speech service may process audio; typing keeps the note out of that service.</div>' +
    '<div class="ai-actions"><div class="language-field"><label class="field-label" for="language">Draft language</label><select id="language">' + languageOptions(item.language || "en-US") + '</select></div>' +
    '<button class="button button-primary" type="button" data-action="ai-draft">Draft with local AI</button>' +
    '<button class="button button-secondary" type="button" data-action="sample-draft">Try the example</button>' +
    '<span class="inline-status ' + (modelStatus.ai === "ready" ? "ready" : "") + '" id="model-inline-status">' +
    (modelStatus.ai === "ready" ? "Ready · " + escapeHtml(modelStatus.model) : "AI model " + (modelStatus.ai === "checking" ? "checking…" : "not connected")) +
    '</span></div></section>' +
    '<form id="invoice-form" class="editor-stack" novalidate>' +
    '<section class="content-card editor-card"><div class="section-heading"><div><h2>Client and dates</h2><p>Check names and dates before this leaves your hands.</p></div><span class="status status-draft">Draft</span></div>' +
    '<div class="form-grid">' +
    '<div class="field"><label for="client-name">Client name <span aria-hidden="true">*</span></label><input id="client-name" name="clientName" autocomplete="organization" maxlength="120" placeholder="Who is this invoice for?" value="' + escapeHtml(item.clientName) + '" required></div>' +
    '<div class="field"><label for="client-email">Client email</label><input id="client-email" name="clientEmail" type="email" autocomplete="email" maxlength="180" placeholder="name@example.com" value="' + escapeHtml(item.clientEmail) + '"><small>Used on the invoice only. Talk2Invoice does not send email.</small></div>' +
    '<div class="field"><label for="invoice-date">Invoice date</label><input id="invoice-date" name="invoiceDate" type="date" value="' + escapeHtml(item.invoiceDate) + '"></div>' +
    '<div class="field"><label for="due-date">Payment due</label><input id="due-date" name="dueDate" type="date" value="' + escapeHtml(item.dueDate) + '"></div>' +
    '</div></section>' +
    '<section class="content-card editor-card"><div class="section-heading"><div><h2>Work and rates</h2><p>Enter the amount you agreed with your client. Totals are calculated on this device.</p></div></div>' +
    '<div class="form-grid" style="margin-bottom:20px"><div class="field"><label for="currency">Currency</label><select id="currency" name="currency">' + currencyOptions(item.currency) + '</select></div>' +
    '<div class="field"><label for="tax-rate">Tax rate, if applicable (%)</label><input id="tax-rate" name="taxRate" type="number" min="0" max="100" step="0.01" value="' + escapeHtml(item.taxRate || 0) + '"><small>Check your local rules. This is a calculation field, not tax advice.</small></div></div>' +
    '<div class="line-items-wrap"><table class="line-items"><thead><tr><th>Service or item</th><th>Quantity</th><th>Rate</th><th>Line total</th><th><span class="sr-only">Remove</span></th></tr></thead><tbody id="line-rows">' + lineRows(item.items) + '</tbody></table></div>' +
    '<button class="button button-quiet add-line" type="button" data-action="add-line">＋ Add another line</button>' +
    '<div class="totals-box" id="editor-totals"></div></section>' +
    '<section class="content-card editor-card"><div class="section-heading"><div><h2>A note for your client</h2><p>Add a short thank-you or payment instruction if you need one.</p></div></div>' +
    '<div class="field"><label for="invoice-note">Invoice note</label><textarea id="invoice-note" name="note" maxlength="500" placeholder="Thank you for your business.">' + escapeHtml(item.note || "") + '</textarea></div></section>' +
    '<div class="notice"><strong>Your approval matters.</strong> AI suggestions can be wrong. Check every name, quantity, rate, date, and total before you save or share this invoice.</div>' +
    '<div class="editor-footer"><button class="button button-quiet" type="button" data-view="invoices">Cancel</button><div class="right-actions"><button class="button button-secondary" type="button" data-action="preview-current">Preview</button>' +
    '<button class="button button-primary" type="button" data-action="save-invoice">Save draft</button></div></div></form></div>';
  updateTotals();
}

function readEditorForm() {
  const form = document.querySelector("#invoice-form");
  if (!form) return editorState;
  const value = (name) => form.elements.namedItem(name)?.value || "";
  const rows = Array.from(document.querySelectorAll("#line-rows tr"));
  return {
    ...editorState,
    clientName: value("clientName").trim(),
    clientEmail: value("clientEmail").trim(),
    invoiceDate: value("invoiceDate"),
    dueDate: value("dueDate"),
    currency: value("currency") || "USD",
    taxRate: Number(value("taxRate")) || 0,
    note: value("note").trim(),
    items: rows.map((row) => ({
      description: row.querySelector('[name="description"]').value.trim(),
      quantity: Number(row.querySelector('[name="quantity"]').value),
      unitPrice: row.querySelector('[name="unitPrice"]').value.trim()
    }))
  };
}

function updateTotals() {
  if (!editorState) return;
  const current = readEditorForm();
  editorState.currency = current.currency;
  const totals = calculateTotals(current.items, current.taxRate, current.currency);
  document.querySelectorAll("#line-rows tr").forEach((row, index) => {
    const item = current.items[index];
    const total = row.querySelector(".line-total");
    if (total && item) total.textContent = money(item.quantity * item.unitPrice, current.currency);
  });
  const box = document.querySelector("#editor-totals");
  if (box) box.innerHTML = '<div class="total-row"><span>Subtotal</span><strong>' + money(totals.subtotal, current.currency) +
    '</strong></div><div class="total-row"><span>Tax (' + escapeHtml(current.taxRate) + '%)</span><strong>' + money(totals.tax, current.currency) +
    '</strong></div><div class="total-row total-final"><span>Total</span><strong>' + money(totals.total, current.currency) + '</strong></div>';
}

function editorFromInvoice(invoice) {
  return { ...invoice, items: invoice.items.map((item) => ({ ...item })), saved: true };
}

function renderSettings() {
  const business = workspace.business || {};
  app.innerHTML = header("YOUR WORKSPACE", "Business settings", "Set the details you want printed on your invoices. These preferences stay in this browser.") +
    '<div class="settings-layout"><section class="content-card settings-card"><div class="section-heading"><div><h2>Your business details</h2><p>Leave a field blank if you do not want it on the invoice.</p></div></div>' +
    '<form id="business-form" class="form-grid" novalidate>' +
    '<div class="field field-wide"><label for="business-name">Business or trading name</label><input id="business-name" name="name" maxlength="120" placeholder="Your name or business" value="' + escapeHtml(business.name) + '"></div>' +
    '<div class="field"><label for="business-email">Business email</label><input id="business-email" name="email" type="email" maxlength="180" placeholder="you@example.com" value="' + escapeHtml(business.email) + '"></div>' +
    '<div class="field"><label for="business-phone">Phone number</label><input id="business-phone" name="phone" type="tel" maxlength="40" placeholder="+1 555 0100" value="' + escapeHtml(business.phone) + '"></div>' +
    '<div class="field field-wide"><label for="business-address">Business address</label><textarea id="business-address" name="address" maxlength="240" placeholder="Street, city, postal code">' + escapeHtml(business.address) + '</textarea></div>' +
    '<div class="field"><label for="business-currency">Default currency</label><select id="business-currency" name="currency">' + currencyOptions(business.currency || "USD") + '</select></div>' +
    '<div class="field field-wide"><button class="button button-primary" type="submit">Save business details</button></div></form>' +
    '<div class="divider"></div><div class="section-heading"><div><h2>Local AI connection</h2><p>Talk2Invoice uses an open-weight model through Ollama. Model availability depends on your device.</p></div></div>' +
    '<div class="setting-status"><div><strong id="settings-ai-label">Checking model connection…</strong><small id="settings-ai-detail">Invoices remain usable without an AI model.</small></div>' +
    '<button class="button button-secondary" type="button" data-action="check-model">Check again</button></div>' +
    '<p class="field-help">Recommended starting point: <code>qwen2.5:1.5b</code>. Run <code>ollama pull qwen2.5:1.5b</code> and keep Ollama running, then return to the invoice screen.</p>' +
    '<p class="field-help">The job note is sent to the Ollama address in your server settings. With the default setup, that service runs on your own device. If you configure a remote service, its operator receives the note.</p></section>' +
    '<div class="editor-stack"><section class="content-card settings-card"><div class="section-heading"><div><h2>Privacy in plain language</h2><p>Here is where the information goes.</p></div></div>' +
    '<ul class="privacy-list"><li><span>✓</span><span>Saved invoices and business details are stored in this browser, not in a Talk2Invoice account.</span></li>' +
    '<li><span>✓</span><span>Invoice totals are calculated by the app on your device.</span></li>' +
    '<li><span>✓</span><span>Only the job note is sent to the Ollama model when you ask it to draft. It is not sent automatically.</span></li>' +
    '<li><span>!</span><span>Browser voice dictation may use the browser’s speech service. Type the note if you do not want to use that service.</span></li>' +
    '<li><span>!</span><span>Printing or saving a PDF uses your browser’s print controls.</span></li></ul></section>' +
    '<section class="content-card settings-card"><div class="section-heading"><div><h2>Back up or clear your work</h2><p>Download a copy before changing browsers or clearing site data.</p></div></div>' +
    '<div class="editor-stack"><button class="button button-secondary" type="button" data-action="export-json">Download a data backup</button>' +
    '<button class="button button-secondary" type="button" data-action="export-csv">Export invoices as CSV</button>' +
    '<button class="button button-danger" type="button" data-action="clear-workspace">Clear this browser’s data</button></div></section></div></div>';
  updateSettingsModel();
}

function updateSettingsModel() {
  const label = document.querySelector("#settings-ai-label");
  const detail = document.querySelector("#settings-ai-detail");
  if (!label || !detail) return;
  if (modelStatus.ai === "ready") {
    label.textContent = "Connected · " + modelStatus.model;
    detail.textContent = "Your configured Ollama model is ready for invoice drafts.";
  } else {
    label.textContent = modelStatus.ai === "checking" ? "Checking model connection…" : "No model connection";
    detail.textContent = "You can still create, edit, save, and print invoices without AI.";
  }
}

function renderInvoiceDetail(invoiceId) {
  const savedInvoice = workspace.invoices.find((item) => item.id === invoiceId);
  const isPreview = Boolean(previewMode && previewInvoice && previewInvoice.id === invoiceId);
  const invoice = isPreview ? previewInvoice : savedInvoice;
  if (!invoice) {
    showToast("That invoice could not be found.", true);
    setView("invoices");
    return;
  }
  openInvoiceId = invoiceId;
  const business = workspace.business || {};
  const totals = calculateTotals(invoice.items || [], invoice.taxRate || 0, invoice.currency);
  const itemRows = invoice.items.map((item) => '<tr><td>' + escapeHtml(item.description) + '</td><td class="numeric">' + escapeHtml(item.quantity) +
    '</td><td class="numeric">' + money(item.unitPrice, invoice.currency) + '</td><td class="numeric money">' +
    money(Number(item.quantity) * Number(item.unitPrice), invoice.currency) + '</td></tr>').join("");
  const address = [business.address, business.phone, business.email].filter(Boolean).map(escapeHtml).join("<br>");
  app.innerHTML = header(isPreview ? "DRAFT PREVIEW" : "INVOICE " + invoice.number, invoice.clientName || "Invoice details", isPreview ? "Preview the current draft before saving it." : "Review the client copy, update its status, or print a PDF.",
    '<div class="toolbar">' + (!isPreview
      ? '<button class="button button-secondary" type="button" data-view="invoices">← Invoices</button>'
      : '<button class="button button-secondary" type="button" data-action="edit-invoice">← Return to draft</button>') +
    '<button class="button button-primary" type="button" data-action="print">Print or save PDF</button></div>') +
    '<div class="invoice-detail-grid"><article class="invoice-paper" id="invoice-paper"><div class="print-only">Client copy</div>' +
    '<div class="paper-top"><div><div class="paper-brand">' + escapeHtml(business.name || "Your business") + '</div><div class="client-sub">' + address + '</div></div>' +
    '<div class="paper-number"><span class="paper-label">Invoice</span><strong>' + escapeHtml(invoice.number) + '</strong><div style="margin-top:8px"><span class="' + statusClass(invoice.status) + '">' + escapeHtml(invoice.status) + '</span></div></div></div>' +
    '<div class="paper-parties"><div><span class="paper-label">Bill to</span><strong>' + escapeHtml(invoice.clientName || "Client name") + '</strong>' + escapeHtml(invoice.clientEmail || "") + '</div>' +
    '<div><span class="paper-label">Dates</span><strong>Issued ' + dateText(invoice.invoiceDate) + '</strong>Due ' + dateText(invoice.dueDate) + '</div></div>' +
    '<div class="table-scroll"><table class="invoice-table paper-table"><thead><tr><th>Service or item</th><th class="numeric">Qty</th><th class="numeric">Rate</th><th class="numeric">Amount</th></tr></thead><tbody>' + itemRows + '</tbody></table></div>' +
    '<div class="paper-totals"><div class="total-row"><span>Subtotal</span><strong>' + money(totals.subtotal, invoice.currency) + '</strong></div>' +
    '<div class="total-row"><span>Tax (' + escapeHtml(invoice.taxRate || 0) + '%)</span><strong>' + money(totals.tax, invoice.currency) + '</strong></div>' +
    '<div class="total-row total-final"><span>Total due</span><strong>' + money(totals.total, invoice.currency) + '</strong></div></div>' +
    (invoice.note ? '<div class="paper-note"><span class="paper-label">A note for you</span>' + escapeHtml(invoice.note) + '</div>' : '') +
    '</article><aside class="content-card detail-actions"><span class="paper-label">Invoice actions</span>' +
    '<button class="button button-secondary" type="button" data-action="edit-invoice">' + (isPreview ? "Return to draft" : "Edit details") + '</button>' +
    (savedInvoice && !isPreview && invoice.status === "Draft" ? '<button class="button button-secondary" type="button" data-action="mark-sent">Mark as sent</button>' : '') +
    (savedInvoice && !isPreview && invoice.status !== "Paid" ? '<button class="button button-secondary" type="button" data-action="mark-paid">Mark as paid</button>' : '') +
    (savedInvoice && !isPreview ? '<button class="button button-secondary" type="button" data-action="export-one">Download data backup</button>' : '') +
    '<div class="notice">Talk2Invoice does not send invoices by email. Print or save a PDF, then share it using your usual method.</div>' +
    (savedInvoice && !isPreview ? '<button class="button button-danger" type="button" data-action="delete-invoice">Delete invoice</button>' : '') + '</aside></div>';
}

function setView(view) {
  currentView = view;
  document.querySelectorAll(".nav-link").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === view);
  });
  document.querySelector("#sidebar").classList.remove("open");
  if (view === "dashboard") renderDashboard();
  else if (view === "invoices") renderInvoices();
  else if (view === "settings") renderSettings();
  else if (view === "editor") renderEditor();
  else if (view === "invoice-detail") renderInvoiceDetail(openInvoiceId);
  if (view !== "invoice-detail") previewMode = false;
  app.focus({ preventScroll: true });
}

function createEditor() {
  editorState = blankEditor();
  setView("editor");
  const field = document.querySelector("#job-note");
  if (field) field.focus();
}

function sampleDraft() {
  const normalized = normalizeAiDraft({
    clientName: "Sam Rivera",
    clientEmail: "sam@example.test",
    summary: "Replace a kitchen tap and include one call-out and travel.",
    dueDays: 14,
    items: [
      { description: "Kitchen tap replacement", quantity: 1, unitPrice: 185 },
      { description: "Call-out and travel", quantity: 1, unitPrice: 35 }
    ]
  });
  editorState = {
    ...editorState,
    ...normalized,
    jobNote: "Replace the kitchen tap for Sam Rivera. One call-out, $185 for the tap and $35 travel. Due in two weeks.",
    dueDate: dueDateFromDays(normalized.dueDays),
    isSample: false
  };
  renderEditor();
  showToast("Example loaded. This is sample content, not a live AI result.");
}

async function askModel() {
  const field = document.querySelector("#job-note");
  const button = document.querySelector('[data-action="ai-draft"]');
  const currency = document.querySelector("#currency")?.value || editorState.currency;
  const languageCode = document.querySelector("#language")?.value || "en-US";
  const language = languageName(languageCode);
  const description = field?.value.trim() || "";
  if (description.length < 8) {
    showToast("Add a little more detail about the job first.", true);
    field?.focus();
    return;
  }
  button.disabled = true;
  button.textContent = "Preparing your draft…";
  try {
    const response = await fetch("/api/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description, currency, language })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "The local model could not create a draft.");
    const draft = normalizeAiDraft(result.draft);
    editorState = {
      ...editorState,
      ...draft,
      jobNote: description,
      currency,
      dueDate: dueDateFromDays(draft.dueDays),
      isSample: false
    };
    renderEditor();
    showToast("Draft ready. Please check every field before saving.");
  } catch (error) {
    button.disabled = false;
    button.textContent = "Draft with local AI";
    showToast(error.message || "Could not reach your model. Try the manual form.", true);
  }
}

function csvEscape(value) {
  return '"' + String(value == null ? "" : value).replaceAll('"', '""') + '"';
}

function downloadFile(name, type, contents) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportCsv(list) {
  const headers = ["Invoice number", "Client", "Email", "Invoice date", "Due date", "Currency", "Subtotal", "Tax rate", "Tax", "Total", "Status"];
  const rows = (list || workspace.invoices).map((invoice) => {
    const totals = calculateTotals(invoice.items || [], invoice.taxRate || 0, invoice.currency);
    return [
      invoice.number, invoice.clientName, invoice.clientEmail, invoice.invoiceDate, invoice.dueDate,
      invoice.currency, totals.subtotal, invoice.taxRate || 0, totals.tax, totals.total, invoice.status
    ].map(csvEscape).join(",");
  });
  downloadFile("talk2invoice-invoices.csv", "text/csv;charset=utf-8", [headers.map(csvEscape).join(","), ...rows].join("\r\n"));
}

function exportJson(list) {
  downloadFile("talk2invoice-backup.json", "application/json", JSON.stringify({
    exportedAt: new Date().toISOString(), business: workspace.business, invoices: list || workspace.invoices
  }, null, 2));
}

function updateInvoice(id, updater) {
  const next = {
    ...workspace,
    invoices: workspace.invoices.map((invoice) => invoice.id === id ? updater(invoice) : invoice)
  };
  persist(next);
}

function clearSampleInvoices() {
  persist({ ...workspace, invoices: workspace.invoices.filter((invoice) => !invoice.isSample) });
  renderDashboard();
  showToast("Sample invoices cleared. Your own invoices are still here.");
}

function closeSampleNoticeIfEmpty() {
  if (currentView === "dashboard") renderDashboard();
  else if (currentView === "invoices") renderInvoices();
}

async function checkModel() {
  modelStatus = { ...modelStatus, ai: "checking" };
  updateSettingsModel();
  try {
    const response = await fetch("/api/health");
    const result = await response.json();
    modelStatus = { ai: result.ai, model: result.model, reason: result.reason };
  } catch {
    modelStatus = { ai: "unavailable", model: "local model" };
  }
  if (currentView === "settings") updateSettingsModel();
  if (currentView === "editor") {
    const status = document.querySelector("#model-inline-status");
    if (status) {
      status.textContent = modelStatus.ai === "ready"
        ? "Ready · " + modelStatus.model
        : "AI model not connected";
      status.classList.toggle("ready", modelStatus.ai === "ready");
    }
  }
}

function dictate() {
  const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Speech) {
    showToast("Voice dictation is not available in this browser. You can type the job note instead.", true);
    return;
  }
  const recognition = new Speech();
  recognition.lang = document.querySelector("#language")?.value || "en-US";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.onresult = (event) => {
    const field = document.querySelector("#job-note");
    const spoken = event.results && event.results[0] && event.results[0][0] && event.results[0][0].transcript;
    if (field && spoken) {
      field.value = (field.value.trim() ? field.value.trim() + " " : "") + spoken;
      field.focus();
      showToast("Dictation added. Please review the words and amounts.");
    }
  };
  recognition.onerror = (event) => showToast("Dictation stopped: " + (event.error || "please try again"), true);
  recognition.start();
}

document.addEventListener("click", async (event) => {
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) {
    event.preventDefault();
    setView(viewButton.dataset.view);
    return;
  }
  const openButton = event.target.closest("[data-open]");
  if (openButton) {
    openInvoiceId = openButton.dataset.open;
    previewInvoice = null;
    previewMode = false;
    setView("invoice-detail");
    return;
  }
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  if (action === "create") createEditor();
  else if (action === "sample-draft") sampleDraft();
  else if (action === "ai-draft") await askModel();
  else if (action === "dictate") dictate();
  else if (action === "check-model") await checkModel();
  else if (action === "add-line" || action === "remove-line") {
    editorState = readEditorForm();
    if (action === "add-line") editorState.items.push({ description: "", quantity: 1, unitPrice: "" });
    else if (editorState.items.length > 1) editorState.items.splice(Number(button.dataset.index), 1);
    else showToast("Keep at least one line on the invoice.", true);
    renderEditor();
  } else if (action === "save-invoice") {
    const invoice = readEditorForm();
    const errors = validateInvoice(invoice);
    if (errors.length) {
      showToast(errors[0], true);
      const field = errors[0].includes("client") ? document.querySelector("#client-name") : document.querySelector("#line-rows input");
      field?.focus();
      return;
    }
    invoice.isSample = false;
    invoice.status = "Draft";
    const exists = workspace.invoices.some((item) => item.id === invoice.id);
    const invoices = exists
      ? workspace.invoices.map((item) => item.id === invoice.id ? invoice : item)
      : [invoice, ...workspace.invoices];
    persist({ ...workspace, invoices });
    openInvoiceId = invoice.id;
    previewInvoice = null;
    previewMode = false;
    editorState = null;
    setView("invoice-detail");
    showToast("Invoice saved on this device.");
  } else if (action === "preview-current") {
    const invoice = readEditorForm();
    const errors = validateInvoice(invoice);
    if (errors.length) {
      showToast(errors[0], true);
      return;
    }
    previewInvoice = { ...invoice, isSample: false };
    previewMode = true;
    openInvoiceId = invoice.id;
    setView("invoice-detail");
  } else if (action === "edit-invoice") {
    const invoice = previewMode && previewInvoice && previewInvoice.id === openInvoiceId
      ? previewInvoice
      : workspace.invoices.find((item) => item.id === openInvoiceId);
    if (invoice) {
      editorState = editorFromInvoice(invoice);
      setView("editor");
    }
  } else if (action === "mark-sent" || action === "mark-paid") {
    const status = action === "mark-sent" ? "Sent" : "Paid";
    updateInvoice(openInvoiceId, (invoice) => ({ ...invoice, status, isSample: false }));
    setView("invoice-detail");
    showToast("Marked as " + status.toLowerCase() + ".");
  } else if (action === "print") window.print();
  else if (action === "export-json") {
    exportJson();
    showToast("Your backup file has been downloaded.");
  } else if (action === "export-csv") {
    exportCsv();
    showToast("Your CSV file has been downloaded.");
  } else if (action === "export-one") {
    const invoice = workspace.invoices.find((item) => item.id === openInvoiceId);
    exportJson(invoice ? [invoice] : []);
    showToast("Invoice data backup downloaded.");
  } else if (action === "delete-invoice") {
    if (window.confirm("Delete this invoice from this browser? This cannot be undone unless you have a backup.")) {
      persist({ ...workspace, invoices: workspace.invoices.filter((invoice) => invoice.id !== openInvoiceId) });
      setView("invoices");
      showToast("Invoice deleted from this browser.");
    }
  } else if (action === "clear-samples") {
    clearSampleInvoices();
  } else if (action === "clear-workspace") {
    if (window.confirm("Clear all invoices and business details saved in this browser? Download a backup first if you may need them.")) {
      workspace = newWorkspace();
      workspace.invoices = [];
      persist(workspace);
      setView("dashboard");
      showToast("This browser’s saved data has been cleared.");
    }
  }
});

document.addEventListener("submit", (event) => {
  if (event.target.id !== "business-form") return;
  event.preventDefault();
  const form = event.target;
  const value = (name) => form.elements.namedItem(name)?.value.trim() || "";
  persist({
    ...workspace,
    business: {
      name: value("name"), email: value("email"), phone: value("phone"),
      address: value("address"), currency: value("currency") || "USD"
    }
  });
  showToast("Business details saved on this device.");
});

document.addEventListener("input", (event) => {
  if (event.target.id === "invoice-search") {
    const term = event.target.value.toLowerCase().trim();
    const filtered = workspace.invoices.filter((invoice) =>
      (invoice.number + " " + invoice.clientName + " " + invoice.clientEmail).toLowerCase().includes(term)
    );
    const rows = document.querySelector("#invoice-rows");
    if (rows) rows.innerHTML = invoiceRows(filtered) || '<tr><td colspan="5" class="client-sub" style="padding:24px">No matching invoices found.</td></tr>';
  }
  if (event.target.closest("#invoice-form")) updateTotals();
});

document.querySelector("#menu-button").addEventListener("click", () => {
  document.querySelector("#sidebar").classList.toggle("open");
});

function renderCurrentView() {
  if (currentView === "dashboard") renderDashboard();
  else if (currentView === "invoices") renderInvoices();
  else if (currentView === "settings") renderSettings();
  else if (currentView === "editor") renderEditor();
  else if (currentView === "invoice-detail") renderInvoiceDetail(openInvoiceId);
}

renderCurrentView();
updateInvoiceCount();
checkModel();
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/service-worker.js").catch(() => {}));
}
