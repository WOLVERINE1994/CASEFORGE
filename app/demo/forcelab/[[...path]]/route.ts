import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

const distRoot = path.join(process.cwd(), "forcelab-demo-dist");

type RouteContext = {
  params: Promise<{ path?: string[] }>;
};

function mimeTypeForPath(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".html") return "text/html; charset=utf-8";
  if (extension === ".js") return "text/javascript; charset=utf-8";
  if (extension === ".css") return "text/css; charset=utf-8";
  if (extension === ".svg") return "image/svg+xml";
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  if (extension === ".ico") return "image/x-icon";
  if (extension === ".txt") return "text/plain; charset=utf-8";
  return "application/octet-stream";
}

async function isFile(filePath: string) {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

function safeDistPath(segments: string[]) {
  const relativePath = segments.join("/");
  if (!relativePath || relativePath.includes("\0")) return null;

  const filePath = path.resolve(distRoot, relativePath);
  const rootWithSeparator = `${distRoot}${path.sep}`;
  if (filePath !== distRoot && !filePath.startsWith(rootWithSeparator)) {
    return null;
  }
  return filePath;
}

export async function GET(_: Request, context: RouteContext) {
  const { path: requestedPath = [] } = await context.params;
  const filePath = safeDistPath(requestedPath);
  const resolvedFilePath = filePath && (await isFile(filePath))
    ? filePath
    : path.join(distRoot, "index.html");
  const body = await readFile(resolvedFilePath);

  return new NextResponse(body, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": mimeTypeForPath(resolvedFilePath),
    },
  });
}
