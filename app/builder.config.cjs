// electron-builder settings for Split, in the same shape as the other RUNNERS apps (Prompt's
// config/electron-builder.config.cjs). Release builds set SPLIT_RELEASE=1 so signing and
// notarization are required; local builds stay unsigned-friendly.
const isRelease = process.env.SPLIT_RELEASE === '1'
// File names use the release tag (2.6.1031.2) instead of the in-app version (2.6.1031+2): a "+" in a GitHub
// release file name is not kept as is, and the tag is what people see anyway.
const tag = process.env.SPLIT_TAG || '${version}'
// Why: Windows keeps a file version as four numbers of at most 65535 each, so the same-day "+2" becomes the
// fourth number (2.6.1031+2 -> 2.6.1031.2), as Monitor does. The semver version updates compare is not changed.
const [base, sameDay = '0'] = require('./package.json').version.split('+')
const shownVersion = sameDay === '0' ? base : `${base}.${sameDay}`
// Why: the macOS app before this one updated through Sparkle, which compares CFBundleVersion. It used the commit
// count (789 for 2.6.1030.10), so this build keeps counting commits; a smaller number would not be offered as an update.
const bundleVersion = process.env.SPLIT_BUILD_NUMBER || require('child_process').execSync('git rev-list --count HEAD').toString().trim()

module.exports = {
  appId: 'im.runners.Split',
  productName: 'Split',
  buildVersion: `${base}.${sameDay}`,
  copyright: '© 2026 RUNNERS. All rights reserved.',
  // Why: .noindex keeps Spotlight from listing the test app next to the installed one.
  directories: { output: 'dist.noindex', buildResources: 'resources/build' },
  files: ['out/**', 'package.json'],
  extraResources: [
    // The native module (native/split-native.<os>-<cpu>*.node) is added per system below.
    { from: '../Split/Resources/Window Position Calculations', to: 'Window Position Calculations' },
    { from: 'resources/menu', to: 'menu' },
    { from: 'resources/tray', to: 'tray' },
  ],
  // The window math and icons sit outside app.asar, so nothing in node_modules is needed at run time but electron-updater.
  asar: true,
  // Why: no npm package with native code ships; the one native module is built by cargo (pnpm native).
  npmRebuild: false,
  mac: {
    category: 'public.app-category.utilities',
    artifactName: `Split-${tag}-mac.\${ext}`,
    bundleVersion,
    icon: 'resources/build/icon.icns',
    minimumSystemVersion: '13.0',
    target: [
      { target: 'dmg', arch: ['universal'] },
      { target: 'zip', arch: ['universal'] },
    ],
    // Why: pnpm native:mac-universal joins both CPUs into one file, so both halves of the universal app carry the same one.
    extraResources: [{ from: 'native', to: 'native', filter: ['split-native.darwin-universal.node'] }],
    x64ArchFiles: 'Contents/Resources/native/*.node',
    hardenedRuntime: true,
    // Why: a local build is not signed with the Developer ID; it is signed ad hoc so it still opens on this Mac.
    ...(isRelease ? {} : { identity: null }),
    entitlements: 'resources/build/entitlements.mac.plist',
    entitlementsInherit: 'resources/build/entitlements.mac.plist',
    notarize: isRelease,
    extendInfo: {
      // Split lives in the menu bar and has no Dock icon, like the macOS app before it.
      LSUIElement: true,
      NSHumanReadableCopyright: '© 2026 RUNNERS. All rights reserved.',
      CFBundleShortVersionString: shownVersion,
      // Shown when Split asks System Events to take Spectacle out of the login items.
      // Why: the previous Mac app (Sparkle 2.10.1) refuses an update whose app drops the EdDSA key it
      // was installed with ("improperly signed"), so the Electron app carries the same public key.
      SUPublicEDKey: '6ZRakftZ8nsC4X0dKIhLz086/SRYn5prMraBTD3vbhw=',
      NSAppleEventsUsageDescription: 'Split removes Spectacle from your login items so the two apps do not answer the same shortcuts.',
    },
  },
  // App Store build (electron-builder --mac mas:universal, scripts/release-app-store.sh). It runs in the App Sandbox,
  // has no update check (process.mas) and is signed with Apple Distribution and the profile in SPLIT_MAS_PROFILE.
  mas: {
    type: 'distribution',
    artifactName: `Split-${tag}-mas.\${ext}`,
    bundleVersion,
    hardenedRuntime: false,
    notarize: false,
    entitlements: 'resources/build/entitlements.mas.plist',
    entitlementsInherit: 'resources/build/entitlements.mas.inherit.plist',
    provisioningProfile: process.env.SPLIT_MAS_PROFILE,
    extraResources: [{ from: 'native', to: 'native', filter: ['split-native.darwin-universal.node'] }],
    x64ArchFiles: 'Contents/Resources/native/*.node',
    extendInfo: {
      LSUIElement: true,
      NSHumanReadableCopyright: '© 2026 RUNNERS. All rights reserved.',
      // Why: App Store Connect takes at most three numbers here, so the same-day "+5" is left out (2.6.1101);
      // scripts/release-app-store.sh passes the version it uploads in SPLIT_MAS_VERSION.
      CFBundleShortVersionString: process.env.SPLIT_MAS_VERSION || base,
      ElectronTeamID: 'RGWVXJ8URP',
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  win: {
    icon: 'resources/build/icon.ico',
    artifactName: `Split-${tag}-windows-x64-setup.\${ext}`,
    target: [{ target: 'nsis', arch: ['x64'] }],
    extraResources: [{ from: 'native', to: 'native', filter: ['split-native.win32-${arch}*.node'] }],
  },
  nsis: { oneClick: true, perMachine: false },
  linux: {
    icon: 'resources/build/icon.png',
    category: 'Utility',
    target: ['AppImage', 'deb', 'rpm'],
    maintainer: 'RUNNERS',
    synopsis: 'Move and resize windows with keyboard shortcuts',
    extraResources: [{ from: 'native', to: 'native', filter: ['split-native.linux-${arch}*.node'] }],
  },
  appImage: { artifactName: `Split-${tag}-linux-x86_64.\${ext}` },
  deb: { artifactName: `Split-${tag}-linux-amd64.\${ext}` },
  rpm: { artifactName: `Split-${tag}-linux-x86_64.\${ext}` },
  forceCodeSigning: isRelease,
  dmg: { artifactName: `Split-${tag}.\${ext}` },
  // Read by electron-updater inside the app (app-update.yml). CI uploads the files itself (--publish never).
  publish: {
    provider: 'github',
    owner: 'RUNNERS-IM',
    repo: 'split',
  },
}
