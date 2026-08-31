import * as React from 'react'
import { DialogContent } from '../dialog'
import { RefNameTextBox } from '../lib/ref-name-text-box'
import { LinkButton } from '../lib/link-button'
import { Account } from '../../models/account'
import { GitConfigUserForm } from '../lib/git-config-user-form'
import { TabBar } from '../tab-bar'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { Select } from '../lib/select'
import {
  cacheHooksEnvKey,
  defaultCacheHooksEnvValue,
  defaultGitHookEnvShell,
  defaultHooksEnvEnabledValue,
  gitHookEnvShellKey,
  hooksEnvEnabledKey,
  shellFriendlyNames,
  SupportedHooksEnvShell,
} from '../../lib/hooks/config'
import { GlobalIgnoreEditor } from './global-ignore'
import { teleportAnchor } from '../../lib/teleport-targets'
import { SSHKeyGenerator } from './ssh-key-generator'
import { getPersistedLanguageMode } from '../../lib/i18n'
import { ShowCommitAuthorInfoKey } from '../../models/commit-author-display'
import { DefaultBranchInDesktop } from '../../lib/helpers/default-branch'
import {
  BooleanSettingExplanation,
  SelectionSettingExplanation,
  SettingExplanation,
  settingExplanationDescriptionIds,
} from './settings-explanation'

interface IGitProps {
  readonly name: string
  readonly email: string
  readonly defaultBranch: string
  readonly isLoadingGitConfig: boolean

  readonly accounts: ReadonlyArray<Account>

  readonly onNameChanged: (name: string) => void
  readonly onEmailChanged: (email: string) => void
  readonly onDefaultBranchChanged: (defaultBranch: string) => void

  readonly onEditGlobalGitConfig: () => void

  readonly selectedTabIndex?: number
  readonly onSelectedTabIndexChanged: (index: number) => void

  readonly onEnableGitHookEnvChanged: (enableGitHookEnv: boolean) => void
  readonly onCacheGitHookEnvChanged: (cacheGitHookEnv: boolean) => void
  readonly onSelectedShellChanged: (selectedShell: string) => void

  readonly enableGitHookEnv: boolean
  readonly cacheGitHookEnv: boolean
  readonly selectedShell: string
  readonly showCommitAuthorInfo: boolean
  readonly onShowCommitAuthorInfoChanged: (show: boolean) => void
}

const windowsShells: ReadonlyArray<SupportedHooksEnvShell> = [
  'git-bash',
  'pwsh',
  'powershell',
  'cmd',
]

export class Git extends React.Component<IGitProps> {
  private localize(english: string, cantonese: string): string {
    switch (getPersistedLanguageMode()) {
      case 'cantonese':
        return cantonese
      case 'bilingual':
        return `${english} · ${cantonese}`
      default:
        return english
    }
  }

  private get selectedTabIndex() {
    return this.props.selectedTabIndex ?? 0
  }

  private onTabClicked = (index: number) => {
    this.props.onSelectedTabIndexChanged?.(index)
  }

