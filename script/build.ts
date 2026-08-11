/* eslint-disable no-sync */
/// <reference path="./globals.d.ts" />

import * as cp from 'child_process'
import packager, { OfficialArch, OsxNotarizeOptions } from 'electron-packager'
import frontMatter from 'front-matter'
import * as os from 'os'
import * as path from 'path'
import { getPrintenvzPath } from 'printenvz'
import { getProxyCommandPath } from 'process-proxy'
import { externals, rendererBundleNames } from '../app/webpack.common'

interface IChooseALicense {
  readonly title: string
  readonly nickname?: string
  readonly featured?: boolean
  readonly hidden?: boolean
}

export interface ILicense {
  readonly name: string
  readonly featured: boolean
  readonly body: string
  readonly hidden: boolean
}

import {
  getBundleID,
  getCompanyName,
  getProductName,
} from '../app/package-info'

import { isGitHubActions } from './build-platforms'
import {
  getChannel,
  getDistArchitecture,
  getDistRoot,
  getExecutableName,
  getIconDirectory,
  isPublishable,
} from './dist-info'

import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  realpathSync,
  readdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'fs'
import { updateLicenseDump } from './licenses/update-license-dump'
import { verifyInjectedSassVariables } from './validate-sass/validate-all'
import { prepareBundledCheapLfsOrasForBuild } from './prepare-cheap-lfs-oras'
import { buildShellExtension } from './build-shell-extension'
import { join } from 'path'
import assert from 'assert'

const isPublishableBuild = isPublishable()
const isDevelopmentBuild = getChannel() === 'development'
const shouldSkipPackaging = process.env.DESKTOP_SKIP_PACKAGE === '1'

const projectRoot = path.join(__dirname, '..')
const entitlementsSuffix = isDevelopmentBuild ? '-dev' : ''
const entitlementsPath = `${projectRoot}/script/entitlements${entitlementsSuffix}.plist`
const extendInfoPath = `${projectRoot}/script/info.plist`
const outRoot = path.join(projectRoot, 'out')

const buildKeepAliveIntervalMilliseconds = 60_000

type ProcessKeepAliveScheduler = (
  callback: () => void,
  delay: number
) => ReturnType<typeof setInterval>
type ProcessKeepAliveCanceller = (
  handle: ReturnType<typeof setInterval>
) => void

/**
 * Keep the Node event loop alive while an asynchronous build step is running.
 *
 * electron-packager can finish its synchronous setup before it owns an active
 * handle. Without this explicit lifecycle handle, Node may exit while the
 * packaging promise is still copying the app, leaving only a temporary output
 * directory behind.
 */
export function keepNodeProcessAliveUntil<T>(
  promise: Promise<T>,
  schedule: ProcessKeepAliveScheduler = setInterval,
  cancel: ProcessKeepAliveCanceller = clearInterval
): Promise<T> {
  const keepAliveHandle = schedule(
    () => undefined,
    buildKeepAliveIntervalMilliseconds
  )

  return promise.finally(() => cancel(keepAliveHandle))
}

/**
 * Strip JavaScript string and template literals from a bundle.
 *
 * The bundle guard below looks for a Node-only binding being REFERENCED. Since
 * the in-app documentation browser bundles every feature article into the
 * renderer, the bundle also contains prose — and one of those articles
 * documents this very failure mode, quoting the binding by name. A plain
 * substring search cannot tell a reference from a sentence about a reference,
 * and it failed the build on documentation that was completely correct.
 *
 * Removing literals first is not a full parse, but it is exactly the
 * distinction that matters here: a real leaked binding is an identifier in
 * code, and prose about it only ever lives inside a string.
 */
export function stripStringLiterals(source: string): string {
  let out = ''
  let index = 0

  while (index < source.length) {
    const character = source[index]

    if (character === '"' || character === "'" || character === '`') {
      const quote = character
      index += 1
      while (index < source.length) {
        if (source[index] === '\\') {
          index += 2
          continue
        }
        if (source[index] === quote) {
          index += 1
          break
        }
        index += 1
      }
      // The literal is replaced by an empty one so adjacent tokens cannot fuse.
      out += '""'
      continue
    }

    out += character
    index += 1
  }

  return out
}

/**
 * Fail the build before packaging when Webpack leaves a Node-only module
 * wrapper reference in a renderer bundle. That reference is not defined by
 * Electron's browser runtime and prevents React from mounting, which otherwise
 * presents to users as a blank window.
 */
