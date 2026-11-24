import * as core from "@actions/core";
import { notifyAirbrake } from "./lib/airbrake.js";
import { baseCheck } from "./lib/baseDeployCheck.js";
import { clientFactory } from "./lib/createClient.js";
import { errorMessage } from "./lib/errorMessage.js";
import { createGithubApiConfig } from "./lib/githubApiConfig.js";
import { checkCurrentIssue } from "./lib/issueDeployCheck.js";
import { withoutFinalNewline } from "./lib/output.js";
import { checkLabeledPr } from "./lib/prDeployCheck.js";

const SEPARATOR = "=".repeat(45);

// clientOptions are for tests: see clientFactory
export async function main(clientOptions) {
  // The Ruby action read AIRBRAKE_KEY as it loaded, before anything that
  // handled errors, so a missing key failed the step. An empty key is allowed.
  const airbrakeKey = process.env.AIRBRAKE_KEY;
  if (airbrakeKey === undefined) {
    core.setFailed('key not found: "AIRBRAKE_KEY"');
    return;
  }

  try {
    const config = await createGithubApiConfig(clientFactory(clientOptions));
    switch (config.eventName) {
      case "pull_request":
      case "pull_request_target":
        if (["opened", "synchronize"].includes(config.eventPayload.action)) {
          core.info("Pull request is opened or synchronized");
          core.info(SEPARATOR);
          await baseCheck(
            config,
            "issues",
            config.eventPayload.pull_request.head.sha,
          );
        } else {
          core.info("Pull request is labeled");
          core.info(SEPARATOR);
          await checkLabeledPr(config);
        }
        break;
      case "push":
        await baseCheck(config, "issues", config.eventPayload.after);
        break;
      case "issues":
        await checkCurrentIssue(config);
        break;
    }
  } catch (error) {
    // A handled error is reported, but it never fails the step
    const message = errorMessage(error);
    // GitHub's own error pages end with a newline, and Ruby's puts did not
    // add a second one
    core.info(withoutFinalNewline(`Unexpected error occurred: ${message}`));
    await notifyAirbrake(error, { message, projectKey: airbrakeKey });
  }
}
