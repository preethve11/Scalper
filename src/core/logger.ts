export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export class Logger {
  private context: string;
  private logLevel: LogLevel;

  constructor(context: string) {
    this.context = context;
    this.logLevel = this.getLogLevel();
  }

  private getLogLevel(): LogLevel {
    const envLogLevel = process.env.LOG_LEVEL as LogLevel;
    return envLogLevel || 'info';
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: Record<LogLevel, number> = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3,
    };
    
    return levels[level] >= levels[this.logLevel];
  }

  private formatMessage(level: LogLevel, message: string, ...args: any[]): string {
    const timestamp = new Date().toISOString();
    const contextStr = `[${this.context}]`;
    const levelStr = `[${level.toUpperCase()}]`;
    
    return `${timestamp} ${levelStr} ${contextStr} ${message}`;
  }

  debug(message: string, ...args: any[]): void {
    if (this.shouldLog('debug')) {
      console.debug(this.formatMessage('debug', message), ...args);
    }
  }

  info(message: string, ...args: any[]): void {
    if (this.shouldLog('info')) {
      console.info(this.formatMessage('info', message), ...args);
    }
  }

  warn(message: string, ...args: any[]): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message), ...args);
    }
  }

  error(message: string, ...args: any[]): void {
    if (this.shouldLog('error')) {
      console.error(this.formatMessage('error', message), ...args);
    }
  }

  // Method to log trading signals
  signal(signal: string, data: any): void {
    const message = `SIGNAL: ${signal}`;
    console.log(this.formatMessage('info', message), data);
  }

  // Method to log trade execution
  trade(action: 'BUY' | 'SELL', token: string, amount: number, price?: number): void {
    const message = `TRADE: ${action} ${amount} ${token}${price ? ` @ ${price}` : ''}`;
    console.log(this.formatMessage('info', message));
  }

  // Method to log performance metrics
  performance(metric: string, value: number, unit?: string): void {
    const message = `PERFORMANCE: ${metric} = ${value}${unit ? ` ${unit}` : ''}`;
    console.log(this.formatMessage('info', message));
  }

  // Method to create a child logger with additional context
  child(additionalContext: string): Logger {
    const childLogger = new Logger(`${this.context}:${additionalContext}`);
    return childLogger;
  }
}
