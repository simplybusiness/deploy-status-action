import { generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it } from "@jest/globals";
import { createAppJwt } from "./appJwt.js";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const pem = (type) => privateKey.export({ type, format: "pem" });
const decode = (part) => JSON.parse(Buffer.from(part, "base64url").toString());

describe("createAppJwt", () => {
  it("has the header and claims the Ruby action sent", () => {
    const [header, payload] = createAppJwt(
      "client-id",
      pem("pkcs1"),
      1_700_000_000,
    ).split(".");

    expect(Buffer.from(header, "base64url").toString()).toBe('{"alg":"RS256"}');
    expect(Buffer.from(payload, "base64url").toString()).toBe(
      '{"iat":1700000000,"exp":1700000600,"iss":"client-id"}',
    );
  });

  it("is signed with the private key", () => {
    const [header, payload, signature] = createAppJwt(
      "client-id",
      pem("pkcs1"),
    ).split(".");

    expect(
      verify(
        "RSA-SHA256",
        Buffer.from(`${header}.${payload}`),
        publicKey,
        Buffer.from(signature, "base64url"),
      ),
    ).toBe(true);
  });

  it("is issued now and expires in ten minutes", () => {
    const before = Math.floor(Date.now() / 1000);

    const claims = decode(
      createAppJwt("client-id", pem("pkcs1")).split(".")[1],
    );

    expect(claims.iat).toBeGreaterThanOrEqual(before);
    expect(claims.iat).toBeLessThanOrEqual(Math.floor(Date.now() / 1000));
    expect(claims.exp - claims.iat).toBe(600);
  });

  it("accepts a key in PKCS#8 form", () => {
    expect(createAppJwt("client-id", pem("pkcs8")).split(".")).toHaveLength(3);
  });

  it.each(["", "not-a-private-key", pem("pkcs1").replaceAll("\n", "\\n")])(
    "throws, in Ruby's words, for a key that cannot be read: %#",
    (key) => {
      expect(() => createAppJwt("client-id", key)).toThrow(
        "Neither PUB key nor PRIV key",
      );
    },
  );

  it("keeps the reason a key could not be read", () => {
    let thrown;
    try {
      createAppJwt("client-id", "not-a-private-key");
    } catch (error) {
      thrown = error;
    }

    expect(thrown.cause).toBeDefined();
  });
});