  private onEnableGitHookEnvChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    this.props.onEnableGitHookEnvChanged(event.currentTarget.checked)
  }

  private onCacheGitHookEnvChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    this.props.onCacheGitHookEnvChanged(event.currentTarget.checked)
  }

  private onSelectedShellChanged = (
    event: React.FormEvent<HTMLSelectElement>
  ) => {
    this.props.onSelectedShellChanged(event.currentTarget.value)
  }

  private onShowCommitAuthorInfoChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    this.props.onShowCommitAuthorInfoChanged(event.currentTarget.checked)
  }

  private renderHooksSettings() {
    return (
      <>
        <div {...teleportAnchor('settings-git-hook-env')}>
          <Checkbox
            label={this.localize(
              'Load Git hook environment variables from shell',
              '由 shell 載入 Git hook 環境變數'
            )}
            ariaDescribedBy={
              settingExplanationDescriptionIds('git-hook-environment-enabled')
                .ariaDescribedBy
            }
            value={
              this.props.enableGitHookEnv ? CheckboxValue.On : CheckboxValue.Off
            }
            onChange={this.onEnableGitHookEnvChanged}
          />
          <BooleanSettingExplanation
            settingId="git-hook-environment-enabled"
            explanationEnglish="Loads environment variables from the selected shell before Git hooks run, for hooks that rely on version-manager or shell configuration."
            explanationCantonese="Git hook 執行之前由所選 shell 載入環境變數，畀依賴版本管理器或者 shell 設定嘅 hook 使用。"
            value={this.props.enableGitHookEnv}
            shippedValue={defaultHooksEnvEnabledValue}
            storageKey={hooksEnvEnabledKey}
          />
        </div>

        {this.props.enableGitHookEnv && __WIN32__ && (
          <div {...teleportAnchor('settings-git-hook-env-shell')}>
            <Select
              className="git-hook-shell-select"
              label={this.localize(
                'Shell to use when loading environment',
                '載入環境時使用嘅 shell'
              )}
              value={this.props.selectedShell}
              onChange={this.onSelectedShellChanged}
              ariaDescribedBy={
                settingExplanationDescriptionIds('git-hook-environment-shell')
                  .ariaDescribedBy
              }
            >
              {windowsShells
                .map(s => ({ key: s, title: shellFriendlyNames[s] }))
                .map(s => (
                  <option key={s.key} value={s.key}>
                    {s.title}
                  </option>
                ))}
            </Select>
            <SelectionSettingExplanation
              settingId="git-hook-environment-shell"
              explanationEnglish="Chooses the shell process used to obtain environment variables for Git hooks."
              explanationCantonese="揀用邊個 shell process 為 Git hook 取得環境變數。"
              currentEnglish={
                shellFriendlyNames[
                  this.props.selectedShell as SupportedHooksEnvShell
                ] ?? this.props.selectedShell
              }
              currentCantonese={
                shellFriendlyNames[
                  this.props.selectedShell as SupportedHooksEnvShell
                ] ?? this.props.selectedShell
              }
              shippedEnglish={shellFriendlyNames[defaultGitHookEnvShell]}
              shippedCantonese={shellFriendlyNames[defaultGitHookEnvShell]}
              storageKey={gitHookEnvShellKey}
            />
          </div>
        )}

        {this.props.enableGitHookEnv && (
          <>
            <div {...teleportAnchor('settings-git-hook-env-cache')}>
              <Checkbox
                label={this.localize(
                  'Cache Git hook environment variables',
                  '快取 Git hook 環境變數'
                )}
                ariaDescribedBy={
                  settingExplanationDescriptionIds('git-hook-environment-cache')
                    .ariaDescribedBy
                }
                onChange={this.onCacheGitHookEnvChanged}
                value={
                  this.props.cacheGitHookEnv
                    ? CheckboxValue.On
                    : CheckboxValue.Off
                }
              />
              <BooleanSettingExplanation
                settingId="git-hook-environment-cache"
                explanationEnglish="Reuses the loaded hook environment to improve performance. Turn it off when hook variables change frequently."
                explanationCantonese="重用已載入嘅 hook 環境以改善效能；hook 變數經常改就閂咗佢。"
                value={this.props.cacheGitHookEnv}
                shippedValue={defaultCacheHooksEnvValue}
                storageKey={cacheHooksEnvKey}
              />
            </div>
          </>
        )}
      </>
    )
  }

  public render() {
    return (
      <DialogContent className="git-preferences">
        <TabBar
          selectedIndex={this.selectedTabIndex}
          onTabClicked={this.onTabClicked}
        >
          <span>Author</span>
          <span>Default branch</span>
          <span>Hooks</span>
          <span>Global ignore</span>
          <span>SSH key</span>
        </TabBar>
        <div className="git-preferences-content">{this.renderCurrentTab()}</div>
      </DialogContent>
    )
  }

  private renderCurrentTab() {
    if (this.selectedTabIndex === 0) {
      return this.renderGitConfigAuthorInfo()
    } else if (this.selectedTabIndex === 1) {
      return this.renderDefaultBranchSetting()
    } else if (this.selectedTabIndex === 2) {
      return this.renderHooksSettings()
    } else if (this.selectedTabIndex === 3) {
      return <GlobalIgnoreEditor />
    } else if (this.selectedTabIndex === 4) {
      return <SSHKeyGenerator email={this.props.email} />
    }

    return null
  }

  private renderGitConfigAuthorInfo() {
    return (
      <>
        <GitConfigUserForm
          email={this.props.email}
          name={this.props.name}
          isLoadingGitConfig={this.props.isLoadingGitConfig}
          accounts={this.props.accounts}
          onEmailChanged={this.props.onEmailChanged}
          onNameChanged={this.props.onNameChanged}
          nameAriaDescribedBy={
            settingExplanationDescriptionIds('git-author-name').ariaDescribedBy
          }
          emailAriaDescribedBy={
            settingExplanationDescriptionIds('git-author-email').ariaDescribedBy
          }
        />
        <SettingExplanation
          settingId="git-author-name"
          summary={this.localize('What this setting changes', '呢個設定會改咩')}
          explanation={this.localize(
            'Sets the author name written to the global Git configuration and used for new commits unless a repository overrides it.',
            '設定寫入全域 Git 設定嘅作者名稱；除非個別儲存庫覆寫，否則新提交會使用佢。'
          )}
          source="main-process-config"
          provenance={this.localize(
            `Current value from global Git configuration: ${
              this.props.name.trim().length === 0
                ? 'not configured'
                : 'configured'
            }. Shipped value: not configured.`,
            `目前值來自全域 Git 設定：${
              this.props.name.trim().length === 0 ? '未設定' : '已設定'
            }。出廠值：未設定。`
          )}
        />
        <SettingExplanation
          settingId="git-author-email"
          summary={this.localize('What this setting changes', '呢個設定會改咩')}
          explanation={this.localize(
            'Sets the author email written to the global Git configuration and used for new commits unless a repository overrides it.',
            '設定寫入全域 Git 設定嘅作者電郵；除非個別儲存庫覆寫，否則新提交會使用佢。'
          )}
          source="main-process-config"
          provenance={this.localize(
            `Current value from global Git configuration: ${
              this.props.email.trim().length === 0
                ? 'not configured'
                : 'configured'
            }. Shipped value: not configured.`,
            `目前值來自全域 Git 設定：${
              this.props.email.trim().length === 0 ? '未設定' : '已設定'
            }。出廠值：未設定。`
          )}
        />
        <div {...teleportAnchor('settings-show-commit-identity')}>
          <Checkbox
            label={this.localize(
              'Show effective identity and config source above commit message',
              '喺提交訊息上面顯示有效身分同設定來源'
            )}
            ariaDescribedBy={
              settingExplanationDescriptionIds('git-show-commit-identity')
                .ariaDescribedBy
            }
            value={
              this.props.showCommitAuthorInfo
                ? CheckboxValue.On
                : CheckboxValue.Off
            }
            onChange={this.onShowCommitAuthorInfoChanged}
          />
          <BooleanSettingExplanation
            settingId="git-show-commit-identity"
            explanationEnglish="Shows the effective author name, email, configuration scope, and winning configuration file above the commit message."
            explanationCantonese="喺提交訊息上面顯示有效作者名稱、電郵、設定範圍同勝出嘅設定檔。"
            value={this.props.showCommitAuthorInfo}
            shippedValue={false}
            storageKey={ShowCommitAuthorInfoKey}
          />
        </div>
        {this.renderEditGlobalGitConfigInfo()}
      </>
    )
  }

  private renderDefaultBranchSetting() {
    return (
      <div
        className="default-branch-component"
        {...teleportAnchor('settings-default-branch-name')}
      >
        <h2 id="default-branch-heading">
          Default branch name for new repositories
        </h2>

        <RefNameTextBox
          initialValue={this.props.defaultBranch}
          onValueChange={this.props.onDefaultBranchChanged}
          ariaLabelledBy={'default-branch-heading'}
          ariaDescribedBy={
            settingExplanationDescriptionIds('git-default-branch-name')
              .ariaDescribedBy
          }
          warningMessageVerb="saved"
        />
        <SettingExplanation
          settingId="git-default-branch-name"
          summary={this.localize('What this setting changes', '呢個設定會改咩')}
          explanation={this.localize(
            'Sets init.defaultBranch in global Git configuration for repositories created later. Existing repositories are unchanged.',
            '喺全域 Git 設定設定 init.defaultBranch，畀之後建立嘅儲存庫使用；現有儲存庫唔會改。'
          )}
          source="main-process-config"
          provenance={this.localize(
            `Current value from global Git configuration or the product fallback: ${this.props.defaultBranch}. Shipped value: ${DefaultBranchInDesktop}.`,
            `目前值來自全域 Git 設定或者產品後備值：${this.props.defaultBranch}。出廠值：${DefaultBranchInDesktop}。`
          )}
        />

        {this.renderEditGlobalGitConfigInfo()}
      </div>
    )
  }

  private renderEditGlobalGitConfigInfo() {
    return (
      <p className="settings-description">
        These preferences will{' '}
        <LinkButton onClick={this.props.onEditGlobalGitConfig}>
          edit your global Git config file
        </LinkButton>
        .
      </p>
    )
  }
}
