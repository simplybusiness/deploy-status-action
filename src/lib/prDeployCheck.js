import * as core from "@actions/core";
import { createGithubSummary, createStatus } from "./baseDeployCheck.js";
import { str } from "./output.js";
import { getLabelTags } from "./simplyIssue.js";

// Check if the emergency deploy present
export async function checkLabeledPr(config) {
  const labelTags = await getLabelTags(config);
  if (!labelTags.includes("emergency deploy")) return;

  const sha = config.eventPayload.pull_request.head.sha;
  const result = await createStatus(
    config,
    sha,
    "success",
    "You are free to deploy",
  );
  const targetUrl = str(config.eventPayload.html_url);
  let githubSummaryMessage = "## Deploy Status Check!\n";
  githubSummaryMessage += "### :sparkles: You are free to deploy :sparkles:\n";
  githubSummaryMessage += `- Created ${str(result.state)} state with description ${str(result.description)} for sha ${str(sha)} and url ${str(result.url)}\n`;
  githubSummaryMessage += `- description ${str(result.description)} for sha ${str(sha)} for url ${str(result.url)}\n`;
  githubSummaryMessage += `- with target_url ${targetUrl}\n `;
  createGithubSummary(githubSummaryMessage);

  // "withdescription" is how the Ruby action wrote it
  core.info(
    `Created ${str(result.state)} state withdescription ${str(result.description)} for sha ${str(sha)} for url ${str(result.url)} with target_url ${targetUrl}`,
  );
  core.info("=".repeat(92));
  return result;
}
