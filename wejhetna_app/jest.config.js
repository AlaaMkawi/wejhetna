// Allow the listed packages (which ship native ES modules) to be transformed
// by Jest, on top of the default react-native package list. Without this,
// `App.tsx` blows up on its first `import { NavigationContainer } from
// "@react-navigation/native"` etc.
const ALSO_TRANSFORM = [
  '@react-navigation',
  '@maplibre',
  'react-native-vector-icons',
  'react-native-reanimated',
  'react-native-worklets',
  'react-native-safe-area-context',
  'react-native-screens',
  'react-native-blob-util',
  'react-native-image-picker',
  'react-native-restart',
  '@react-native-community',
  '@react-native-picker',
];

module.exports = {
  preset: 'react-native',
  // jest.setup.js installs mocks for native modules (AsyncStorage,
  // react-native-localize) so smoke tests that import the App tree don't
  // crash in the Jest sandbox.
  setupFiles: ['./jest.setup.js'],
  // The react-native preset already ignores everything under node_modules
  // EXCEPT a curated allow-list. We re-state that list here and append our
  // own entries instead of replacing it (a bare override would re-ignore
  // `react-native` itself and break the preset).
  transformIgnorePatterns: [
    `node_modules/(?!(?:.pnpm/)?(react-native|@react-native|${ALSO_TRANSFORM.join('|')})/)`,
  ],
};
