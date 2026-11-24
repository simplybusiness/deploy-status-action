import { createPrivateKey, sign } from "node:crypto";

const TEN_MINUTES = 600; // seconds

const encode = (value) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

// The JWT that identifies the GitHub App, as the jwt gem built it
export function createAppJwt(
  clientId,
  privateKey,
  now = Math.floor(Date.now() / 1000),
) {
  let key;
  try {
    key = createPrivateKey(privateKey);
  } catch (error) {
    // What the Ruby action printed for a key OpenSSL could not read
    throw new Error("Neither PUB key nor PRIV key", { cause: error });
  }
  const unsigned = `${encode({ alg: "RS256" })}.${encode({ iat: now, exp: now + TEN_MINUTES, iss: clientId })}`;
  const signature = sign("RSA-SHA256", Buffer.from(unsigned), key);
  return `${unsigned}.${signature.toString("base64url")}`;
}
