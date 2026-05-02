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

async function compressImage(buffer: Buffer, originalName: string): Promise<{ buffer: Buffer; ext: string; method: string }> {
  const TARGET_MIN = 600 * 1024;  // 600 KB
  const TARGET_MAX = 1024 * 1024; // 1 MB
  const ext = ".jpg";

  // Already within 600KB–1MB: keep as-is
  if (buffer.length >= TARGET_MIN && buffer.length <= TARGET_MAX) {
    return { buffer, ext, method: "no compression needed (already in 600 KB–1 MB range)" };
  }

  // Under 600KB: keep as-is (never upscale/inflate)
  if (buffer.length < TARGET_MIN) {
    return { buffer, ext, method: "no compression needed (under 600 KB)" };
  }

  // Over 1MB: try quality reduction first (full resolution preserved)
  const qualityOnlyLevels = [85, 82, 78, 75];
  for (const quality of qualityOnlyLevels) {
    const compressed = await sharp(buffer)
      .rotate()
      .jpeg({ quality })
      .toBuffer();
    if (compressed.length >= TARGET_MIN && compressed.length <= TARGET_MAX) {
      return { buffer: compressed, ext, method: `quality reduction → q${quality} (full resolution)` };
    }
    if (compressed.length < TARGET_MIN) {
      return { buffer: compressed, ext, method: `quality reduction → q${quality} (full resolution, slightly under 600 KB)` };
    }
  }

  // Still over 1MB: try resizing progressively
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
    if (originalWidth <= maxWidth) continue;
    const resized = await sharp(buffer)
      .rotate()
      .resize({ width: maxWidth, withoutEnlargement: true })
      .jpeg({ quality })
      .toBuffer();
    if (resized.length <= TARGET_MAX) {
      return { buffer: resized, ext, method: `resize to ${maxWidth}px + q${quality}` };
    }
  }

  // Final fallback
  const fallback = await sharp(buffer)
    .rotate()
    .resize({ width: 1600, withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
  return { buffer: fallback, ext, method: "fallback resize to 1600px + q80" };
}

export async function saveImageLocally(
  buffer: Buffer,
  originalName: string,
  oldUrl?: string,
): Promise<string> {
  const incomingKB  = (buffer.length / 1024).toFixed(1);
  const incomingMB  = (buffer.length / 1024 / 1024).toFixed(2);

  console.log(`\n┌─ [Image Upload] ──────────────────────────────`);
  console.log(`│  File        : ${originalName}`);
  console.log(`│  Received    : ${incomingMB} MB (${incomingKB} KB)`);
  console.log(`│  Upload limit: 100 MB  |  Compress target: ≤ 1 MB`);

  if (oldUrl) {
    console.log(`│  Replacing   : ${oldUrl}`);
    deleteLocalImage(oldUrl);
  }

  const { buffer: compressedBuffer, ext, method } = await compressImage(buffer, originalName);

  const finalKB = (compressedBuffer.length / 1024).toFixed(1);
  const finalMB = (compressedBuffer.length / 1024 / 1024).toFixed(2);
  const saving  = (((buffer.length - compressedBuffer.length) / buffer.length) * 100).toFixed(1);

  const filename = randomBytes(16).toString("hex") + ext;
  const destPath = getLocalPath(filename);
  fs.writeFileSync(destPath, compressedBuffer);

  console.log(`│  Compression : ${method}`);
  console.log(`│  Before → After: ${incomingMB} MB → ${finalMB} MB (${finalKB} KB)  [saved ${saving}%]`);
  console.log(`│  Saved as    : /images/${filename}`);
  console.log(`└───────────────────────────────────────────────\n`);

  return `/images/${filename}`;
}

export default {};
