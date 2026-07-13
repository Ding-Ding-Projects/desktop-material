export type CLIAction =
  | {
      readonly kind: 'open-repository'
      readonly path: string
      /** False for a secondary window so global last-selection is unchanged. */
      readonly persistSelection?: boolean
    }
  | {
      readonly kind: 'clone-url'
      readonly url: string
      readonly branch?: string
    }
