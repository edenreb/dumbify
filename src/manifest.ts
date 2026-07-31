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
      run_at: 'document_end',
    },
  ],
  background: {
    service_worker: 'src/background.ts',
    type: 'module',
  },
  action: {
    default_popup: 'src/popup/index.html',
    default_title: 'Dumbify',
  },
  options_page: 'src/options/index.html',
  permissions: ['storage', 'scripting'],
  host_permissions: ['https://www.youtube.com/*'],
  web_accessible_resources: [
    {
      resources: ['icons/logo.png'],
      matches: ['https://www.youtube.com/*'],
    },
  ],
})
