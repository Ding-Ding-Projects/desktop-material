/**
 * Main-process credential snapshot. `accountKey` is optional for consumers
 * that only need an endpoint/token allowlist, but account-sensitive features
 * must require it so multiple users on one GitHub host stay distinct.
 */
export type EndpointToken = {
  endpoint: string
  token: string
  accountKey?: string
}
