import { defineManifest } from '@crxjs/vite-plugin'

export default defineManifest({
  manifest_version: 3,
  name: 'Dumbify - Customizable text-based YouTube, no thumbnails or distractions',
  version: '2.0.0',
  description: 'Turn YouTube into a calm reading list: no thumbnails, no autoplay, no clutter. 19 themes, layouts, GIF wallpapers, custom fonts.',
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
  // unlimitedStorage: an animated wallpaper is stored as the original file, and a GIF or
  // video loop of a few megabytes would otherwise hit chrome.storage.local's 10 MB cap.
  // It carries no install-time warning.
  permissions: ['storage', 'scripting', 'unlimitedStorage'],
  host_permissions: ['https://www.youtube.com/*'],
  web_accessible_resources: [
    {
      // Only what the page itself loads. Anything listed here is fetchable by any site,
      // which makes it a way to detect the extension - the sidebar mark is drawn now,
      // so the logo image no longer needs to be.
      resources: ['fonts/*.woff2'],
      matches: ['https://www.youtube.com/*'],
    },
  ],
})