export function assertRendererBundlesAreRunnable(
  outputRoot: string = outRoot
): void {
  for (const bundleName of rendererBundleNames) {
    const bundlePath = path.join(outputRoot, bundleName)
    assert(
      existsSync(bundlePath),
      `Missing renderer bundle required for startup: ${bundlePath}`
    )

    const bundle = readFileSync(bundlePath, 'utf8')
    const code = stripStringLiterals(bundle)

    assert(
      !code.includes('__webpack_module__'),
      `Renderer bundle contains the undefined Webpack module binding: ${bundlePath}`
    )
  }
}

export function getSelfHostedServerExtraResourcePath(
  root: string = projectRoot
): string {
  return path.join(root, 'services', 'desktop-material-server')
}

async function finishBuildAfterPreparation(): Promise<void> {
  try {
    await verifyInjectedSassVariables(outRoot)
  } catch (err) {
    console.error(
      'Error verifying the Sass variables in the rendered app. This is fatal for a published build.'
    )

    if (!isDevelopmentBuild) {
      throw err
    }
  }

  console.log('Updating our licenses dump…')
  try {
    await updateLicenseDump(projectRoot, outRoot)
  } catch (err) {
    console.error(
      'Error updating the license dump. This is fatal for a published build.'
    )

    if (!isDevelopmentBuild) {
      throw err
    }
  }

  let appPaths: string[]
  if (shouldSkipPackaging) {
    console.log('Skipping packaging…')
    appPaths = [outRoot]
  } else {
    console.log('Packaging…')
    appPaths = await packageApp()
  }

  console.log(`Built to ${appPaths}`)
}

if (require.main === module) {
  console.log(`Building for ${getChannel()}…`)

  console.log('Removing old distribution…')
  rmSync(getDistRoot(), { recursive: true, force: true })

  console.log('Copying dependencies…')
  copyDependencies()

  console.log('Packaging emoji…')
  copyEmoji()

  console.log('Copying static resources…')
  copyStaticResources()

  console.log('Checking renderer bundles…')
  assertRendererBundlesAreRunnable(outRoot)

  if (process.platform === 'win32') {
    // Optional: the Windows 11 top-level context menu needs a compiled COM
    // server. When the C++ toolchain is absent the build continues and the app
    // falls back to the classic context-menu verbs, which need no native code.
    console.log('Building Windows shell extension…')
    const shellExtension = buildShellExtension(outRoot)
    console.log(
      shellExtension.built
        ? `  built into ${shellExtension.outputDirectory}`
        : `  skipped (${shellExtension.reason})`
    )
  }

  if (process.platform === 'win32') {
    console.log('Preparing pinned Cheap LFS ORAS runtime…')
  }
  const cheapLfsOrasPreparation =
    process.platform === 'win32'
      ? prepareBundledCheapLfsOrasForBuild({ generatedOutputRoot: outRoot })
      : Promise.resolve(null)

  console.log('Parsing license metadata…')
  generateLicenseMetadata(outRoot)

  moveAnalysisFiles()

  if (
    isGitHubActions() &&
    process.platform === 'darwin' &&
    isPublishableBuild
  ) {
    console.log('Setting up keychain…')
    cp.execSync(path.join(__dirname, 'setup-macos-keychain'))
  }

  const buildPromise = cheapLfsOrasPreparation.then(() =>
    finishBuildAfterPreparation()
  )

  void keepNodeProcessAliveUntil(buildPromise).catch(err => {
    console.error(err)
    process.exitCode = 1
  })
}

