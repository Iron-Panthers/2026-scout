import { supabase } from "./supabase";

/**
 * Compress an image file using canvas API
 * @param file - The image file to compress
 * @param maxWidth - Maximum width in pixels (default 1920)
 * @param maxHeight - Maximum height in pixels (default 1080)
 * @param quality - JPEG quality 0-1 (default 0.8)
 * @returns Compressed file
 */
export async function compressImage(
  file: File,
  maxWidth = 1920,
  maxHeight = 1080,
  quality = 0.8
): Promise<File> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        // Calculate new dimensions while maintaining aspect ratio
        if (width > height) {
          if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = (width * maxHeight) / height;
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Failed to get canvas context"));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Failed to compress image"));
              return;
            }

            const compressedFile = new File([blob], file.name, {
              type: "image/jpeg",
              lastModified: Date.now(),
            });

            resolve(compressedFile);
          },
          "image/jpeg",
          quality
        );
      };
      img.onerror = () => reject(new Error("Failed to load image"));
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
  });
}

/**
 * Upload a pit scouting photo to Supabase Storage
 * @param file - The image file to upload
 * @param userId - The user's ID (for path organization)
 * @param eventCode - The event code
 * @param teamNum - The team number
 * @returns Object with storage path and public URL
 */
export async function uploadPitPhoto(
  file: File,
  userId: string,
  eventCode: string,
  teamNum: number
): Promise<{ path: string; publicUrl: string }> {
  // Validate file
  if (!file.type.startsWith("image/")) {
    throw new Error("File must be an image");
  }

  const maxSize = 5 * 1024 * 1024; // 5MB
  if (file.size > maxSize) {
    throw new Error("File size must be less than 5MB");
  }

  // Compress if larger than 1MB
  let uploadFile = file;
  if (file.size > 1024 * 1024) {
    try {
      uploadFile = await compressImage(file);
    } catch (error) {
      console.warn("Failed to compress image, uploading original:", error);
      uploadFile = file;
    }
  }

  // Create storage path: eventCode/teamNum/timestamp.jpg
  const timestamp = Date.now();
  const extension = "jpg"; // Always use jpg after compression
  const filename = `${timestamp}.${extension}`;
  const path = `${eventCode}/${teamNum}/${filename}`;

  // Upload to Supabase Storage
  const { data, error } = await supabase.storage
    .from("pit-scouting-photos")
    .upload(path, uploadFile, {
      contentType: "image/jpeg",
      upsert: false,
    });

  if (error) {
    throw new Error(`Failed to upload photo: ${error.message}`);
  }

  // Get public URL
  const {
    data: { publicUrl },
  } = supabase.storage.from("pit-scouting-photos").getPublicUrl(data.path);

  return { path: data.path, publicUrl };
}

/**
 * Delete a pit scouting photo from Supabase Storage
 * @param path - The storage path to delete
 */
export async function deletePitPhoto(path: string): Promise<void> {
  const { error } = await supabase.storage
    .from("pit-scouting-photos")
    .remove([path]);

  if (error) {
    throw new Error(`Failed to delete photo: ${error.message}`);
  }
}

/**
 * Convert a File to a data URL (base64) for offline storage
 * @param file - The file to convert
 * @returns Data URL string
 */
export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
  });
}

/**
 * Convert a data URL (base64) back to a File
 * @param dataUrl - The data URL to convert
 * @param filename - The filename for the created file
 * @returns File object
 */
export function dataUrlToFile(dataUrl: string, filename: string): File {
  const arr = dataUrl.split(",");
  const mime = arr[0].match(/:(.*?);/)?.[1] || "image/jpeg";
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);

  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }

  return new File([u8arr], filename, { type: mime });
}
