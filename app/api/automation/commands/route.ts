import { AUTOMATION_COMMAND_CATALOG } from "../../../../utils/automation/language-core";

export async function GET() {
  const byDomain = AUTOMATION_COMMAND_CATALOG.reduce<Record<string, typeof AUTOMATION_COMMAND_CATALOG>>(
    (groups, command) => ({
      ...groups,
      [command.domain]: [...(groups[command.domain] ?? []), command],
    }),
    {},
  );

  return Response.json({
    commands: AUTOMATION_COMMAND_CATALOG,
    domains: Object.entries(byDomain).map(([domain, commands]) => ({
      commands,
      domain,
      executableCount: commands.filter((command) => command.executable).length,
      totalCount: commands.length,
    })),
  });
}
