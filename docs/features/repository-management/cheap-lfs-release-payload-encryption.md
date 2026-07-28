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

By default, a prompted password belongs only to that upload or materialization
operation and its buffer is overwritten when the operation settles. The next
operation prompts again. The user can instead opt into the operating-system
credential vault. A password is never written to repository preferences, Git
history, local storage, the profile history repository, a pointer, or a Release
asset. Vault entries use a hashed repository identity rather than exposing the
local path or remote name in the credential label.

**Set/Change password** changes the vault value only when **Save in Windows
Credential Manager** is selected. **Forget saved password** clears the exact
repository-scoped vault entry. A password entered for decryption is saved only
after its GCM tag and plaintext receipts verify, so a mistyped replacement
cannot overwrite a usable credential. Buffers owned by the transfer path are
zeroed after use where the JavaScript runtime permits.

## Unattended commits

A scheduled or automated commit runs with nobody in front of the app, so it must
never summon credential UI. When such a commit would auto-pin a large file in a
repository that has encryption on and **no** saved password, the pin is skipped
rather than prompted:

- Nothing is encrypted and nothing is uploaded. No release is anchored and no
  provider is contacted, because the decision is made before the anchor step.
- The affected large files stay in the working tree, unchanged, and are left out
  of that commit. Everything else in the selection commits normally.
- Each skipped file carries a localized reason on its commit-terminal row, and a
  single non-blocking notice per repository explains what happened and how to
  fix it — commit interactively to be asked for the password, or save one under
  **Large files & storage**. No modal is shown.
- An unreachable or locked credential vault is treated exactly like a missing
  password. It is never read as permission to upload in the clear.

An interactive commit is unaffected: it still opens the masked password dialog,
which is a modal because the password is a decision required before continuing.
The notice body honours the per-language funny-level sliders; the skipped paths,
their count, and the remedy are stated identically at every level.

## Failure modes and safety

- A missing password opens the masked password prompt before an encrypted
  upload or restore. Canceling stops before provider access, and the app never
  silently falls back to plaintext.
- An unattended commit is never prompted at all. See **Unattended commits**
  above for the defined skip-and-report outcome.
- A locked or unavailable credential vault produces a non-blocking error. The
  one-operation password is never copied to a weaker store.
- A saved password that fails authentication is identified as stale. The app
  asks before removing it, then asks for a replacement and retries without
  publishing partial plaintext.
- Pointers already written by the pushed format-v1 implementation remain
  readable. The canonical contract stays `encryption 1` followed by
  `part-encrypted <plain-sha> <plain-size> <stored-size> <stored-sha> <name>`;
  the unchanged versioned container remains decryptable by the streaming path.
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
streaming ranges, a captured origin/main format-v1 container, the exact
origin/main pointer text, wrong-password and tamper failures, encrypted
multipart Release upload and materialization, exact temporary-file cleanup,
operation-scoped prompting, stale-vault replacement, credential-vault
save/change/forget behavior, the irreversible acknowledgement, the unattended
commit skip (including the unreachable-vault case, the funny-level bands, and
the source-level proof that the skip is decided before any prompt or anchor),
all three language modes, and ciphertext storage accounting. The checkpoint also passes
full TypeScript checking. Packaged visual acceptance and remote CI remain
separate release evidence.

This feature adds no HTTP endpoint, so a Postman collection is not applicable.
