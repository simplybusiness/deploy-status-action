import { generateKeyPairSync } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeRequests } from "./fakeGitHub.js";
import { CLIENT_ID, REPOSITORY } from "./scenarios.js";

// What runs a scenario, shared by the Jest tests and the parity check

export const GOLDEN_DIRECTORY = new URL("./fixtures/golden/", import.meta.url);

// The variables a runner sets for the action
export const ENV_NAMES = [
  "GITHUB_REPOSITORY",
  "GITHUB_EVENT_PATH",
  "GITHUB_EVENT_NAME",
  "GITHUB_REF",
  "GITHUB_STEP_SUMMARY",
  "CLIENT_ID",
  "PRIVATE_KEY",
  "AIRBRAKE_KEY",
];

// A private key for the GitHub App, made up for this run
export function generateAppKey() {
  return generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs1", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
}

export function readGolden(scenario) {
  return JSON.parse(
    readFileSync(new URL(`${scenario.name}.json`, GOLDEN_DIRECTORY), "utf8"),
  );
}

// Creates the event file and the environment that a runner would provide
export function prepare(scenario, { privateKey }) {
  const directory = mkdtempSync(join(tmpdir(), "deploy-status-action-"));
  const eventPath = join(directory, "event.json");
  if (scenario.eventFile === "malformed") {
    writeFileSync(eventPath, "not json");
  } else if (scenario.eventFile !== "missing") {
    writeFileSync(eventPath, JSON.stringify(scenario.payload));
  }

  const env = {
    GITHUB_REPOSITORY: REPOSITORY,
    GITHUB_EVENT_PATH: eventPath,
    GITHUB_EVENT_NAME: scenario.event,
    GITHUB_REF: scenario.ref,
    // Does not exist yet, so a test can tell whether a summary was written
    GITHUB_STEP_SUMMARY: join(directory, "summary.md"),
    CLIENT_ID,
    PRIVATE_KEY: privateKey,
    AIRBRAKE_KEY: "",
    ...scenario.env,
  };
  for (const [name, value] of Object.entries(env)) {
    if (value === undefined) delete env[name];
  }

  return {
    env,
    directory,
    cleanup: () => rmSync(directory, { recursive: true, force: true }),
  };
}

// What a run did, in the form that is recorded and compared
export function outcome({
  scenario,
  github,
  publicKey,
  directory,
  stdout,
  exitCode,
}) {
  const summaryPath = join(directory, "summary.md");
  return {
    requests: normalizeRequests(github.requests, {
      publicKey,
      clientId: CLIENT_ID,
    }),
    stdout: normalizeStdout(stdout, { scenario, github, directory }),
    summary: existsSync(summaryPath) ? readFileSync(summaryPath, "utf8") : null,
    exitCode,
  };
}

function normalizeStdout(stdout, { scenario, github, directory }) {
  let text = stdout
    .replaceAll(github.url, "http://github.test")
    .replaceAll(directory, "<directory>")
    // Workflow commands, which the runner does not show
    .replace(/^::.*\n/gm, "");
  if (scenario.runtimeMessage) {
    // Ruby and Node word their own errors differently
    text = text.replace(
      /^(Unexpected error occurred: )[^]*$/m,
      "$1<message from the runtime>\n",
    );
  }
  return text;
}
