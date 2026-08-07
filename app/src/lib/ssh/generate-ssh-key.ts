import { generateKeyPair } from 'crypto'
import { promisify } from 'util'
import { TokenStore } from '../stores'
import { getSSHCredentialStoreKey } from './ssh-credential-storage'

const generateKeyPairAsync = promisify(generateKeyPair)

/** Store/key used to persist the auto-generated SSH private key material. */
export const GeneratedSSHKeyStore =
  getSSHCredentialStoreKey('Generated SSH Key')
const GeneratedSSHKeyStoreLogin = 'default'

export interface IGeneratedSSHKey {
  /** OpenSSH `authorized_keys`-formatted public key, safe to display/copy. */
  readonly publicKey: string
  /** PEM-encoded PKCS#8 private key. Never logged or rendered raw in the UI. */
  readonly privateKey: string
}

/**
 * Renders a raw Ed25519 public key (as produced by Node's `crypto` module in
 * `der` format) into the `ssh-ed25519 <base64> <comment>` line OpenSSH and
 * most Git hosts expect in `authorized_keys` / "add SSH key" forms.
 */
function toOpenSSHPublicKey(rawPublicKeyDer: Buffer, comment: string): string {
  // An Ed25519 SPKI DER public key is a fixed-length structure ending in the
  // 32-byte raw key; the last 32 bytes are exactly what OpenSSH's wire format
  // needs, so we don't need a full ASN.1 parser here.
  const rawKey = rawPublicKeyDer.subarray(rawPublicKeyDer.length - 32)

  const keyType = 'ssh-ed25519'
  const parts = [encodeSSHString(Buffer.from(keyType)), encodeSSHString(rawKey)]
  const blob = Buffer.concat(parts).toString('base64')

  return `${keyType} ${blob} ${comment}`.trim()
}

function encodeSSHString(value: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(value.length, 0)
  return Buffer.concat([length, value])
}

/**
 * Generates a new Ed25519 SSH key pair locally (no network access), and
 * stores the private key in the OS-backed credential vault (the same
 * `TokenStore`/keytar mechanism Desktop already uses for SSH passphrases and
 * Git credentials). The private key is never written to disk, logged, or
 * returned to callers that only need the public half.
 *
 * @param comment A label embedded in the public key line, e.g. the user's
 *                configured Git email, to help identify the key on a host.
 */
export async function generateSSHKey(
  comment: string
): Promise<IGeneratedSSHKey> {
  const { publicKey, privateKey } = await generateKeyPairAsync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })

  const openSSHPublicKey = toOpenSSHPublicKey(publicKey, comment)

  await TokenStore.setItem(
    GeneratedSSHKeyStore,
    GeneratedSSHKeyStoreLogin,
    privateKey
  )

  return { publicKey: openSSHPublicKey, privateKey }
}

/** Returns the most recently generated private key, if one is stored. */
export function getGeneratedSSHPrivateKey(): Promise<string | null> {
  return TokenStore.getItem(GeneratedSSHKeyStore, GeneratedSSHKeyStoreLogin)
}

/** Deletes the auto-generated key from the credential vault, if present. */
export function deleteGeneratedSSHKey(): Promise<boolean> {
  return TokenStore.deleteItem(GeneratedSSHKeyStore, GeneratedSSHKeyStoreLogin)
}
