const owner = "WOLVERINE1994";
const repo = "CASEFORGE";
const version = "0.1.31";
const tag = `companion-v${version}`;
const assetName = `CaseForge-Companion-Setup-${version}.exe`;

function githubHeaders(accept: string) {
  const token = process.env.CASEFORGE_GITHUB_DOWNLOAD_TOKEN || process.env.GITHUB_TOKEN || "";
  return {
    Accept: accept,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

export async function GET() {
  const releaseResponse = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/releases/tags/${tag}`,
    {
      cache: "no-store",
      headers: githubHeaders("application/vnd.github+json"),
    },
  );

  if (!releaseResponse.ok) {
    return Response.json(
      {
        error:
          releaseResponse.status === 404
            ? "Companion installer release was not found or is private. Configure CASEFORGE_GITHUB_DOWNLOAD_TOKEN on Vercel, or publish the release asset publicly."
            : "Could not find the Companion installer release.",
        status: releaseResponse.status,
      },
      { status: releaseResponse.status === 404 ? 404 : 502 },
    );
  }

  const release = (await releaseResponse.json()) as {
    assets?: Array<{
      content_type?: string;
      name?: string;
      size?: number;
      url?: string;
    }>;
  };
  const asset =
    release.assets?.find((item) => item.name === assetName) ??
    release.assets?.find((item) => item.name?.endsWith(".exe"));

  if (!asset?.url) {
    return Response.json(
      {
        error: `Companion installer asset was not found on ${tag}. Expected ${assetName}.`,
      },
      { status: 404 },
    );
  }

  const assetResponse = await fetch(asset.url, {
    cache: "no-store",
    headers: githubHeaders("application/octet-stream"),
  });

  if (!assetResponse.ok || !assetResponse.body) {
    return Response.json(
      {
        error: "Could not download the Companion installer asset from GitHub.",
        status: assetResponse.status,
      },
      { status: assetResponse.status === 404 ? 404 : 502 },
    );
  }

  const headers = new Headers({
    "Cache-Control": "no-store",
    "Content-Disposition": `attachment; filename="${assetName}"`,
    "Content-Type": asset.content_type || "application/octet-stream",
  });
  const contentLength = asset.size || assetResponse.headers.get("content-length");
  if (contentLength) headers.set("Content-Length", String(contentLength));

  return new Response(assetResponse.body, {
    headers,
    status: 200,
  });
}
