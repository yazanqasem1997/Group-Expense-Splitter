const hooks = require("eslint-plugin-react-hooks");
const tsParser = require("@typescript-eslint/parser");
module.exports = [
  { ignores: ["dist/**", "node_modules/**", ".expo/**"] },
  { files: ["**/*.{ts,tsx}"], languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } }, plugins: { "react-hooks": hooks }, rules: { "react-hooks/rules-of-hooks": "error" } },
];
