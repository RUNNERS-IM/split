<p align="center">
  <img src="https://runners.im/images/apps/split/icon.webp" width="96" alt="Split">
</p>
<h1 align="center">Split</h1>
<p align="center"><b>One shortcut, half the screen.</b><br>Move windows to halves, thirds, corners or the next display with one shortcut, and arrange up to nine at once.</p>
<p align="center">
  <a href="https://runners.im/en/split"><b>Download for Mac</b></a> ·
  <a href="https://github.com/RUNNERS-IM/split/releases/latest">Windows · Linux</a> ·
  <a href="README.ko.md">한국어</a>
</p>
<p align="center"><sub>Free · macOS 13 or later · Apple silicon · Intel · Windows · Linux · 20 languages</sub></p>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://runners.im/images/apps/split/stage-en-dark.webp">
  <img src="https://runners.im/images/apps/split/stage-en-light.webp" alt="Split arranging the windows on a Mac">
</picture>

## What it does

<table>
<tr>
<td colspan="2"><picture><source media="(prefers-color-scheme: dark)" srcset="https://runners.im/images/apps/split/shortcuts-en-dark.webp"><img src="https://runners.im/images/apps/split/shortcuts-en-light.webp" alt="The Split shortcut list that appears when you hold ⌥⌘ for a second"></picture><br><b>Never leave the keyboard</b><br>Halves, corners, thirds and the next display are each one shortcut away. Press the same key again to cycle 1/2 → 2/3 → 1/3, and hold ⌥⌘ for a second to see every shortcut.</td>
</tr>
<tr>
<td width="50%"><picture><source media="(prefers-color-scheme: dark)" srcset="https://runners.im/images/apps/split/layouts-en-dark.webp"><img src="https://runners.im/images/apps/split/layouts-en-light.webp" alt="The Split menu for picking a display and a layout shape"></picture><br><b>Up to nine windows with one ⌥⌘A</b><br>Arranges the windows on the display to fit how many there are. One ⌥⌘Z puts them all back.</td>
<td width="50%"><picture><source media="(prefers-color-scheme: dark)" srcset="https://runners.im/images/apps/split/save-en-dark.webp"><img src="https://runners.im/images/apps/split/save-en-light.webp" alt="The Split window for saving the current layout under a name"></picture><br><b>Save and restore layouts</b><br>Save every window's place across all displays under a name, and load it when the same displays connect.</td>
</tr>
<tr>
<td><picture><source media="(prefers-color-scheme: dark)" srcset="https://runners.im/images/apps/split/displays-en-dark.webp"><img src="https://runners.im/images/apps/split/displays-en-light.webp" alt="Split notice saying windows were rearranged because the displays changed"></picture><br><b>Unplug and replug without losing your place</b><br>Windows move to the screens that are left and come back when the display returns.</td>
<td><picture><source media="(prefers-color-scheme: dark)" srcset="https://runners.im/images/apps/split/effects-en-dark.webp"><img src="https://runners.im/images/apps/split/effects-en-light.webp" alt="The Effects tab of Split settings"></picture><br><b>See where it went</b><br>The moved window glows briefly and the shortcut you pressed appears on screen.</td>
</tr>
</table>

With the Split phone app and the same RUNNERS account, you can also arrange this computer's windows from your phone (Settings → Account).

## Install

```sh
brew tap runners-im/tap && brew trust runners-im/tap
brew install --cask split
```

