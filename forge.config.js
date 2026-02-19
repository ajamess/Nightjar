module.exports = {
  packagerConfig: {
    asar: {
      unpack: "{sidecar/**/*,backend/**/*,node_modules/**/*}"
    },
    icon: './build/icon', // Will use icon.icns on Mac, icon.ico on Windows
    // Mac-specific options
    ...(process.platform === 'darwin' && {
      osxSign: false, // Disable signing for development builds
      osxNotarize: false
    }),
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {},
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-deb',
      config: {},
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {},
    },
  ],
  // SECURITY NOTE: --no-sandbox disables the Chromium sandbox. This is required for
  // some CI/containerized environments and GPU-less systems. In production, the app
  // should rely on Electron's own process sandboxing (BrowserWindow sandbox: true).
  electronLaunchArgs: [
    '--disable-gpu',
    '--disable-software-rasterizer',
    '--disable-hardware-acceleration',
    '--no-sandbox',
    '--disable-gpu-sandbox',
    '--disable-dev-shm-usage',
    '--in-process-gpu'
  ],
};