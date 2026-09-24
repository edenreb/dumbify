// Stand-in youtube.com pages for the end-to-end tests: just enough of the real page
// shape (ytcfg, ytInitialData, ytInitialPlayerResponse, a player element) for the
// content script to render its reading view. No request ever leaves the machine.

const CHANNELS = [
  ['Workshop Notes', 'UCworkshopnotes000000001'],
  ['City Lines', 'UCcitylines0000000000002'],
  ['Deep Field', 'UCdeepfield0000000000003'],
  ['The Kitchen Lab', 'UCkitchenlab000000000004'],
  ['Late Bloomer', 'UClatebloomer00000000005'],
  ['Proof by Example', 'UCproofbyexample0000006'],
  ['Coastline', 'UCcoastline0000000000007'],
]

const TITLES = [
  'The quiet genius of Japanese joinery',
  'Why cities are rediscovering the tram',
  'A slow tour of the Milky Way, in true scale',
  'How sourdough actually works',
  'Learning the cello at 40: one year in',
  'The mathematics of paper folding',
  'What the tide tables don’t tell you',
  'Restoring a 1960s typewriter, start to finish',
  'The hidden logic of airport layouts',
  'Building a dry stone wall by hand',
  'How lighthouses were lit before electricity',
  'An hour in a Norwegian fjord, no narration',
  'The engineering behind a violin bridge',
  'Why old maps got the coastline wrong',
  'Fermenting hot sauce: a beginner’s guide',
  'Watching glass get blown, up close',
  'The long history of the humble pencil',
  'Night train from Vienna to Venice',
]

const WHEN = ['2 hours ago', '5 hours ago', '1 day ago', '1 day ago', '3 days ago', '5 days ago', '1 week ago', '2 weeks ago', '3 weeks ago', '1 month ago', '2 months ago', '8 months ago']

export function videoId(i) {
  return `vid${String(i).padStart(8, '0')}`
}

export function sampleVideos(n = 18) {
  return Array.from({ length: n }, (_, i) => {
    const [channel, channelId] = CHANNELS[i % CHANNELS.length]
    const live = i === 2
    return {
      id: videoId(i),
      title: TITLES[i % TITLES.length],
      channel,
      channelId,
      views: live ? '12K watching' : `${(((i * 7919) % 900) + 12) / 10}K views`.replace('.0K', 'K'),
      published: live ? '' : WHEN[i % WHEN.length],
      duration: live ? '' : `${(i * 7) % 50 + 3}:${String((i * 13) % 60).padStart(2, '0')}`,
      live,
    }
  })
}

function videoRenderer(v) {
  const r = {
    videoId: v.id,
    title: { runs: [{ text: v.title }] },
    ownerText: { runs: [{ text: v.channel, navigationEndpoint: { browseEndpoint: { browseId: v.channelId } } }] },
    viewCountText: { simpleText: v.views },
  }
  if (v.published) r.publishedTimeText = { simpleText: v.published }
  if (v.duration) r.lengthText = { simpleText: v.duration }
  if (v.live) r.badges = [{ metadataBadgeRenderer: { style: 'BADGE_STYLE_TYPE_LIVE_NOW', label: 'LIVE' } }]
  return r
}

const YTCFG = {
  INNERTUBE_API_KEY: 'e2e-test-key',
  LOGGED_IN: true,
  INNERTUBE_CLIENT_NAME: 'WEB',
  INNERTUBE_CLIENT_VERSION: '2.20260901.00.00',
  INNERTUBE_CONTEXT: { client: { clientName: 'WEB', clientVersion: '2.20260901.00.00', hl: 'en', gl: 'US' } },
}

