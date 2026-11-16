import { setTimeout as sleep } from "node:timers/promises";
import * as core from "@actions/core";
import { getOctokit } from "@actions/github";
import { throttling } from "@octokit/plugin-throttling";
import Bottleneck from "bottleneck/light.js";

export const GET_RETRIES = 2;
export const REQUEST_TIMEOUT_MS = 60_000;
// GitHub allows about 180 writes a minute to one endpoint
export const WRITE_MIN_TIME_MS = 350;
export const RATE_LIMIT_RETRIES = 3;
// The longest the action waits because GitHub asked it to
export const MAX_WAIT_SECONDS = 120;

let factories = 0;

// Returns the function that makes the API clients for one run of the action
export function clientFactory({
  writeMinTime = WRITE_MIN_TIME_MS,
  retryAfterBaseValue = 1000,
  timeoutMs = REQUEST_TIMEOUT_MS,
} = {}) {
  factories += 1;
  const throttle = {
    // The plugin keeps its limiters by id for as long as the process lives,
    // so each run gets its own
    id: `deploy-status-action-${factories}`,
    // Requests that change something go one at a time, at least this far apart
    write: new Bottleneck.Group({ maxConcurrent: 1, minTime: writeMinTime }),
    retryAfterBaseValue,
    onRateLimit: waitAndRetry,
    onSecondaryRateLimit: waitAndRetry,
  };
  // requestPolicy is given first so that the throttling plugin wraps it: each
  // attempt the plugin makes then gets its own retries and timeout
  return (token) =>
    getOctokit(
      token,
      { throttle },
      requestPolicy({ timeoutMs, retryAfterBaseValue }),
      throttling,
    );
}

// Called when GitHub says a rate limit was reached. Returning true makes the
// plugin wait for retryAfter seconds and send the request again.
function waitAndRetry(retryAfter, options, _octokit, retryCount) {
  if (retryCount >= RATE_LIMIT_RETRIES || retryAfter > MAX_WAIT_SECONDS) {
    return false;
  }
  core.warning(
    `GitHub rate limit reached for ${options.method} ${options.url}. Trying again in ${retryAfter} seconds.`,
  );
  return true;
}

// Octokit Ruby retried a GET twice after a 5xx or a read timeout, straight
// away unless GitHub said how long to wait, and never retried a POST.
// Net::HTTP gave up on a read after 60 seconds.
export function requestPolicy({
  retries = GET_RETRIES,
  timeoutMs = REQUEST_TIMEOUT_MS,
  retryAfterBaseValue = 1000,
} = {}) {
  return (octokit) => {
    octokit.hook.wrap("request", async (request, options) => {
      const attempts = options.method === "GET" ? retries + 1 : 1;
      for (let attempt = 1; ; attempt += 1) {
        const signal = AbortSignal.timeout(timeoutMs);
        // The inner hooks are bound to this object, so it must be changed in place
        options.request.signal = signal;
        try {
          const response = await request(options);
          if (!hasReadableBody(response))
            throw unreadableBody(response, signal);
          return response;
        } catch (error) {
          if (attempt >= attempts || !isRetryable(error)) throw error;
          const wait = retryAfterSeconds(error) * retryAfterBaseValue;
          if (wait > 0) await sleep(wait);
        }
      }
    });
    return {};
  };
}

// Octokit returns "" for a body it could not read, and its pagination takes
// that for an empty page. Every reply this action uses is a JSON object or list.
function hasReadableBody(response) {
  if (response.status !== 200 && response.status !== 201) return true;
  const { data } = response;
  return (
    Array.isArray(data) ||
    Object.prototype.toString.call(data) === "[object Object]"
  );
}

function unreadableBody(response, signal) {
  const error = new Error(`The reply from ${response.url} could not be read`);
  error.timedOut = signal.aborted;
  return error;
}

function isRetryable(error) {
  // GitHub answered: only a 5xx is worth another go
  if (error.response) return error.status >= 500;
  // No answer, or half of one: retry our own timeout, but not a lost connection
  return error.timedOut === true || error.cause?.name === "TimeoutError";
}

// How long GitHub asks to be left alone after a 5xx, if it says
function retryAfterSeconds(error) {
  const seconds = Number(error.response?.headers?.["retry-after"]);
  return seconds > 0 ? Math.min(seconds, MAX_WAIT_SECONDS) : 0;
}
