# Maintained LTS. Review/refresh patch level and engine policy before EOL (2027-08-15).
FROM clamav/clamav:1.4.6
USER root
RUN apk add --no-cache python3 poppler-utils
COPY clamd.conf /etc/clamav/clamd.conf
COPY freshclam.conf /etc/clamav/support-freshclam.conf
COPY worker.py healthcheck.py run.sh /opt/support-scanner/
RUN chmod 755 /opt/support-scanner/run.sh
ENV TZ=UTC SUPPORT_SCANNER_PORT=8443
EXPOSE 8443
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 CMD python3 /opt/support-scanner/healthcheck.py
# Raw clamd has only a Unix socket. Only this authenticated TLS wrapper is exposed.
ENTRYPOINT ["/opt/support-scanner/run.sh"]
