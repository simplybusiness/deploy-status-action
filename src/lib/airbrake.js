import { hostname } from "node:os";
import * as core from "@actions/core";

const NOTICES_URL = "https://api.airbrake.io/api/v3/projects/258121/notices";
const TIMEOUT_MS = 10_000;
const MAX_MESSAGE_LENGTH = 10_000;
const STACK_FRAME = /^\s*at (?:async )?(?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/;

// Reports an error to Airbrake. Reporting must never change the result of
// the step, so nothing here throws.
export async function notifyAirbrake(error, { message, projectKey }) {
  // The Ruby notifier sent nothing without a key, and said nothing about it
  if (!projectKey) return;

  try {
    const response = await fetch(NOTICES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${projectKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildNotice(error, message)),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // Reading the reply releases the connection, so the process can exit
    const body = await response.text();
    core.debug(`Airbrake answered ${response.status} ${body}`);
  } catch (notifyError) {
    core.debug(`Could not report the error to Airbrake: ${notifyError}`);
  }
}

function buildNotice(error, message) {
  return {
    errors: [
      {
        type: error?.name ?? "Error",
        message: message.slice(0, MAX_MESSAGE_LENGTH),
        backtrace: backtrace(error?.stack),
      },
    ],
    context: {
      notifier: {
        name: "deploy-status-action",
        version: "1.0.0",
        url: "https://github.com/simplybusiness/deploy-status-action",
      },
      severity: "error",
      hostname: hostname(),
      os: `${process.platform}-${process.arch}`,
      language: `node/${process.versions.node}`,
      // The workspace path names the repository the action ran in
      rootDirectory: process.env.GITHUB_WORKSPACE ?? process.cwd(),
    },
    environment: {},
    session: {},
    params: {
      repo: "simplybusiness/deploy-status-action",
      github_action: "deploy_action",
    },
  };
}

function backtrace(stack) {
  if (typeof stack !== "string") return [];
  return stack
    .split("\n")
    .map((line) => STACK_FRAME.exec(line))
    .filter(Boolean)
    .map(([, name, file, line, column]) => ({
      function: name ?? "",
      file,
      line: Number(line),
      column: Number(column),
    }));
}
