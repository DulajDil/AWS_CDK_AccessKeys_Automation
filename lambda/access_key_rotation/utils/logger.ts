// Structured logging utility for CloudWatch

export class Logger {
  static info(message: string, metadata?: any) {
    console.log(JSON.stringify({
      level: 'INFO',
      message,
      timestamp: new Date().toISOString(),
      ...metadata,
    }));
  }

  static error(message: string, error?: any, metadata?: any) {
    console.log(JSON.stringify({
      level: 'ERROR',
      message,
      error: error?.message || error,
      stack: error?.stack,
      timestamp: new Date().toISOString(),
      ...metadata,
    }));
  }

  static warning(message: string, metadata?: any) {
    console.warn(JSON.stringify({
      level: 'WARNING',
      message,
      timestamp: new Date().toISOString(),
      ...metadata,
    }));
  }

  static debug(message: string, metadata?: any) {
    console.log(JSON.stringify({
      level: 'DEBUG',
      message,
      timestamp: new Date().toISOString(),
      ...metadata,
    }));
  }
}
