import {
  AgentServerGatewayURLStorageKey,
  AgentServerLANPortStorageKey,
  AgentServerModeStorageKey,
  AgentServerSiteURLStorageKey,
  DefaultAgentRemoteSiteURL,
  IAgentServerStartupConfiguration,
} from './agent-commands'

const EnabledStorageKey = 'agent-server-enabled'

function storedBoolean(value: string | null): boolean {
  return value === '1' || value === 'true'
}

/**
 * Restore safe modes before the main process binds a socket. A prior YOLO
 * selection is a one-shot sentinel: restart always clears it and forces the
 * bridge to local/off until the warning is confirmed again.
 */
export function restoreAgentServerStartupConfiguration(
  storage: Pick<Storage, 'getItem' | 'setItem'>
): IAgentServerStartupConfiguration {
  const storedMode = storage.getItem(AgentServerModeStorageKey)
  const unsafeModeWasSaved = storedMode === 'yolo-lan'
  if (unsafeModeWasSaved) {
    storage.setItem(AgentServerModeStorageKey, 'local')
    storage.setItem(EnabledStorageKey, '0')
  }

  const rawPort = Number(storage.getItem(AgentServerLANPortStorageKey))
  return {
    enabled:
      !unsafeModeWasSaved && storedBoolean(storage.getItem(EnabledStorageKey)),
    mode: storedMode === 'paired-lan' ? 'paired-lan' : 'local',
    siteURL:
      storage.getItem(AgentServerSiteURLStorageKey) ??
      DefaultAgentRemoteSiteURL,
    gatewayURL: storage.getItem(AgentServerGatewayURLStorageKey),
    preferredLANPort:
      Number.isInteger(rawPort) && rawPort >= 1024 && rawPort <= 65535
        ? rawPort
        : null,
  }
}
