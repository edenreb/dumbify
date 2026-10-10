// The website on localhost, kept current without a git pull:
//   npm run site:serve                    # http://localhost:8000
//   npm run site:serve -- --port 8001
//   npm run site:serve -- --no-pull       # serve and reload, but leave the branch alone
// Open pages reload themselves when the site's files change. Every 10 seconds it also
// fetches the checked-out branch and fast-forwards to anything new, so a pushed change
// shows up by itself. It only ever fast-forwards, like `git pull --ff-only`: uncommitted
// work stays as it is, and when it is in the way git refuses, and this says so.

import { execFile } from 'node:child_process'
import { watch } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { connect } from 'node:net'
import { extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const portAt = process.argv.indexOf('--port')
const port = portAt > -1 ? Number(process.argv[portAt + 1]) : 8000
const pull = !process.argv.includes('--no-pull')
const EVERY_MS = 10_000

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('--port takes a number, like --port 8001')
  process.exit(1)
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
}
/** .git, .env and the like, or a step up out of the folder. */
const hidden = (path) => /(^|[\\/])\./.test(path)

/* ---- Open pages reload when the site's files change ---- */

const pages = new Set()
let pending
function changed() {
  // A pull or a save writes several files at once: reload once, after the last of them.
  clearTimeout(pending)
  pending = setTimeout(() => {
    for (const page of pages) page.write('data: reload\n\n')
  }, 200)
}
// Now and then a comment, so an idle connection stays open.
setInterval(() => {
  for (const page of pages) page.write(': \n\n')
}, 30_000).unref()

const RELOADER = `// Added by scripts/serve-site.mjs: reload when the site's files change. The demo's
// frame reloads with the page around it.
if (window === window.top) new EventSource('/__serve/events').onmessage = () => location.reload()
`
const TAG = '<script src="/__serve/reload.js"></script>'

// What the page is made of: index.html and PRIVACY.md at the top, then site/ and public/.
// Not the whole tree, where node_modules would cost Linux a watcher for every folder.
for (const [dir, recursive, wanted] of [
  [root, false, /\.html$|^PRIVACY\.md$/],
  [join(root, 'site'), true, /./],
  [join(root, 'public'), true, /./],
]) {
  try {
    watch(dir, { recursive }, (_, file) => {
      if (file && wanted.test(file) && !hidden(file)) changed()
    }).on('error', () => {})
  } catch {
    // Watching a tree needs Node 20 on Linux. Without it, pulls still reload the page.
  }
}

/* ---- The files, served the way GitHub Pages serves them ---- */

function send(req, res, status, type, body, headers = {}) {
  res.writeHead(status, { 'content-type': type, 'content-length': Buffer.byteLength(body), 'cache-control': 'no-store', ...headers })
  res.end(req.method === 'HEAD' ? undefined : body)
}
const notFound = (req, res) => send(req, res, 404, TYPES['.txt'], 'Not found')

async function handle(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(req, res, 405, TYPES['.txt'], 'Only GET and HEAD')
  const url = new URL(req.url, 'http://localhost')
  if (url.pathname === '/__serve/events') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store' })
    res.write('retry: 1000\n\n')
    pages.add(res)
    res.on('close', () => pages.delete(res))
    return
  }
  if (url.pathname === '/__serve/reload.js') return send(req, res, 200, TYPES['.js'], RELOADER)

  let path
  try {
    path = decodeURIComponent(url.pathname)
  } catch {
    return send(req, res, 400, TYPES['.txt'], 'Bad address')
  }
  let file = join(root, path)
  if (hidden(path) || (file !== root && !file.startsWith(root + sep))) return notFound(req, res)
  let info = await stat(file).catch(() => null)
  if (!info) {
    // Pages serves PRIVACY.md at /PRIVACY.
    for (const ext of ['.html', '.md']) {
      info = await stat(file + ext).catch(() => null)
      if (info) {
        file += ext
        break
      }
    }
  } else if (info.isDirectory()) {
    // A folder's address ends in a slash, or the relative links inside it go astray.
    if (!url.pathname.endsWith('/')) return send(req, res, 301, TYPES['.txt'], '', { location: `${url.pathname}/${url.search}` })
    file = join(file, 'index.html')
    info = await stat(file).catch(() => null)
  }
  if (!info?.isFile()) return notFound(req, res)

  const type = TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream'
  let body = await readFile(file)
  // Only into the page itself; the demo's frame is reloaded along with it.
  if (type === TYPES['.html'] && req.headers['sec-fetch-dest'] !== 'iframe') {
    const html = body.toString()
    const at = html.toLowerCase().lastIndexOf('</body>')
    body = at < 0 ? html + TAG : html.slice(0, at) + TAG + html.slice(at)
  }
  send(req, res, 200, type, body)
}

