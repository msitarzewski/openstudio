FROM node:18-alpine

WORKDIR /app

# Copy package files from server directory
COPY server/package*.json ./

# Install dependencies
RUN npm install

# Copy station manifest files from project root
COPY station-manifest*.json ../

# Copy application code from server directory
COPY server/ .

# Expose signaling server port
EXPOSE 6736

# Health check (uses HTTP endpoint)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:6736/health || exit 1

# Run as non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

# Start signaling server
CMD ["node", "server.js"]
