// app.config.js
import 'dotenv/config';

export default ({ config }) => ({
  ...config,
  name: 'Tracklink',
  slug: 'tracklink',
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#0B1020',
  },
  ios: {
    ...config.ios,
    infoPlist: {
      ...(config.ios?.infoPlist || {}),
      NSLocationWhenInUseUsageDescription:
        'Tracklink uses your location to record drives.',
      NSLocationAlwaysAndWhenInUseUsageDescription:
        'Tracklink needs background location to record drives when the app is closed or minimized.',
      UIBackgroundModes: ['location'],
      LSApplicationQueriesSchemes: ['comgooglemaps', 'waze'],
    },
  },
  android: {
    ...config.android,
    permissions: [
      'ACCESS_FINE_LOCATION',
      'ACCESS_COARSE_LOCATION',
      'ACCESS_BACKGROUND_LOCATION',
      'FOREGROUND_SERVICE',
    ],
  },
  extra: {
    ...config.extra,
    googleMapsKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY,
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  },
});
