import { readFileSync } from "node:fs";
import { route } from "./fakeGitHub.js";

// Every situation the action can be in: what it is given, and what the fake
// GitHub API answers. What the Ruby action did in each one is recorded in
// fixtures/golden, and the JavaScript action is compared with that.

// The repository the action runs in. The payloads name another one, to show
// which calls use which.
export const REPOSITORY = "simplybusiness/other-app";
export const PAYLOAD_REPOSITORY = "simplybusiness/important-app";
export const CLIENT_ID = "Iv1.0123456789abcdef";
export const INSTALLATION_TOKEN = "ghs_installationtoken";

const INSTALLATION_ID = 55045987;
const PULL_NUMBER = 159;
const ISSUE_NUMBER = 160;
const PUSHED_SHA = "5555555555555555555555555555555555555555";
// What the API reports as the head of the pull request. The payloads carry a
// different one, and the status must go to the payload's.
const API_HEAD_SHA = "9999999999999999999999999999999999999999";
const [FIRST_SHA, SECOND_SHA, THIRD_SHA] = ["1", "2", "3"].map((digit) =>
  digit.repeat(40),
);

const fixture = (name) =>
  JSON.parse(
    readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"),
  );
const openPr = fixture("open-pr-payload.json");
const labeledPr = fixture("labeled-pr-payload.json");
const OPENED_SHA = openPr.pull_request.head.sha;
const LABELED_SHA = labeledPr.pull_request.head.sha;
const withoutAction = (payload) =>
  Object.fromEntries(
    Object.entries(payload).filter(([name]) => name !== "action"),
  );

const repository = { full_name: PAYLOAD_REPOSITORY };
const pushPayload = { ref: "refs/heads/master", after: PUSHED_SHA, repository };
// The labels in an issue payload are never read: they come from the API
const issuePayload = (action, label) => ({
  action,
  issue: { number: ISSUE_NUMBER, state: "open", labels: [] },
  ...(label ? { label: { name: label } } : {}),
  repository,
});

const labels = (...names) => names.map((name) => ({ name }));

// Routes
const installation = route("GET", `/repos/${PAYLOAD_REPOSITORY}/installation`, {
  body: { id: INSTALLATION_ID },
});
const token = route(
  "POST",
  `/app/installations/${INSTALLATION_ID}/access_tokens`,
  { status: 201, body: { token: INSTALLATION_TOKEN } },
);
const auth = [installation, token];

const search = (...replies) => route("GET", "/search/issues", ...replies);
const found = (...numbers) => ({
  body: {
    total_count: numbers.length,
    incomplete_results: false,
    items: numbers.map((number) => ({ number })),
  },
});
const incomplete = {
  body: { total_count: 0, incomplete_results: true, items: [] },
};

const pull = (...names) =>
  route("GET", `/repos/${REPOSITORY}/pulls/${PULL_NUMBER}`, {
    body: {
      number: PULL_NUMBER,
      head: { sha: API_HEAD_SHA },
      labels: labels(...names),
    },
  });
const issue = (names, state = "open") =>
  route("GET", `/repos/${REPOSITORY}/issues/${ISSUE_NUMBER}`, {
    body: { number: ISSUE_NUMBER, state, labels: labels(...names) },
  });

const statusPath = (sha) => `/repos/${REPOSITORY}/statuses/${sha}`;
const created = (sha, state) => ({
  status: 201,
  body: {
    url: `https://api.github.com${statusPath(sha)}`,
    state,
    description:
      state === "success" ? "You are free to deploy" : "Deploys are blocked",
    context: "Deploy status",
    target_url: null,
  },
});
const status = (sha, state) =>
  route("POST", statusPath(sha), created(sha, state));

const listed = (number, sha, ...names) => ({
  number,
  head: { sha },
  labels: labels(...names),
});
const pulls = (...replies) =>
  route("GET", `/repos/${REPOSITORY}/pulls`, ...replies);
// Three open pull requests over two pages; the second one is an emergency deploy
const twoPagesOfPulls = [
  pulls({
    body: [listed(11, FIRST_SHA), listed(12, SECOND_SHA, "emergency deploy")],
    headers: {
      link: '<{url}/repositories/1/pulls?per_page=100&state=open&page=2>; rel="next", <{url}/repositories/1/pulls?per_page=100&state=open&page=2>; rel="last"',
    },
  }),
  route("GET", "/repositories/1/pulls", { body: [listed(13, THIRD_SHA)] }),
];
const onePageOfPulls = pulls({
  body: [listed(11, FIRST_SHA), listed(12, SECOND_SHA), listed(13, THIRD_SHA)],
});
const statusForEach = (state) =>
  [FIRST_SHA, SECOND_SHA, THIRD_SHA].map((sha) => status(sha, state));

