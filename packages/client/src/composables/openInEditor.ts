export async function openInEditor(file: string) {
  return trpc.openInEditor.query(file)
}
