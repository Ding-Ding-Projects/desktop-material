# Cheap LFS Release payload encryption

Desktop Material can encrypt newly uploaded GitHub Release-backed Cheap LFS
payloads with a repository-scoped password. The option is deliberately off by
default and applies only to the Release provider. GHCR and Docker Hub keep their
existing repository-key contract.

## Behavior

Open **Repository settings → Cheap LFS**, keep **GitHub Release** as the storage
provider, and enable **Encrypt new Release payloads**. Before the option becomes
active, the app asks for a password in a masked field and requires an explicit
acknowledgement that losing the password makes the encrypted payload
unrecoverable. The acknowledgement records consent only; it never stores the
password.

Each stable source range is streamed through AES-256-GCM. A fixed, versioned
container header records the non-secret cipher and scrypt parameters, salt,
nonce, and authentication metadata. The committed pointer records both the
plaintext size/SHA-256 and the encrypted container size/SHA-256. Uploads,
downloads, and restores verify the applicable receipt before replacing any
working-tree file.

The working-tree file stays plaintext. Existing unencrypted pointers remain
readable, and disabling the setting affects only future uploads. An already
encrypted pointer still requires its password to materialize.

## Password storage

The password can stay only in the current app process, which is the default, or
the user can opt into the operating-system credential vault. It is never
written to repository preferences, Git history, local storage, the profile
history repository, a pointer, or a Release asset. Vault entries use a hashed
repository identity rather than exposing the local path or remote name in the
credential label.

**Set/Change password** replaces the in-session value and, when requested, the
vault value. **Forget saved password** clears both the in-session copy and the
exact repository-scoped vault entry. Buffers owned by the transfer path are
zeroed after use where the JavaScript runtime permits.

## Failure modes and safety

- A missing password stops before provider access for an encrypted upload or
  restore. The app never silently falls back to plaintext.
- A locked or unavailable credential vault produces a non-blocking error. The
  password can still remain in memory for the current process; it is never
  copied to a weaker store.
- A changed source range, malformed header, unsupported parameters, wrong
  password, authentication-tag failure, size mismatch, or SHA-256 mismatch
  rejects the operation before the destination is replaced.
- Temporary encrypted and decrypted files are removed on success, failure, and
  cancellation. Manual browser upload is refused for encrypted payloads because
  it cannot preserve the app's verified cleanup and receipt boundary.
- Ciphertext size, rather than plaintext or compressed size, is used for
  provider storage totals.

Password recovery is intentionally impossible. A forgotten password cannot be
derived from the pointer, Release asset, or app settings.

## Verification

Focused unit and integration coverage exercises container round trips,
streaming ranges, wrong-password and tamper failures, pointer parsing,
encrypted multipart Release upload and materialization, exact temporary-file
cleanup, credential-vault save/change/forget behavior, the irreversible
acknowledgement, all three language modes, and ciphertext storage accounting.
The checkpoint also passes full TypeScript checking. Packaged visual acceptance
and remote CI remain separate release evidence.

This feature adds no HTTP endpoint, so a Postman collection is not applicable.
