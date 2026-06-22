const windowsInstallerUrl =
  "https://github.com/WOLVERINE1994/CASEFORGE/releases/download/companion-v0.1.42/CaseForge-Companion-Setup-0.1.42.exe";

const osCards = [
  {
    action: "Download Windows installer",
    description:
      "Current supported build for local browser recording on Windows.",
    enabled: true,
    href: windowsInstallerUrl,
    name: "Windows",
    status: "Available",
  },
  {
    action: "Coming soon",
    description:
      "macOS builds need Apple Developer ID signing and notarization before public download.",
    enabled: false,
    href: "",
    name: "macOS",
    status: "Planned",
  },
  {
    action: "Coming soon",
    description:
      "Linux builds need a packaged AppImage, deb, or rpm release before public download.",
    enabled: false,
    href: "",
    name: "Linux",
    status: "Planned",
  },
];

export default function CompanionDownloadPage() {
  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-10 text-white">
      <div className="mx-auto grid max-w-5xl gap-8">
        <section className="grid gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
            CaseForge Companion
          </p>
          <h1 className="max-w-3xl text-3xl font-semibold tracking-tight md:text-5xl">
            Download the browser companion safely
          </h1>
          <p className="max-w-3xl text-sm leading-6 text-zinc-300 md:text-base">
            The Companion connects your local browser to CaseForge for recording and playback.
            Choose the installer for your operating system.
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          {osCards.map((card) => (
            <article
              key={card.name}
              className="grid gap-4 rounded-lg border border-zinc-800 bg-zinc-900 p-5"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-semibold">{card.name}</h2>
                <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-xs font-semibold text-emerald-200">
                  {card.status}
                </span>
              </div>
              <p className="min-h-20 text-sm leading-6 text-zinc-300">{card.description}</p>
              {card.enabled ? (
                <a
                  href={card.href}
                  rel="noreferrer"
                  target="_blank"
                  className="rounded-lg border border-white bg-white px-4 py-2 text-center text-sm font-semibold !text-zinc-950 transition hover:border-emerald-400 hover:bg-zinc-950 hover:!text-white"
                >
                  {card.action}
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-500"
                >
                  {card.action}
                </button>
              )}
            </article>
          ))}
        </section>

        <section className="rounded-lg border border-sky-400/30 bg-sky-400/10 p-5">
          <h2 className="text-lg font-semibold text-sky-100">Private GitHub Download</h2>
          <p className="mt-2 text-sm leading-6 text-sky-50/90">
            The Windows installer is hosted in the private CaseForge GitHub release. If GitHub asks,
            sign in with an account that can access the repository, then the installer download will continue.
          </p>
        </section>

        <section className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-5">
          <h2 className="text-lg font-semibold text-amber-100">Windows SmartScreen Notice</h2>
          <p className="mt-2 text-sm leading-6 text-amber-50/90">
            The current Windows installer is an unsigned preview build. Windows may show
            "Windows protected your PC" until the installer is signed with a trusted code-signing
            certificate and gains reputation. For production distribution, CaseForge should use
            an OV or EV code-signing certificate for Windows, Apple Developer ID signing and
            notarization for macOS, and signed packages/checksums for Linux.
          </p>
        </section>
      </div>
    </main>
  );
}
