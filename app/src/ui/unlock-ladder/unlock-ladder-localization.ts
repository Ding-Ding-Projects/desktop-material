import type { LanguageMode } from '../../models/language-mode'
import type { UnlockLadderRung } from '../../models/unlock-ladder'

export type UnlockLadderCopyKey =
  | 'title'
  | 'waitOnly'
  | 'credentialNext'
  | 'attemptsUnchanged'
  | 'expired'
  | 'wrong'
  | 'tooEarly'
  | 'invalidHit'
  | 'duplicateHit'
  | 'clock'
  | 'dimSumPrompt'
  | 'sumsPrompt'
  | 'molesPrompt'
  | 'submit'
  | 'cancel'
  | 'remaining'
  | 'targetCounted'
  | 'visibleTarget'
  | 'hiddenTarget'

type Copy = Readonly<Record<UnlockLadderCopyKey, string>>

type CopyBands = Readonly<Record<'plain' | 'light' | 'playful' | 'maximum', Copy>>

const english: CopyBands = {
  plain: {
    title: 'Unlock ladder',
    waitOnly: 'This can clear the waiting period only. It never signs you in.',
    credentialNext: 'After the wait is cleared, enter your credential normally.',
    attemptsUnchanged: 'Your attempt count is unchanged.',
    expired: 'This challenge expired. Request a new challenge.',
    wrong: 'That answer was not correct. The lockout escalation is unchanged.',
    tooEarly: 'The round is still running. Submit after its timer ends.',
    invalidHit: 'One or more hits was outside the visible target window.',
    duplicateHit: 'A target can be counted only once.',
    clock: 'The ladder is unavailable for this lockout. Continue waiting.',
    dimSumPrompt: 'Choose one dish.',
    sumsPrompt: 'Answer every sum.',
    molesPrompt: 'Hit enough visible targets, then submit after the round ends.',
    submit: 'Submit answer',
    cancel: 'Return to credential entry',
    remaining: '{count} wait skips remain in this rolling hour.',
    targetCounted: 'Target already counted',
    visibleTarget: 'Visible target',
    hiddenTarget: 'Hidden target',
  },
  light: {
    title: 'Unlock ladder',
    waitOnly: 'This clears waiting, not access.',
    credentialNext: 'Then the ordinary credential step is still required.',
    attemptsUnchanged: 'Attempts stay exactly where they were.',
    expired: 'The challenge timed out. Ask for a fresh one.',
    wrong: 'Not quite. The lockout rules did not move.',
    tooEarly: 'The round has not finished yet.',
    invalidHit: 'A target was tapped outside its visible window.',
    duplicateHit: 'That target has already been counted.',
    clock: 'No ladder rung remains. The clock is the route.',
    dimSumPrompt: 'Pick one dish.',
    sumsPrompt: 'Solve all the sums.',
    molesPrompt: 'Tap enough targets and wait for the round to finish.',
    submit: 'Submit answer',
    cancel: 'Return to credential entry',
    remaining: '{count} wait skips remain in this rolling hour.',
    targetCounted: 'Target already counted',
    visibleTarget: 'Visible target',
    hiddenTarget: 'Hidden target',
  },
  playful: {
    title: 'Unlock ladder',
    waitOnly: 'This ladder opens the waiting door, not the account door.',
    credentialNext: 'The credential still gets the final say afterwards.',
    attemptsUnchanged: 'The attempt counter remains firmly unrefunded.',
    expired: 'That challenge wandered off. Request another one.',
    wrong: 'The answer missed; the lockout arithmetic remains untouched.',
    tooEarly: 'The moles are still on the clock. Submit when the round ends.',
    invalidHit: 'That tap missed the target’s visible window.',
    duplicateHit: 'One mole, one counted hit. No double dipping.',
    clock: 'The ladder has packed up. The clock is still working.',
    dimSumPrompt: 'Choose a dish from the tiny menu.',
    sumsPrompt: 'Give every sum a proper answer.',
    molesPrompt: 'Whack enough visible targets and let the round finish.',
    submit: 'Submit answer',
    cancel: 'Return to credential entry',
    remaining: '{count} wait skips remain in this rolling hour.',
    targetCounted: 'Target already counted',
    visibleTarget: 'Visible target',
    hiddenTarget: 'Hidden target',
  },
  maximum: {
    title: 'Unlock ladder',
    waitOnly: 'This is a waiting-room escape hatch, not a magic login spell.',
    credentialNext: 'The credential still stands at the exit checking tickets.',
    attemptsUnchanged: 'The attempt counter has not received even one bonus point.',
    expired: 'The challenge has aged out. Fetch a new one before it sulks.',
    wrong: 'No luck. The lockout escalation stayed exactly as recorded.',
    tooEarly: 'The mole round is not done; the server will not accept a speedrun.',
    invalidHit: 'That hit did not land inside a target’s real visible window.',
    duplicateHit: 'That target already gave you its one and only hit.',
    clock: 'The ladder is finished. The clock remains the honest route.',
    dimSumPrompt: 'Select one dish; the dumplings are not authentication.',
    sumsPrompt: 'Solve all ten small sums; the arithmetic is the bouncer.',
    molesPrompt: 'Hit enough real targets, then let the timer finish its dramatic pause.',
    submit: 'Submit answer',
    cancel: 'Return to credential entry',
    remaining: '{count} wait skips remain in this rolling hour.',
    targetCounted: 'Target already counted',
    visibleTarget: 'Visible target',
    hiddenTarget: 'Hidden target',
  },
}