function packageApp() {
  // not sure if this is needed anywhere, so I'm just going to inline it here
  // for now and see what the future brings...
  const toPackagePlatform = (platform: NodeJS.Platform) => {
    if (platform === 'win32' || platform === 'darwin' || platform === 'linux') {
      return platform
    }
    throw new Error(
      `Unable to convert to platform for electron-packager: '${process.platform}`
    )
  }

  const toPackageArch = (targetArch: string | undefined): OfficialArch => {
    if (targetArch === undefined) {
      targetArch = os.arch()
    }

    if (targetArch === 'arm64' || targetArch === 'x64') {
      return targetArch
    }

    throw new Error(
      `Building Desktop for architecture '${targetArch}' is not supported`
    )
  }

  // get notarization deets, unless we're not going to publish this
  const osxNotarize = isPublishableBuild ? getNotarizationOptions() : undefined

  if (
    isPublishableBuild &&
    isGitHubActions() &&
    process.platform === 'darwin' &&
    osxNotarize === undefined
  ) {
    // we can't publish a mac build without these
    throw new Error(
      'Unable to retreive appleId and/or appleIdPassword to notarize macOS build'
    )
  }

  const iconPath = getIconDirectory()
  const assetsCarPath = join(iconPath, 'Assets.car')
  assert(
    existsSync(assetsCarPath),
    `Unable to find Assets.car at ${assetsCarPath}`
  )

  return packager({
    name: getExecutableName(),
    platform: toPackagePlatform(process.platform),
    arch: toPackageArch(process.env.TARGET_ARCH),
    asar: false, // TODO: Probably wanna enable this down the road.
    out: getDistRoot(),
    icon: join(iconPath, 'icon-logo'),
    extraResource: [assetsCarPath, getSelfHostedServerExtraResourcePath()],
    dir: outRoot,
    overwrite: true,
    tmpdir: false,
    derefSymlinks: false,
    prune: false, // We'll prune them ourselves below.
    ignore: [
      new RegExp('/node_modules/electron($|/)'),
      new RegExp('/node_modules/electron-packager($|/)'),
      new RegExp('/\\.git($|/)'),
      new RegExp('/node_modules/\\.bin($|/)'),
    ],
    appCopyright: `Copyright © ${new Date().getFullYear()} GitHub, Inc.`,

    // macOS
    appBundleId: getBundleID(),
    appCategoryType: 'public.app-category.developer-tools',
    darwinDarkModeSupport: true,
    osxSign: {
      optionsForFile: (path: string) => ({
        hardenedRuntime: true,
        entitlements: entitlementsPath,
      }),
      type: isPublishableBuild ? 'distribution' : 'development',
      // For development, we will use '-' as the identifier so that codesign
      // will sign the app to run locally. We need to disable 'identity-validation'
      // or otherwise it will replace '-' with one of the regular codesigning
      // identities in our system.
      identity: isDevelopmentBuild ? '-' : undefined,
      identityValidation: !isDevelopmentBuild,
    },
    osxNotarize,
    protocols: [
      {
        name: getBundleID(),
        schemes: [
          !isDevelopmentBuild
            ? 'x-github-desktop-auth'
            : 'x-github-desktop-dev-auth',
          'x-github-client',
          'github-mac',
        ],
      },
    ],
    extendInfo: extendInfoPath,

    // Windows
    win32metadata: {
      CompanyName: getCompanyName(),
      FileDescription: '',
      OriginalFilename: '',
      ProductName: getProductName(),
      InternalName: getProductName(),
    },
  })
}

export function removeAndCopy(source: string, destination: string) {
  rmSync(destination, { recursive: true, force: true })
  // Materialize a linked source root (notably a worktree's gemoji junction)
  // without following links nested inside dependency/resource trees.
  const resolvedSource = realpathSync.native(source)
  cpSync(resolvedSource, destination, {
    recursive: true,
    verbatimSymlinks: true,
    filter: sourcePath => {
      if (
        path.relative(resolvedSource, sourcePath) !== '' &&
        lstatSync(sourcePath).isSymbolicLink()
      ) {
        throw new Error(
          `Refusing to copy nested symbolic link from build input: ${sourcePath}`
        )
      }
      return true
    },
  })
}

interface IStaticResourceCopyOptions {
  readonly force?: boolean
}

function isPathInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return (
    relative === '' ||
    (!path.isAbsolute(relative) &&
      relative !== '..' &&
      !relative.startsWith(`..${path.sep}`))
  )
}

/**
 * Copy a static-resource directory without retaining links in the packaged app.
 *
 * A few upstream gitignore aliases are relative file symlinks. They are safe
 * to package only when their resolved target is a regular file inside the
 * source tree. Directory links, escaping or broken links, special files, and
 * linked destinations all fail closed.
 */
