const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const { withNativeWind } = require('nativewind/metro');

const shared = path.resolve(__dirname, '../shared');

/**
 * Shared code lives outside the app (apps/shared). `@shared/<path>` maps to that folder, and its
 * own imports (react-native, lucide…) resolve from this app's node_modules.
 */
const config = mergeConfig(getDefaultConfig(__dirname), {
  watchFolders: [shared],
  resolver: {
    nodeModulesPaths: [path.resolve(__dirname, 'node_modules')],
    resolveRequest: (context, moduleName, platform) => {
      if (moduleName === '@shared' || moduleName.startsWith('@shared/')) {
        return context.resolveRequest(context, path.join(shared, moduleName.slice('@shared'.length)), platform);
      }
      return context.resolveRequest(context, moduleName, platform);
    },
  },
});

module.exports = withNativeWind(config, { input: './src/global.css' });
