import { describe, expect, it } from "@jest/globals";
import { str, withNewline, withoutFinalNewline } from "./output.js";

describe("str", () => {
  it("is empty for a missing value, as nil was in Ruby", () => {
    expect(str(undefined)).toBe("");
    expect(str(null)).toBe("");
  });

  it("keeps values that are falsy but present", () => {
    expect(str(0)).toBe("0");
    expect(str(false)).toBe("false");
    expect(str("")).toBe("");
  });

  it("returns text as it is", () => {
    expect(str("success")).toBe("success");
  });
});

describe("withNewline", () => {
  it("adds a newline to text that does not end with one", () => {
    expect(withNewline("text")).toBe("text\n");
    expect(withNewline("text\n ")).toBe("text\n \n");
  });

  it("does not add a second newline", () => {
    expect(withNewline("text\n")).toBe("text\n");
  });
});

describe("withoutFinalNewline", () => {
  it("takes one newline off the end", () => {
    expect(withoutFinalNewline("text\n")).toBe("text");
    expect(withoutFinalNewline("text\n\n")).toBe("text\n");
  });

  it("leaves other text as it is", () => {
    expect(withoutFinalNewline("text")).toBe("text");
    expect(withoutFinalNewline("one\ntwo")).toBe("one\ntwo");
  });
});
