import { writeFileSync } from "node:fs";
import * as core from "@actions/core";
import { fetchEnv } from "./env.js";
import { str, withNewline } from "./output.js";
import { blockDeploys } from "./simplyIssue.js";

export const CONTEXT_NAME = "Deploy status";

export async function createStatus(config, sha, state, description) {
  const { owner, repo } = config.appRepo;
  const result = await config.client.request(
    "POST /repos/{owner}/{repo}/statuses/{sha}",
    {
      owner,
      repo,
      sha,
      // The body the Ruby action sent, in the same order. The payload has no
      // top-level html_url, so target_url is null, and null is sent, not left out.
      description,
      context: CONTEXT_NAME,
      target_url: config.eventPayload.html_url ?? null,
      state,
    },
  );
  return result.data;
}

// Checks the deploy checks present
export async function baseCheck(config, event, sha) {
  core.info(`config event branch  ${config.eventBranch}`);
  let githubSummaryMessage = "## Deploy Status Check\n ";
  let result;
  if (await blockDeploys(config, event)) {
    githubSummaryMessage += "### :boom: Deploys are blocked :boom:\n";
    result = await createStatus(config, sha, "failure", "Deploys are blocked");
  } else {
    githubSummaryMessage += "### :tada: You are free to deploy :tada:\n";
    result = await createStatus(
      config,
      sha,
      "success",
      "You are free to deploy",
    );
  }
  githubSummaryMessage += `- Created ${str(result.state)} state with description: ${str(result.description)}\n`;
  githubSummaryMessage += `- for sha ${str(sha)} and url ${str(result.url)}\n`;
  createGithubSummary(githubSummaryMessage);
  core.info(
    `Created ${str(result.state)} state with description ${str(result.description)}`,
  );
  // Ruby printed this without a newline, so the separator follows on the same line
  core.info(`for sha ${str(sha)} and url ${str(result.url)}${"=".repeat(73)}`);
  return result;
}

// Replaces the file each time, as File.open(path, "w") did
export function createGithubSummary(githubSummaryMessage) {
  writeFileSync(
    fetchEnv("GITHUB_STEP_SUMMARY"),
    withNewline(githubSummaryMessage),
  );
}
