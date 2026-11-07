# Contributing

Issues and pull requests are welcome at [RUNNERS-IM/split](https://github.com/RUNNERS-IM/split).

## Issues

Search the existing issues first. When reporting a defect, include the Split version (Split → About), the macOS version, the shortcut or menu item you used, and what you expected to happen.

## Pull requests

- Branch from `master` and keep each pull request to one change.
- Run the tests before sending: `cd app && pnpm typecheck && pnpm test`.
- New text shown to users goes into `app/locales` for all 20 languages.
- Comments that name a `.m` file point to the earlier Objective-C app, kept at the tag `legacy-objc`.
- Releases are made by merging `master` into `release`; do not bump versions by hand.