export function copyStaticResourceTree(
  source: string,
  destination: string,
  options: IStaticResourceCopyOptions = {}
) {
  const force = options.force ?? true
  const sourceRootStat = lstatSync(source)
  if (sourceRootStat.isSymbolicLink() || !sourceRootStat.isDirectory()) {
    throw new Error(
      `Static resource source must be a real directory: ${source}`
    )
  }

  const resolvedSourceRoot = realpathSync.native(source)

  const copyEntry = (sourcePath: string, destinationPath: string): void => {
    const sourceStat = lstatSync(sourcePath)

    if (sourceStat.isSymbolicLink()) {
      let resolvedTarget: string
      try {
        resolvedTarget = realpathSync.native(sourcePath)
      } catch {
        throw new Error(
          `Static resource link has an unsupported or missing target: ${sourcePath}`
        )
      }

      if (!isPathInside(resolvedSourceRoot, resolvedTarget)) {
        throw new Error(
          `Static resource link escapes its source tree: ${sourcePath}`
        )
      }

      const targetStat = lstatSync(resolvedTarget)
      if (!targetStat.isFile()) {
        throw new Error(
          `Static resource links must target regular files: ${sourcePath}`
        )
      }

      copyStaticResourceFile(resolvedTarget, destinationPath, force)
      return
    }

    if (sourceStat.isDirectory()) {
      const destinationStat = lstatIfPresent(destinationPath)
      if (destinationStat !== undefined) {
        if (
          destinationStat.isSymbolicLink() ||
          !destinationStat.isDirectory()
        ) {
          throw new Error(
            `Static resource destination directory is unsafe: ${destinationPath}`
          )
        }
      } else {
        mkdirSync(destinationPath, { recursive: true })
      }

      for (const entry of readdirSync(sourcePath)) {
        copyEntry(
          path.join(sourcePath, entry),
          path.join(destinationPath, entry)
        )
      }
      return
    }

    if (sourceStat.isFile()) {
      copyStaticResourceFile(sourcePath, destinationPath, force)
      return
    }

    throw new Error(`Unsupported static resource entry: ${sourcePath}`)
  }

  copyEntry(source, destination)
}

function lstatIfPresent(
  entry: string
): ReturnType<typeof lstatSync> | undefined {
  try {
    return lstatSync(entry)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined
    }
    throw error
  }
}

function copyStaticResourceFile(
  source: string,
  destination: string,
  force: boolean
): void {
  const destinationStat = lstatIfPresent(destination)
  if (destinationStat !== undefined) {
    if (destinationStat.isSymbolicLink() || !destinationStat.isFile()) {
      throw new Error(
        `Static resource destination file is unsafe: ${destination}`
      )
    }
    if (!force) {
      return
    }
  }

  cpSync(source, destination, {
    force,
    errorOnExist: false,
  })

  if (lstatSync(destination).isSymbolicLink()) {
    throw new Error(
      `Static resource copy unexpectedly created a link: ${destination}`
    )
  }
}

function copyEmoji() {
  const emojiImages = path.join(projectRoot, 'gemoji', 'images', 'emoji')
  const emojiImagesDestination = path.join(outRoot, 'emoji')
  removeAndCopy(emojiImages, emojiImagesDestination)

  // Remove unicode-based emoji images (use the unicode emojis instead)
  const emojiImagesUnicode = path.join(emojiImagesDestination, 'unicode')
  rmSync(emojiImagesUnicode, { recursive: true, force: true })

  const emojiJSON = path.join(projectRoot, 'gemoji', 'db', 'emoji.json')
  const emojiJSONDestination = path.join(outRoot, 'emoji.json')
  removeAndCopy(emojiJSON, emojiJSONDestination)
}

function copyStaticResources() {
  const dirName = process.platform
  const platformSpecific = path.join(projectRoot, 'app', 'static', dirName)
  const common = path.join(projectRoot, 'app', 'static', 'common')
  const destination = path.join(outRoot, 'static')
  rmSync(destination, { recursive: true, force: true })
  if (existsSync(platformSpecific)) {
    copyStaticResourceTree(platformSpecific, destination)
  }
  copyStaticResourceTree(common, destination, {
    force: false,
  })

  // The pre-generated narration + melody assets live in a top-level static dir
  // (not under common/), so copy them into the packaged static/audio folder the
  // renderer references via encodePathAsUrl(__dirname, 'static/audio', …).
  const audioSource = path.join(projectRoot, 'app', 'static', 'audio')
  if (existsSync(audioSource)) {
    removeAndCopy(audioSource, path.join(destination, 'audio'))
  }

  // The bundled dim sum surprise pictures follow the same arrangement: a
  // top-level static dir the renderer reaches through
  // encodePathAsUrl(__dirname, 'static/dim-sum', …).
  const dimSumSource = path.join(projectRoot, 'app', 'static', 'dim-sum')
  if (existsSync(dimSumSource)) {
    removeAndCopy(dimSumSource, path.join(destination, 'dim-sum'))
  }
}

