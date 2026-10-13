module.exports = {
  presets: [['module:@react-native/babel-preset', { jsxImportSource: 'nativewind' }], 'nativewind/babel'],
  // Must be last: Reanimated 4 worklets.
  plugins: ['react-native-worklets/plugin'],
};
