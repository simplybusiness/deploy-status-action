import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { coreMock } from "../test-utils/coreMock.js";
import { ENV_NAMES, generateAppKey, prepare } from "../test-utils/harness.js";

const core = coreMock();
jest.unstable_mockModule("@actions/core", () => core);
const { createGithubApiConfig, parseRepository } =
  await import("./githubApiConfig.js");

describe("parseRepository", () => {
  it.each(["owner/repo", "Owner-1/repo.name_2", "o/r"])(
    "accepts %s",
    (name) => {
      const [owner, repo] = name.split("/");

      expect(parseRepository(name)).toEqual({ owner, repo, slug: name });
    },
  );

  it.each([
    "repo",
    "owner/repo/extra",
    "",
    "owner /repo",
    "owner/",
    "/repo",
    123,
  ])("rejects %p, in Ruby's words", (name) => {
    expect(() => parseRepository(name)).toThrow(
      `${JSON.stringify(name)} is invalid as a repository identifier. Use the user/repo (String) format, or the repository ID (Integer), or a hash containing :repo and :user keys.`,
    );
  });

  it.each([undefined, null])(
    "shows a missing name as Ruby showed nil",
    (name) => {
      expect(() => parseRepository(name)).toThrow(
        "nil is invalid as a repository identifier.",
      );
    },
  );
});

describe("createGithubApiConfig", () => {
  const { privateKey } = generateAppKey();
  const originalEnv = { ...process.env };
  let prepared;
  let bearerClient;
  let createClient;

  beforeEach(() => {
    prepared = prepare(
      {
        event: "issues",
        ref: "refs/heads/master",
        payload: {
          action: "labeled",
          repository: { full_name: "payload-owner/payload-repo" },
        },
        env: { GITHUB_REPOSITORY: "env-owner/env-repo" },
      },
      { privateKey },
    );
    Object.assign(process.env, prepared.env);
    bearerClient = {
      request: jest
        .fn()
        .mockResolvedValueOnce({ data: { id: 42 } })
        .mockResolvedValueOnce({ data: { token: "installation-token" } }),
    };
    createClient = jest.fn((token) =>
      token === "installation-token" ? { installation: true } : bearerClient,
    );
  });

  afterEach(() => {
    prepared.cleanup();
    for (const name of ENV_NAMES) delete process.env[name];
    Object.assign(process.env, originalEnv);
  });

  it("reads the repository, the event and the branch", async () => {
    const config = await createGithubApiConfig(createClient);

    expect(config.appRepo).toEqual({
      owner: "env-owner",
      repo: "env-repo",
      slug: "env-owner/env-repo",
    });
    expect(config.eventPayload.action).toBe("labeled");
    expect(config.eventName).toBe("issues");
    expect(config.eventBranch).toBe("refs/heads/master");
  });

  it("gets a token for the installation on the repository named in the event", async () => {
    const config = await createGithubApiConfig(createClient);

    expect(createClient.mock.calls[0][0].split(".")).toHaveLength(3);
    expect(bearerClient.request.mock.calls).toEqual([
      [
        "GET /repos/{owner}/{repo}/installation",
        { owner: "payload-owner", repo: "payload-repo" },
      ],
      [
        "POST /app/installations/{installation_id}/access_tokens",
        { installation_id: 42 },
      ],
    ]);
    expect(createClient).toHaveBeenLastCalledWith("installation-token");
    expect(config.client).toEqual({ installation: true });
  });

  it("masks the token", async () => {
    await createGithubApiConfig(createClient);

    expect(core.setSecret).toHaveBeenCalledWith("installation-token");
  });

  it("masks nothing when GitHub gives no token", async () => {
    bearerClient.request = jest
      .fn()
      .mockResolvedValueOnce({ data: { id: 42 } })
      .mockResolvedValueOnce({ data: {} });

    await createGithubApiConfig(createClient);

    expect(core.setSecret).not.toHaveBeenCalled();
    expect(createClient).toHaveBeenLastCalledWith(undefined);
  });
});
