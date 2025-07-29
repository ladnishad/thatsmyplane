const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

const formatMessage = (level, message, ...args) => {
  const timestamp = new Date().toISOString();
  const formattedArgs = args.length > 0 ? ` ${args.join(' ')}` : '';
  return `[${timestamp}] [${level}] ${message}${formattedArgs}`;
};

const logger = {
  info: (message, ...args) => {
    if (process.env.NODE_ENV !== 'test') {
      console.log(colors.green + formatMessage('INFO', message, ...args) + colors.reset);
    }
  },

  warn: (message, ...args) => {
    if (process.env.NODE_ENV !== 'test') {
      console.warn(colors.yellow + formatMessage('WARN', message, ...args) + colors.reset);
    }
  },

  error: (message, ...args) => {
    if (process.env.NODE_ENV !== 'test') {
      console.error(colors.red + formatMessage('ERROR', message, ...args) + colors.reset);
    }
  },

  debug: (message, ...args) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(colors.cyan + formatMessage('DEBUG', message, ...args) + colors.reset);
    }
  },

  success: (message, ...args) => {
    if (process.env.NODE_ENV !== 'test') {
      console.log(colors.bright + colors.green + formatMessage('SUCCESS', message, ...args) + colors.reset);
    }
  },
};

module.exports = logger; 