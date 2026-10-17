export const SUPPORTED_CURRENCIES = [
  "AUD", "BRL", "CAD", "CHF", "EUR", "GBP", "INR", "JPY",
  "KES", "MXN", "NGN", "NZD", "PHP", "SGD", "USD", "ZAR"
];

export function currencyDigits(currency) {
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: currency || "USD"
    }).resolvedOptions().maximumFractionDigits;
  } catch {
    return 2;
  }
}

export function toMinorUnits(value, currency) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  const scale = Math.pow(10, currencyDigits(currency));
  return Math.round((amount + Number.EPSILON) * scale);
}

export function fromMinorUnits(value, currency) {
  return Number(value) / Math.pow(10, currencyDigits(currency));
}

export function calculateTotals(items, taxRate, currency) {
  const subtotalMinor = (items || []).reduce((sum, item) => {
    const quantity = Number(item.quantity);
    const unitPriceMinor = toMinorUnits(item.unitPrice, currency);
    if (!Number.isFinite(quantity) || quantity <= 0) return sum;
    return sum + Math.round(quantity * unitPriceMinor);
  }, 0);
  const rate = Number(taxRate);
  const taxMinor = Number.isFinite(rate) && rate > 0
    ? Math.round(subtotalMinor * rate / 100)
    : 0;
  return {
    subtotalMinor,
    taxMinor,
    totalMinor: subtotalMinor + taxMinor,
    subtotal: fromMinorUnits(subtotalMinor, currency),
    tax: fromMinorUnits(taxMinor, currency),
    total: fromMinorUnits(subtotalMinor + taxMinor, currency)
  };
}

export function validateInvoice(invoice) {
  const errors = [];
  if (!invoice || typeof invoice !== "object") {
    return ["Enter invoice details to continue."];
  }
  if (!String(invoice.clientName || "").trim()) errors.push("Add the client’s name.");
  if (!Array.isArray(invoice.items) || invoice.items.length === 0) {
    errors.push("Add at least one service or item.");
    return errors;
  }
  invoice.items.forEach((item, index) => {
    const n = index + 1;
    if (!String(item.description || "").trim()) errors.push("Add a description to line " + n + ".");
    const quantity = Number(item.quantity);
    const price = Number(item.unitPrice);
    if (!Number.isFinite(quantity) || quantity <= 0) errors.push("Line " + n + " needs a quantity greater than zero.");
    if (item.unitPrice == null || String(item.unitPrice).trim() === "") errors.push("Add the agreed rate for line " + n + ".");
    if (!Number.isFinite(price) || price < 0) errors.push("Line " + n + " needs a valid amount.");
  });
  const taxRate = Number(invoice.taxRate || 0);
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
    errors.push("Enter a tax rate from 0 to 100, or leave it at 0.");
  }
  return errors;
}

export function normalizeAiDraft(draft) {
  const source = draft && typeof draft === "object" ? draft : {};
  const items = Array.isArray(source.items) ? source.items.slice(0, 12) : [];
  return {
    clientName: typeof source.clientName === "string" ? source.clientName.slice(0, 120) : "",
    clientEmail: typeof source.clientEmail === "string" ? source.clientEmail.slice(0, 180) : "",
    summary: typeof source.summary === "string" ? source.summary.slice(0, 300) : "",
    dueDays: Number.isInteger(source.dueDays) && source.dueDays >= 1 && source.dueDays <= 90
      ? source.dueDays : 14,
    items: items.map((item) => ({
      description: item && typeof item.description === "string" ? item.description.slice(0, 160) : "",
      quantity: Number.isFinite(Number(item && item.quantity)) && Number(item.quantity) > 0
        ? Number(item.quantity) : 1,
      unitPrice: item && item.unitPrice != null && item.unitPrice !== "" &&
        Number.isFinite(Number(item.unitPrice)) && Number(item.unitPrice) >= 0
        ? Number(item.unitPrice) : ""
    }))
  };
}

export function dueDateFromDays(days, now) {
  const date = new Date(now || Date.now());
  date.setDate(date.getDate() + Math.max(1, Number(days) || 14));
  return date.toISOString().slice(0, 10);
}
