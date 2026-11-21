import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const repoDir = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
const gameDir = path.join(repoDir, 'game');
const shotsJsonPath = path.join(repoDir, 'shots.json');
const screenshotsDir = path.join(repoDir, 'screenshots');

const errors = [];

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg'
};

const server = http.createServer((req, res) => {
  try {
    const urlObj = new URL(req.url, `http://${req.headers.host}`);
    let pathname = decodeURIComponent(urlObj.pathname);
    if (pathname.startsWith('/')) pathname = pathname.slice(1);
    const resolvedPath = path.resolve(gameDir, pathname);

    if (!resolvedPath.startsWith(gameDir)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('403 Forbidden');
      return;
    }

    fs.stat(resolvedPath, (err, stats) => {
      if (err || !stats.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
        return;
      }

      const ext = path.extname(resolvedPath).toLowerCase();
      const contentType = mimeTypes[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      fs.createReadStream(resolvedPath).pipe(res);
    });
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('500 Internal Server Error');
  }
});

server.listen(0, '127.0.0.1', async () => {
  const port = server.address().port;
  try {
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }

    const shotsData = JSON.parse(fs.readFileSync(shotsJsonPath, 'utf8'));

    const toolsRequire = createRequire('/home/hatch/workspace/tools/shots/node_modules/playwright-core/index.js');
    const { chromium } = toolsRequire('playwright-core');

    const browser = await chromium.launch({
      headless: true,
      args: [
        '--enable-unsafe-swiftshader',
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-gpu',
        '--no-sandbox',
        '--disable-setuid-sandbox'
      ]
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 }
    });

    const page = await context.newPage();

    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(`Console error: ${msg.text()}`);
      }
    });

    page.on('pageerror', err => {
      errors.push(`Page error: ${err.message}`);
    });

    for (const shot of shotsData) {
      const shotUrl = `http://127.0.0.1:${port}/index.html${shot.query}`;
      await page.goto(shotUrl, { waitUntil: 'load' });

      try {
        await page.waitForFunction(() => window.__gameReady === true, { timeout: 30000 });
      } catch (e) {
        errors.push(`Timeout waiting for __gameReady on shot ${shot.name}: ${e.message}`);
      }

      const webglOk = await page.evaluate(() => {
        const container = document.querySelector('#game');
        if (!container) return false;
        const canvas = container.querySelector('canvas') || document.querySelector('canvas');
        if (!canvas) return false;
        try {
          const gl = canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
          return !!gl;
        } catch (e) {
          return false;
        }
      });

      if (!webglOk) {
        errors.push(`WebGL context not found or invalid for shot ${shot.name}`);
      }

      await new Promise(resolve => setTimeout(resolve, 2600));

      const shotFilePath = path.join(screenshotsDir, shot.name);
      await page.screenshot({ path: shotFilePath, type: 'jpeg', quality: 82 });

      const stats = fs.statSync(shotFilePath);
      const size = stats.size;
      if (size > 262144) {
        errors.push(`Screenshot ${shot.name} size (${size} bytes) exceeds 262144 bytes`);
        console.log(`${shot.name}: ${size} bytes (TOO LARGE)`);
      } else {
        console.log(`${shot.name}: ${size} bytes OK`);
      }
    }

    const fps = await page.evaluate(() => window.__solmarFps);
    if (fps !== undefined) {
      console.log(`FPS: ${fps}`);
    }

    await browser.close();
    server.close();

    if (errors.length > 0) {
      console.error('Errors encountered:');
      errors.forEach(err => console.error(err));
      process.exit(1);
    } else {
      console.log('all shots OK, no page errors');
      process.exit(0);
    }
  } catch (err) {
    server.close();
    console.error('Fatal error in shots driver:', err);
    process.exit(1);
  }
});
