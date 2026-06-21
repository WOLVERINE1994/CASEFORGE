const windowsInstallerUrl =
  "https://github.com/WOLVERINE1994/CASEFORGE/releases/download/companion-v0.1.41/CaseForge-Companion-Setup-0.1.41.exe";

export function GET() {
  return Response.redirect(windowsInstallerUrl, 302);
}
