// Metro bundler config — injects polyfills.js as a polyfill so it runs
// BEFORE any other module bundle. Required for web preview because
// transitively-imported modules (e.g. @solana/spl-token-metadata) use
// `Buffer` at module-init time, before our app code has a chance to
// polyfill it via runtime imports.

const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Prepend our polyfill to Metro's polyfill list. Metro evaluates
// these synchronously at bundle init, before any user module.
const oldGetPolyfills =
  config.serializer.getPolyfills ?? (() => []);
config.serializer.getPolyfills = (options) => [
  ...oldGetPolyfills(options),
  path.resolve(__dirname, "polyfills.js"),
];

module.exports = config;
