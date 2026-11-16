import * as core from "@actions/core";
import { createGithubSummary, createStatus } from "./baseDeployCheck.js";
import { str } from "./output.js";
import { getAllIssues, getLabelTags } from "./simplyIssue.js";

// Check if the deploy status issue created is already present
export async function checkCurrentIssue(config) {
  const labelTags = await getLabelTags(config);
  if (!labelTags.includes("block deploys")) return;

  core.info(`Event: ${str(config.eventPayload.action)} called`);
  core.info("=".repeat(47));
  let githubSummaryMessage = "## Deploy Status Check\n";
  switch (config.eventPayload.action) {
    case "labeled":
      githubSummaryMessage += "### :boom: Deploys are blocked :boom:\n";
      await createStatusForAllPrs(
        config,
        "failure",
        "Deploys are blocked",
        githubSummaryMessage,
      );
      break;
    case "closed":
      if (
        (await getAllIssues(config, "issues", "block deploys")).length === 0
      ) {
        githubSummaryMessage +=
          "### :sparkles: You are free to deploy :sparkles:\n";
        await createStatusForAllPrs(
          config,
          "success",
          "You are free to deploy",
          githubSummaryMessage,
        );
      }
      break;
  }
}

export async function createStatusForAllPrs(
  config,
  status,
  statusMessage,
  message,
) {
  const allPullRequests = await getAllIssues(config, "pull_request");
  const targetUrl = str(config.eventPayload.html_url);
  // One at a time, in list order; the first failure stops the loop
  for (const pr of allPullRequests) {
    const result = await createStatus(
      config,
      pr.head.sha,
      status,
      statusMessage,
    );
    message += `- Created ${str(result.state)} state with\n`;
    message += `- description ${str(result.description)} for PR ${str(pr.number)} and url ${str(result.url)}\n`;
    message += `- with target_url ${targetUrl}\n`;
    // The whole summary so far is written again after every pull request
    createGithubSummary(message);
    core.info(
      `Created ${str(result.state)} state with description ${str(result.description)} for PR ${str(pr.number)} and url ${str(result.url)} with target_url ${targetUrl}`,
    );
    core.info("=".repeat(92));
  }
}
