---
title: "Talk2Invoice: Turn a Job Note Into a Client-Ready Draft With Open-Weight AI"
description: "A local-first, voice-friendly invoice drafting tool for independent service workers."
tags: devchallenge, hf26challenge, opensource, javascript
---

This is my submission for the [Hacktoberfest Open-Source AI Challenge: Week 2 — Side Hustle](https://dev.to/challenges/hacktoberfest-week2-2026-10-12).

## What I built

Talk2Invoice helps an independent service worker turn a short note about a finished job into a client-ready invoice draft.

The person can type a note or use optional browser dictation, choose one of 16 currencies and one of seven draft languages (English, Hindi, Bengali, Spanish, French, Portuguese, or Arabic), then ask an open-weight model to suggest the client and line items. They can review and edit every field, add a tax rate if it applies to them, and print or save a PDF when they are satisfied. The interface is in English for now; draft-language support does not localize every control or provide country-specific tax guidance.

![Talk2Invoice dashboard preview](https://raw.githubusercontent.com/acceptedsoul-11/Talk2Invoice/main/docs/images/dashboard-preview.svg)

![Talk2Invoice invoice preview](https://raw.githubusercontent.com/acceptedsoul-11/Talk2Invoice/main/docs/images/invoice-preview.svg)

These hand-drawn SVG interface previews use fictional sample records. They are not captures of a live app session, a real customer transaction, or an inference result from a live model.

## Who it is for

The first likely users are independent repair workers, tutors, cleaners, and freelancers who finish a job away from their desk and want to send a clear bill without learning an accounting system.

Someone might pay for a tool that saves them a few minutes at the end of every job and keeps customer details on a device they control. That is a product hypothesis, not a validated sale: I have not yet asked a service worker to test it or confirmed willingness to pay.

## How I built it

The UI is plain JavaScript served by a small Node.js server. When a user requests a draft, the server calls an Ollama-compatible local model and requests structured JSON. The suggested values go back into an editable form.

The recommended model is Qwen2.5 1.5B, an open-weight, multilingual model available through Ollama. The model is replaceable with another Ollama model by changing one setting.

![Talk2Invoice data flow](https://raw.githubusercontent.com/acceptedsoul-11/Talk2Invoice/main/docs/images/architecture.svg)

I deliberately left the model out of decisions the app can make reliably. Code calculates quantities, rates, tax, and totals. If the model does not provide a rate, that field stays blank and the person must fill it in. The invoice remains a draft until the person checks it.

## Why open innovation matters here

The job note can include a client’s name, work performed, and agreed prices. Running the model through an Ollama service on a machine the user controls keeps that note out of a hosted AI API by default. Invoice data and business settings are stored in the browser, and the model is contacted only after the person requests a draft.

Open models also make it possible to change the model or adapt the language and workflow without tying the tool to one provider’s account or pricing. Local inference still uses memory, power, and time; I have not measured whether it is cheaper than a hosted model, so I am not making a cost-savings claim.

One privacy detail deserves a clear explanation: browser voice dictation may use the browser provider’s speech service. Typing is available for people who want to avoid that service. Talk2Invoice does not record or upload audio itself.

## Demo and code

- **Source:** [Talk2Invoice on GitHub](https://github.com/acceptedsoul-11/Talk2Invoice)
- **Run it:** install Ollama, run `ollama pull qwen2.5:1.5b`, then use `docker compose up --build` from the repository.
- **Open the app:** `http://localhost:3000`
- **Tests:** run `npm test`. The API contract is tested against a mock Ollama server; this does not evaluate real model accuracy or speed.

The first model download needs internet. After that, the local Docker setup reuses the model volume.

## What is not finished yet

Talk2Invoice does not send email, collect payments, sync between devices, or file taxes. Its interface is currently English-only, and its draft-language choices do not replace full localization or market-specific tax rules. It has not been tested with an external service worker, and I have not validated whether anyone would pay for it. The next useful step is to watch one independent worker create an invoice after a real job, with permission, then fix the parts that slow them down.

Tax is an arithmetic field, not advice. AI-generated details can be wrong; check every amount, date, and name before sharing an invoice.

## Why I chose this workflow

There are already several invoice and receipt sorting projects in this challenge. Talk2Invoice takes a different part of the work: the moment after a service is complete, when a worker needs to turn what they just did into a clear invoice. The small scope keeps the app approachable while leaving room to add a market-specific template or language after talking to real users.

## Source notes

- [StrukLokal: Local-First Receipt OCR for Freelancers](https://dev.to/bangkah/building-a-local-first-receipt-ocr-app-and-being-honest-about-what-i-tested-3oai) describes a local OCR workflow that treats extracted values as suggestions, then asks a person to correct and approve them.
- [I built an offline invoice sorter for freelancers, then measured whether local inference is actually cheaper](https://dev.to/dekita/i-built-an-offline-invoice-sorter-for-freelancers-then-measured-whether-local-inference-is-35p4) reports that privacy and control were clearer benefits than assumed cost savings, which is why this project makes no cost claim.
- [Schema-Valid Isn't Correct: 4 Checks Before You Trust LLM Extraction](https://dev.to/michael_maurice/schema-valid-correct-4-checks-before-you-trust-llm-extraction-4n6f) explains why structured output still needs evidence checks, arithmetic validation, and human review.
