---
name: expo-file-system v57 API change
description: expo-file-system v57 removed legacy top-level exports; use the legacy sub-path for old-style file writes.
---

**Rule:** Import `cacheDirectory`, `writeAsStringAsync`, `EncodingType` etc. from `expo-file-system/legacy`, not `expo-file-system`.

**Why:** expo-file-system v57 (installed alongside expo 54) replaced all legacy functions with a new class-based API (`File`, `Directory`, `Paths`). The old APIs still exist but only under the `/legacy` sub-path. Importing from the root causes TS2339 errors at compile time and runtime throws.

**How to apply:** Wherever you need the classic FS write pattern:
```ts
import * as FileSystem from "expo-file-system/legacy";
// FileSystem.cacheDirectory, FileSystem.writeAsStringAsync, FileSystem.EncodingType all work
```

For new code you *can* use the class API instead:
```ts
import { File, Paths, EncodingType } from "expo-file-system";
const f = new File(Paths.cache, "name.txt");
f.write("content");
```
