import {
  HomeAssistantBooleanState,
  IHomeAssistantSettingsRequest,
  ISetHomeAssistantTokenRequest,
  IScheduledSettingsValue,
} from '../models/scheduled-settings'
import { invoke } from './ipc-renderer'

export function fetchScheduledSettingsAPI(
  endpoint: string
): Promise<IScheduledSettingsValue> {
  return invoke('fetch-scheduled-settings', endpoint)
}

export function fetchHomeAssistantState(
  request: IHomeAssistantSettingsRequest
): Promise<HomeAssistantBooleanState> {
  return invoke('fetch-home-assistant-state', request)
}

export function setHomeAssistantToken(
  request: ISetHomeAssistantTokenRequest
): Promise<void> {
  return invoke('set-home-assistant-token', request)
}
