# Split

**English** · [한국어](README.ko.md)

Move and resize windows with keyboard shortcuts. No mouse required.

Split is a free window manager by RUNNERS for macOS (universal for Apple silicon and Intel, notarized), Windows and Linux, with auto-arrange, saved layouts, arranging from the phone app and 20 languages. The shortcuts below are the Mac ones.

## Install

1. Download `Split-<version>.dmg` from [Releases](https://github.com/RUNNERS-IM/split/releases), open it and drag Split to Applications. Split is signed and notarized, so it opens without a warning. On Windows download `Split-<version>-windows-x64-setup.exe`, on Linux the `.AppImage` or `.deb`.
2. On a Mac, Split opens **System Settings → Privacy & Security → Accessibility** next to its guide window. Turn on the switch next to Split. Split cannot move windows of other apps without this permission. Once it is on, the guide turns into a "You’re all set" view with a first shortcut to try, and stays until you close it.
3. If another copy of a Spectacle-style window manager is still running, Split offers to quit it so the two apps don't react to the same shortcuts.

On a Mac, Split runs natively on Apple silicon and Intel with macOS 13 or later. Split checks GitHub for a new version once a day, downloads it and asks before installing.

With Homebrew:

```sh
brew tap runners-im/tap
brew trust runners-im/tap   # recent Homebrew asks you to trust third-party taps once
brew install --cask split
```

Split speaks Arabic, Chinese (Simplified), Chinese (Traditional), Dutch, English, Finnish, French, German, Hindi, Indonesian, Italian, Japanese, Korean, Polish, Portuguese, Russian, Spanish, Thai, Turkish and Vietnamese. It follows the language set for your Mac.

## Default keyboard shortcuts

| Symbol | Key |
|:---:|:---|
| ⌘ | Command |
| ⌃ | Control |
| ⌥ | Option |
| ⇧ | Shift |

All shortcuts can be changed or cleared in Settings → Shortcuts.

### Basic window actions

- Center — ⌥⌘C (size is not changed)
- Fullscreen — ⌥⌘F
- Left half — ⌥⌘←
- Right half — ⌥⌘→
- Top half — ⌥⌘↑
- Bottom half — ⌥⌘↓
- Upper left — ⌃⌘←
- Lower left — ⌃⇧⌘←
- Upper right — ⌃⌘→
- Lower right — ⌃⇧⌘→

Pressing a half or corner shortcut repeatedly cycles the window through 1/2, 3/4 and 1/4 of that region.

### Auto arrange

- Arrange all windows — ⌥⌘A

Places up to 9 visible windows on the display with the frontmost window, most recently used first:

| Windows | Layout |
|:---:|:---|
| 1 | Full screen |
| 2 | Left and right halves |
| 3 | Left half, right side split top and bottom |
| 4 | 2 × 2 grid |
| 5 | 2 × 2 grid, the front window floating in the middle at 60% |
| 6 | 3 × 2 grid |
| 7–9 | 3 × 2 grid, the rest stacked in the middle at 60%, 30 points apart |

Minimized windows, windows in full screen and windows of hidden apps are left alone. One undo (⌥⌘Z) puts every arranged window back where it was. Hovering the menu item shows where each window will go.

### Thirds

- Next third — ⌃⌥→
- Previous third — ⌃⌥←

### Resize

- Make larger — ⌃⌥⇧→
- Make smaller — ⌃⌥⇧←

Split keeps the window touching the screen edges it already touches while resizing.

### Multiple displays

- Next display — ⌃⌥⌘→
- Previous display — ⌃⌥⌘←

### History

- Undo last window action — ⌥⌘Z
- Redo — ⌥⇧⌘Z

Hold ⌥⌘ for a second to see the list of shortcuts on screen. This can be turned off in Settings.

### Pausing shortcuts

When another app needs the same keys, choose **Pause Shortcuts** in the Split menu:

- **For an Hour** — every Split shortcut is off for an hour.
- **While (app) Is in Front** — Split shortcuts are off whenever that app is the front app, and come back as soon as you switch away. With that app in front, choose the same item again to turn its shortcuts back on.

## Launch options

These are checked in the version downloaded from Releases or Homebrew; the Mac App Store version has not been tried. Split must already be running; the options are passed to it.

```sh
open -g -a Split --args --perform MoveToLeftHalf   # run one window action, for scripts and launchers
open -g -a Split --args --menu                     # show the Split menu at the pointer
open -g -a Split --args --guide                    # show the Accessibility guide again
```

The action names for `--perform` are MoveToCenter, MoveToFullscreen, MoveToLeftHalf, MoveToRightHalf, MoveToTopHalf, MoveToBottomHalf, MoveToUpperLeft, MoveToUpperRight, MoveToLowerLeft, MoveToLowerRight, MoveToNextThird, MoveToPreviousThird, MoveToNextDisplay, MoveToPreviousDisplay, MakeLarger, MakeSmaller, UndoLastMove, RedoLastMove and ArrangeWindows. Opening Split again without options opens its settings.

## Roadmap

Done:

- Rebuilt with Electron for macOS, Windows and Linux, plus a Mac App Store version
- The Phone tab in settings: arrange windows into a shape or bring back a saved layout from the Split phone app
- Developer ID signing, notarization and automatic updates from GitHub Releases
- A step-by-step Accessibility permission guide
- Homebrew tap
- New icon, a picture menu with a live preview, and a glow after each move
- Auto arrange (⌥⌘A)
- A new settings window and 18 languages
- 1.2: an Effects tab (strength, color, label, duration, position), space between windows (screen edges stay flush),
  full screen that toggles back, rearranging windows when monitors are plugged in or out,
  a shortcut list while ⌥⌘ is held, and short tips for new users

Issues and pull requests are welcome in this repository.

## Common issues

### Split asks for accessibility access

Split uses the macOS Accessibility protocol to move windows that belong to other applications. It cannot work until it is allowed in **System Settings → Privacy & Security → Accessibility**.

### A window does not resize as expected

Applications may set a minimum or maximum size for their windows. Split always respects those constraints, so a window with a minimum width of 1600 px cannot be fitted into a 1440 px half of the screen. It will be resized as close to the target as the application allows.

### Terminal windows behave oddly

Terminal and similar apps (iTerm2 and others) only allow sizes that show whole rows and columns. Split tries the exact size first and then shrinks the window step by step until it fits, which can look slightly jittery. The result is centered inside the intended region.

### The Split icon is hidden behind the notch

On a MacBook with a notch, a full menu bar can push the Split icon under the notch. Open Split again (from Applications or Spotlight) to get its settings, or run `open -g -a Split --args --menu` to show the Split menu at the pointer. The same works when the menu bar icon is turned off in Settings.

### Some applications cannot be controlled

Applications that build their interface in non-standard ways may not expose their windows through the Accessibility protocol. Split cannot move those windows.

## Building from source

The current app is the Electron app in `app/`. It needs Node.js and pnpm.

```sh
cd app
pnpm install
pnpm dev        # run for development
pnpm test       # tests
pnpm typecheck  # type check
```

Pushing to the `release` branch makes GitHub Actions build, sign and notarize the macOS, Windows and Linux versions and upload them to GitHub Releases. To build by hand use `pnpm dist:mac`, `pnpm dist:win` or `pnpm dist:linux`. The earlier Objective-C Mac version is kept at the tag `legacy-objc`.

## License

Copyright (c) 2026 Runners Co., Ltd. All rights reserved. See [LICENSE.md](LICENSE.md).

The notices of the open source code Split uses (Lucide and Spectacle) are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and in the app under About Split → Open Source Notices.
