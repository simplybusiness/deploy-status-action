import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
const { baseCheck, CONTEXT_NAME, createGithubSummary, createStatus } =
  await import("./baseDeployCheck.js");

let directory;
let config;
const summary = () => readFileSync(process.env.GITHUB_STEP_SUMMARY, "utf8");
// What GitHub answers, which is what gets printed
const answered = {
  data: {
    state: "answered state",
    description: "answered description",
    url: "answered url",
  },
};

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "deploy-status-action-"));
  process.env.GITHUB_STEP_SUMMARY = join(directory, "summary.md");
  config = {
    client: { request: jest.fn().mockResolvedValue(answered) },
    appRepo: { owner: "owner", repo: "repo", slug: "owner/repo" },
    eventName: "push",
    eventBranch: "refs/heads/master",
    eventPayload: {},
  };
});

afterEach(() => {
  delete process.env.GITHUB_STEP_SUMMARY;
  rmSync(directory, { recursive: true, force: true });
});

describe("createStatus", () => {
  it("is called Deploy status", () => {
    expect(CONTEXT_NAME).toBe("Deploy status");
  });

  it("creates the status and returns what GitHub answered", async () => {
    const result = await createStatus(
      config,
      "abc",
      "failure",
      "Deploys are blocked",
    );

    expect(config.client.request).toHaveBeenCalledWith(
      "POST /repos/{owner}/{repo}/statuses/{sha}",
      {
        owner: "owner",
        repo: "repo",
        sha: "abc",
        description: "Deploys are blocked",
        context: "Deploy status",
        target_url: null,
        state: "failure",
      },
    );
    expect(result).toBe(answered.data);
  });

  it("links to the html_url of the payload when there is one", async () => {
    config.eventPayload.html_url = "https://github.com/owner/repo/issues/1";

    await createStatus(config, "abc", "success", "You are free to deploy");

    expect(config.client.request.mock.calls[0][1].target_url).toBe(
      "https://github.com/owner/repo/issues/1",
    );
  });
});

describe("baseCheck", () => {
  const noBlockingIssue = { data: { incomplete_results: false, items: [] } };

  it("prints and summarises what GitHub answered", async () => {
    config.client.request.mockResolvedValueOnce(noBlockingIssue);

    const result = await baseCheck(config, "issues", "abc");

    expect(result).toBe(answered.data);
    expect(core.info.mock.calls.map(([line]) => line)).toEqual([
      "config event branch  refs/heads/master",
      "Created answered state state with description answered description",
      `for sha abc and url answered url${"=".repeat(73)}`,
    ]);
    expect(summary()).toBe(
      "## Deploy Status Check\n ### :tada: You are free to deploy :tada:\n- Created answered state state with description: answered description\n- for sha abc and url answered url\n",
    );
  });

  it("leaves a gap where GitHub's answer lacks something", async () => {
    config.client.request
      .mockReset()
      .mockResolvedValueOnce(noBlockingIssue)
      .mockResolvedValueOnce({ data: {} });

    await baseCheck(config, "issues", undefined);

    expect(core.info).toHaveBeenLastCalledWith(
      `for sha  and url ${"=".repeat(73)}`,
    );
  });
});

describe("createGithubSummary", () => {
  it("creates the file", () => {
    createGithubSummary("a summary\n");

    expect(summary()).toBe("a summary\n");
  });

  it("replaces what the file had", () => {
    writeFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      "something longer that was there before\n",
    );

    createGithubSummary("a summary\n");

    expect(summary()).toBe("a summary\n");
  });

  it("ends the summary with a newline", () => {
    createGithubSummary("a summary");

    expect(summary()).toBe("a summary\n");
  });

  it("throws, in Ruby's words, when the runner gives no summary file", () => {
    delete process.env.GITHUB_STEP_SUMMARY;

    expect(() => createGithubSummary("a summary")).toThrow(
      'key not found: "GITHUB_STEP_SUMMARY"',
    );
  });
});
