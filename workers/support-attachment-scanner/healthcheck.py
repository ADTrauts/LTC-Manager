"""Check the private engine, maintained definitions and TLS listener without file bytes."""
import os
import pwd
import socket
import ssl

from worker import engine_info

# Root has no DAC override capability. Join the internal socket group explicitly;
# retain access to the mounted TLS certificate without loosening secret permissions.
if os.getuid() == 0:
    os.setegid(pwd.getpwnam("clamav").pw_gid)
engine_info()
context = ssl.create_default_context(cafile=os.environ["SUPPORT_SCANNER_TLS_CERT"])
with socket.create_connection(("127.0.0.1", int(os.environ.get("SUPPORT_SCANNER_PORT", "8443"))), timeout=5) as connection:
    with context.wrap_socket(connection, server_hostname=os.environ.get("SUPPORT_SCANNER_TLS_SERVER_NAME", "localhost")):
        pass
