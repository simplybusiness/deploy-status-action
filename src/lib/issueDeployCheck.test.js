import { mkdtempSync, readFileSync, rmSync } from "node:fs";
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
const { checkCurrentIssue, createStatusForAllPrs } =
  await import("./issueDeployCheck.js");

const LIST = "GET /repos/{owner}/{repo}/pulls";
const labelled = (...names) => ({
  data: { labels: names.map((name) => ({ name })) },
});
const created = (sha) => ({
  data: {
    state: "failure",
    description: "Deploys are blocked",
    url: `url of ${sha}`,
  },
});
const statusWrites = () =>
  config.client.request.mock.calls.filter(([route]) =>
    route.startsWith("POST"),
  );
let directory;
let config;
let openPulls;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "deploy-status-action-"));
  process.env.GITHUB_STEP_SUMMARY = join(directory, "summary.md");
  openPulls = [
    { number: 1, head: { sha: "first sha" } },
    { number: 2, head: { sha: "second sha" } },
    { number: 3, head: { sha: "third sha" } },
  ];
  config = {
    client: {
      // The list of open pull requests on one page, and a status for each
      request: jest.fn(async (route, parameters) =>
        route === LIST
          ? { data: openPulls, headers: {} }
          : created(parameters.sha),
      ),
    },
    appRepo: { owner: "owner", repo: "repo", slug: "owner/repo" },
    eventName: "issues",
    eventPayload: {
      action: "labeled",
      issue: { number: 8 },
      html_url: "payload url",
    },
  };
});

afterEach(() => {
  delete process.env.GITHUB_STEP_SUMMARY;
  rmSync(directory, { recursive: true, force: true });
});

describe("checkCurrentIssue", () => {
  it("does and prints nothing for an issue that does not block deploys", async () => {
    config.client.request.mockResolvedValueOnce(labelled("another label"));

    await checkCurrentIssue(config);

    expect(config.client.request).toHaveBeenCalledTimes(1);
    expect(core.info).not.toHaveBeenCalled();
  });

  it("names the event when the payload has no action", async () => {
    config.eventPayload = { issue: { number: 8 } };
    config.client.request.mockResolvedValueOnce(labelled("block deploys"));

    await checkCurrentIssue(config);

    expect(core.info.mock.calls.map(([line]) => line)).toEqual([
      "Event:  called",
      "=".repeat(47),
    ]);
    expect(config.client.request).toHaveBeenCalledTimes(1);
  });
});

describe("createStatusForAllPrs", () => {
  it("sets the status of each open pull request in turn, on the head the list gives", async () => {
    await createStatusForAllPrs(
      config,
      "failure",
      "Deploys are blocked",
      "## Heading\n",
    );

    expect(statusWrites().map(([, parameters]) => parameters.sha)).toEqual([
      "first sha",
      "second sha",
      "third sha",
    ]);
    expect(statusWrites()[0][1]).toMatchObject({
      state: "failure",
      description: "Deploys are blocked",
      target_url: "payload url",
    });
  });

  it("prints and summarises each status, with the html_url of the payload when there is one", async () => {
    openPulls = [{ number: 1, head: { sha: "first sha" } }];

    await createStatusForAllPrs(
      config,
      "failure",
      "Deploys are blocked",
      "## Heading\n",
    );

    expect(core.info.mock.calls.map(([line]) => line)).toEqual([
      "Created failure state with description Deploys are blocked for PR 1 and url url of first sha with target_url payload url",
      "=".repeat(92),
    ]);
    expect(readFileSync(process.env.GITHUB_STEP_SUMMARY, "utf8")).toBe(
      "## Heading\n- Created failure state with\n- description Deploys are blocked for PR 1 and url url of first sha\n- with target_url payload url\n",
    );
  });

  it("stops at the first status that fails", async () => {
    config.client.request.mockImplementation(async (route, parameters) => {
      if (route === LIST) return { data: openPulls, headers: {} };
      if (parameters.sha === "second sha") throw new Error("no");
      return created(parameters.sha);
    });

    await expect(
      createStatusForAllPrs(
        config,
        "failure",
        "Deploys are blocked",
        "## Heading\n",
      ),
    ).rejects.toThrow("no");

    expect(statusWrites()).toHaveLength(2);
    expect(readFileSync(process.env.GITHUB_STEP_SUMMARY, "utf8")).toBe(
      "## Heading\n- Created failure state with\n- description Deploys are blocked for PR 1 and url url of first sha\n- with target_url payload url\n",
    );
  });
});
