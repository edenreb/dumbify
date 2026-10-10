// npm run site:serve, run for real against a throwaway site and remote: what it serves, how
// it tells pages to reload, and the pulls it makes or refuses to make. A server fetches as
// soon as it starts, so a clone left behind its remote shows the outcome at once.
import { describe, test, before, after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { appendFileSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { request } from 'node:http'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

const SCRIPT = resolve('scripts/serve-site.mjs')
const IDENTITY = ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false']
const git = (cwd, ...args) => execFileSync('git', [...IDENTITY, ...args], { cwd, encoding: 'utf8' }).trim()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function until(check, what, timeout = 10000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    if (await check()) return
    await sleep(50)
  }
  assert.fail(`timed out waiting for ${what}`)
}

const freePort = () => new Promise((done) => {
  const s = createServer().listen(0, '127.0.0.1', () => {
    const { port } = s.address()
    s.close(() => done(port))
  })
})

function write(root, file, text) {
  mkdirSync(dirname(join(root, file)), { recursive: true })
  writeFileSync(join(root, file), text)
}

describe('npm run site:serve', () => {
  let dir, work, pusher, port
  const servers = []

  function serve(...args) {
    const proc = spawn(process.execPath, ['scripts/serve-site.mjs', '--port', String(port), ...args], { cwd: work })
    let log = ''
    proc.stdout.on('data', (d) => { log += d })
    proc.stderr.on('data', (d) => { log += d })
    const exited = new Promise((r) => proc.on('exit', r))
    const server = {
      log: () => log,
      exited,
      async stop() {
        proc.kill()
        await exited
      },
    }
    servers.push(server)
    return server
  }

  const get = (path, headers = {}, method = 'GET') => new Promise((done, fail) => {
    const req = request({ host: '127.0.0.1', port, path, method, headers }, (res) => {
      let body = ''
      res.on('data', (d) => { body += d })
      res.on('end', () => done({ status: res.statusCode, headers: res.headers, body }))
    })
    req.on('error', fail)
    req.end()
  })
  const version = (body) => body.match(/<script src="\/__serve\/reload\.js" data-version="(\d+)"><\/script>/)?.[1]

  function push(file, text, message) {
    write(pusher, file, text)
    git(pusher, 'add', file)
    git(pusher, 'commit', '-qm', message)
    git(pusher, 'push', '-q', 'origin', 'HEAD')
    return git(pusher, 'rev-parse', 'HEAD')
  }

  before(async () => {
    port = await freePort()
    dir = mkdtempSync(join(tmpdir(), 'dumbify-serve-'))
    const seed = join(dir, 'seed')
    mkdirSync(seed)
    git(seed, 'init', '-q')
    write(seed, 'index.html', '<!doctype html><title>Site</title><body><h1>one</h1></body>\n')
    write(seed, 'site/site.css', 'h1 { color: red }\n')
    write(seed, 'site/demo/index.html', '<!doctype html><title>Demo</title><body>demo</body>\n')
    write(seed, 'PRIVACY.md', '# Privacy\n\nNothing leaves your browser.\n')
    mkdirSync(join(seed, 'scripts'))
    copyFileSync(SCRIPT, join(seed, 'scripts/serve-site.mjs'))
    git(seed, 'add', '-A')
    git(seed, 'commit', '-qm', 'site')
    git(dir, 'clone', '-q', '--bare', 'seed', 'remote.git')
    git(dir, 'clone', '-q', 'remote.git', 'work')
    git(dir, 'clone', '-q', 'remote.git', 'pusher')
    work = join(dir, 'work')
    pusher = join(dir, 'pusher')
  })

  // Stopped even when a test fails, so the port is free for the next one.
  afterEach(async () => {
    await Promise.all(servers.splice(0).map((s) => s.stop()))
  })
  after(() => rmSync(dir, { recursive: true, force: true }))

  test('serves the site as Pages would, with the reload script in pages but not in frames', async () => {
    const s = serve()
    await until(() => s.log().includes('Following'), 'the server to start')

    const home = await get('/')
    assert.equal(home.status, 200)
    assert.match(home.headers['content-type'], /^text\/html/)
    assert.equal(home.headers['cache-control'], 'no-store')
    assert.ok(version(home.body), 'the page carries the reload script')
    assert.ok(home.body.indexOf('data-version') < home.body.indexOf('</body>'))
    assert.equal((await get('/', {}, 'HEAD')).body, '')

    assert.match((await get('/site/site.css?v=7')).headers['content-type'], /^text\/css/)
    const folder = await get('/site/demo?look=paper')
    assert.equal(folder.status, 301)
    assert.equal(folder.headers.location, '/site/demo/?look=paper')
    assert.ok(!version((await get('/site/demo/', { 'sec-fetch-dest': 'iframe' })).body), 'no reload script in a frame')
    assert.match((await get('/PRIVACY')).body, /Nothing leaves your browser/)

    for (const path of ['/.git/config', '/..%2f.git/config', '/site/..%2f..%2fetc%2fpasswd', '/nope']) {
      assert.equal((await get(path)).status, 404, path)
    }
    assert.equal((await get('/', {}, 'POST')).status, 405)

    // Another copy on the same port says what's wrong instead of failing quietly.
    const second = serve()
    assert.equal(await second.exited, 1)
    assert.match(second.log(), /already serving/)
  })

  test('a page hears the current version when it connects, and a new one when files change', async () => {
    const s = serve('--no-pull')
    await until(() => s.log().includes('localhost'), 'the server to start')
    const served = version((await get('/')).body)
    const heard = []
    const events = request({ host: '127.0.0.1', port, path: '/__serve/events' }, (res) => {
      res.on('data', (d) => heard.push(...[...String(d).matchAll(/data: (\d+)/g)].map((m) => m[1])))
    })
    events.end()
    await until(() => heard.length === 1, 'the version on connect')
    assert.equal(heard[0], served)
    appendFileSync(join(work, 'site/site.css'), '/* edited */\n')
    await until(() => heard.length >= 2, 'the version after an edit')
    assert.notEqual(heard[1], served)
    events.destroy()
    git(work, 'checkout', '--', 'site/site.css')
  })

  test('a pull that would overwrite uncommitted work waits, and says so', async () => {
    const before = git(work, 'rev-parse', 'HEAD')
    push('index.html', '<!doctype html><title>Site</title><body><h1>two</h1></body>\n', 'Second heading')
    appendFileSync(join(work, 'index.html'), '<!-- mine -->\n')
    const s = serve()
    await until(() => s.log().includes("Can't pull"), 'the refusal')
    assert.match(s.log(), /index\.html/, 'names the file in the way')
    assert.equal(git(work, 'rev-parse', 'HEAD'), before)
    assert.match(readFileSync(join(work, 'index.html'), 'utf8'), /<!-- mine -->/)
  })

  test('with the way clear, it pulls by itself and serves what it pulled', async () => {
    git(work, 'checkout', '--', 'index.html')
    const theirs = git(pusher, 'rev-parse', 'HEAD')
    const s = serve()
    await until(() => git(work, 'rev-parse', 'HEAD') === theirs, 'the pull')
    await until(() => s.log().includes('Second heading'), 'the pulled commit in the log')
    assert.match((await get('/')).body, /<h1>two<\/h1>/)
  })

  test('an untracked file where a pull would write is kept', async () => {
    const before = git(work, 'rev-parse', 'HEAD')
    push('site/notes.txt', 'theirs\n', 'Notes')
    write(work, 'site/notes.txt', 'mine\n')
    const s = serve()
    await until(() => s.log().includes("Can't pull"), 'the refusal')
    assert.equal(git(work, 'rev-parse', 'HEAD'), before)
    assert.equal(readFileSync(join(work, 'site/notes.txt'), 'utf8'), 'mine\n')
    await s.stop()
    rmSync(join(work, 'site/notes.txt'))
  })

  test('--no-pull leaves the branch alone', async () => {
    const before = git(work, 'rev-parse', 'HEAD')
    const s = serve('--no-pull')
    await until(() => s.log().includes('localhost'), 'the server to start')
    await sleep(1500)
    assert.equal(git(work, 'rev-parse', 'HEAD'), before)
    assert.ok(!s.log().includes('Following'))
  })
})
