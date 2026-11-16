import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { coreMock } from "../test-utils/coreMock.js";

const core = coreMock();
jest.unstable_mockModule("@actions/core", () => core);
const { blockDeploys, getAllIssues, getLabelTags } =
  await import("./simplyIssue.js");

const labelled = (...names) => ({
  data: { labels: names.map((name) => ({ name })) },
});
const found = (...items) => ({ data: { incomplete_results: false, items } });
let config;

beforeEach(() => {
  config = {
    client: { request: jest.fn() },
    appRepo: { owner: "owner", repo: "repo", slug: "owner/repo" },
    eventName: "pull_request",
    eventPayload: { number: 7, issue: { number: 8 } },
  };
});

describe("getLabelTags", () => {
  it.each(["pull_request", "pull_request_target"])(
    "reads the labels of the pull request for %s",
    async (eventName) => {
      config.eventName = eventName;
      config.client.request.mockResolvedValue(
        labelled("one", "emergency deploy"),
      );

      expect(await getLabelTags(config)).toEqual(["one", "emergency deploy"]);
      expect(config.client.request).toHaveBeenCalledWith(
        "GET /repos/{owner}/{repo}/pulls/{pull_number}",
        {
          owner: "owner",
          repo: "repo",
          pull_number: 7,
        },
      );
      expect(core.info).toHaveBeenCalledWith("Pull request 7");
    },
  );

  it("reads the labels of the issue for any other event", async () => {
    config.eventName = "issues";
    config.client.request.mockResolvedValue(labelled("block deploys"));

    expect(await getLabelTags(config)).toEqual(["block deploys"]);
    expect(config.client.request).toHaveBeenCalledWith(
      "GET /repos/{owner}/{repo}/issues/{issue_number}",
      {
        owner: "owner",
        repo: "repo",
        issue_number: 8,
      },
    );
    expect(core.info).not.toHaveBeenCalled();
  });

  it("prints nothing for a number the payload does not have", async () => {
    config.eventPayload = {};
    config.client.request.mockResolvedValue(labelled());

    await getLabelTags(config);

    expect(core.info).toHaveBeenCalledWith("Pull request ");
  });
});

describe("getAllIssues", () => {
  it("lists every open pull request, 100 to a page, following the link to each next page", async () => {
    const page = (number, link) => ({
      data: [{ number }],
      headers: link ? { link } : {},
    });
    config.client.request
      .mockResolvedValueOnce(
        page(
          1,
          '<https://api.github.test/pulls?page=2>; rel="next", <https://api.github.test/pulls?page=3>; rel="last"',
        ),
      )
      .mockResolvedValueOnce(
        page(
          2,
          '<https://api.github.test/pulls?page=1>; rel="prev", <https://api.github.test/pulls?page=3>; rel="next"',
        ),
      )
      .mockResolvedValueOnce(
        page(3, '<https://api.github.test/pulls?page=1>; rel="first"'),
      );

    expect(await getAllIssues(config, "pull_request")).toEqual([
      { number: 1 },
      { number: 2 },
      { number: 3 },
    ]);
    expect(config.client.request.mock.calls).toEqual([
      [
        "GET /repos/{owner}/{repo}/pulls",
        { owner: "owner", repo: "repo", per_page: 100, state: "open" },
      ],
      ["GET https://api.github.test/pulls?page=2"],
      ["GET https://api.github.test/pulls?page=3"],
    ]);
  });

  it("asks for one page when GitHub links to no other", async () => {
    config.client.request.mockResolvedValueOnce({ data: [], headers: {} });

    expect(await getAllIssues(config, "pull_request")).toEqual([]);
    expect(config.client.request).toHaveBeenCalledTimes(1);
  });

  it("fails when any page fails, whatever the status", async () => {
    const conflict = Object.assign(new Error("Conflict"), { status: 409 });
    config.client.request
      .mockResolvedValueOnce({
        data: [{ number: 1 }],
        headers: { link: '<https://api.github.test/pulls?page=2>; rel="next"' },
      })
      .mockRejectedValueOnce(conflict);

    await expect(getAllIssues(config, "pull_request")).rejects.toBe(conflict);
  });

  it("searches for open issues with a label, in one request", async () => {
    config.client.request.mockResolvedValue(found({ number: 3 }));

    expect(await getAllIssues(config, "issues", "block deploys")).toEqual([
      { number: 3 },
    ]);
    expect(config.client.request).toHaveBeenCalledTimes(1);
    expect(config.client.request).toHaveBeenCalledWith("GET /search/issues", {
      q: 'repo:owner/repo is:issue is:open label:"block deploys"',
    });
  });

  it("searches for all open issues when no label is given", async () => {
    config.client.request.mockResolvedValue(found());

    await getAllIssues(config, "issues");

    expect(config.client.request).toHaveBeenCalledWith("GET /search/issues", {
      q: "repo:owner/repo is:issue is:open",
    });
  });

  it("throws when the search is incomplete, because a blocking issue could be missing", async () => {
    config.client.request.mockResolvedValue({
      data: { incomplete_results: true, items: [] },
    });

    await expect(
      getAllIssues(config, "issues", "block deploys"),
    ).rejects.toThrow(
      'Search for blocking issues returned incomplete results: repo:owner/repo is:issue is:open label:"block deploys"',
    );
  });

  it("returns nothing for anything else", async () => {
    expect(await getAllIssues(config, "commits")).toBeUndefined();
    expect(config.client.request).not.toHaveBeenCalled();
  });
});

describe("blockDeploys", () => {
  it("is false when no blocking issue is open, without reading any labels", async () => {
    config.client.request.mockResolvedValueOnce(found());

    expect(await blockDeploys(config, "issues")).toBe(false);
    expect(config.client.request).toHaveBeenCalledTimes(1);
  });

  it("is true when a blocking issue is open", async () => {
    config.client.request
      .mockResolvedValueOnce(found({ number: 3 }))
      .mockResolvedValueOnce(labelled("one"));

    expect(await blockDeploys(config, "issues")).toBe(true);
  });

  it("is false for an emergency deploy", async () => {
    config.client.request
      .mockResolvedValueOnce(found({ number: 3 }))
      .mockResolvedValueOnce(labelled("one", "emergency deploy"));

    expect(await blockDeploys(config, "issues")).toBe(false);
  });

  it("matches the label exactly", async () => {
    config.client.request
      .mockResolvedValueOnce(found({ number: 3 }))
      .mockResolvedValueOnce(labelled("Emergency Deploy", "emergency deploy "));

    expect(await blockDeploys(config, "issues")).toBe(true);
  });
});
