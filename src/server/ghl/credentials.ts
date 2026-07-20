import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { env } from "~/env";

export interface EncryptedGhlToken {
  encryptedToken: string;
  tokenIv: string;
  tokenAuthTag: string;
  tokenLastFour: string;
}

function encryptionKey() {
  const key = Buffer.from(env.GHL_CREDENTIALS_ENCRYPTION_KEY, "base64");
  if (key.length !== 32)
    throw new Error("Invalid GHL credential encryption key");
  return key;
}

function additionalData(clientId: string, locationId: string) {
  return Buffer.from(`agency-os:ghl:${clientId}:${locationId}`, "utf8");
}

export function encryptGhlToken(input: {
  clientId: string;
  locationId: string;
  token: string;
}): EncryptedGhlToken {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(additionalData(input.clientId, input.locationId));
  const encrypted = Buffer.concat([
    cipher.update(input.token, "utf8"),
    cipher.final(),
  ]);
  return {
    encryptedToken: encrypted.toString("base64"),
    tokenIv: iv.toString("base64"),
    tokenAuthTag: cipher.getAuthTag().toString("base64"),
    tokenLastFour: input.token.slice(-4),
  };
}

export function decryptGhlToken(input: {
  clientId: string;
  locationId: string;
  encryptedToken: string;
  tokenIv: string;
  tokenAuthTag: string;
}) {
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      Buffer.from(input.tokenIv, "base64"),
    );
    decipher.setAAD(additionalData(input.clientId, input.locationId));
    decipher.setAuthTag(Buffer.from(input.tokenAuthTag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(input.encryptedToken, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch (error) {
    throw new Error("Stored GHL credential could not be decrypted", {
      cause: error,
    });
  }
}
