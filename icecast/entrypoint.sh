#!/bin/sh
set -e

# Default values
SOURCE_PASSWORD="${ICECAST_SOURCE_PASSWORD:-hackme}"
ADMIN_PASSWORD="${ICECAST_ADMIN_PASSWORD:-hackme}"
ADMIN_USERNAME="${ICECAST_ADMIN_USERNAME:-admin}"
RELAY_PASSWORD="${ICECAST_RELAY_PASSWORD:-hackme}"
HOSTNAME="${ICECAST_HOSTNAME:-localhost}"

# Generate Icecast configuration
cat > /etc/icecast2/icecast.xml <<EOF
<icecast>
    <location>OpenStudio</location>
    <admin>admin@localhost</admin>

    <limits>
        <clients>100</clients>
        <sources>2</sources>
        <queue-size>524288</queue-size>
        <client-timeout>30</client-timeout>
        <header-timeout>15</header-timeout>
        <source-timeout>10</source-timeout>
        <burst-on-connect>1</burst-on-connect>
        <burst-size>65535</burst-size>
    </limits>

    <authentication>
        <source-password>${SOURCE_PASSWORD}</source-password>
        <relay-password>${RELAY_PASSWORD}</relay-password>
        <admin-user>${ADMIN_USERNAME}</admin-user>
        <admin-password>${ADMIN_PASSWORD}</admin-password>
    </authentication>

    <hostname>${HOSTNAME}</hostname>

    <listen-socket>
        <port>8000</port>
    </listen-socket>

    <fileserve>1</fileserve>

    <paths>
        <basedir>/usr/share/icecast</basedir>
        <logdir>/var/log/icecast</logdir>
        <webroot>/usr/share/icecast/web</webroot>
        <adminroot>/usr/share/icecast/admin</adminroot>
        <alias source="/" destination="/status.xsl"/>
    </paths>

    <logging>
        <accesslog>-</accesslog>
        <errorlog>-</errorlog>
        <loglevel>3</loglevel>
        <logsize>10000</logsize>
    </logging>

    <security>
        <chroot>0</chroot>
    </security>
</icecast>
EOF

# Start Icecast in foreground
exec icecast -c /etc/icecast2/icecast.xml
