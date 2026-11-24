import { createServer } from "node:net";
import {
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { coreMock } from "../test-utils/coreMock.js";
import { route, startFakeGitHub } from "../test-utils/fakeGitHub.js";

const core = coreMock();
jest.unstable_mockModule("@actions/core", () => core);

// @actions/github reads the API's address as it is imported
const github = await startFakeGitHub();
process.env.GITHUB_API_URL = github.url;
const { clientFactory } = await import("./createClient.js");

// No wait between writes, and a millisecond for each second GitHub asks for
const createClient = (options) =>
  clientFactory({ writeMinTime: 0, retryAfterBaseValue: 1, ...options })(
    "installation-token",
  );
const ok = { body: { ok: true } };
const created = { status: 201, body: { state: "success" } };
const serverError = { status: 500, body: { message: "Server Error" } };
const sent = () =>
  github.requests.map((request) => `${request.method} ${request.path}`);
const gaps = () =>
  github.requests
    .slice(1)
    .map((request, index) => request.at - github.requests[index].at);
const secondaryLimit = (retryAfter) => ({
  status: 403,
  headers: { "retry-after": retryAfter },
  body: {
    message:
      "You have exceeded a secondary rate limit. Please wait a few minutes before you try again.",
  },
});
const primaryLimit = (secondsUntilReset) => ({
  status: 403,
  headers: {
    "x-ratelimit-remaining": 0,
    "x-ratelimit-reset": Math.floor(Date.now() / 1000) + secondsUntilReset,
  },
  body: { message: "API rate limit exceeded for installation." },
});

beforeEach(() => github.reset());

afterAll(() => github.close());

describe("authorization", () => {
  it("sends an app's JWT as a bearer token", async () => {
    github.reset([route("GET", "/app", ok)]);

    await clientFactory()("header.payload.signature").request("GET /app");

    expect(github.requests[0].authorization).toBe(
      "bearer header.payload.signature",
    );
  });

  it("sends an installation token as a token", async () => {
    github.reset([route("GET", "/thing", ok)]);

    await createClient().request("GET /thing");

    expect(github.requests[0].authorization).toBe("token installation-token");
    expect(github.requests[0].accept).toBe("application/vnd.github.v3+json");
  });
});

describe("retries", () => {
  it("retries a generic 429 response after Retry-After", async () => {
    github.reset([
      route(
        "POST",
        "/thing",
        {
          status: 429,
          headers: { "retry-after": 1 },
          body: { message: "Too Many Requests" },
        },
        created,
      ),
    ]);

    const response = await createClient({ retryAfterBaseValue: 25 }).request(
      "POST /thing",
    );

    expect(response.status).toBe(201);
    expect(sent()).toHaveLength(2);
    expect(gaps()[0]).toBeGreaterThanOrEqual(15);
  });

  it("does not retry a generic 429 when the requested wait exceeds two minutes", async () => {
    github.reset([
      route(
        "POST",
        "/thing",
        {
          status: 429,
          headers: { "retry-after": 2000 },
          body: { message: "Too Many Requests" },
        },
        created,
      ),
    ]);

    await expect(createClient().request("POST /thing")).rejects.toMatchObject({
      status: 429,
    });

    expect(sent()).toHaveLength(1);
    expect(core.warning).not.toHaveBeenCalled();
  });

  it("gives up after three retries of a generic 429 response", async () => {
    github.reset([
      route("POST", "/thing", {
        status: 429,
        headers: { "retry-after": 1 },
        body: { message: "Too Many Requests" },
      }),
    ]);

    await expect(createClient().request("POST /thing")).rejects.toMatchObject({
      status: 429,
    });
    expect(sent()).toHaveLength(4);
    expect(core.warning).toHaveBeenCalledTimes(3);
  });

  it("uses the throttling plugin retry budget for a secondary-limit 429", async () => {
    github.reset([
      route("POST", "/thing", {
        status: 429,
        headers: { "retry-after": 1 },
        body: {
          message:
            "You have exceeded a secondary rate limit. Please wait before trying again.",
        },
      }),
    ]);

    await expect(createClient().request("POST /thing")).rejects.toMatchObject({
      status: 429,
    });

    expect(sent()).toHaveLength(4);
    expect(core.warning).toHaveBeenCalledTimes(3);
  });

  it("tries a GET three times when GitHub answers with a 5xx", async () => {
    github.reset([
      route(
        "GET",
        "/thing",
        { status: 502, body: "Server Error" },
        serverError,
        ok,
      ),
    ]);

    const response = await createClient().request("GET /thing");

    expect(response.data).toEqual({ ok: true });
    expect(sent()).toEqual(["GET /thing", "GET /thing", "GET /thing"]);
  });

  it("gives up on a GET after three 5xx answers", async () => {
    github.reset([route("GET", "/thing", serverError)]);

    await expect(createClient().request("GET /thing")).rejects.toMatchObject({
      status: 500,
    });
    expect(sent()).toHaveLength(3);
  });

  it("does not try a GET again after a 4xx", async () => {
    await expect(
      createClient().request("GET /nothing-here"),
    ).rejects.toMatchObject({ status: 404 });
    expect(sent()).toHaveLength(1);
  });

  it("never tries a POST again after a 5xx", async () => {
    github.reset([route("POST", "/thing", serverError, created)]);

    await expect(createClient().request("POST /thing")).rejects.toMatchObject({
      status: 500,
    });
    expect(sent()).toHaveLength(1);
  });

  it("does not try again when the connection fails", async () => {
    let connections = 0;
    const server = createServer((socket) => {
      connections += 1;
      socket.destroy();
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

    await expect(
      createClient().request(
        `GET http://127.0.0.1:${server.address().port}/thing`,
      ),
    ).rejects.toThrow();
    await new Promise((resolve) => server.close(resolve));

    expect(connections).toBe(1);
  });

  it("waits before trying a GET again when GitHub says how long with a 5xx", async () => {
    const unavailable = {
      status: 503,
      headers: { "retry-after": 100 },
      body: "Service Unavailable",
    };
    github.reset([route("GET", "/thing", unavailable, ok)]);

    // A millisecond for each second, so 100 "seconds" are 100 ms
    const response = await createClient().request("GET /thing");

    expect(response.data).toEqual({ ok: true });
    expect(gaps()[0]).toBeGreaterThanOrEqual(80);
  });

  it("waits two minutes at most", async () => {
    const unavailable = {
      status: 503,
      headers: { "retry-after": 2000 },
      body: "Service Unavailable",
    };
    github.reset([route("GET", "/thing", unavailable, ok)]);

    await createClient().request("GET /thing");

    // 120 ms, not 2000
    expect(gaps()[0]).toBeGreaterThanOrEqual(100);
    expect(gaps()[0]).toBeLessThan(1500);
  });

  it("tries a GET again at once when GitHub does not say how long to wait", async () => {
    github.reset([
      route(
        "GET",
        "/thing",
        { ...serverError, headers: { "retry-after": "soon" } },
        serverError,
        ok,
      ),
    ]);

    await createClient({ retryAfterBaseValue: 1000 }).request("GET /thing");

    for (const gap of gaps()) expect(gap).toBeLessThan(900);
  });
});

describe("timeouts", () => {
  const slow = { ...ok, delayMs: 1000 };

  it("tries a GET again when the answer takes too long, with a fresh time limit each time", async () => {
    github.reset([route("GET", "/thing", slow, slow, ok)]);

    const response = await createClient({ timeoutMs: 250 }).request(
      "GET /thing",
    );

    expect(response.data).toEqual({ ok: true });
    expect(sent()).toHaveLength(3);
  });

  it("gives up on a GET that is too slow three times", async () => {
    github.reset([route("GET", "/thing", slow)]);

    await expect(
      createClient({ timeoutMs: 250 }).request("GET /thing"),
    ).rejects.toThrow();
    expect(sent()).toHaveLength(3);
  });

  it("does not try a POST again when the answer takes too long", async () => {
    github.reset([route("POST", "/thing", { ...created, delayMs: 1000 })]);

    await expect(
      createClient({ timeoutMs: 250 }).request("POST /thing"),
    ).rejects.toThrow();
    expect(sent()).toHaveLength(1);
  });
});

describe("a reply that cannot be read", () => {
  it("is an error, and the GET is not tried again", async () => {
    github.reset([route("GET", "/thing", { ...ok, dropBody: true }, ok)]);

    await expect(createClient().request("GET /thing")).rejects.toThrow(
      `The reply from ${github.url}/thing could not be read`,
    );
    expect(sent()).toHaveLength(1);
  });

  it("is an error for a POST too", async () => {
    github.reset([route("POST", "/thing", { ...created, dropBody: true })]);

    await expect(createClient().request("POST /thing")).rejects.toThrow(
      "could not be read",
    );
    expect(sent()).toHaveLength(1);
  });

  it("is never taken for an empty page of a list", async () => {
    github.reset([
      route("GET", "/things", {
        body: [{ number: 1 }],
        headers: { link: '<{url}/things-page-2>; rel="next"' },
        dropBody: true,
      }),
      route("GET", "/things-page-2", { body: [{ number: 2 }] }),
    ]);

    await expect(createClient().paginate("GET /things")).rejects.toThrow(
      "could not be read",
    );
    expect(sent()).toEqual(["GET /things"]);
  });

  it("counts as a timeout when the rest of the reply never comes, so a GET is tried again", async () => {
    github.reset([route("GET", "/thing", { ...ok, stallBody: true }, ok)]);

    const response = await createClient({ timeoutMs: 250 }).request(
      "GET /thing",
    );

    expect(response.data).toEqual({ ok: true });
    expect(sent()).toHaveLength(2);
  });

  it("does not question a reply without a body", async () => {
    github.reset([route("DELETE", "/thing", { status: 204, body: "" })]);

    const response = await createClient().request("DELETE /thing");

    expect(response.status).toBe(204);
  });

  it("is an error whatever kind of body was cut short", async () => {
    github.reset([
      route("GET", "/thing", {
        body: "some bytes that stop half way",
        headers: { "content-type": "application/octet-stream" },
        dropBody: true,
      }),
    ]);

    await expect(createClient().request("GET /thing")).rejects.toThrow(
      "could not be read",
    );
  });

  it("is an error when the body is whole but is not JSON", async () => {
    github.reset([
      route("GET", "/thing", { body: "<html>not what was asked for</html>" }),
    ]);

    await expect(createClient().request("GET /thing")).rejects.toThrow(
      "could not be read",
    );
    expect(sent()).toHaveLength(1);
  });
});

describe("the wait between writes", () => {
  it("starts writes at least the given time apart", async () => {
    github.reset([route("POST", "/thing", created)]);
    const client = createClient({ writeMinTime: 200 });

    for (let count = 0; count < 3; count += 1)
      await client.request("POST /thing");

    for (const gap of gaps()) expect(gap).toBeGreaterThanOrEqual(150);
  });

  it("is 350 ms unless told otherwise", async () => {
    github.reset([route("POST", "/thing", created)]);
    const client = clientFactory()("installation-token");

    await client.request("POST /thing");
    await client.request("POST /thing");

    const [gap] = gaps();
    // Not the 1000 ms the throttling plugin would use
    expect(gap).toBeGreaterThanOrEqual(300);
    expect(gap).toBeLessThan(900);
  });

  it("is shared by the two clients of one run", async () => {
    github.reset([route("POST", "/thing", created)]);
    const createClientForRun = clientFactory({ writeMinTime: 200 });

    await createClientForRun("header.payload.signature").request("POST /thing");
    await createClientForRun("installation-token").request("POST /thing");

    expect(gaps()[0]).toBeGreaterThanOrEqual(150);
  });

  it("does not apply to reads", async () => {
    github.reset([route("GET", "/thing", ok)]);
    const client = createClient({ writeMinTime: 2000 });

    for (let count = 0; count < 3; count += 1)
      await client.request("GET /thing");

    for (const gap of gaps()) expect(gap).toBeLessThan(1500);
  });

  it("does not apply after the request for an installation token", async () => {
    github.reset([
      route("POST", "/app/installations/1/access_tokens", {
        status: 201,
        body: { token: "token" },
      }),
      route("POST", "/thing", created),
    ]);
    const client = createClient({ writeMinTime: 2000 });

    await client.request(
      "POST /app/installations/{installation_id}/access_tokens",
      { installation_id: 1 },
    );
    await client.request("POST /thing");

    expect(gaps()[0]).toBeLessThan(1500);
  });

  it("does not make a search wait for the search of an earlier run", async () => {
    github.reset([route("GET", "/search/issues", ok)]);

    await createClient().request("GET /search/issues", { q: "first" });
    await createClient().request("GET /search/issues", { q: "second" });

    // The plugin keeps searches from one client two seconds apart
    expect(gaps()[0]).toBeLessThan(1500);
  });
});

describe("rate limits", () => {
  it("waits as long as GitHub says and sends the request again", async () => {
    github.reset([route("POST", "/thing", secondaryLimit(2), created)]);

    const response = await createClient().request("POST /thing");

    expect(response.status).toBe(201);
    expect(sent()).toHaveLength(2);
    expect(core.warning).toHaveBeenCalledTimes(1);
    expect(core.warning).toHaveBeenCalledWith(
      "GitHub rate limit reached for POST /thing. Trying again in 2 seconds.",
    );
  });

  it("does the same for a read", async () => {
    github.reset([route("GET", "/search/issues", secondaryLimit(1), ok)]);

    const response = await createClient().request("GET /search/issues", {
      q: "query",
    });

    expect(response.data).toEqual({ ok: true });
    expect(sent()).toHaveLength(2);
  });

  it("waits until the hourly limit is reset when that is soon", async () => {
    github.reset([route("GET", "/thing", primaryLimit(2), ok)]);

    const response = await createClient().request("GET /thing");

    expect(response.data).toEqual({ ok: true });
    expect(core.warning).toHaveBeenCalledTimes(1);
  });

  it("gives up after the third wait", async () => {
    github.reset([route("POST", "/thing", secondaryLimit(1))]);

    await expect(createClient().request("POST /thing")).rejects.toMatchObject({
      status: 403,
    });
    expect(sent()).toHaveLength(4);
    expect(core.warning).toHaveBeenCalledTimes(3);
  });

  it("does not wait when told to wait more than two minutes", async () => {
    github.reset([route("POST", "/thing", secondaryLimit(121), created)]);

    await expect(createClient().request("POST /thing")).rejects.toMatchObject({
      status: 403,
    });
    expect(sent()).toHaveLength(1);
    expect(core.warning).not.toHaveBeenCalled();
  });

  it("does not wait for an hourly limit that is reset much later", async () => {
    github.reset([route("GET", "/thing", primaryLimit(3600), ok)]);

    await expect(createClient().request("GET /thing")).rejects.toMatchObject({
      status: 403,
    });
    expect(sent()).toHaveLength(1);
    expect(core.warning).not.toHaveBeenCalled();
  });

  it("does not take another 403 for a rate limit", async () => {
    github.reset([
      route("GET", "/thing", {
        status: 403,
        body: { message: "Resource not accessible by integration" },
      }),
    ]);

    await expect(createClient().request("GET /thing")).rejects.toMatchObject({
      status: 403,
    });
    expect(sent()).toHaveLength(1);
  });
  it("waits before it sends the request again, and the wait is not part of the time limit", async () => {
    github.reset([route("POST", "/thing", secondaryLimit(4), created)]);

    // Four "seconds" of 100 ms: longer than the time limit of one attempt
    const response = await createClient({
      retryAfterBaseValue: 100,
      timeoutMs: 250,
    }).request("POST /thing");

    expect(response.status).toBe(201);
    expect(gaps()[0]).toBeGreaterThanOrEqual(350);
  });

  it("waits a second for each second GitHub asks for unless told otherwise", async () => {
    github.reset([route("POST", "/thing", secondaryLimit(1), created)]);

    await clientFactory({ writeMinTime: 0 })("installation-token").request(
      "POST /thing",
    );

    expect(gaps()[0]).toBeGreaterThanOrEqual(950);
  });
});