const pullRequest = {
  event: "pull_request",
  ref: `refs/pull/${PULL_NUMBER}/merge`,
};
const push = {
  event: "push",
  ref: "refs/heads/master",
  payload: pushPayload,
};
const issues = { event: "issues", ref: "refs/heads/master" };
const unset = (...names) =>
  Object.fromEntries(names.map((name) => [name, undefined]));

export const scenarios = [
  // Start-up
  {
    name: "unknown-event",
    event: "workflow_dispatch",
    ref: "refs/heads/master",
    payload: { repository },
    routes: auth,
  },
  {
    name: "airbrake-key-unset",
    ...pullRequest,
    payload: openPr,
    env: unset("AIRBRAKE_KEY"),
    routes: auth,
  },
  {
    name: "empty-secrets",
    ...pullRequest,
    payload: openPr,
    env: { CLIENT_ID: "", PRIVATE_KEY: "" },
    routes: auth,
  },
  ...[
    "GITHUB_REPOSITORY",
    "GITHUB_EVENT_PATH",
    "GITHUB_EVENT_NAME",
    "GITHUB_REF",
    "CLIENT_ID",
    "PRIVATE_KEY",
  ].map((name) => ({
    name: `unset-${name.toLowerCase().replaceAll("_", "-")}`,
    ...pullRequest,
    payload: openPr,
    env: unset(name),
    routes: auth,
  })),
  {
    name: "unset-everything",
    ...pullRequest,
    payload: openPr,
    env: unset(
      "GITHUB_REPOSITORY",
      "GITHUB_EVENT_PATH",
      "GITHUB_EVENT_NAME",
      "GITHUB_REF",
      "GITHUB_STEP_SUMMARY",
      "CLIENT_ID",
      "PRIVATE_KEY",
    ),
    routes: auth,
  },
  {
    name: "malformed-repository",
    ...pullRequest,
    payload: openPr,
    env: { GITHUB_REPOSITORY: "not-a-repository" },
    routes: auth,
  },
  {
    name: "event-file-missing",
    ...pullRequest,
    eventFile: "missing",
    routes: auth,
    runtimeMessage: true,
    // The toolkit looks for the file as the bundle loads, and says so twice
    bundle: {
      stdout:
        "GITHUB_EVENT_PATH <directory>/event.json does not exist\n".repeat(2) +
        "Unexpected error occurred: <message from the runtime>\n",
    },
  },
  {
    name: "event-file-not-json",
    ...pullRequest,
    eventFile: "malformed",
    routes: auth,
    runtimeMessage: true,
    // The toolkit parses the file as the bundle loads, before the action can
    // handle the error. A runner always writes valid JSON.
    bundle: { stdout: "", exitCode: 1, stderr: true },
  },
  {
    name: "junk-private-key",
    ...pullRequest,
    payload: openPr,
    env: { PRIVATE_KEY: "not-a-private-key" },
    routes: auth,
  },
  {
    name: "payload-without-repository",
    event: "workflow_dispatch",
    ref: "refs/heads/master",
    payload: {},
    routes: auth,
    runtimeMessage: true,
  },
  {
    name: "installation-not-found",
    ...pullRequest,
    payload: openPr,
    routes: [
      route("GET", `/repos/${PAYLOAD_REPOSITORY}/installation`, {
        status: 404,
        body: {
          message: "Not Found",
          documentation_url:
            "https://docs.github.com/rest/apps/apps#get-a-repository-installation-for-the-authenticated-app",
          status: "404",
        },
      }),
      token,
    ],
  },
  {
    name: "token-request-fails",
    ...pullRequest,
    payload: openPr,
    routes: [
      installation,
      route("POST", `/app/installations/${INSTALLATION_ID}/access_tokens`, {
        status: 500,
        body: "",
      }),
    ],
  },

  // Pull request events
  {
    name: "pr-opened-not-blocked",
    ...pullRequest,
    payload: openPr,
    routes: [...auth, search(found()), status(OPENED_SHA, "success")],
  },
  {
    name: "pr-target-synchronize-not-blocked",
    ...pullRequest,
    event: "pull_request_target",
    ref: "refs/heads/master",
    payload: { ...openPr, action: "synchronize" },
    routes: [...auth, search(found()), status(OPENED_SHA, "success")],
  },
  {
    name: "pr-opened-blocked",
    ...pullRequest,
    payload: openPr,
    routes: [
      ...auth,
      search(found(ISSUE_NUMBER)),
      pull(),
      status(OPENED_SHA, "failure"),
    ],
  },
  {
    name: "pr-opened-blocked-emergency",
    ...pullRequest,
    payload: openPr,
    routes: [
      ...auth,
      search(found(ISSUE_NUMBER)),
      pull("emergency deploy"),
      status(OPENED_SHA, "success"),
    ],
  },
  {
    name: "pr-opened-search-incomplete",
    ...pullRequest,
    payload: openPr,
    routes: [...auth, search(incomplete), status(OPENED_SHA, "success")],
  },
  {
    name: "pr-labeled-emergency",
    ...pullRequest,
    payload: labeledPr,
    // A blocking issue is open, but this path never looks
    routes: [
      ...auth,
      search(found(ISSUE_NUMBER)),
      pull("another label", "emergency deploy"),
      status(LABELED_SHA, "success"),
    ],
  },
  {
    name: "pr-edited-emergency",
    ...pullRequest,
    payload: { ...labeledPr, action: "edited" },
    routes: [...auth, pull("emergency deploy"), status(LABELED_SHA, "success")],
  },
  {
    name: "pr-without-action-emergency",
    ...pullRequest,
    payload: withoutAction(labeledPr),
    routes: [...auth, pull("emergency deploy"), status(LABELED_SHA, "success")],
  },
  {
    name: "pr-labeled-not-emergency",
    ...pullRequest,
    // The payload says "emergency deploy", the API does not
    payload: labeledPr,
    routes: [...auth, pull("another label"), status(LABELED_SHA, "success")],
  },
  {
    name: "pr-opened-summary-path-unset",
    ...pullRequest,
    payload: openPr,
    env: unset("GITHUB_STEP_SUMMARY"),
    routes: [...auth, search(found()), status(OPENED_SHA, "success")],
  },

  // Push events
  {
    name: "push-not-blocked",
    ...push,
    routes: [...auth, search(found()), status(PUSHED_SHA, "success")],
  },
  {
    name: "push-blocked",
    ...push,
    routes: [
      ...auth,
      search(found(ISSUE_NUMBER)),
      status(PUSHED_SHA, "failure"),
    ],
    runtimeMessage: true,
  },
  {
    name: "push-search-incomplete",
    ...push,
    routes: [...auth, search(incomplete), status(PUSHED_SHA, "success")],
  },

  // Issue events
  {
    name: "issue-labeled-without-blocking-label",
    ...issues,
    payload: issuePayload("labeled", "block deploys"),
    routes: [...auth, issue(["another label"]), onePageOfPulls],
  },
  {
    name: "issue-labeled-blocks-open-prs",
    ...issues,
    payload: issuePayload("labeled", "block deploys"),
    routes: [
      ...auth,
      issue(["block deploys"]),
      ...twoPagesOfPulls,
      ...statusForEach("failure"),
    ],
  },
  {
    name: "issue-labeled-no-open-prs",
    ...issues,
    payload: issuePayload("labeled", "block deploys"),
    routes: [...auth, issue(["block deploys"]), pulls({ body: [] })],
  },
  {
    name: "issue-labeled-other-label-on-closed-issue",
    ...issues,
    payload: issuePayload("labeled", "another label"),
    routes: [
      ...auth,
      issue(["another label", "block deploys"], "closed"),
      onePageOfPulls,
      ...statusForEach("failure"),
    ],
  },
  {
    name: "issue-closed-unblocks-open-prs",
    ...issues,
    payload: issuePayload("closed"),
    routes: [
      ...auth,
      issue(["block deploys"], "closed"),
      search(found()),
      ...twoPagesOfPulls,
      ...statusForEach("success"),
    ],
  },
  {
    name: "issue-closed-another-blocker-open",
    ...issues,
    payload: issuePayload("closed"),
    routes: [
      ...auth,
      issue(["block deploys"], "closed"),
      search(found(161)),
      onePageOfPulls,
    ],
  },
  {
    name: "issue-closed-search-incomplete",
    ...issues,
    payload: issuePayload("closed"),
    routes: [
      ...auth,
      issue(["block deploys"], "closed"),
      search(incomplete),
      onePageOfPulls,
    ],
  },
  {
    name: "issue-reopened-with-blocking-label",
    ...issues,
    payload: issuePayload("reopened"),
    routes: [...auth, issue(["block deploys"]), onePageOfPulls],
  },
  {
    name: "issue-labeled-second-status-fails",
    ...issues,
    payload: issuePayload("labeled", "block deploys"),
    routes: [
      ...auth,
      issue(["block deploys"]),
      onePageOfPulls,
      status(FIRST_SHA, "failure"),
      route("POST", statusPath(SECOND_SHA), {
        status: 422,
        body: {
          message: "Validation Failed",
          errors: [
            {
              resource: "Status",
              code: "custom",
              message:
                "This SHA and context has reached the maximum number of statuses.",
            },
          ],
          documentation_url:
            "https://docs.github.com/rest/commits/statuses#create-a-commit-status",
          status: "422",
        },
      }),
      status(THIRD_SHA, "failure"),
    ],
  },

  // Retries and failures
  {
    name: "search-502-twice-then-ok",
    ...pullRequest,
    payload: openPr,
    routes: [
      ...auth,
      search(
        { status: 502, body: "Server Error" },
        { status: 502, body: "Server Error" },
        found(),
      ),
      status(OPENED_SHA, "success"),
    ],
  },
  {
    name: "search-500-three-times",
    ...pullRequest,
    payload: openPr,
    routes: [
      ...auth,
      search({
        status: 500,
        body: "upstream connect error or disconnect/reset before headers",
      }),
      status(OPENED_SHA, "success"),
    ],
  },
  {
    name: "status-write-500",
    ...issues,
    payload: issuePayload("labeled", "block deploys"),
    routes: [
      ...auth,
      issue(["block deploys"]),
      onePageOfPulls,
      status(FIRST_SHA, "failure"),
      route("POST", statusPath(SECOND_SHA), {
        status: 500,
        body: { message: "Server Error" },
      }),
      status(THIRD_SHA, "failure"),
    ],
  },
  {
    name: "pr-list-body-dropped",
    ...issues,
    payload: issuePayload("labeled", "block deploys"),
    routes: [
      ...auth,
      issue(["block deploys"]),
      pulls({
        body: [listed(11, FIRST_SHA), listed(12, SECOND_SHA)],
        headers: {
          link: '<{url}/repositories/1/pulls?per_page=100&state=open&page=2>; rel="next"',
        },
        dropBody: true,
      }),
      route("GET", "/repositories/1/pulls", { body: [listed(13, THIRD_SHA)] }),
      ...statusForEach("failure"),
    ],
    runtimeMessage: true,
  },
  {
    name: "search-body-dropped",
    ...pullRequest,
    payload: openPr,
    routes: [
      ...auth,
      search({ ...found(ISSUE_NUMBER), dropBody: true }),
      pull(),
      status(OPENED_SHA, "success"),
    ],
    runtimeMessage: true,
  },
  {
    name: "status-write-body-dropped",
    ...issues,
    payload: issuePayload("labeled", "block deploys"),
    routes: [
      ...auth,
      issue(["block deploys"]),
      onePageOfPulls,
      route("POST", statusPath(FIRST_SHA), {
        ...created(FIRST_SHA, "failure"),
        dropBody: true,
      }),
      status(SECOND_SHA, "failure"),
      status(THIRD_SHA, "failure"),
    ],
    runtimeMessage: true,
  },
  {
    name: "pr-list-second-page-500",
    ...issues,
    payload: issuePayload("labeled", "block deploys"),
    routes: [
      ...auth,
      issue(["block deploys"]),
      twoPagesOfPulls[0],
      route("GET", "/repositories/1/pulls", {
        status: 500,
        body: { message: "Server Error" },
      }),
      ...statusForEach("failure"),
    ],
  },
  {
    name: "pr-list-409",
    ...issues,
    payload: issuePayload("labeled", "block deploys"),
    routes: [
      ...auth,
      issue(["block deploys"]),
      pulls({
        status: 409,
        body: {
          message: "Git Repository is empty.",
          documentation_url: "https://docs.github.com/rest",
        },
      }),
      ...statusForEach("failure"),
    ],
  },
  {
    name: "search-502-html",
    ...pullRequest,
    payload: openPr,
    routes: [
      ...auth,
      // An error page from in front of the API, which ends with a newline
      search({
        status: 502,
        headers: { "content-type": "text/html; charset=utf-8" },
        body: "<html>\n<head><title>502 Bad Gateway</title></head>\n<body>Bad Gateway</body>\n</html>\n",
      }),
      status(OPENED_SHA, "success"),
    ],
  },
];
