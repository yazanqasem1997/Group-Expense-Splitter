---
name: Native Excel sharing
description: Compatibility rule for exporting generated XLSX blobs from the Expo app to a device share sheet
---

Use `FileReader.readAsDataURL()` to convert the generated XLSX `Blob` to base64 before writing it with Expo FileSystem. Do not assume the browser download path or browser-style base64 globals behave the same in Expo Go/native runtime.

**Why:** The browser can download the workbook directly, but native Expo sharing requires a cached file and has different Blob/base64 runtime support.

**How to apply:** Keep web downloads and native file-sharing branches separate, overwrite the cached export path deliberately, and surface a clear error if device storage or sharing is unavailable.