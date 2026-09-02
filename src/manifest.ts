import { defineManifest } from '@crxjs/vite-plugin'

export default defineManifest({
  manifest_version: 3,
  name: 'Dumbify',
  version: '1.0.0',
  description: 'A calm, text-first YouTube experience.',
  content_scripts: [
    {
      matches: ['https://www.youtube.com/*'],
      js: ['src/content.ts'],
      run_at: 'document_start',
    },
  ],
  background: {
    service_worker: 'src/background.ts',
    type: 'module',
  },
  // Required for the Chrome Web Store (128 is the store listing icon) and for the
  // toolbar button, which showed the generic puzzle piece without default_icon.
  icons: {
    16: 'icons/icon-16.png',
    32: 'icons/icon-32.png',
    48: 'icons/icon-48.png',
    128: 'icons/icon-128.png',
  },
  action: {
    default_popup: 'src/popup/index.html',
    default_title: 'Dumbify',
    default_icon: {
      16: 'icons/icon-16.png',
      32: 'icons/icon-32.png',
      48: 'icons/icon-48.png',
    },
  },
  options_page: 'src/options/index.html',
  permissions: ['storage', 'scripting'],
  host_permissions: ['https://www.youtube.com/*'],
  web_accessible_resources: [
    {
      resources: ['icons/logo.png', 'fonts/*.woff2'],
      matches: ['https://www.youtube.com/*'],
    },
  ],
})
