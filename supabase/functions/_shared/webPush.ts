/**
 * Manual Web Push implementation for Deno
 * Implements the Web Push Protocol without relying on the web-push npm package
 *
 * Based on the Web Push Protocol specification:
 * https://datatracker.ietf.org/doc/html/rfc8030
 * https://datatracker.ietf.org/doc/html/rfc8291 (Message Encryption)
 * https://datatracker.ietf.org/doc/html/rfc8292 (VAPID)
 */

interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

interface VapidKeys {
  subject: string;
  publicKey: string;
  privateKey: string;
}

/**
 * Send a web push notification using native Deno APIs
 */
export async function sendWebPush(
  subscription: PushSubscription,
  payload: string,
  vapidKeys: VapidKeys
): Promise<void> {
  const { endpoint, keys } = subscription;
  const { p256dh, auth } = keys;

  // Parse the endpoint to extract the push service details
  const url = new URL(endpoint);

  // Generate VAPID authorization header
  const vapidHeader = await generateVapidHeaders(
    url.origin,
    vapidKeys.subject,
    vapidKeys.publicKey,
    vapidKeys.privateKey
  );

  // Encrypt the payload
  const encryptedPayload = await encryptPayload(
    payload,
    p256dh,
    auth
  );

  // Send the push notification
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      "Authorization": vapidHeader.authorization,
      "Crypto-Key": vapidHeader.cryptoKey,
      TTL: "86400", // 24 hours
    },
    body: encryptedPayload,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Push notification failed: ${response.status} ${response.statusText} - ${text}`
    );
  }
}

/**
 * Generate VAPID authorization headers
 */
async function generateVapidHeaders(
  audience: string,
  subject: string,
  publicKey: string,
  privateKey: string
): Promise<{ authorization: string; cryptoKey: string }> {
  // Create JWT claims
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 12 * 60 * 60; // 12 hours from now

  const claims = {
    aud: audience,
    exp,
    sub: subject,
  };

  // Create JWT header
  const header = {
    typ: "JWT",
    alg: "ES256",
  };

  // Encode header and payload
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedClaims = base64UrlEncode(JSON.stringify(claims));
  const unsignedToken = `${encodedHeader}.${encodedClaims}`;

  // Sign the JWT
  const signature = await signJWT(unsignedToken, privateKey);
  const jwt = `${unsignedToken}.${signature}`;

  return {
    authorization: `vapid t=${jwt}, k=${publicKey}`,
    cryptoKey: `p256ecdsa=${publicKey}`,
  };
}

/**
 * Sign a JWT using ES256 (ECDSA with P-256 and SHA-256)
 */
async function signJWT(data: string, privateKeyBase64: string): Promise<string> {
  // Import the private key
  const privateKeyBuffer = base64UrlDecode(privateKeyBase64);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    privateKeyBuffer,
    {
      name: "ECDSA",
      namedCurve: "P-256",
    },
    false,
    ["sign"]
  );

  // Sign the data
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);

  const signature = await crypto.subtle.sign(
    {
      name: "ECDSA",
      hash: { name: "SHA-256" },
    },
    cryptoKey,
    dataBuffer
  );

  // Convert signature to base64url
  return base64UrlEncode(new Uint8Array(signature));
}

/**
 * Encrypt the payload using aes128gcm
 */
async function encryptPayload(
  payload: string,
  p256dhBase64: string,
  authBase64: string
): Promise<Uint8Array> {
  // For now, we'll use a simplified implementation
  // This is a placeholder - full implementation requires:
  // 1. ECDH key agreement
  // 2. HKDF key derivation
  // 3. AES-128-GCM encryption

  // TODO: Implement full Web Push encryption
  // For testing, we'll just return the raw payload
  const encoder = new TextEncoder();
  return encoder.encode(payload);
}

/**
 * Base64 URL encode (RFC 4648 §5)
 */
function base64UrlEncode(data: string | Uint8Array): string {
  let base64: string;

  if (typeof data === "string") {
    // For strings, use btoa
    base64 = btoa(data);
  } else {
    // For Uint8Array, convert to binary string first
    const binaryString = String.fromCharCode(...data);
    base64 = btoa(binaryString);
  }

  return base64
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/**
 * Base64 URL decode
 */
function base64UrlDecode(base64url: string): Uint8Array {
  // Add padding
  const padding = "=".repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  // Decode
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}
