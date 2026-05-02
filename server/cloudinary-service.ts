import path from "path";
import fs from "fs";
import { randomBytes } from "crypto";
import sharp from "sharp";

const IMAGES_DIR = path.join(process.cwd(), "public", "images");

if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

function getLocalPath(filename: string): string {
  return path.join(IMAGES_DIR, filename);
}

function urlToFilePath(url: string): string | null {
  if (!url) return null;
  const prefix = "/images/";
  const idx = url.indexOf(prefix);
  if (idx === -1) return null;
  const filename = url.slice(idx + prefix.length);
  return path.join(IMAGES_DIR, filename);
}

export function deleteLocalImage(url: string): void {
  if (!url) return;
  const filePath = urlToFilePath(url);
  if (filePath && fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
      console.log(`[LocalStorage] Deleted old image: ${filePath}`);
    } catch (err) {
      console.error(`[LocalStorage] Failed to delete old image: ${filePath}`, err);
    }
  }
}

export function deleteLocalImages(urls: (string | undefined | null)[]): void {
  for (const url of urls) {
    if (url) deleteLocalImage(url);
  }
}

export function extractProductImageUrls(product: any): string[] {
  const urls: string[] = [];
  if (Array.isArray(product.images)) {
    for (const img of product.images) {
      if (typeof img === "string" && img.startsWith("/images/")) urls.push(img);
    }
  }
  if (Array.isArray(product.colorVariants)) {
    for (const variant of product.colorVariants) {
      if (Array.isArray(variant.images)) {
        for (const img of variant.images) {
          if (typeof img === "string" && img.startsWith("/images/")) urls.push(img);
        }
      }
    }
  }
  return urls;
}

export function extractCategoryImageUrls(category: any): string[] {
  const urls: string[] = [];
  if (typeof category.image === "string" && category.image.startsWith("/images/")) {
    urls.push(category.image);
  }
  if (Array.isArray(category.subCategories)) {
    for (const sub of category.subCategories) {
      if (typeof sub.image === "string" && sub.image.startsWith("/images/")) {
        urls.push(sub.image);
      }
    }
  }
  return urls;
}

async function compressImage(buffer: Buffer, originalName: string): Promise<{ buffer: Buffer; ext: string }> {
  const TARGET_MIN = 600 * 1024;  // 600 KB
  const TARGET_MAX = 1024 * 1024; // 1 MB
  const originalSizeKB = (buffer.length / 1024).toFixed(1);

  // Always output as JPEG for consistent compression
  const ext = ".jpg";

  // Already within 600KB–1MB: keep as-is
  if (buffer.length >= TARGET_MIN && buffer.length <= TARGET_MAX) {
    console.log(`[Compress] ${originalName} — ${originalSizeKB} KB already in target range, keeping as-is`);
    return { buffer, ext };
  }

  // Under 600KB: keep as-is (never upscale/inflate)
  if (buffer.length < TARGET_MIN) {
    console.log(`[Compress] ${originalName} — ${originalSizeKB} KB (under 600 KB, keeping as-is)`);
    return { buffer, ext };
  }

  // Over 1MB: compress to target range using quality reduction only (no resize, preserves pixel count)
  // We use standard JPEG (no mozjpeg) to avoid overshooting compression
  const qualityOnlyLevels = [85, 82, 78, 75];
  for (const quality of qualityOnlyLevels) {
    const compressed = await sharp(buffer)
      .rotate()
      .jpeg({ quality })
      .toBuffer();
    const kb = (compressed.length / 1024).toFixed(0);
    console.log(`[Compress] ${originalName} — quality ${quality} (full-res) → ${kb} KB`);
    if (compressed.length >= TARGET_MIN && compressed.length <= TARGET_MAX) {
      console.log(`[Compress] ✓ ${originalName} — saved at ${kb} KB (quality ${quality}, full resolution)`);
      return { buffer: compressed, ext };
    }
    // If we already dropped below target min, don't go lower quality — use previous result
    if (compressed.length < TARGET_MIN) {
      // Previous quality was too aggressive; use this one since it's the first under 1MB
      console.log(`[Compress] ✓ ${originalName} — saved at ${kb} KB (quality ${quality}, full resolution, slightly under 600 KB)`);
      return { buffer: compressed, ext };
    }
  }

  // Still over 1MB after quality reduction: try resizing (larger dimensions first to preserve quality)
  // Strategy: maintain quality 85, reduce width progressively until we hit 600KB–1MB
  const metadata = await sharp(buffer).metadata();
  const originalWidth = metadata.width || 4000;

  const resizeSteps = [
    { maxWidth: 3000, quality: 85 },
    { maxWidth: 2560, quality: 85 },
    { maxWidth: 2048, quality: 85 },
    { maxWidth: 1920, quality: 85 },
    { maxWidth: 1600, quality: 85 },
  ];

  for (const { maxWidth, quality } of resizeSteps) {
    if (originalWidth <= maxWidth) continue; // No point resizing to larger
    const resized = await sharp(buffer)
      .rotate()
      .resize({ width: maxWidth, withoutEnlargement: true })
      .jpeg({ quality })
      .toBuffer();
    const kb = (resized.length / 1024).toFixed(0);
    console.log(`[Compress] ${originalName} — resize to ${maxWidth}px q${quality} → ${kb} KB`);
    if (resized.length <= TARGET_MAX) {
      console.log(`[Compress] ✓ ${originalName} — saved at ${kb} KB (${maxWidth}px, quality ${quality})`);
      return { buffer: resized, ext };
    }
  }

  // Final fallback: 1600px quality 80 — covers extreme cases
  const fallback = await sharp(buffer)
    .rotate()
    .resize({ width: 1600, withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
  const kb = (fallback.length / 1024).toFixed(0);
  console.log(`[Compress] ✓ ${originalName} — fallback saved at ${kb} KB (1600px, quality 80)`);
  return { buffer: fallback, ext };
}

export async function saveImageLocally(
  buffer: Buffer,
  originalName: string,
  oldUrl?: string,
): Promise<string> {
  if (oldUrl) {
    deleteLocalImage(oldUrl);
  }

  const { buffer: compressedBuffer, ext } = await compressImage(buffer, originalName);

  const filename = randomBytes(16).toString("hex") + ext;
  const destPath = getLocalPath(filename);

  fs.writeFileSync(destPath, compressedBuffer);

  const sizeKB = (compressedBuffer.length / 1024).toFixed(0);
  const sizeMB = (compressedBuffer.length / 1024 / 1024).toFixed(2);
  console.log(`[LocalStorage] Saved: ${filename} — ${sizeKB} KB (${sizeMB} MB)`);

  return `/images/${filename}`;
}

export default {};
