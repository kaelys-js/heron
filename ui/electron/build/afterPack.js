// electron-builder afterPack hook -- flips Electron security fuses on the
// packed app's Electron binary BEFORE electron-builder code-signs it.
//
// afterPack runs after the app dir is assembled but before signing/notarizing,
// which is exactly when fuses must be flipped: flipping mutates the binary, so
// it has to happen before the real signature is applied (electron-builder signs
// afterward, so we do NOT reset the ad-hoc darwin signature here -- that's only
// needed when there's no later signing step).
//
// Fuses are compile-time-style toggles baked into the Electron binary that
// remove attack surface that contextIsolation/nodeIntegration alone can't:
//   - RunAsNode / EnableNodeCliInspectArguments / EnableNodeOptionsEnvironmentVariable:
//     block the binary from being re-invoked as a plain Node process or a
//     debugger via env vars / CLI flags (a local-priv-esc vector).
//   - EnableCookieEncryption: encrypts the cookie store at rest.
//   - EnableEmbeddedAsarIntegrityValidation + OnlyLoadAppFromAsar: the app is
//     loaded only from a validated app.asar, so a tampered/added file on disk
//     can't be loaded as app code.
//
// CommonJS (electron-builder requires hooks as CJS modules).
const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses');
const path = require('node:path');

/** Resolve the path to the packed Electron binary inside context.appOutDir,
 *  per platform. electron-builder names the executable after productName. */
function electronBinaryPath(appOutDir, electronPlatformName, productFilename) {
  switch (electronPlatformName) {
    case 'darwin':
    case 'mas':
      // .../<Product>.app/Contents/MacOS/<Product>
      return path.join(
        appOutDir,
        `${productFilename}.app`,
        'Contents',
        'MacOS',
        productFilename,
      );
    case 'win32':
      return path.join(appOutDir, `${productFilename}.exe`);
    default:
      // linux: the executable is the lowercased executableName from the config.
      return path.join(appOutDir, productFilename);
  }
}

module.exports = async function afterPack(context) {
  const { appOutDir, electronPlatformName, packager } = context;
  // On linux electron-builder uses the `executableName` (lowercased) for the
  // binary; on mac/win it uses the productName. executableFilename covers both.
  const productFilename =
    packager.executableName || packager.appInfo.productFilename;
  const electronBinary = electronBinaryPath(
    appOutDir,
    electronPlatformName,
    productFilename,
  );

  await flipFuses(electronBinary, {
    version: FuseVersion.V1,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    // RISK -- PACKAGED-BUILD VALIDATION REQUIRED (flagged in return notes):
    // OnlyLoadAppFromAsar restricts where the ELECTRON APP itself is loaded
    // from (must be app.asar). The embedded SvelteKit server lives in
    // extraResources at app/server/index.js -- OUTSIDE the asar -- but it is
    // launched via child_process.fork (server-process.ts), NOT loaded as part
    // of the Electron app's module graph, so OnlyLoadAppFromAsar should not
    // block it. This is believed safe but MUST be confirmed by booting a real
    // packaged build (the orchestrator's end-to-end verify): if the packaged
    // app fails to launch or the embedded server doesn't start, set this fuse
    // to `false` and re-validate. Kept TRUE here per the hardening spec, with
    // this loud flag for the packaged-validation gate.
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
  });
};
