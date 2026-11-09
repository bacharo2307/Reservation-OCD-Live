'use strict';
// Logs structurés en JSON, une ligne par événement (lisibles dans Railway).

const silent = process.env.LOG_SILENT === 'true';

function write(level, msg, data) {
  if (silent) return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...(data || {}) });
  if (level === 'error' || level === 'warn') process.stderr.write(line + '\n');
  else process.stdout.write(line + '\n');
}

module.exports = {
  info: (msg, data) => write('info', msg, data),
  warn: (msg, data) => write('warn', msg, data),
  error: (msg, data) => write('error', msg, data),
};
