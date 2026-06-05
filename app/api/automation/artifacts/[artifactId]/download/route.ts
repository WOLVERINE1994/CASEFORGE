type RouteContext = {
  params: Promise<{ artifactId: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  const { artifactId } = await context.params;
  return Response.json({
    artifactId,
    message:
      "Artefact bytes are stored by the execution worker/object store. This route is the stable download hook for signed URL generation.",
  });
}
