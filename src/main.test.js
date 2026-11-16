import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { coreMock } from "./test-utils/coreMock.js";
import { route, startFakeGitHub } from "./test-utils/fakeGitHub.js";
import {
  ENV_NAMES,
  generateAppKey,
  outcome,
  prepare,
  readGolden,
} from "./test-utils/harness.js";
import { INSTALLATION_TOKEN, scenarios } from "./test-utils/scenarios.js";

const core = coreMock();
jest.unstable_mockModule("@actions/core", () => core);

// @actions/github reads the API's address as it is imported
const github = await startFakeGitHub();
process.env.GITHUB_API_URL = github.url;
const { main } = await import("./main.js");

const key = generateAppKey();
const scenario = (name) => scenarios.find((each) => each.name === name);
const originalEnv = { ...process.env };
let prepared;

// Sets up the environment of a scenario and returns what main did in it
async function run(scenario, { env = {}, clientOptions } = {}) {
  prepared = prepare(scenario, key);
  for (const name of ENV_NAMES) delete process.env[name];
  Object.assign(process.env, prepared.env, env);
  github.reset(scenario.routes);

  await main({ writeMinTime: 0, ...clientOptions });

  return outcome({
    scenario,
    github,
    publicKey: key.publicKey,
    directory: prepared.directory,
    stdout: core.info.mock.calls.map(([line]) => `${line}\n`).join(""),
    exitCode: core.setFailed.mock.calls.length > 0 ? 1 : 0,
  });
}

beforeEach(() => {
  jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
});

afterEach(() => {
  prepared?.cleanup();
  for (const name of Object.keys(process.env)) {
    if (!(name in originalEnv)) delete process.env[name];
  }
  Object.assign(process.env, originalEnv);
  jest.restoreAllMocks();
});

afterAll(() => github.close());

describe("main, compared with what the Ruby action did", () => {
  it.each(scenarios.map((each) => [each.name, each]))(
    "%s",
    async (_name, each) => {
      expect(await run(each)).toEqual(readGolden(each));
      // No scenario has an Airbrake key
      expect(globalThis.fetch).not.toHaveBeenCalled();
    },
  );
});

describe("main", () => {
  it("fails the step when AIRBRAKE_KEY is not set", async () => {
    await run(scenario("airbrake-key-unset"));

    expect(core.setFailed).toHaveBeenCalledWith(
      'key not found: "AIRBRAKE_KEY"',
    );
    expect(github.requests).toEqual([]);
  });

  it("never fails the step for an error it handles", async () => {
    await run(scenario("installation-not-found"));

    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it("masks the installation token", async () => {
    await run(scenario("pr-opened-not-blocked"));

    expect(core.setSecret).toHaveBeenCalledWith(INSTALLATION_TOKEN);
  });

  it("reports a handled error to Airbrake", async () => {
    await run(scenario("installation-not-found"), {
      env: { AIRBRAKE_KEY: "airbrake-project-key" },
    });

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, request] = globalThis.fetch.mock.calls[0];
    expect(url).toBe("https://api.airbrake.io/api/v3/projects/258121/notices");
    expect(request.headers.Authorization).toBe("Bearer airbrake-project-key");
    const notice = JSON.parse(request.body);
    expect(notice.params).toEqual({
      repo: "simplybusiness/deploy-status-action",
      github_action: "deploy_action",
    });
    expect(notice.errors[0].message).toBe(
      `GET ${github.url}/repos/simplybusiness/important-app/installation: 404 - Not Found // See: https://docs.github.com/rest/apps/apps#get-a-repository-installation-for-the-authenticated-app`,
    );
    expect(core.info).toHaveBeenLastCalledWith(
      `Unexpected error occurred: ${notice.errors[0].message}`,
    );
  });

  it("does not report anything to Airbrake when all goes well", async () => {
    await run(scenario("pr-opened-not-blocked"), {
      env: { AIRBRAKE_KEY: "airbrake-project-key" },
    });

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("passes the step when Airbrake cannot be reached", async () => {
    globalThis.fetch.mockRejectedValue(new TypeError("fetch failed"));

    await run(scenario("installation-not-found"), {
      env: { AIRBRAKE_KEY: "airbrake-project-key" },
    });

    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it("adds no wait to a pull request event", async () => {
    const started = Date.now();

    // A wait between writes that could not be missed if it applied
    await run(scenario("pr-opened-blocked"), {
      clientOptions: { writeMinTime: 2000 },
    });

    expect(github.requests).toHaveLength(5);
    expect(Date.now() - started).toBeLessThan(1500);
  });

  it("waits and carries on when GitHub says a rate limit was reached", async () => {
    const each = scenario("issue-labeled-blocks-open-prs");
    const [, , , , , first] = each.routes;
    const limited = {
      status: 403,
      headers: { "retry-after": 1 },
      body: {
        message:
          "You have exceeded a secondary rate limit. Please wait a few minutes before you try again.",
      },
    };
    const routes = each.routes.map((existing) =>
      existing === first
        ? route(first.method, first.path, limited, ...first.replies)
        : existing,
    );

    // One millisecond for each second GitHub asks for
    const result = await run(
      { ...each, routes },
      { clientOptions: { retryAfterBaseValue: 1 } },
    );

    const golden = readGolden(each);
    expect(result.stdout).toBe(golden.stdout);
    expect(result.summary).toBe(golden.summary);
    expect(result.requests).toHaveLength(golden.requests.length + 1);
    expect(core.warning).toHaveBeenCalledTimes(1);
    expect(core.warning).toHaveBeenCalledWith(
      "GitHub rate limit reached for POST /repos/{owner}/{repo}/statuses/{sha}. Trying again in 1 seconds.",
    );
  });
});
