/**
 * Pure resolution of the `act` (nektos/act) release asset to download.
 *
 * Kept free of I/O so the part most likely to be wrong — which file to fetch
 * for the machine we are on — is unit-testable without touching the network.
 * The downloader in the main process supplies the actual transport.
 */

/** Thrown when this host has no published `act` build. */
export class ActReleaseError extends Error {
  public constructor(message: string) {
    super(message)
    this.name = 'ActReleaseError'
  }
}

/**
 * `act` publishes one asset per OS/architecture pair, named
 * `act_<Os>_<Arch>.<ext>`. The OS and architecture spellings are the release's
 * own, which is why they are mapped explicitly rather than derived from
 * Node's: `process.arch` says `x64` where the asset says `x86_64`, and
 * `win32`/`darwin` are `Windows`/`Darwin` there.
 */
const OperatingSystems = new Map<string, string>([
  ['win32', 'Windows'],
  ['darwin', 'Darwin'],
  ['linux', 'Linux'],
])

const Architectures = new Map<string, string>([
  ['x64', 'x86_64'],
  ['arm64', 'arm64'],
  ['arm', 'armv7'],
  ['ia32', 'i386'],
])

/** The archive `act` ships for a platform. Windows uses zip, others tar.gz. */
export function actArchiveExtension(platform: string): string {
  return platform === 'win32' ? 'zip' : 'tar.gz'
}

/** The executable name inside the extracted archive. */
export function actExecutableName(platform: string): string {
  return platform === 'win32' ? 'act.exe' : 'act'
}

/**
 * The release asset file name for a host, e.g. `act_Windows_x86_64.zip`.
 *
 * Throws {@link ActReleaseError} rather than guessing when the host is one
 * `act` publishes nothing for — a download that 404s halfway through an
 * install is a worse way to learn that than being told up front.
 */
export function actAssetName(platform: string, arch: string): string {
  const os = OperatingSystems.get(platform)
  const architecture = Architectures.get(arch)

  if (os === undefined || architecture === undefined) {
    throw new ActReleaseError(
      `act publishes no build for ${platform}/${arch}, so it cannot be ` +
        `installed automatically here. Install it manually and it will be ` +
        `picked up from your PATH.`
    )
  }

  return `act_${os}_${architecture}.${actArchiveExtension(platform)}`
}

/**
 * The download URL for a release asset.
 *
 * `latest` uses GitHub's redirecting `releases/latest/download` path so no
 * version has to be resolved first; an explicit tag pins the exact release.
 */
export function actDownloadUrl(
  assetName: string,
  version: string = 'latest'
): string {
  if (!/^[A-Za-z0-9._-]+$/.test(assetName)) {
    throw new ActReleaseError(`Refusing to download "${assetName}".`)
  }

  if (version === 'latest') {
    return `https://github.com/nektos/act/releases/latest/download/${assetName}`
  }

  if (!/^v?[0-9][A-Za-z0-9._-]*$/.test(version)) {
    throw new ActReleaseError(`Refusing to download release "${version}".`)
  }

  return `https://github.com/nektos/act/releases/download/${version}/${assetName}`
}
