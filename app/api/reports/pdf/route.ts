import { chromium } from "playwright";

export async function POST(req: Request) {
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;

  try {
    const body = await req.json();
    const html = typeof body?.html === "string" ? body.html : "";
    const filename =
      typeof body?.filename === "string" && body.filename.trim()
        ? body.filename.trim()
        : "execution-report.pdf";

    if (!html.trim()) {
      return Response.json({ error: "HTML content is required." }, { status: 400 });
    }

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.emulateMedia({ media: "screen" });
    await page.setContent(html, { waitUntil: "load" });

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "16mm",
        right: "12mm",
        bottom: "16mm",
        left: "12mm",
      },
    });

    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
      },
    });
  } catch (error) {
    console.error("EXECUTION REPORT PDF ERROR:", error);
    return Response.json(
      {
        error:
          error instanceof Error && error.message.trim()
            ? error.message
            : "Failed to generate PDF report.",
      },
      { status: 500 }
    );
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
