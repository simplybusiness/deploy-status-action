import * as core from "@actions/core";
import { str } from "./output.js";

// Fetch the labels on PR and issue
export async function getLabelTags(config) {
  const { owner, repo } = config.appRepo;
  let issue;
  if (["pull_request", "pull_request_target"].includes(config.eventName)) {
    core.info(`Pull request ${str(config.eventPayload.number)}`);
    issue = await config.client.request(
      "GET /repos/{owner}/{repo}/pulls/{pull_number}",
      {
        owner,
        repo,
        pull_number: config.eventPayload.number,
      },
    );
  } else {
    issue = await config.client.request(
      "GET /repos/{owner}/{repo}/issues/{issue_number}",
      {
        owner,
        repo,
        issue_number: config.eventPayload.issue.number,
      },
    );
  }

  return issue.data.labels.map((label) => label.name);
}

export async function getAllIssues(config, aspect, label) {
  const { owner, repo, slug } = config.appRepo;
  switch (aspect) {
    case "pull_request": {
      // Every page, 100 at a time. Not client.paginate, which takes a 409 for
      // the end of the list where the Ruby action stopped with the error.
      let page = await config.client.request(
        "GET /repos/{owner}/{repo}/pulls",
        { owner, repo, per_page: 100, state: "open" },
      );
      const pulls = [...page.data];
      for (let next = nextPage(page); next; next = nextPage(page)) {
        page = await config.client.request(`GET ${next}`);
        pulls.push(...page.data);
      }
      return pulls;
    }
    case "issues": {
      // Search, because the list issues API also returns pull requests
      let query = `repo:${slug} is:issue is:open`;
      if (label) query += ` label:"${label}"`;
      // One request, not paginate: that would drop incomplete_results
      const result = await config.client.request("GET /search/issues", {
        q: query,
      });
      // An incomplete result could leave out a blocking issue
      if (result.data.incomplete_results) {
        throw new Error(
          `Search for blocking issues returned incomplete results: ${query}`,
        );
      }

      return result.data.items;
    }
  }
}

// The address of the page after this one, from the Link header
function nextPage(response) {
  return /<([^<>]+)>;\s*rel="next"/.exec(response.headers.link ?? "")?.[1];
}

export async function blockDeploys(config, event) {
  if ((await getAllIssues(config, event, "block deploys")).length === 0)
    return false;

  const labelTags = await getLabelTags(config);
  return !labelTags.includes("emergency deploy");
}
