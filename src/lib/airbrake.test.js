import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { coreMock } from "../test-utils/coreMock.js";

const core = coreMock();
jest.unstable_mockModule("@actions/core", () => core);
const { notifyAirbrake } = await import("./airbrake.js");

const notice = () => JSON.parse(globalThis.fetch.mock.calls[0][1].body);
const options = { message: "the printed message", projectKey: "project-key" };

beforeEach(() => {
  jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response('{"id":"1"}', { status: 201 }));
});

afterEach(() => {
  delete process.env.GITHUB_WORKSPACE;
  jest.restoreAllMocks();
});

describe("notifyAirbrake", () => {
  it.each([undefined, ""])(
    "sends nothing without a project key (%p)",
    async (projectKey) => {
      await notifyAirbrake(new Error("an error"), {
        message: "an error",
        projectKey,
      });

      expect(globalThis.fetch).not.toHaveBeenCalled();
      expect(core.debug).not.toHaveBeenCalled();
    },
  );

  it("posts the notice to the project, with the key as a bearer token", async () => {
    await notifyAirbrake(new Error("an error"), options);

    const [url, request] = globalThis.fetch.mock.calls[0];
    expect(url).toBe("https://api.airbrake.io/api/v3/projects/258121/notices");
    expect(request.method).toBe("POST");
    expect(request.headers).toEqual({
      Authorization: "Bearer project-key",
      "Content-Type": "application/json",
    });
    expect(request.signal.aborted).toBe(false);
  });

  it("says what went wrong, and where", async () => {
    const error = new TypeError("message of the error");
    error.stack = [
      "TypeError: message of the error",
      "    at getLabelTags (file:///action/dist/index.js:120:15)",
      "    at async file:///action/dist/index.js:200:5",
      "    at node:internal/process/task_queues:95:5",
      "    not a stack frame",
    ].join("\n");

    await notifyAirbrake(error, options);

    expect(notice().errors).toEqual([
      {
        type: "TypeError",
        message: "the printed message",
        backtrace: [
          {
            function: "getLabelTags",
            file: "file:///action/dist/index.js",
            line: 120,
            column: 15,
          },
          {
            function: "",
            file: "file:///action/dist/index.js",
            line: 200,
            column: 5,
          },
          {
            function: "",
            file: "node:internal/process/task_queues",
            line: 95,
            column: 5,
          },
        ],
      },
    ]);
  });

  it("sends the parameters the Ruby action sent", async () => {
    await notifyAirbrake(new Error("an error"), options);

    expect(notice().params).toEqual({
      repo: "simplybusiness/deploy-status-action",
      github_action: "deploy_action",
    });
  });

  it("names the workspace, which shows where the action ran", async () => {
    process.env.GITHUB_WORKSPACE = "/home/runner/work/repo/repo";

    await notifyAirbrake(new Error("an error"), options);

    expect(notice().context).toMatchObject({
      notifier: { name: "deploy-status-action" },
      severity: "error",
      rootDirectory: "/home/runner/work/repo/repo",
    });
  });

  it("names the working directory when there is no workspace", async () => {
    await notifyAirbrake(new Error("an error"), options);

    expect(notice().context.rootDirectory).toBe(process.cwd());
  });

  it("copes with something thrown that is not an error", async () => {
    await notifyAirbrake("just text", options);

    expect(notice().errors).toEqual([
      { type: "Error", message: "the printed message", backtrace: [] },
    ]);
  });

  it("cuts a very long message", async () => {
    await notifyAirbrake(new Error("an error"), {
      ...options,
      message: "m".repeat(20_000),
    });

    expect(notice().errors[0].message).toHaveLength(10_000);
  });

  it("notes Airbrake's answer where only a debug run shows it", async () => {
    await notifyAirbrake(new Error("an error"), options);

    expect(core.debug).toHaveBeenCalledWith('Airbrake answered 201 {"id":"1"}');
  });

  it("does not throw when Airbrake refuses the notice", async () => {
    globalThis.fetch.mockResolvedValue(
      new Response('{"message":"unauthorized"}', { status: 401 }),
    );

    await expect(
      notifyAirbrake(new Error("an error"), options),
    ).resolves.toBeUndefined();
    expect(core.debug).toHaveBeenCalledWith(
      'Airbrake answered 401 {"message":"unauthorized"}',
    );
  });

  it("does not throw when Airbrake cannot be reached", async () => {
    globalThis.fetch.mockRejectedValue(new TypeError("fetch failed"));

    await expect(
      notifyAirbrake(new Error("an error"), options),
    ).resolves.toBeUndefined();
    expect(core.debug).toHaveBeenCalledWith(
      "Could not report the error to Airbrake: TypeError: fetch failed",
    );
  });
});