/* ---- Following the branch ---- */

const run = promisify(execFile)
// Never ask for a password or a passphrase: a fetch that would need one fails, and says so.
const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' }
const git = async (...args) => (await run('git', args, { cwd: root, env, timeout: 60_000 })).stdout.trim()
const isAncestor = (a, b) => git('merge-base', '--is-ancestor', a, b).then(() => true, () => false)
const indent = (text) => text.trim().split('\n').map((line) => `    ${line}`).join('\n')
const reason = (e) => e.killed ? 'no answer within a minute' : (e.stderr || e.message).trim().split('\n')[0].replace(/^(fatal|error): /, '')
const time = () => new Date().toLocaleTimeString()

let said = ''
// Each problem once rather than every ten seconds; '' is all well again.
function say(text) {
  if (text && text !== said) console.log(`${time()}  ${text}`)
  said = text
}

let following = ''
async function follow() {
  try {
    const branch = await git('symbolic-ref', '--quiet', '--short', 'HEAD').catch(() => '')
    if (!branch) return say('Not pulling: no branch is checked out.')
    const remote = await git('config', `branch.${branch}.remote`).catch(() => 'origin')
    const merge = await git('config', `branch.${branch}.merge`).catch(() => `refs/heads/${branch}`)
    const target = `${remote}/${merge.replace(/^refs\/heads\//, '')}`
    if (target !== following) {
      following = target
      console.log(`Following ${target}: its new commits come in by themselves.`)
    }
    try {
      await git('fetch', '--quiet', remote, merge)
    } catch (e) {
      return say(`Can't fetch ${target}: ${reason(e)}`)
    }
    const [mine, theirs] = await Promise.all([git('rev-parse', 'HEAD'), git('rev-parse', 'FETCH_HEAD')])
    // Up to date, or ahead with commits of your own: nothing to do.
    if (mine === theirs || (await isAncestor(theirs, mine))) return say('')
    if (!(await isAncestor(mine, theirs))) {
      return say(`Not pulling: ${branch} and ${target} have diverged, so this one needs a git pull by hand.`)
    }
    try {
      await git('merge', '--ff-only', '--quiet', theirs)
    } catch (e) {
      return say(`Can't pull ${target} yet, so nothing changed. Git says:\n${indent(e.stderr || e.message)}\n  It pulls by itself once that's sorted.`)
    }
    said = ''
    console.log(`${time()}  Pulled from ${target}:\n${indent(await git('log', '--format=%h %s', `${mine}..${theirs}`))}`)
    changed()
  } finally {
    setTimeout(follow, EVERY_MS)
  }
}

/* ---- Start ---- */

const busy = (host) => new Promise((done) => {
  const socket = connect({ host, port }, () => {
    socket.destroy()
    done(true)
  })
  socket.on('error', () => done(false))
})
function portTaken() {
  console.error(`Port ${port} is already serving something, probably python3 -m http.server. Stop that (Ctrl+C in its terminal) and run this again, or use another port: npm run site:serve -- --port ${port + 1}`)
  process.exit(1)
}
// Checked on both loopbacks: a server on the other one would answer localhost instead.
if ((await busy('127.0.0.1')) || (await busy('::1'))) portTaken()

const server = createServer((req, res) => {
  handle(req, res).catch((e) => {
    console.error(e)
    if (!res.headersSent) send(req, res, 500, TYPES['.txt'], 'Server error')
  })
})
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') portTaken()
  throw e
})
server.listen(port, '127.0.0.1', async () => {
  console.log(`Dumbify's site is on http://localhost:${port}, and open pages reload when its files change.`)
  if (!pull) return
  if (!(await git('rev-parse', '--is-inside-work-tree').catch(() => ''))) {
    return console.log("Not pulling: git isn't installed, or this folder isn't a git checkout.")
  }
  if (!env.GIT_SSH_COMMAND && !env.GIT_SSH && !(await git('config', 'core.sshCommand').catch(() => ''))) {
    env.GIT_SSH_COMMAND = 'ssh -o BatchMode=yes'
  }
  void follow()
})
