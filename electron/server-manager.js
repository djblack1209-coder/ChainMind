const { utilityProcess } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

function createServerManager({ isDev, host, port, appUrl, isQuitting }) {
  let nextProcess = null;

  function waitForServer(url, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      let timer = null;
      let settled = false;

      const settle = (err) => {
        if (settled) return;
        settled = true;
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        if (err) reject(err);
        else resolve();
      };

      const check = () => {
        if (isQuitting()) return settle(new Error('App is quitting'));
        const req = http.get(url, (res) => {
          res.resume();

          if (res.statusCode === 200 || res.statusCode === 304) settle();
          else if (Date.now() - start > timeout) settle(new Error('Server timeout'));
          else timer = setTimeout(check, 300);
        });

        req.on('error', () => {
          if (isQuitting()) return settle(new Error('App is quitting'));
          if (Date.now() - start > timeout) settle(new Error('Server timeout'));
          else timer = setTimeout(check, 300);
        });

        req.setTimeout(2000, () => req.destroy());
      };

      check();
    });
  }

  function startNextServer() {
    return new Promise((resolve, reject) => {
      let settled = false;

      const settle = (fn, value) => {
        if (settled) return;
        settled = true;
        fn(value);
      };

      const env = {
        ...process.env,
        PORT: String(port),
        HOSTNAME: host,
        NODE_ENV: isDev ? 'development' : 'production',
        ELECTRON: '1',
      };

      if (isDev) {
        const serverDir = path.join(__dirname, '..');
        nextProcess = spawn('npx', ['next', 'dev', '-H', host, '-p', String(port)], {
          cwd: serverDir,
          env,
          shell: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } else {
        const standaloneDir = path.join(process.resourcesPath, 'app', '.next', 'standalone');
        const serverJs = path.join(standaloneDir, 'server.js');
        nextProcess = utilityProcess.fork(serverJs, [], {
          cwd: standaloneDir,
          env: {
            ...env,
            NEXT_DIST_DIR: path.join(process.resourcesPath, 'app', '.next'),
          },
          stdio: 'pipe',
        });
      }

      nextProcess.stdout?.on('data', (d) => {
        const msg = d.toString();
        console.log('[Next.js]', msg);
        if (msg.includes('Ready') || msg.includes('ready') || msg.includes(`${port}`)) {
          settle(resolve);
        }
      });

      nextProcess.stderr?.on('data', (d) => {
        console.error('[Next.js ERR]', d.toString());
      });

      if (nextProcess.on && isDev) {
        nextProcess.on('error', (err) => settle(reject, err));
      }

      nextProcess.on('exit', (code) => {
        if (code !== 0 && code !== null) {
          console.error(`Next.js exited with code ${code}`);
          settle(reject, new Error(`Next.js exited with code ${code}`));
        }
      });

      waitForServer(appUrl)
        .then(() => settle(resolve))
        .catch((err) => settle(reject, err));
    });
  }

  function killNextServer() {
    if (!nextProcess) return;
    const proc = nextProcess;
    nextProcess = null;

    try {
      proc.kill();
    } catch {
      // Already dead.
    }

    setTimeout(() => {
      try {
        if (proc.pid) process.kill(proc.pid, 'SIGKILL');
      } catch {
        // Already dead.
      }
    }, 3000);
  }

  return {
    startNextServer,
    killNextServer,
  };
}

module.exports = {
  createServerManager,
};
