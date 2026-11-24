---
name: React Compiler for-of crash
description: for...of destructuring inside hooks causes blank screen with React Compiler enabled in Expo 54
---

In this project `transform.reactCompiler=true` is set in `babel.config.js`. Hermes + React Compiler transpilation chokes on `for (const [key, value] of Object.entries(...))` destructuring inside hooks or components, producing a blank white screen with no visible error.

**Why:** The React Compiler transforms destructured iteration in a way that crashes at runtime on Hermes.

**How to apply:** Any time you need to iterate an object in a hook or component body, use:
```ts
Object.keys(obj).forEach((key) => {
  const value = obj[key];
  // ...
});
```
Never use `for...of` with destructured entries in this codebase.
