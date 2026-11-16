import { createServer } from "node:http";
import { createPublicKey, verify } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";

const NOT_FOUND = {
  status: 404,
  body: {
    message: "Not Found",
    documentation_url: "https://docs.github.com/rest",
  },
};

// A stand-in for the GitHub API. It answers from a list of routes and keeps
// every request it receives, so a test can check exactly what was sent.
export async function startFakeGitHub() {
  const requests = [];
  let routes = [];
  let lastRequestAt = 0;

  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const { pathname, search } = new URL(request.url, "http://github.test");
    lastRequestAt = Date.now();
    requests.push({
      method: request.method,
      path: pathname,
      query: search.slice(1),
      authorization: request.headers.authorization ?? null,
      accept: request.headers.accept ?? null,
      body: Buffer.concat(chunks).toString(),
      at: lastRequestAt,
    });

    const route = routes.find(
      (candidate) =>
        candidate.method === request.method && candidate.path === pathname,
    );
    // The last reply of a route is used for every further request to it
    const reply = route
      ? route.replies.length > 1
        ? route.replies.shift()
        : route.replies[0]
      : NOT_FOUND;
    await send(response, reply, url);
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;

  return {
    url,
    requests,
    lastRequestAt: () => lastRequestAt,
    // Replaces the routes and forgets the requests made so far
    reset(newRoutes = []) {
      requests.length = 0;
      routes = newRoutes.map((route) => ({
        ...route,
        replies: [...route.replies],
      }));
    },
    close() {
      server.closeAllConnections();
      return new Promise((resolve) => server.close(resolve));
    },
  };
}

// One route: every request with this method and path gets the next reply
export function route(method, path, ...replies) {
  return { method, path, replies };
}

async function send(response, reply, url) {
  const {
    status = 200,
    body = {},
    headers = {},
    delayMs = 0,
    dropBody = false,
    stallBody = false,
  } = reply;
  if (delayMs > 0) await sleep(delayMs);

  const text = typeof body === "string" ? body : JSON.stringify(body);
  const allHeaders = {
    "content-type":
      typeof body === "string"
        ? "text/plain; charset=utf-8"
        : "application/json; charset=utf-8",
    ...Object.fromEntries(
      Object.entries(headers).map(([name, value]) => [
        name,
        String(value).replaceAll("{url}", url),
      ]),
    ),
  };

  if (dropBody || stallBody) {
    // Promise the whole body and send half of it. Then either cut the
    // connection, or leave the client waiting for the rest.
    response.writeHead(status, {
      ...allHeaders,
      "content-length": Buffer.byteLength(text),
    });
    response.write(text.slice(0, Math.ceil(text.length / 2)), () => {
      if (dropBody) response.destroy();
    });
    return;
  }

  response.writeHead(status, allHeaders);
  response.end(text);
}

// The form in which requests are compared. Clients differ in details that the
// API treats alike (the order and escaping of the query, the case of the
// authorization scheme, a `{}` body or none), so those are levelled out here.
export function normalizeRequests(requests, { publicKey, clientId }) {
  return requests.map((request) => {
    const normalized = {
      method: request.method,
      path: request.path,
      query: [...new URLSearchParams(request.query)].sort(([a], [b]) =>
        a.localeCompare(b),
      ),
      authorization: normalizeAuthorization(request.authorization, {
        publicKey,
        clientId,
      }),
      accept: request.accept,
      body:
        request.body === "" || request.body === "{}"
          ? null
          : JSON.parse(request.body),
    };
    // A status must be sent byte for byte as the Ruby action sent it
    if (/\/statuses\//.test(request.path)) normalized.rawBody = request.body;
    return normalized;
  });
}

function normalizeAuthorization(authorization, { publicKey, clientId }) {
  if (!authorization) return null;
  const [scheme, value] = authorization.split(" ");
  if (scheme.toLowerCase() !== "bearer")
    return `${scheme.toLowerCase()} ${value}`;
  // A new JWT is signed for every run, so it is checked, not compared
  return `bearer ${describeJwt(value, { publicKey, clientId })}`;
}

function describeJwt(jwt, { publicKey, clientId }) {
  const [header, payload, signature] = jwt.split(".");
  const decode = (part) =>
    JSON.parse(Buffer.from(part, "base64url").toString());
  const claims = decode(payload);
  const now = Math.floor(Date.now() / 1000);
  const problems = [];
  if (JSON.stringify(decode(header)) !== '{"alg":"RS256"}')
    problems.push("header");
  if (claims.iss !== clientId) problems.push("iss");
  if (claims.exp - claims.iat !== 600) problems.push("lifetime");
  if (Math.abs(now - claims.iat) > 60) problems.push("iat");
  if (Object.keys(claims).join() !== "iat,exp,iss") problems.push("claims");
  const signed = verify(
    "RSA-SHA256",
    Buffer.from(`${header}.${payload}`),
    createPublicKey(publicKey),
    Buffer.from(signature, "base64url"),
  );
  if (!signed) problems.push("signature");
  return problems.length === 0
    ? "<valid app jwt>"
    : `<invalid app jwt: ${problems.join(", ")}>`;
}
