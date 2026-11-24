import { mkdtempSync, existsSync, readFileSync, rmSync } from "node:fs";
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
const { checkLabeledPr } = await import("./prDeployCheck.js");

const labelled = (...names) => ({
  data: { labels: names.map((name) => ({ name })) },
});
const created = {
  data: {
    state: "success",
    description: "You are free to deploy",
    url: "status url",
  },
};
let directory;
let config;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "deploy-status-action-"));
  process.env.GITHUB_STEP_SUMMARY = join(directory, "summary.md");
  config = {
    client: { request: jest.fn() },
    appRepo: { owner: "owner", repo: "repo", slug: "owner/repo" },
    eventName: "pull_request",
    eventPayload: { number: 7, pull_request: { head: { sha: "payload sha" } } },
  };
});

afterEach(() => {
  delete process.env.GITHUB_STEP_SUMMARY;
  rmSync(directory, { recursive: true, force: true });
});

describe("checkLabeledPr", () => {
  it("does nothing for a pull request that is not an emergency deploy", async () => {
    config.client.request.mockResolvedValueOnce(labelled("another label"));

    expect(await checkLabeledPr(config)).toBeUndefined();
    expect(config.client.request).toHaveBeenCalledTimes(1);
    expect(existsSync(process.env.GITHUB_STEP_SUMMARY)).toBe(false);
  });

  it("frees an emergency deploy, on the commit named in the payload", async () => {
    config.client.request
      .mockResolvedValueOnce(labelled("emergency deploy"))
      .mockResolvedValueOnce(created);

    expect(await checkLabeledPr(config)).toBe(created.data);
    expect(config.client.request).toHaveBeenLastCalledWith(
      "POST /repos/{owner}/{repo}/statuses/{sha}",
      expect.objectContaining({
        sha: "payload sha",
        state: "success",
        description: "You are free to deploy",
      }),
    );
  });

  it("prints and summarises the status, with the html_url of the payload when there is one", async () => {
    config.eventPayload.html_url = "payload url";
    config.client.request
      .mockResolvedValueOnce(labelled("emergency deploy"))
      .mockResolvedValueOnce(created);

    await checkLabeledPr(config);

    expect(core.info.mock.calls.map(([line]) => line)).toEqual([
      "Pull request 7",
      "Created success state withdescription You are free to deploy for sha payload sha for url status url with target_url payload url",
      "=".repeat(92),
    ]);
    expect(readFileSync(process.env.GITHUB_STEP_SUMMARY, "utf8")).toBe(
      "## Deploy Status Check!\n### :sparkles: You are free to deploy :sparkles:\n- Created success state with description You are free to deploy for sha payload sha and url status url\n- description You are free to deploy for sha payload sha for url status url\n- with target_url payload url\n \n",
    );
  });
});
