FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application code (will be minimal for now)
COPY . .

# Expose signaling server port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "console.log('OK')" || exit 1

# Placeholder startup - will be replaced in task 003
CMD ["node", "-e", "console.log('OpenStudio signaling server placeholder - ready for task 003'); setInterval(() => {}, 1000)"]