function moveAnalysisFiles() {
  const rendererReport = 'renderer.report.html'
  const analysisSource = path.join(outRoot, rendererReport)
  if (existsSync(analysisSource)) {
    const distRoot = getDistRoot()
    const destination = path.join(distRoot, rendererReport)
    mkdirSync(distRoot, { recursive: true })
    // there's no moveSync API here, so let's do it the old fashioned way
    //
    // unlinkSync below ensures that the analysis file isn't bundled into
    // the app by accident
    cpSync(analysisSource, destination, {
      recursive: true,
      force: true,
      verbatimSymlinks: true,
    })
    unlinkSync(analysisSource)
  }
}

function copyDependencies() {
  const pkg: Package = require(path.join(projectRoot, 'app', 'package.json'))

  const filterExternals = (dependencies: Record<string, string>) =>
    Object.fromEntries(
      Object.entries(dependencies).filter(([k]) => externals.includes(k))
    )

  // The product name changes depending on whether it's a prod build or dev
  // build, so that we can have them running side by side.
  pkg.productName = getProductName()
  pkg.dependencies = filterExternals(pkg.dependencies)
  pkg.devDependencies =
    isDevelopmentBuild && pkg.devDependencies
      ? filterExternals(pkg.devDependencies)
      : {}

  writeFileSync(path.join(outRoot, 'package.json'), JSON.stringify(pkg))
  rmSync(path.resolve(outRoot, 'node_modules'), {
    recursive: true,
    force: true,
  })

  console.log('  Installing dependencies via yarn…')
  cp.execSync('yarn install', { cwd: outRoot, env: process.env })

  console.log('  Copying desktop-askpass-trampoline…')
  const trampolineSource = path.resolve(
    projectRoot,
    'app/node_modules/desktop-trampoline/build/Release'
  )
  const desktopTrampolineDir = path.resolve(outRoot, 'desktop-trampoline')
  const desktopAskpassTrampolineFile =
    process.platform === 'win32'
      ? 'desktop-askpass-trampoline.exe'
      : 'desktop-askpass-trampoline'

  rmSync(desktopTrampolineDir, { recursive: true, force: true })
  mkdirSync(desktopTrampolineDir, { recursive: true })
  cpSync(
    path.resolve(trampolineSource, desktopAskpassTrampolineFile),
    path.resolve(desktopTrampolineDir, desktopAskpassTrampolineFile),
    { recursive: true, verbatimSymlinks: true }
  )

  console.log('  Copying copilot…')
  copyCopilotDependency()

  // Dev builds for macOS require a SSH wrapper to use SSH_ASKPASS
  if (process.platform === 'darwin' && isDevelopmentBuild) {
    console.log('  Copying ssh-wrapper')
    const sshWrapperFile = 'ssh-wrapper'
    cpSync(
      path.resolve(
        projectRoot,
        'app/node_modules/desktop-trampoline/build/Release',
        sshWrapperFile
      ),
      path.resolve(desktopTrampolineDir, sshWrapperFile),
      { recursive: true, verbatimSymlinks: true }
    )
  }

  console.log('  Copying git environment…')
  const gitDir = path.resolve(outRoot, 'git')
  rmSync(gitDir, { recursive: true, force: true })
  mkdirSync(gitDir, { recursive: true })
  cpSync(path.resolve(projectRoot, 'app/node_modules/dugite/git'), gitDir, {
    recursive: true,
    verbatimSymlinks: true,
  })

  console.log('  Copying desktop credential helper…')
  const mingw = getDistArchitecture() === 'x64' ? 'mingw64' : 'clangarm64'
  const gitCoreDir =
    process.platform === 'win32'
      ? path.resolve(outRoot, 'git', mingw, 'libexec', 'git-core')
      : path.resolve(outRoot, 'git', 'libexec', 'git-core')

  const desktopCredentialHelperTrampolineFile =
    process.platform === 'win32'
      ? 'desktop-credential-helper-trampoline.exe'
      : 'desktop-credential-helper-trampoline'

  const desktopCredentialHelperFile = `git-credential-desktop${
    process.platform === 'win32' ? '.exe' : ''
  }`

  cpSync(
    path.resolve(trampolineSource, desktopCredentialHelperTrampolineFile),
    path.resolve(gitCoreDir, desktopCredentialHelperFile),
    { recursive: true, verbatimSymlinks: true }
  )

  if (process.platform === 'darwin') {
    console.log('  Copying app-path binary…')
    const appPathMain = path.resolve(outRoot, 'main')
    rmSync(appPathMain, { recursive: true, force: true })
    cpSync(
      path.resolve(projectRoot, 'app/node_modules/app-path/main'),
      appPathMain,
      { recursive: true, verbatimSymlinks: true }
    )
  }

  console.log('  Copying process-proxy binary')
  cpSync(
    getProxyCommandPath(),
    path.resolve(
      outRoot,
      process.platform === 'win32' ? 'process-proxy.exe' : 'process-proxy'
    ),
    { recursive: true, verbatimSymlinks: true }
  )

  console.log('  Copying printenvz binary')
  cpSync(
    getPrintenvzPath(),
    path.resolve(
      outRoot,
      process.platform === 'win32' ? 'printenvz.exe' : 'printenvz'
    ),
    { recursive: true, verbatimSymlinks: true }
  )
}

