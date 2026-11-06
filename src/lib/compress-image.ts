/**
 * Shrinks a photo in the browser before upload (servers reject large request bodies).
 * Returns the original file if it isn't an image the browser can decode, or is already small.
 */
export const UPLOAD_BUDGET_BYTES = 4 * 1024 * 1024; // keep each request under the host's ~4.5 MB limit

export async function compressImage(file: File, maxDim = 2400, quality = 0.85, skipUnder = 1_200_000): Promise<File> {
  const isImage = file.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
  if (!isImage || file.type === "image/gif") return file;
  if (file.size <= skipUnder && !/heic|heif/i.test(file.type + file.name)) return file;
  try {
    const url = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = url;
    });
    URL.revokeObjectURL(url);
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale)), h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
    if (!blob || (blob.size >= file.size && !/heic|heif/i.test(file.type + file.name))) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  }
}

export function setInputFiles(input: HTMLInputElement | null, files: File[]) {
  if (!input) return;
  const dt = new DataTransfer();
  files.forEach((f) => dt.items.add(f));
  input.files = dt.files;
}
