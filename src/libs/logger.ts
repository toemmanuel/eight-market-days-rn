type LogType = 'log' | 'info' | 'warn' | 'error';

class Logger {
  constructor(private namespace: string) {}

  private print(type: LogType, ...args: any[]) {
    if (!__DEV__) return;

    const timestamp = new Date().toISOString();

    const icon = {
      log: '🟢',
      info: '🔵',
      warn: '🟡',
      error: '🔴',
    }[type];

    console[type](`${icon} [${timestamp}] [${this.namespace}]`, ...args);
  }

  log(...args: any[]) {
    this.print('log', ...args);
  }

  info(...args: any[]) {
    this.print('info', ...args);
  }

  warn(...args: any[]) {
    this.print('warn', ...args);
  }

  error(...args: any[]) {
    this.print('error', ...args);
  }
}
