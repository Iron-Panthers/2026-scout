// Animated GIFs keep decoding and repainting every frame, which adds up fast
// when hundreds are on screen (the manager assignment grid). This grabs one
// still frame per URL, scaled down, and shares it between every avatar using it.

const MAX_SIZE = 96;
const frames = new Map<string, Promise<string | null>>();

export function isAnimatedImage(url: string): boolean {
  return /\.gif(\?|#|$)/i.test(url);
}

/** A small PNG data URL of the image's first frame, or null if it can't be drawn. */
export function getStaticFrame(url: string): Promise<string | null> {
  let frame = frames.get(url);
  if (!frame) {
    frame = new Promise((resolve) => {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => {
        try {
          const scale = Math.min(1, MAX_SIZE / Math.max(image.naturalWidth, image.naturalHeight));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
          canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/png"));
        } catch {
          resolve(null); // cross-origin image without CORS: can't read it back
        }
      };
      image.onerror = () => resolve(null);
      image.src = url;
    });
    frames.set(url, frame);
  }
  return frame;
}
