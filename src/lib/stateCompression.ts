import LZString from "lz-string";

/**
 * Compress and encode state for URL/QR code
 * Uses LZ compression + base64url encoding for smaller QR codes
 */
export function compressState(state: any): string {
  try {
    const json = JSON.stringify(state);
    const compressed = LZString.compressToEncodedURIComponent(json);
    return compressed;
  } catch (error) {
    console.error("Failed to compress state:", error);
    throw error;
  }
}

/**
 * Decompress and decode state from URL/QR code
 */
export function decompressState(compressed: string): any {
  try {
    const json = LZString.decompressFromEncodedURIComponent(compressed);
    if (!json) {
      throw new Error("Decompression failed - invalid data");
    }
    return JSON.parse(json);
  } catch (error) {
    console.error("Failed to decompress state:", error);
    throw error;
  }
}

/**
 * Legacy base64url decoder for backwards compatibility
 * Try to decode old-format URLs that don't use compression
 */
export function decodeLegacyBase64Url(encoded: string): any {
  try {
    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      Array.prototype.map
        .call(
          atob(base64),
          (c: string) => `%${("00" + c.charCodeAt(0).toString(16)).slice(-2)}`
        )
        .join("")
    );
    return JSON.parse(json);
  } catch (error) {
    console.error("Failed to decode legacy base64url:", error);
    throw error;
  }
}
