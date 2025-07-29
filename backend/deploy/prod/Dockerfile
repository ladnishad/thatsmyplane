# Production Dockerfile with multi-stage build
# Stage 1: Build stage
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Copy package files
COPY package*.json ./

# Install dependencies (including dev dependencies for build)
RUN npm ci --only=production && npm cache clean --force

# Stage 2: Production stage
FROM node:18-alpine AS production

# Create app user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodeuser -u 1001

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Set working directory
WORKDIR /app

# Copy production dependencies from builder stage
COPY --from=builder --chown=nodeuser:nodejs /app/node_modules ./node_modules

# Copy application code
COPY --chown=nodeuser:nodejs . .

# Remove unnecessary files for production
RUN rm -rf tests/ scripts/ *.md .eslint* .prettier* jest.config.js deploy/

# Create logs directory with proper permissions
RUN mkdir -p logs && chown nodeuser:nodejs logs

# Switch to non-root user
USER nodeuser

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "const http = require('http'); const options = { host: 'localhost', port: 3000, path: '/health', timeout: 5000 }; const req = http.request(options, (res) => { console.log('Health check passed'); process.exit(res.statusCode === 200 ? 0 : 1); }); req.on('error', () => process.exit(1)); req.end();"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "src/server.js"]