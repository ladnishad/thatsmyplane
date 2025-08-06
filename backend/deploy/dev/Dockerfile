# Development Dockerfile optimized for hot reloading
FROM node:18-alpine

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create app user (optional for development, but good practice)
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodeuser -u 1001

# Set working directory
WORKDIR /app

# Copy package files (from the backend directory which is the build context)
COPY package*.json ./

# Install all dependencies (including dev dependencies)
RUN npm ci && npm cache clean --force

# Install nodemon globally for development
RUN npm install -g nodemon

# Create logs directory
RUN mkdir -p logs

# Change ownership of the app directory to nodeuser
RUN chown -R nodeuser:nodejs /app

# Switch to non-root user (commented out for development convenience)
# USER nodeuser

# Expose port
EXPOSE 3000

# Health check (simplified for development)
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application with nodemon for hot reloading
CMD ["npm", "run", "dev"]