function page({ title = 'YouTube', initialData, playerResponse, body = '' }) {
  const scripts = [
    `<script>var ytcfg = { data_: {}, set: function (o) { Object.assign(this.data_, o) } }; ytcfg.set(${JSON.stringify(YTCFG)});</script>`,
  ]
  if (initialData) scripts.push(`<script>var ytInitialData = ${JSON.stringify(initialData)};</script>`)
  if (playerResponse) scripts.push(`<script>var ytInitialPlayerResponse = ${JSON.stringify(playerResponse)};</script>`)
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>${scripts.join('\n')}</head><body><ytd-app>${body}</ytd-app></body></html>`
}

export function homePage(videos = sampleVideos()) {
  return page({
    initialData: {
      contents: { twoColumnBrowseResultsRenderer: { tabs: [{ tabRenderer: { selected: true, content: { richGridRenderer: {
        contents: videos.map((v) => ({ richItemRenderer: { content: { videoRenderer: videoRenderer(v) } } })),
      } } } }] } },
    },
  })
}

export function subscriptionsPage(videos = sampleVideos()) {
  return homePage(videos)
}

export function historyPage(videos = sampleVideos(12)) {
  const shorts = (n, from) => ({
    reelShelfRenderer: {
      items: Array.from({ length: n }, (_, k) => ({
        reelItemRenderer: { videoId: `short${String(from + k).padStart(6, '0')}`, headline: { simpleText: `A short, number ${from + k}` } },
      })),
    },
  })
  const section = (label, items) => ({
    itemSectionRenderer: {
      header: { itemSectionHeaderRenderer: { title: { simpleText: label } } },
      contents: items,
    },
  })
  return page({
    initialData: {
      contents: { twoColumnBrowseResultsRenderer: { tabs: [{ tabRenderer: { selected: true, content: { sectionListRenderer: { contents: [
        section('Today', [
          { videoRenderer: videoRenderer(videos[0]) },
          shorts(3, 1),
          { videoRenderer: videoRenderer(videos[1]) },
          { videoRenderer: videoRenderer(videos[3]) },
        ]),
        section('Yesterday', videos.slice(4, 8).map((v) => ({ videoRenderer: videoRenderer(v) }))),
        section('Sep 18, 2026', videos.slice(8, 12).map((v) => ({ videoRenderer: videoRenderer(v) }))),
      ] } } } }] } },
    },
  })
}

export function watchPage(v = sampleVideos()[0]) {
  const description = 'Six joints, no nails, no glue.\n\nIn this video we cut a kanawa tsugi by hand and look at why it holds.\n\nChapters\n0:00 Intro\n2:10 Marking out\n9:45 Cutting\n15:30 The reveal'
  return page({
    title: `${v.title} - YouTube`,
    playerResponse: {
      playabilityStatus: { status: 'OK' },
      videoDetails: {
        videoId: v.id, title: v.title, author: v.channel, channelId: v.channelId,
        viewCount: '1204331', lengthSeconds: '1122', shortDescription: description, isLive: false,
      },
      microformat: { playerMicroformatRenderer: { publishDate: '2026-09-21T08:00:00-07:00' } },
    },
    initialData: { contents: { twoColumnWatchNextResults: { results: { results: { contents: [] } } } } },
    // A player shaped like YouTube's: #movie_player with a <video> inside it, painted so a
    // screenshot shows where it went.
    body: `<div id="player"><div id="movie_player" class="html5-video-player" style="background: radial-gradient(circle at 30% 35%, #4a5160, #0d0e11 72%)"><video style="width:100%;height:100%"></video></div></div>`,
  })
}

function channelRenderer(name, id, subs, videos, description, verified = false) {
  return {
    channelRenderer: {
      channelId: id,
      title: { simpleText: name },
      navigationEndpoint: { browseEndpoint: { browseId: id, canonicalBaseUrl: `/@${name.replace(/\s+/g, '')}` } },
      subscriberCountText: { simpleText: subs },
      videoCountText: { simpleText: videos },
      descriptionSnippet: { runs: [{ text: description }] },
      ownerBadges: verified ? [{ metadataBadgeRenderer: { tooltip: 'Verified' } }] : [],
    },
  }
}

export function searchPage(query = 'joinery', videos = sampleVideos(10)) {
  return page({
    title: `${query} - YouTube`,
    initialData: {
      contents: { twoColumnSearchResultsRenderer: { primaryContents: { sectionListRenderer: { contents: [{
        itemSectionRenderer: { contents: [
          channelRenderer('Workshop Notes', 'UCworkshopnotes000000001', '1.2M subscribers', '340 videos',
            'Slow, careful woodworking. Joinery, hand tools and restoration - no music, no jump cuts.', true),
          ...videos.slice(0, 4).map((v) => ({ videoRenderer: videoRenderer(v) })),
          channelRenderer('Joinery Journal', 'UCjoineryjournal00000009', '48K subscribers', '112 videos',
            'A notebook of traditional joints from around the world.'),
          ...videos.slice(4).map((v) => ({ videoRenderer: videoRenderer(v) })),
        ] },
      }] } } } },
    },
  })
}

/** Serves a youtube.com URL from the fixtures above. */
export function fixtureFor(url) {
  const u = new URL(url)
  if (u.pathname.startsWith('/youtubei/')) return { status: 200, contentType: 'application/json', body: '{}' }
  if (u.pathname === '/' || u.pathname === '') return { status: 200, contentType: 'text/html', body: homePage() }
  if (u.pathname === '/feed/subscriptions') return { status: 200, contentType: 'text/html', body: subscriptionsPage() }
  if (u.pathname === '/feed/history') return { status: 200, contentType: 'text/html', body: historyPage() }
  if (u.pathname === '/watch') return { status: 200, contentType: 'text/html', body: watchPage() }
  if (u.pathname.startsWith('/channel/') || u.pathname.startsWith('/@')) {
    return { status: 200, contentType: 'text/html', body: page({ initialData: { contents: { twoColumnBrowseResultsRenderer: { tabs: [] } } } }) }
  }
  if (u.pathname === '/results') return { status: 200, contentType: 'text/html', body: searchPage(u.searchParams.get('search_query') ?? '') }
  return { status: 404, contentType: 'text/plain', body: '' }
}
