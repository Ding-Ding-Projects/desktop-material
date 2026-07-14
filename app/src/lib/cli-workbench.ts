/** Executables used internally by named workbench operations. */
export type CLIWorkbenchTool = 'git' | 'gh'

export type RepositoryToolOperationID =
  | 'status-summary'
  | 'repository-health'
  | 'maintenance-preview'
  | 'maintenance-run'
  | 'reflog-view'
  | 'signature-audit'

export type RepositoryArchiveFormat = 'zip' | 'tar'

/**
 * The renderer may request only named operations with bounded fields. It
 * never supplies an executable, argv, refspec, or Git global option.
 */
export type CLIWorkbenchOperation =
  | { readonly id: RepositoryToolOperationID }
  | {
      readonly id: 'archive-export'
      readonly format: RepositoryArchiveFormat
      readonly destination: string
    }
  | { readonly id: 'bundle-export'; readonly destination: string }
  | { readonly id: 'bundle-verify'; readonly bundlePath: string }
  | { readonly id: 'bundle-list-heads'; readonly bundlePath: string }
  | {
      readonly id: 'bundle-import-validate-destination'
      readonly branchName: string
    }
  | {
      readonly id: 'bundle-import-check-destination'
      readonly branchName: string
    }
  | {
      readonly id: 'bundle-import-fetch-objects'
      readonly bundlePath: string
      readonly sourceRef: string
    }
  | {
      readonly id: 'bundle-import-validate-commit'
      readonly oid: string
    }
  | {
      readonly id: 'bundle-import-create-branch'
      readonly branchName: string
      readonly oid: string
    }
  | { readonly id: 'shallow-history-status' }
  | { readonly id: 'fetch-remote-list' }
  | {
      readonly id: 'history-deepen'
      readonly remote: string
      readonly deepenBy: number
    }
  | { readonly id: 'history-unshallow'; readonly remote: string }

export interface ICLIWorkbenchOperationRequest {
  readonly id: string
  readonly operation: CLIWorkbenchOperation
  readonly repositoryPath: string
  /** Set only after the user confirms an operation that requires review. */
  readonly confirmed?: boolean
}

export interface ICLICommandOutputEvent {
  readonly id: string
  readonly stream: 'stdout' | 'stderr'
  readonly data: string
}

export interface ICLICommandStateEvent {
  readonly id: string
  readonly state: 'running' | 'completed' | 'cancelled' | 'failed'
  readonly exitCode: number | null
  readonly signal: string | null
  readonly error?: string
}

export interface ICLICommandCatalogEntry {
  readonly tool: CLIWorkbenchTool
  readonly command: string
  readonly summary: string
  readonly category: string
}

/** Runtime availability exposed to named-function surfaces. */
export interface ICLIWorkbenchToolRuntime {
  readonly tool: CLIWorkbenchTool
  readonly available: boolean
  readonly version: string | null
  readonly error: string | null
}

export interface ICLIWorkbenchRuntime {
  readonly tools: ReadonlyArray<ICLIWorkbenchToolRuntime>
}

/** Internal command inventory retained for implementation coverage audits. */
export interface ICLIWorkbenchToolCatalog extends ICLIWorkbenchToolRuntime {
  readonly entries: ReadonlyArray<ICLICommandCatalogEntry>
}

export interface ICLIWorkbenchCatalog {
  readonly tools: ReadonlyArray<ICLIWorkbenchToolCatalog>
  readonly entries: ReadonlyArray<ICLICommandCatalogEntry>
}