const cantonese: CopyBands = {
  plain: {
    title: '解鎖梯',
    waitOnly: '呢個只可以清走等待狀態，唔會幫你登入。',
    credentialNext: '清走等待之後，照樣要正常輸入憑證。',
    attemptsUnchanged: '嘗試次數維持原狀。',
    expired: '呢題過咗時限，請重新攞一題。',
    wrong: '答案唔啱，鎖定升級規則冇變。',
    tooEarly: '回合未完，等計時完先提交。',
    invalidHit: '有一下唔喺目標可見時間內。',
    duplicateHit: '每個目標只可以計一次。',
    clock: '呢次冇梯級可以行，繼續等個鐘。',
    dimSumPrompt: '揀一款點心。',
    sumsPrompt: '答晒所有算術題。',
    molesPrompt: '打中足夠嘅可見目標，回合完先提交。',
    submit: '提交答案',
    cancel: '返去輸入憑證',
    remaining: '呢個滾動一小時仲有 {count} 次清等待機會。',
    targetCounted: '目標已經計過',
    visibleTarget: '可見目標',
    hiddenTarget: '隱藏目標',
  },
  light: {
    title: '解鎖梯',
    waitOnly: '呢個只係清等待，唔係開權限。',
    credentialNext: '之後仲要行返正常憑證步驟。',
    attemptsUnchanged: '嘗試次數原封不動。',
    expired: '題目超時喇，攞過一題啦。',
    wrong: '未啱，鎖定規則冇郁過。',
    tooEarly: '回合仲未完。',
    invalidHit: '有一下撳咗喺可見時間窗之外。',
    duplicateHit: '嗰個目標已經計過。',
    clock: '冇梯級啦，個鐘先係路。',
    dimSumPrompt: '揀一款點心。',
    sumsPrompt: '計晒啲算術題。',
    molesPrompt: '撳夠目標，等回合完先提交。',
    submit: '提交答案',
    cancel: '返去輸入憑證',
    remaining: '呢個滾動一小時仲有 {count} 次清等待機會。',
    targetCounted: '嗰個目標已經計過',
    visibleTarget: '可見目標',
    hiddenTarget: '隱藏目標',
  },
  playful: {
    title: '解鎖梯',
    waitOnly: '呢條梯開嘅係等待門，唔係帳戶門。',
    credentialNext: '之後仲係要由憑證大佬最後話事。',
    attemptsUnchanged: '嘗試次數一粒糖都冇加。',
    expired: '題目行咗去飲茶，攞過一題先。',
    wrong: '答案差少少，鎖定計數照舊。',
    tooEarly: '啲目標仲喺計時，未完唔收貨。',
    invalidHit: '嗰一下唔喺目標出現嗰段時間。',
    duplicateHit: '一個目標一次，唔好食住碗底再打。',
    clock: '梯收工喇，個鐘仲照行。',
    dimSumPrompt: '喺細細張點心餐牌揀一款。',
    sumsPrompt: '俾每條算術題一個答案。',
    molesPrompt: '撳夠可見目標，等回合自然完場。',
    submit: '提交答案',
    cancel: '返去輸入憑證',
    remaining: '呢個滾動一小時仲有 {count} 次清等待機會。',
    targetCounted: '嗰個目標已經計過喇',
    visibleTarget: '可見目標',
    hiddenTarget: '隱藏目標',
  },
  maximum: {
    title: '解鎖梯',
    waitOnly: '呢條係走出等待室嘅小門，唔係魔法登入咒語。',
    credentialNext: '憑證仲係企喺出口查飛。',
    attemptsUnchanged: '嘗試次數冇收過任何額外獎分。',
    expired: '題目老到過期喇，攞過一題，唔好俾佢繼續扮神秘。',
    wrong: '未中，鎖定升級照原本咁行。',
    tooEarly: '目標回合未完，伺服器唔收速跑成績。',
    invalidHit: '嗰一下冇落喺目標真正可見時間窗入面。',
    duplicateHit: '嗰個目標已經交咗唯一一次命中，唔可以再報。',
    clock: '條梯完咗，個鐘仍然係最老實嗰條路。',
    dimSumPrompt: '揀一款點心；餃子唔係登入因素。',
    sumsPrompt: '計晒十條小算術，算術係門口保安。',
    molesPrompt: '打中足夠真目標，再俾計時器完成佢嘅戲份。',
    submit: '提交答案',
    cancel: '返去輸入憑證',
    remaining: '呢個滾動一小時仲有 {count} 次清等待機會。',
    targetCounted: '嗰個目標已經交咗唯一一次命中',
    visibleTarget: '可見目標',
    hiddenTarget: '隱藏目標',
  },
}

