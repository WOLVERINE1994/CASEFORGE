const windowsInstallerUrl =
  "https://github.com/WOLVERINE1994/CASEFORGE/releases/download/companion-v0.1.38/CaseForge-Companion-Setup-0.1.38.exe";

export function GET() {
  return Response.redirect(windowsInstallerUrl, 302);
}
