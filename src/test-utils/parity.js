import { execFile } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { isDeepStrictEqual, parseArgs } from "node:util";
import { startFakeGitHub } from "./fakeGitHub.js";
import {
  generateAppKey,
  GOLDEN_DIRECTORY,
  outcome,
  prepare,
  readGolden,
} from "./harness.js";
import { scenarios } from "./scenarios.js";

// Runs the action as a separate process against the fake GitHub API.
//
//   node src/test-utils/parity.js check
//     runs the bundle in dist/ and compares it with fixtures/golden
//   node src/test-utils/parity.js record --ruby-dir <checkout of v2.4.0>
//     runs the Ruby action and writes fixtures/golden
//   node src/test-utils/parity.js check --ruby-dir <checkout of v2.4.0>
//     compares the Ruby action with fixtures/golden

// A process that is still running this long after its last request has
// something keeping it alive
const MAX_EXIT_DELAY_MS = 5_000;
const TIME_LIMIT_MS = 120_000;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { "ruby-dir": { type: "string" } },
});
const [command] = positionals;
const rubyDirectory = values["ruby-dir"] && resolve(values["ruby-dir"]);
if (
  !["check", "record"].includes(command) ||
  (command === "record" && !rubyDirectory)
) {
  console.error(
    "Usage: parity.js check [--ruby-dir <dir>] | record --ruby-dir <dir>",
  );
  process.exit(2);
}

const repositoryRoot = new URL("../../", import.meta.url);
// The bundle is run from a directory of its own, to show it needs nothing else
const bundleDirectory = mkdtempSync(
  join(tmpdir(), "deploy-status-action-dist-"),
);
if (!rubyDirectory) {
  cpSync(new URL("dist/", repositoryRoot), bundleDirectory, {
    recursive: true,
  });
}

const github = await startFakeGitHub();
const key = generateAppKey();
const failures = [];

for (const scenario of scenarios) {
  const result = await run(scenario);
  if (command === "record") {
    writeFileSync(
      new URL(`${scenario.name}.json`, GOLDEN_DIRECTORY),
      `${JSON.stringify(result.outcome, null, 2)}\n`,
    );
    console.log(`recorded ${scenario.name}`);
    continue;
  }

  const problems = compare(scenario, result);
  console.log(`${problems.length === 0 ? "ok  " : "FAIL"} ${scenario.name}`);
  if (problems.length > 0) failures.push({ scenario, problems });
}

await github.close();
rmSync(bundleDirectory, { recursive: true, force: true });

for (const { scenario, problems } of failures) {
  console.error(`\n${scenario.name}`);
  for (const problem of problems) console.error(`  ${problem}`);
}
if (failures.length > 0) {
  console.error(`\n${failures.length} of ${scenarios.length} scenarios differ`);
  process.exit(1);
}

async function run(scenario) {
  const { env, directory, cleanup } = prepare(scenario, key);
  github.reset(scenario.routes);
  const started = Date.now();
  const child = rubyDirectory
    ? await spawn("bundle", ["exec", "ruby", "lib/action.rb"], {
        cwd: rubyDirectory,
        env: { ...env, OCTOKIT_API_ENDPOINT: `${github.url}/` },
      })
    : await spawn(process.execPath, [join(bundleDirectory, "index.js")], {
        cwd: bundleDirectory,
        env: { ...env, GITHUB_API_URL: github.url },
      });
  const result = {
    outcome: outcome({
      scenario,
      github,
      publicKey: key.publicKey,
      directory,
      stdout: child.stdout,
      exitCode: child.exitCode,
    }),
    stderr: child.stderr,
    exitDelay: Date.now() - Math.max(started, github.lastRequestAt()),
  };
  cleanup();
  return result;
}

function spawn(file, args, { cwd, env }) {
  return new Promise((resolvePromise) => {
    execFile(
      file,
      args,
      {
        cwd,
        // Nothing of this process's environment but what is needed to start
        env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env },
        timeout: TIME_LIMIT_MS,
        maxBuffer: 16 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        const exitCode = error
          ? typeof error.code === "number"
            ? error.code
            : -1
          : 0;
        resolvePromise({ stdout, stderr, exitCode });
      },
    );
  });
}

function compare(scenario, { outcome: actual, stderr, exitDelay }) {
  // Where the bundle is known to differ from Ruby, the scenario says how
  const known = rubyDirectory ? {} : (scenario.bundle ?? {});
  const { stderr: stderrExpected = false, ...overrides } = known;
  const expected = { ...readGolden(scenario), ...overrides };
  const problems = [];
  for (const part of ["requests", "stdout", "summary", "exitCode"]) {
    if (!isDeepStrictEqual(actual[part], expected[part])) {
      problems.push(
        `${part}: expected ${JSON.stringify(expected[part])}, got ${JSON.stringify(actual[part])}`,
      );
    }
  }
  if (!rubyDirectory) {
    if (stderrExpected !== (stderr !== "")) {
      problems.push(`stderr: ${JSON.stringify(stderr)}`);
    }
    if (exitDelay > MAX_EXIT_DELAY_MS) {
      problems.push(
        `the process took ${exitDelay} ms to exit after its last request`,
      );
    }
  }
  return problems;
}