function generateLicenseMetadata(outRoot: string) {
  const chooseALicense = path.join(outRoot, 'static', 'choosealicense.com')
  const licensesDir = path.join(chooseALicense, '_licenses')

  const files = readdirSync(licensesDir)

  const licenses = new Array<ILicense>()
  for (const file of files) {
    const fullPath = path.join(licensesDir, file)
    const contents = readFileSync(fullPath, 'utf8')
    const result = frontMatter<IChooseALicense>(contents)

    const licenseText = result.body.trim()
    // ensure that any license file created in the app does not trigger the
    // "no newline at end of file" warning when viewing diffs
    const licenseTextWithNewLine = `${licenseText}\n`

    const license: ILicense = {
      name: result.attributes.nickname || result.attributes.title,
      featured: result.attributes.featured || false,
      hidden:
        result.attributes.hidden === undefined || result.attributes.hidden,
      body: licenseTextWithNewLine,
    }

    if (!license.hidden) {
      licenses.push(license)
    }
  }

  const licensePayload = path.join(outRoot, 'static', 'available-licenses.json')
  const text = JSON.stringify(licenses)
  writeFileSync(licensePayload, text, 'utf8')

  // embed the license alongside the generated license payload
  const chooseALicenseLicense = path.join(chooseALicense, 'LICENSE.md')
  const licenseDestination = path.join(
    outRoot,
    'static',
    'LICENSE.choosealicense.md'
  )

  const licenseText = readFileSync(chooseALicenseLicense, 'utf8')
  const licenseWithHeader = `GitHub Desktop uses licensing information provided by choosealicense.com.

The bundle in available-licenses.json has been generated from a source list provided at https://github.com/github/choosealicense.com, which is made available under the below license:

------------

${licenseText}`

  writeFileSync(licenseDestination, licenseWithHeader, 'utf8')

  // sweep up the choosealicense directory as the important bits have been bundled in the app
  rmSync(chooseALicense, { recursive: true, force: true })
}

function getNotarizationOptions(): OsxNotarizeOptions | undefined {
  const {
    APPLE_ID: appleId,
    APPLE_ID_PASSWORD: appleIdPassword,
    APPLE_TEAM_ID: teamId,
  } = process.env

  return appleId && appleIdPassword && teamId
    ? { tool: 'notarytool', appleId, appleIdPassword, teamId }
    : undefined
}

