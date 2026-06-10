type LogType = 'log' | 'info' | 'warn' | 'error';

const LOG_ICONS: Record<LogType, string> = {
  log: '🟢',
  info: '🔵',
  warn: '🟡',
  error: '🔴',
};

export function log(type: LogType = 'log', name = 'APP', ...args: any[]) {
  if (!__DEV__) return;

  const timestamp = new Date().toISOString();

  const prefix = `${LOG_ICONS[type]} [${timestamp}] [${name}]`;

  switch (type) {
    case 'info':
      console.info(prefix, ...args);
      break;

    case 'warn':
      console.warn(prefix, ...args);
      break;

    case 'error':
      console.error(prefix, ...args);
      break;

    default:
      console.log(prefix, ...args);
  }
}
