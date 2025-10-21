FROM alpine:latest

# Install Icecast (creates icecast user and group automatically)
RUN apk add --no-cache icecast

# Create directories with proper ownership
RUN mkdir -p /etc/icecast2 /var/log/icecast /usr/share/icecast && \
    chown -R icecast:icecast /etc/icecast2 /var/log/icecast /usr/share/icecast

# Copy entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Expose Icecast ports
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8000/ || exit 1

# Switch to icecast user
USER icecast

# Run Icecast
ENTRYPOINT ["/entrypoint.sh"]
