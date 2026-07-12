import { ICustomIntegration } from '../lib/custom-integration'

/** Per-repository editor choice. Null on Repository means use global settings. */
export type EditorOverride = {
  readonly selectedExternalEditor: string | null
  readonly useCustomEditor: boolean
  readonly customEditor: ICustomIntegration | null
}

export function getEditorOverrideLabel(
  editorOverride: EditorOverride
): string | undefined {
  return editorOverride.useCustomEditor
    ? undefined
    : editorOverride.selectedExternalEditor ?? undefined
}

export function getEditorOverrideHash(
  editorOverride: EditorOverride | null
): string | null {
  if (editorOverride === null) {
    return null
  }
  return [
    editorOverride.selectedExternalEditor,
    editorOverride.useCustomEditor,
    editorOverride.customEditor?.path,
    editorOverride.customEditor?.bundleID,
    editorOverride.customEditor?.arguments,
  ].join('|')
}
