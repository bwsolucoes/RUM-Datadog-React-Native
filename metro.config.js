// metro.config.js
const { getDefaultConfig } = require('expo/metro-config');
// Correct import: use the exact named export found in metro.js
const { withDatadogMetroConfig } = require('@datadog/mobile-react-native/metro');

// For Expo SDK 49+ and Datadog >= 2.0.0
// Get the default Metro configuration for your Expo project
const config = getDefaultConfig(__dirname);

// Apply the Datadog Metro plugin to your configuration
// Use the correctly imported function name
module.exports = withDatadogMetroConfig(config, {
  // You can add Datadog-specific Metro options here if needed,
  // but usually, just wrapping the config is enough.
});