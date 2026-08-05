/**
 * The 1.0.8 release of `@github/copilot-sdk` ships generated declaration
 * unions with four names that are absent from the published package. The next
 * upstream preview removes these stale protocol members, so model them as
 * `never` while 1.0.8 remains pinned instead of disabling declaration checks
 * for every dependency.
 */
import '@github/copilot-sdk/dist/generated/rpc'
import '@github/copilot-sdk/dist/generated/session-events'

declare module '@github/copilot-sdk/dist/generated/rpc' {
  type HookInvokeRequest = never
  type HookInvokeResponse = never
}

declare module '@github/copilot-sdk/dist/generated/session-events' {
  type AssistantTurnRetryEvent = never
  type ModelCallStartEvent = never
}
