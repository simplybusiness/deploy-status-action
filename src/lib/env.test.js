import { afterEach, describe, expect, it } from "@jest/globals";
import { fetchEnv } from "./env.js";

describe("fetchEnv", () => {
  afterEach(() => {
    delete process.env.DEPLOY_STATUS_TEST_VARIABLE;
  });

  it("returns the value of a variable", () => {
    process.env.DEPLOY_STATUS_TEST_VARIABLE = "value";

    expect(fetchEnv("DEPLOY_STATUS_TEST_VARIABLE")).toBe("value");
  });

  it("allows an empty value", () => {
    process.env.DEPLOY_STATUS_TEST_VARIABLE = "";

    expect(fetchEnv("DEPLOY_STATUS_TEST_VARIABLE")).toBe("");
  });

  it("throws, in Ruby's words, for a variable that is not set", () => {
    expect(() => fetchEnv("DEPLOY_STATUS_TEST_VARIABLE")).toThrow(
      'key not found: "DEPLOY_STATUS_TEST_VARIABLE"',
    );
  });
});