function band(level: number): 'plain' | 'light' | 'playful' | 'maximum' {
  const value = Math.min(5, Math.max(1, Number.isFinite(level) ? level : 1))
  return value <= 2 ? 'plain' : value === 3 ? 'light' : value === 4 ? 'playful' : 'maximum'
}

export interface IUnlockLadderLevels {
  readonly english: number
  readonly cantonese: number
}

function lookup(
  key: UnlockLadderCopyKey,
  mode: LanguageMode,
  levels: IUnlockLadderLevels
): string {
  const englishValue = english[band(levels.english)][key]
  const cantoneseValue = cantonese[band(levels.cantonese)][key]
  if (mode === 'english') return englishValue
  if (mode === 'cantonese') return cantoneseValue
  return `${englishValue} · ${cantoneseValue}`
}

export function unlockLadderText(
  key: UnlockLadderCopyKey,
  mode: LanguageMode,
  levels: IUnlockLadderLevels,
  variables: Readonly<Record<string, string>> = {}
): string {
  return lookup(key, mode, levels).replace(/\{(\w+)\}/g, (_, name: string) => variables[name] ?? `{${name}}`)
}

export function unlockLadderPromptKey(
  rung: UnlockLadderRung
): UnlockLadderCopyKey | null {
  switch (rung) {
    case 'dim-sum':
      return 'dimSumPrompt'
    case 'sums':
      return 'sumsPrompt'
    case 'moles':
      return 'molesPrompt'
    case 'clock':
      return 'clock'
  }
}
