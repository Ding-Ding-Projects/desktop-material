export type EndpointToken = {
  endpoint: string
  token: string
  /** Stable identity for main-process consumers that must select one account. */
  accountKey?: string
}
