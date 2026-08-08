export function quotePosixShell(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`
}

export function quoteWindowsCommand(value: string): string {
  return `"${value.replace(/["&|<>^]/g, '^$&')}"`
}

interface IRunnerConfigurationCommand {
  readonly configPath: string
  readonly repositoryURL: string
  readonly name: string
  readonly labels: ReadonlyArray<string>
}

export interface IWindowsRunnerCommandInvocation {
  readonly command: string
  readonly environment: Readonly<Record<string, string>>
}

/**
 * Build the non-secret Windows configuration command. The official runner
 * reads its one-time token from ACTIONS_RUNNER_INPUT_TOKEN, so a token must
 * never be interpolated into this command line.
 */
export function buildWindowsRunnerConfigurationCommand(
  request: IRunnerConfigurationCommand
): string {
  return [
    quoteWindowsCommand(request.configPath),
    '--unattended',
    '--url',
    quoteWindowsCommand(request.repositoryURL),
    '--name',
    quoteWindowsCommand(request.name),
    '--labels',
    quoteWindowsCommand(request.labels.join(',')),
    '--work',
    quoteWindowsCommand('_work'),
  ].join(' ')
}

export function buildWindowsRunnerConfigurationInvocation(
  request: IRunnerConfigurationCommand,
  token: string
): IWindowsRunnerCommandInvocation {
  return {
    command: buildWindowsRunnerConfigurationCommand(request),
    environment: { ACTIONS_RUNNER_INPUT_TOKEN: token },
  }
}

export function buildWindowsRunnerRemovalCommand(configPath: string): string {
  return [quoteWindowsCommand(configPath), 'remove'].join(' ')
}

export function buildWindowsRunnerRemovalInvocation(
  configPath: string,
  token: string
): IWindowsRunnerCommandInvocation {
  return {
    command: buildWindowsRunnerRemovalCommand(configPath),
    environment: { ACTIONS_RUNNER_INPUT_TOKEN: token },
  }
}

export function buildLinuxRunnerConfigurationScript(
  runnerRoot: string,
  repositoryURL: string,
  name: string,
  labels: ReadonlyArray<string>
): string {
  return [
    'set -eu',
    `cd ${quotePosixShell(runnerRoot)}`,
    'IFS= read -r RUNNER_REGISTRATION_TOKEN',
    `./config.sh --unattended --url ${quotePosixShell(
      repositoryURL
    )} --token "$RUNNER_REGISTRATION_TOKEN" --name ${quotePosixShell(
      name
    )} --labels ${quotePosixShell(labels.join(','))} --work ${quotePosixShell(
      '_work'
    )}`,
  ].join('\n')
}

export function buildLinuxRunnerRemovalScript(runnerRoot: string): string {
  return [
    'set -eu',
    `cd ${quotePosixShell(runnerRoot)}`,
    'IFS= read -r RUNNER_REMOVE_TOKEN',
    './config.sh remove --token "$RUNNER_REMOVE_TOKEN"',
  ].join('\n')
}
