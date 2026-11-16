/**
 * For a detailed explanation regarding each configuration property, visit:
 * https://jestjs.io/docs/configuration
 */

/** @type {import('jest').Config} */
export default {
  clearMocks: true,
  collectCoverage: true,
  collectCoverageFrom: [
    "./src/**",
    "!./src/**/*.test.js",
    "!./src/test-utils/**",
  ],
  coverageDirectory: "coverage",
  coverageProvider: "v8",
  coverageReporters: ["json", "text", "lcov", "clover", "cobertura"],
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90,
    },
  },
  reporters: ["default"],
  transform: {},
  transformIgnorePatterns: [],
};
