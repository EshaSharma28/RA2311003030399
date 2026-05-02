const axios = require('axios');

let _token = null;

function setToken(token) {
  _token = token;
}

// only these values work — the server rejects anything else
const VALID_STACKS = ['backend', 'frontend'];
const VALID_LEVELS = ['debug', 'info', 'warn', 'error', 'fatal'];
const VALID_PACKAGES = [
  // backend only
  'cache', 'controller', 'cron_job', 'db', 'domain',
  'handler', 'repository', 'route', 'service',
  // frontend only
  'api', 'component', 'hook', 'page', 'state', 'style',
  // shared
  'auth', 'config', 'middleware', 'utils'
];

async function Log(stack, level, pkg, message) {
  if (!_token) {
    throw new Error('call setToken() before using Log');
  }

  if (!VALID_STACKS.includes(stack)) throw new Error(`bad stack: ${stack}`);
  if (!VALID_LEVELS.includes(level)) throw new Error(`bad level: ${level}`);
  if (!VALID_PACKAGES.includes(pkg)) throw new Error(`bad package: ${pkg}`);

  try {
    const res = await axios.post(
      'http://20.207.122.201/evaluation-service/logs',
      { stack, level, package: pkg, message },
      {
        headers: {
          Authorization: `Bearer ${_token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return res.data;
  } catch (err) {
    // swallow logging errors so they don't crash the main app
    const status = err.response ? err.response.status : 'no response';
    const body = err.response ? JSON.stringify(err.response.data) : '';
    console.error(`[log] ${status}: ${err.message} ${body}`);
  }
}

module.exports = { Log, setToken };
