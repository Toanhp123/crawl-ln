export async function runSourcePluginStudioClose({
  flush,
  close
}: {
  flush: () => Promise<unknown>;
  close: () => void;
}) {
  await flush();
  close();
}
