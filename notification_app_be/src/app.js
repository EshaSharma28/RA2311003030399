const express = require('express');
const { Log } = require('./config/logger');
const { requestLogger, errorHandler } = require('./middleware/requestLogger');
const notificationRoutes = require('./route/notificationRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(requestLogger);

// health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'notification_app_be', timestamp: new Date().toISOString() });
});

app.use('/api/notifications', notificationRoutes);

app.use(errorHandler);

app.listen(PORT, async () => {
  await Log('backend', 'info', 'service', `Notification service started on port ${PORT}`);
  console.log(`Notification service running on http://localhost:${PORT}`);
});

module.exports = app;
