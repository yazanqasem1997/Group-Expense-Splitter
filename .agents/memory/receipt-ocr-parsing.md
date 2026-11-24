---
name: Receipt OCR parsing
description: Durable constraints for the Azure-backed receipt extraction and manual review flow.
---

Receipt OCR should not rely on one Tesseract page-segmentation mode or on a strict two-decimal price at the end of each line. Receipt photos commonly wrap item names, separate prices onto the next line, use comma decimals, and contain OCR substitutions in numeric tokens. Small phone photos should be rotated, upscaled, and sharpened before recognition.

**Why:** A single default pass and line-end-only parser caused intermittent missing items and incorrect amounts even when the receipt image itself was readable; upscaling the supplied low-resolution receipt recovered the missing right-hand prices.

**How to apply:** Preprocess the image, run multiple Tesseract layout passes, prefer candidates with directly named price rows, normalize common numeric OCR errors and separators, preserve layout/confidence separately from arithmetic validation, and keep manual editing before expense creation.

The current implementation sends normalized receipt images from the API server to Azure AI Document Intelligence's prebuilt Receipt model when its server-side secrets are configured. It stores the raw Azure response plus structured words, boxes, confidence, and reconciliation results with the receipt. Tesseract remains a local fallback when Azure is not configured.

**Why:** The Azure receipt model provides merchant, totals, tax, tip, and line-item fields without exposing credentials to Expo. The F0 service limit only processes the first two pages, which is acceptable for normal receipts.

**How to apply:** Keep Azure calls server-side, preprocess uploads to a bounded JPEG, preserve unreadable values as null, surface quota/readability errors for manual entry, and keep the review screen the final authority. Do not claim universal multilingual coverage without testing Azure's supported languages against fixtures.

Discounts are entered manually as a separate optional review row rather than being inferred into receipt items. The reviewer chooses value or percentage and selects the members who share the negative adjustment.

**Why:** Automatically inferred discount rows were ambiguous about who should receive the reduction; explicit input makes the amount and recipients reviewable.

**How to apply:** Keep the manual discount separate from OCR line items, require at least one selected member when a discount is entered, and apply the negative amount directly to those selected members while positive items absorb proportional tax/tip allocation.