function copyCopilotDependency() {
  const currentPlatform = process.platform
  const currentArch = getDistArchitecture()

  // The @github/copilot package now uses platform-specific optional
  // dependencies (e.g. @github/copilot-darwin-arm64) that already contain only
  // the binaries for the target platform, so we copy the appropriate one
  // directly instead of the base @github/copilot package.
  const copilotPkgDir = path.resolve(
    projectRoot,
    `app/node_modules/@github/copilot-${currentPlatform}-${currentArch}`
  )

  const copilotDestination = path.resolve(outRoot, 'copilot')
  removeAndCopy(copilotPkgDir, copilotDestination)

  // Platforms and architectures to remove from prebuild directories. This is
  // an exhaustive list of all non-current platforms rather than an allowlist,
  // because some packages (clipboard, pvrecorder) have entries without
  // standard platform identifiers that we must preserve.
  const nonValidPlatforms = [
    'darwin',
    'linux',
    'win32',
    'freebsd',
    'openbsd',
    'musl',
  ].filter(p => p !== currentPlatform)
  const nonValidArchitectures = [
    'x64',
    'arm64',
    'ia32',
    'armhf',
    'riscv64',
    'loong64',
  ].filter(a => a !== currentArch)

  // Also map platform names for packages that use non-standard naming
  // (e.g., pvrecorder uses "mac" and "windows" instead of "darwin"/"win32")
  const platformAliases: Record<string, string> = {
    darwin: 'mac',
    win32: 'windows',
  }
  const currentPlatformAlias = platformAliases[currentPlatform]
  const nonValidPlatformAliases = Object.values(platformAliases).filter(
    a => a !== currentPlatformAlias
  )

  // Removing unnecessary prebuild binaries from the copilot package to reduce
  // bundle size and prevent signing failures on Windows (signtool can't sign
  // non-PE binaries from other platforms).
  const prebuildsDirs = [
    path.join(copilotDestination, 'prebuilds'),
    path.join(copilotDestination, 'ripgrep', 'bin'),
    path.join(copilotDestination, 'clipboard', 'node_modules', '@teddyzhu'),
    path.join(
      copilotDestination,
      'clipboard',
      'node_modules',
      '@teddyzhu',
      'clipboard'
    ),
    path.join(
      copilotDestination,
      'foundry-local-sdk',
      'node_modules',
      'foundry-local-sdk',
      'prebuilds'
    ),
    path.join(
      copilotDestination,
      'pvrecorder',
      'node_modules',
      '@picovoice',
      'pvrecorder-node',
      'lib'
    ),
  ]

  for (const prebuildsDir of prebuildsDirs) {
    if (!existsSync(prebuildsDir)) {
      continue
    }

    const prebuilds = readdirSync(prebuildsDir)
    for (const prebuild of prebuilds) {
      const shouldRemove =
        nonValidPlatforms.some(p => prebuild.includes(p)) ||
        nonValidArchitectures.some(a => prebuild.includes(a)) ||
        nonValidPlatformAliases.some(a => prebuild === a)

      if (shouldRemove) {
        rmSync(path.join(prebuildsDir, prebuild), {
          recursive: true,
          force: true,
        })
      }
    }
  }

  // mxc cleanup (only if the mxc-bin directory exists in this copilot version)
  const mxcDir = path.join(copilotDestination, 'mxc-bin')
  if (!existsSync(mxcDir)) {
    return
  }
  // Read subdirs, delete the one that has a name that is not a valid architecture
  const mxcSubdirs = readdirSync(mxcDir)
  for (const subdir of mxcSubdirs) {
    if (nonValidArchitectures.some(a => subdir.includes(a))) {
      rmSync(path.join(mxcDir, subdir), {
        recursive: true,
        force: true,
      })
    }
  }
  // Then, read the subdir with the valid architecture and:
  // - leave only exe and dll files for Windows platforms
  // - on macOS, delete exe and dll files and also linux-test-proxy and lxc-exec
  // - on Linux, delete exe and dll files and also mxc-exec-mac
  const mxcArchSubdirPath = path.join(mxcDir, currentArch)
  if (!existsSync(mxcArchSubdirPath)) {
    return
  }
  const mxcFiles = readdirSync(mxcArchSubdirPath)
  const isWindowsBinary = (file: string) =>
    file.endsWith('.exe') || file.endsWith('.dll')
  const isMacOSBinary = (file: string) => file === 'mxc-exec-mac'
  const isLinuxBinary = (file: string) =>
    file === 'linux-test-proxy' || file === 'lxc-exec'

  for (const file of mxcFiles) {
    const shouldRemove =
      (currentPlatform === 'win32' &&
        (isMacOSBinary(file) || isLinuxBinary(file))) ||
      (currentPlatform === 'darwin' &&
        (isWindowsBinary(file) || isLinuxBinary(file))) ||
      (currentPlatform === 'linux' &&
        (isWindowsBinary(file) || isMacOSBinary(file)))

    if (shouldRemove) {
      rmSync(path.join(mxcArchSubdirPath, file), {
        recursive: true,
        force: true,
      })
    }
  }
}
