import { describe, expect, it } from "@jest/globals";
import { errorMessage } from "./errorMessage.js";

const httpError = (
  data,
  {
    method = "GET",
    url = "https://api.github.com/repos/o/r/pulls/1",
    status = 404,
  } = {},
) =>
  Object.assign(new Error("message from Octokit"), {
    status,
    request: { method, url },
    response: { status, data },
  });

describe("errorMessage", () => {
  it("words an HTTP error as Octokit Ruby did", () => {
    const error = httpError({
      message: "Not Found",
      documentation_url: "https://docs.github.com/rest",
    });

    expect(errorMessage(error)).toBe(
      "GET https://api.github.com/repos/o/r/pulls/1: 404 - Not Found // See: https://docs.github.com/rest",
    );
  });

  it("leaves out the documentation when there is none", () => {
    expect(errorMessage(httpError({ message: "Not Found" }))).toBe(
      "GET https://api.github.com/repos/o/r/pulls/1: 404 - Not Found",
    );
  });

  it("lists the errors GitHub gives, one field to a line", () => {
    const error = httpError(
      {
        message: "Validation Failed",
        errors: [
          { resource: "Status", code: "custom", field: null },
          "and a plain one",
        ],
        documentation_url: "https://docs.github.com/rest",
      },
      { method: "POST", status: 422 },
    );

    expect(errorMessage(error)).toBe(
      "POST https://api.github.com/repos/o/r/pulls/1: 422 - Validation Failed\nError summary:\n  resource: Status\n  code: custom\n  field: \n  and a plain one // See: https://docs.github.com/rest",
    );
  });

  it("shows errors given as text", () => {
    expect(
      errorMessage(httpError({ message: "Invalid", errors: "a description" })),
    ).toBe(
      "GET https://api.github.com/repos/o/r/pulls/1: 404 - Invalid\nError summary:\na description",
    );
  });

  it("ignores an empty list of errors", () => {
    expect(errorMessage(httpError({ message: "Invalid", errors: [] }))).toBe(
      "GET https://api.github.com/repos/o/r/pulls/1: 404 - Invalid",
    );
  });

  it("shows an error key straight after the message", () => {
    expect(
      errorMessage(
        httpError(
          { message: "Bad credentials", error: "invalid_token" },
          { status: 401 },
        ),
      ),
    ).toBe(
      "GET https://api.github.com/repos/o/r/pulls/1: 401 - Bad credentialsError: invalid_token",
    );
  });

  it("shows a body that is not JSON as it is", () => {
    expect(errorMessage(httpError("Server Error", { status: 502 }))).toBe(
      "GET https://api.github.com/repos/o/r/pulls/1: 502 - Server Error",
    );
  });

  it("shows nothing after the status for an empty body", () => {
    expect(errorMessage(httpError("", { method: "POST", status: 500 }))).toBe(
      "POST https://api.github.com/repos/o/r/pulls/1: 500 - ",
    );
    expect(errorMessage(httpError(undefined, { status: 500 }))).toBe(
      "GET https://api.github.com/repos/o/r/pulls/1: 500 - ",
    );
  });

  it("writes a space in the query as Ruby did", () => {
    const error = httpError("Server Error", {
      url: "https://api.github.com/search/issues?q=repo%3Ao%2Fr%20is%3Aissue%20label%3A%22block%20deploys%22",
      status: 500,
    });

    expect(errorMessage(error)).toBe(
      "GET https://api.github.com/search/issues?q=repo%3Ao%2Fr+is%3Aissue+label%3A%22block+deploys%22: 500 - Server Error",
    );
  });

  it("writes the query sorted by name, as Ruby sent it", () => {
    const error = httpError("Server Error", {
      url: "https://api.github.com/repositories/1/pulls?state=open&per_page=100&page=2",
      status: 500,
    });

    expect(errorMessage(error)).toBe(
      "GET https://api.github.com/repositories/1/pulls?page=2&per_page=100&state=open: 500 - Server Error",
    );
  });

  it("counts an empty error or documentation address as given, as Ruby did", () => {
    expect(
      errorMessage(
        httpError(
          { message: "Bad Request", error: "", documentation_url: "" },
          { status: 400 },
        ),
      ),
    ).toBe(
      "GET https://api.github.com/repos/o/r/pulls/1: 400 - Bad RequestError:  // See: ",
    );
  });

  it("leaves out an error that is false or null", () => {
    expect(
      errorMessage(
        httpError(
          { message: "Bad Request", error: false, documentation_url: null },
          { status: 400 },
        ),
      ),
    ).toBe("GET https://api.github.com/repos/o/r/pulls/1: 400 - Bad Request");
    expect(
      errorMessage(
        httpError({ message: "Bad Request", error: null }, { status: 400 }),
      ),
    ).toBe("GET https://api.github.com/repos/o/r/pulls/1: 400 - Bad Request");
  });

  it("uses the message of an error that is not an HTTP error", () => {
    expect(errorMessage(new Error("something else"))).toBe("something else");
    expect(
      errorMessage(
        Object.assign(new Error("no answer"), { request: { method: "GET" } }),
      ),
    ).toBe("no answer");
  });

  it("copes with something thrown that is not an error", () => {
    expect(errorMessage("just text")).toBe("just text");
    expect(errorMessage(undefined)).toBe("undefined");
  });
});
