import { readFileSync } from "node:fs";
import * as core from "@actions/core";
import { createAppJwt } from "./appJwt.js";
import { fetchEnv } from "./env.js";

// Octokit::Repository's rule for "owner/name"
const NAME_WITH_OWNER = /^[\w.-]+\/[\w.-]+$/;

export function parseRepository(nameWithOwner) {
  if (
    typeof nameWithOwner !== "string" ||
    !NAME_WITH_OWNER.test(nameWithOwner)
  ) {
    // Ruby printed a missing value as nil
    const shown = nameWithOwner == null ? "nil" : JSON.stringify(nameWithOwner);
    throw new Error(
      `${shown} is invalid as a repository identifier. Use the user/repo (String) format, or the repository ID (Integer), or a hash containing :repo and :user keys.`,
    );
  }
  const [owner, repo] = nameWithOwner.split("/");
  return { owner, repo, slug: nameWithOwner };
}

// Sets the GitHub client and event payload. Everything is read in the order
// the Ruby action read it, so the first thing missing is the one reported.
export async function createGithubApiConfig(createClient) {
  const appRepo = parseRepository(fetchEnv("GITHUB_REPOSITORY"));
  const eventPayload = JSON.parse(
    readFileSync(fetchEnv("GITHUB_EVENT_PATH"), "utf8"),
  );
  const eventName = fetchEnv("GITHUB_EVENT_NAME");
  const eventBranch = fetchEnv("GITHUB_REF");
  const client = createClient(await accessToken(createClient, eventPayload));
  return { client, appRepo, eventPayload, eventName, eventBranch };
}

async function accessToken(createClient, eventPayload) {
  const bearerClient = createClient(
    createAppJwt(fetchEnv("CLIENT_ID"), fetchEnv("PRIVATE_KEY")),
  );
  // The installation is looked up for the repository in the event, not GITHUB_REPOSITORY
  const { owner, repo } = parseRepository(eventPayload.repository.full_name);
  const { data: installation } = await bearerClient.request(
    "GET /repos/{owner}/{repo}/installation",
    {
      owner,
      repo,
    },
  );
  const { data } = await bearerClient.request(
    "POST /app/installations/{installation_id}/access_tokens",
    {
      installation_id: installation.id,
    },
  );
  if (data.token) core.setSecret(data.token);
  return data.token;
}
