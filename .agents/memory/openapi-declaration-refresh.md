---
name: OpenAPI declaration refresh
description: Workspace package declarations can lag generated OpenAPI source files after schema changes.
---

After regenerating the OpenAPI client and Zod source, rebuild the affected workspace packages before checking consumers. The mobile and API packages may resolve the workspace package declaration output rather than the newly generated source files, which can make valid new exports appear to be missing. This workspace uses Zod 3, so generated Zod 4-only helpers such as `zod.int()` and `zod.url()` must be normalized. Current Orval may also emit top-level `zod.email()` and `zod.uuid()` for OpenAPI `format` annotations; omit those formats or normalize them before runtime.

**Why:** The receipt work initially had correct generated source but stale package declarations, producing misleading missing-export and missing-field errors. A later Orval version also emitted helpers unavailable at runtime in the installed Zod version, which can crash the API before any request reaches an integration.

**How to apply:** Run API-spec codegen, rebuild or emit declarations for api-client-react and api-zod as their existing errors allow, then typecheck api-server and mobile. Confirm the API workflow reaches “Server listening” before testing server-backed features.