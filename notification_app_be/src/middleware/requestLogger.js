const { Log } = require('../config/logger');

// attaches request logging on every incoming request
async function requestLogger(req, res, next) {
  const start = Date.now();

  await Log('backend', 'info', 'middleware', `${req.method} ${req.path}`);

  res.on('finish', async () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    await Log('backend', level, 'middleware', `${req.method} ${req.path} ${res.statusCode}`);
  });

  next();
}

// basic error handler — keeps stack traces out of the response
function errorHandler(err, req, res, next) {
  Log('backend', 'error', 'middleware', `Error on ${req.method} ${req.path}`);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
}

module.exports = { requestLogger, errorHandler };