Or download `Split-<version>.dmg` from [Releases](https://github.com/RUNNERS-IM/split/releases/latest), open it and drag Split to Applications. It is signed and notarized, so it opens without a warning. Windows (`-windows-x64-setup.exe`) and Linux (`.AppImage`, `.deb`) builds are on the same page.

On first launch Split opens **System Settings → Privacy & Security → Accessibility**. Turn on the switch next to Split; it cannot move other apps' windows without this. Windows and Linux skip this step. Split checks GitHub for a new version once a day and asks before installing it.

## Default shortcuts

`⌘` Command · `⌃` Control · `⌥` Option · `⇧` Shift. Change or clear any of them in Settings → Shortcuts.

| Action | Keys |
|:---|:---:|
| **Arrange all windows** | **⌥⌘A** |
| Left half | ⌥⌘← |
| Right half | ⌥⌘→ |
| Top half | ⌥⌘↑ |
| Bottom half | ⌥⌘↓ |
| Upper left | ⌃⌘← |
| Lower left | ⌃⇧⌘← |
| Upper right | ⌃⌘→ |
| Lower right | ⌃⇧⌘→ |
| Center (same size) | ⌥⌘C |
| Fullscreen | ⌥⌘F |
| Next third | ⌃⌥→ |
| Previous third | ⌃⌥← |
| Make larger | ⌃⌥⇧→ |
| Make smaller | ⌃⌥⇧← |
| Next display | ⌃⌥⌘→ |
| Previous display | ⌃⌥⌘← |
| Undo | ⌥⌘Z |
| Redo | ⌥⇧⌘Z |

Pressing a half or corner shortcut again cycles the window through 1/2, 2/3 and 1/3 of that region. Resizing keeps the window touching the screen edges it already touches.

**Arrange all windows** places up to nine visible windows on the front window's display, most recently used first:

| Windows | Layout |
|:---:|:---|
| 1 | Full screen |
| 2 | Left and right halves |
| 3 | Left half, right side split top and bottom |
| 4 | 2 × 2 grid |
| 5 | 2 × 2 grid, the front window floating in the middle at 60% |
| 6 | 3 × 2 grid |
| 7–9 | 3 × 2 grid, the rest stacked in the middle at 60%, 30 points apart |

Minimized windows, full-screen windows and windows of hidden apps are left alone. Hover the menu item to preview where each window will go.

**Pausing shortcuts.** When another app needs the same keys, choose **Pause Shortcuts** in the Split menu: **For an Hour**, or **While (app) Is in Front**, which turns Split's shortcuts off only while that app is the front app.

<details>
<summary><b>Launch options</b></summary>

Split must already be running. Checked with the Releases and Homebrew versions.

```sh
open -g -a Split --args --perform MoveToLeftHalf   # run one window action, for scripts and launchers
open -g -a Split --args --menu                     # show the Split menu at the pointer
open -g -a Split --args --guide                    # show the Accessibility guide again
```

Action names for `--perform`: MoveToCenter, MoveToFullscreen, MoveToLeftHalf, MoveToRightHalf, MoveToTopHalf, MoveToBottomHalf, MoveToUpperLeft, MoveToUpperRight, MoveToLowerLeft, MoveToLowerRight, MoveToNextThird, MoveToPreviousThird, MoveToNextDisplay, MoveToPreviousDisplay, MakeLarger, MakeSmaller, UndoLastMove, RedoLastMove and ArrangeWindows. Opening Split again without options opens its settings.

</details>

## Privacy

Split has no ads and no analytics. Window positions are read only on your computer, and window contents are never read. It sends a short error report (with emails, tokens and names hidden) when it runs into an error, and talks to the RUNNERS account server only after you sign in on the Account tab. Details: [PRIVACY.md](PRIVACY.md).

## Common issues

<details>
<summary><b>A window does not resize as expected</b></summary>

Apps can set a minimum or maximum size for their windows, and Split respects it. A window with a minimum width of 1600 px cannot fit a 1440 px half, so it is sized as close as the app allows.
</details>

<details>
<summary><b>Terminal windows look jittery</b></summary>

Terminal, iTerm2 and similar apps only allow sizes that show whole rows and columns. Split tries the exact size first, then shrinks step by step until it fits, and centers the result in the intended region.
</details>

<details>
<summary><b>The Split icon is hidden behind the notch</b></summary>

On a MacBook with a notch, a full menu bar can push the icon under the notch. Open Split again from Applications or Spotlight to get its settings, or run `open -g -a Split --args --menu`. The same works when the menu bar icon is turned off.
</details>

<details>
<summary><b>Some apps cannot be controlled</b></summary>

Apps that draw their interface in non-standard ways may not expose their windows through the Accessibility protocol, so Split cannot move them.
</details>

Issues and pull requests are welcome in this repository.

## Building from source

The app is the Electron app in `app/` and needs Node.js and pnpm.

```sh
cd app
pnpm install
pnpm dev        # run for development
pnpm test       # tests
pnpm typecheck  # type check
```

Pushing to the `release` branch makes GitHub Actions build, sign and notarize the macOS, Windows and Linux versions and upload them to Releases. By hand: `pnpm dist:mac`, `pnpm dist:win` or `pnpm dist:linux`. The earlier Objective-C Mac version is kept at the tag `legacy-objc`.

---

<p align="center"><a href="https://runners.im"><picture><source media="(prefers-color-scheme: dark)" srcset="https://runners.im/icons/logos/RUNNERS_H_W.svg"><img src="https://runners.im/icons/logos/RUNNERS_H.svg" height="20" alt="RUNNERS"></picture></a><br><sub>Made by RUNNERS · © 2026 Runners Co., Ltd. All rights reserved (<a href="LICENSE.md">LICENSE.md</a>) · Open source notices in <a href="THIRD_PARTY_NOTICES.md">THIRD_PARTY_NOTICES.md</a></sub></p>
