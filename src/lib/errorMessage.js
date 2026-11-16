import { str } from "./output.js";

// Octokit Ruby's wording for an HTTP error, for example
// GET https://api.github.com/repos/o/r/pulls/1: 404 - Not Found // See: https://docs.github.com/rest
// The step stays green after an error, so this line is the only local clue.
export function errorMessage(error) {
  const { request, response } = error ?? {};
  if (!request || !response) return error?.message ?? String(error);

  const data = response.data;
  let message = `${request.method} ${rubyUrl(request.url)}: ${response.status} - `;
  if (typeof data === "string") return message + data;
  message += str(data?.message);
  // An empty string counted in Ruby, where only nil and false did not
  if (data?.error != null && data.error !== false) {
    message += `Error: ${data.error}`;
  }
  message += errorSummary(data?.errors);
  if (data?.documentation_url != null) {
    message += ` // See: ${data.documentation_url}`;
  }
  return message;
}

// Ruby sent the query sorted by name, with a space written as "+". Octokit
// keeps the order it was given and writes "%20".
function rubyUrl(url) {
  const [path, query] = url.split("?");
  if (query === undefined) return path;
  return `${path}?${query.replaceAll("%20", "+").split("&").sort().join("&")}`;
}

function errorSummary(errors) {
  if (typeof errors === "string") return `\nError summary:\n${errors}`;
  if (!Array.isArray(errors) || errors.length === 0) return "";
  const lines = errors.flatMap((entry) =>
    entry !== null && typeof entry === "object"
      ? Object.entries(entry).map(([key, value]) => `  ${key}: ${str(value)}`)
      : [`  ${str(entry)}`],
  );
  return `\nError summary:\n${lines.join("\n")}`;
}
