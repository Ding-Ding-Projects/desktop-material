#  Development Environment Setup

## Setup

Desktop Material's graphical Electron edition is developed and accepted on
Windows only:

- [Windows](./setup-windows.md)

The separate Linux-first terminal edition is developed and accepted on Linux:

- [Linux TUI development and verification](../features/linux-tui/verification.md)

Windows ARM64 build details are available here:

- [ARM64](./building-arm64.md)

Inherited macOS and Linux **Electron** setup files remain upstream reference
material, not supported graphical-edition development or release targets.

## Verification

Verify you have these commands available in your shell and that the found
versions look similar to the below output:

```shellsession
$ node -v
v24.15.0

$ yarn -v
1.21.1
```

Where those numbers come from, so you can check them yourself rather than
trusting this page:

| Tool | Pin | Where it is pinned |
| --- | --- | --- |
| Node.js | `24.15.0` | [`.node-version`](../../.node-version), [`.nvmrc`](../../.nvmrc), [`.tool-versions`](../../.tool-versions), and `NODE_VERSION` in [`ci-linux.yml`](../../.github/workflows/ci-linux.yml) and [`ci-windows.yml`](../../.github/workflows/ci-windows.yml) |
| Yarn | `1.21.1` (Yarn Classic) | [`.yarnrc`](../../.yarnrc) sets `yarn-path` to the vendored `vendor/yarn-1.21.1.js`, so a repository-local `yarn` reports `1.21.1` whatever you have installed globally |

`package.json` declares a looser floor of `node >= 22` and `yarn >= 1.9` for
consumers; the pins above are what this repository is developed and tested
against, so prefer them. Yarn Classic is deliberate — the lockfile is
`yarn lockfile v1` and Yarn 2+ will not read it.

### Python

Python is needed on Windows so that `node-gyp` can compile native modules during
install — [`setup-windows.md`](./setup-windows.md) covers installing it.

**This repository's Python pins contradict each other, and this page states that
rather than picking a winner:**

| Source | Python | What it is for |
| --- | --- | --- |
| [`.python-version`](../../.python-version) | `3.9` | inherited toolchain pin |
| [`.tool-versions`](../../.tool-versions) | `3.9.5` | inherited toolchain pin |
| [`setup-windows.md`](./setup-windows.md) | `3.9.x` | `node-gyp` native-module builds |
| [`super-express-release.yml`](../../.github/workflows/super-express-release.yml) | `3.11` | the Python the desktop packaging job restores |
| [`ci-linux.yml`](../../.github/workflows/ci-linux.yml) and [`ci-windows.yml`](../../.github/workflows/ci-windows.yml) | `3.10`, `3.12`, `3.13` | the `linux-tui` / `windows-tui-core` test matrix |

Nothing in CI installs Python 3.9, so no green run is evidence that `3.9` still
works here; the versions with passing runs behind them are `3.10` through `3.13`.
Those runs test the Python TUI package, not `node-gyp`, so no CI run vouches for
any particular Python for the native-module build either. Whether the pin files should be raised, or CI lowered to match them, is a
maintainer decision that has not been made — so neither side was quietly edited to
agree with the other. If you hit a `node-gyp` failure, report the Python version
you used on
[the tracker](https://github.com/Ding-Ding-Projects/desktop-material/issues), as
that is the data this needs to be settled.

There are also [additional resources](tooling.md) to configure your favorite
editor to work nicely with this repository.

## Building Desktop Material

First, create a fork of [`Ding-Ding-Projects/desktop-material`](https://github.com/Ding-Ding-Projects/desktop-material)
and then clone your fork to your local machine. You'll need to be inside the
repository in order to build the application locally.

Contributions go to this repository, not to `desktop/desktop`. This codebase
originated as a fork of that project (MIT) and credits it as such, but upstream
cannot review or ship a Desktop Material change.

The typical workflow to get up running is as follows:

* Run `yarn` to get all required dependencies on your machine.
* Run `yarn build:dev` to create a development build of the app.
* Run `yarn start` to launch the application. Changes will be compiled in the
  background. The app can then be reloaded to see the changes
  (<kbd>Ctrl+Alt+R</kbd>).

If you've made changes in the `main-process` folder you need to run `yarn
build:dev` to rebuild the package, and then `yarn start` for these changes to be
reflected in the running app.

If you are using GitHub Enterprise with your development build of Desktop
Material, you will need to follow a few extra steps to
[authenticate properly](github-enterprise-auth-from-dev-build.md).

If you're still encountering issues with building, refer to our
[troubleshooting](troubleshooting.md) guide for more common
problems.

## Running tests

- `yarn test` - Alias for `yarn test:unit`
- `yarn test:script` - Runs all script tests
- `yarn test:eslint` - Runs all eslint tests 
- `yarn test:unit` - Runs all unit tests
  - Add `<file>` argument to only run tests in the specified file
  - Add `<directory>` to search for tests matching our test pattern in the given directory
  - Add `--test-name-pattern <pattern>` to only match tests whose name matches the pattern
  - For more information on these and other arguments, see [Node CLI options](https://nodejs.org/api/test.html)

## Debugging

Electron ships with Chrome Dev Tools to assist with debugging, profiling and
other measurement tools.

1. Run the command `yarn start` to launch the app
2. Under the **View** menu, select **Toggle Developer Tools**

When running the app in development mode,
[React Dev Tools](https://chrome.google.com/webstore/detail/react-developer-tools/fmkadmapgofadopljbjfkapdkoienihi?hl=en)
should automatically install itself on first start when in development mode.

## The Next Steps

You're almost there! Here's a couple of things we recommend you read next:

 - [Help Wanted](../../.github/CONTRIBUTING.md#help-wanted) - we've marked some
   tasks in the backlog that are ideal for external contributors
 - [Notes for Contributors](../process/notes-for-contributors.md) - some notes
   for new contributors getting started
