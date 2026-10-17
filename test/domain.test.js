import test from "node:test";
import assert from "node:assert/strict";
import {
  SUPPORTED_CURRENCIES,
  calculateTotals,
  currencyDigits,
  dueDateFromDays,
  fromMinorUnits,
  normalizeAiDraft,
  toMinorUnits,
  validateInvoice
} from "../public/js/domain.js";

test("calculates line totals and tax with currency-safe rounding", () => {
  const totals = calculateTotals([
    { quantity: 3, unitPrice: 19.95 },
    { quantity: 1, unitPrice: 8.1 }
  ], 8.25, "USD");
  assert.equal(totals.subtotalMinor, 6795);
  assert.equal(totals.taxMinor, 561);
  assert.equal(totals.totalMinor, 7356);
  assert.equal(totals.total, 73.56);
});

test("uses zero decimal places for JPY", () => {
  assert.equal(currencyDigits("JPY"), 0);
  assert.equal(toMinorUnits(125.8, "JPY"), 126);
  assert.equal(fromMinorUnits(126, "JPY"), 126);
});

test("formats every listed currency and calculates a finite total", () => {
  for (const currency of SUPPORTED_CURRENCIES) {
    const digits = currencyDigits(currency);
    const total = calculateTotals([{ quantity: 2, unitPrice: 12.34 }], 5, currency);
    assert.ok(Number.isInteger(digits), currency + " has supported currency precision");
    assert.ok(Number.isFinite(total.total), currency + " has a finite invoice total");
    assert.equal(total.totalMinor, total.subtotalMinor + total.taxMinor, currency + " total reconciles");
  }
});

test("reports missing client, line details, and model rates for human review", () => {
  const errors = validateInvoice({
    clientName: "",
    taxRate: 0,
    items: [{ description: "Repair", quantity: 1, unitPrice: "" }]
  });
  assert.ok(errors.includes("Add the client’s name."));
  assert.ok(errors.includes("Add the agreed rate for line 1."));
});

test("accepts a complete draft and rejects invalid quantities and tax rates", () => {
  assert.deepEqual(validateInvoice({
    clientName: "Sam Rivera",
    taxRate: 5,
    items: [{ description: "Tap replacement", quantity: 1, unitPrice: 125 }]
  }), []);
  assert.ok(validateInvoice({
    clientName: "Sam Rivera",
    taxRate: 101,
    items: [{ description: "Tap replacement", quantity: -1, unitPrice: 125 }]
  }).some((message) => message.includes("quantity")));
});

test("normalizes incomplete model output without inventing an amount", () => {
  const draft = normalizeAiDraft({
    clientName: "A Client",
    dueDays: null,
    items: [{ description: "A service", quantity: 1, unitPrice: null }]
  });
  assert.equal(draft.clientName, "A Client");
  assert.equal(draft.dueDays, 14);
  assert.equal(draft.items[0].unitPrice, "");
  assert.ok(validateInvoice({ clientName: draft.clientName, items: draft.items, taxRate: 0 })
    .includes("Add the agreed rate for line 1."));
});

test("uses a 14-day due date when an invalid period is supplied", () => {
  const due = dueDateFromDays(0, new Date("2026-10-17T12:00:00Z"));
  assert.match(due, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(due, "2026-10-31");
});
