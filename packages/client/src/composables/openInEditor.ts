export async function openInEditor(file: string) {
  if (file !== 'node_modules')
    return trpc.openInEditor.query(file)
}
