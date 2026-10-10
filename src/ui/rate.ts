// "Rate Dumbify" opens the store this copy came from. Extension pages are served from
// moz-extension:// in Firefox; Chrome and Edge install the same package, so Edge is told
// apart by the "Edg/" token in its user agent.
//
// addons.mozilla.org redirects an add-on's ID to its listing, whatever that listing's URL
// turns out to be, and the place to rate is the listing itself. Edge Add-ons assigns the
// listing URL only once the extension exists there, so Edge points at a search for it,
// which lands on the listing as soon as it is live.
const EDGE = navigator.userAgent.includes('Edg/')

export const RATE_URL = location.protocol === 'moz-extension:'
  ? 'https://addons.mozilla.org/firefox/addon/dumbify@edenreb.github.io/'
  : EDGE
    ? 'https://microsoftedge.microsoft.com/addons/search/dumbify'
    : 'https://chromewebstore.google.com/detail/dumbify-customizable-text/lhnjjldhbllcdfdldeacdgalkkofhicf/reviews'
