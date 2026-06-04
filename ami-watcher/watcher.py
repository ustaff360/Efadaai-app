"""
AMI Watcher Service
"""
import asyncio
import os
import signal
import logging
from datetime import datetime, timezone

import redis.asyncio as redis
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

logging.basicConfig(level=logging.INFO, format="%(asctime)s [AMI-WATCHER] %(message)s")
logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://routing_user:routing_secret_2024@postgres:5432/asterisk_routing")
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
ASTERISK_HOST = os.getenv("ASTERISK_HOST", "127.0.0.1")
ASTERISK_PORT = int(os.getenv("ASTERISK_PORT", "5038"))
AMI_USERNAME = os.getenv("AMI_USERNAME", "admin")
AMI_PASSWORD = os.getenv("AMI_PASSWORD", "admin123")
POLL_INTERVAL = int(os.getenv("POLL_INTERVAL", "5"))
AGENT_STATUS_TTL = int(os.getenv("AGENT_STATUS_TTL", "60"))
_redis_client = None


class AMIProtocol(asyncio.Protocol):
    """Raw AMI protocol handler."""

    def __init__(self):
        self.buffer = ""
        self.connected = False
        self.logged_in = False
        self.transport = None

    def connection_made(self, transport):
        self.transport = transport
        self.connected = True

    def data_received(self, data):
        self.buffer += data.decode("utf-8", errors="replace")
        while "\r\n\r\n" in self.buffer:
            msg, self.buffer = self.buffer.split("\r\n\r\n", 1)
            self._process_message(msg)

    def _parse_headers(self, msg):
        lines = msg.strip().split("\r\n")
        headers = {}
        for line in lines:
            if ": " in line:
                key, val = line.split(": ", 1)
                headers[key] = val
            elif line.startswith(" ") and headers:
                prev_key = list(headers.keys())[-1]
                headers[prev_key] += " " + line.strip()
        return headers

    def _process_message(self, msg):
        headers = self._parse_headers(msg)
        event_type = headers.get("Event", "")
        if event_type == "Login":
            if headers.get("Response") == "Success":
                self.logged_in = True
                logger.info("AMI logged in successfully")
                self.transport.write(b"Action: Events\r\nFlags: 0\r\n\r\n")
        elif event_type == "Newstate":
            self._handle_channel_hangup(headers)
        elif event_type == "Hangup":
            self._handle_channel_hangup(headers)
        elif event_type == "PeerStatus":
            self._handle_peer_status(headers)
        elif event_type == "SoftHangup":
            self._handle_soft_hangup(headers)

    def _handle_newstate(self, headers):
        channel = headers.get("Channel", "")
        state = headers.get("ChannelState", "")
        linkedid = headers.get("LinkedID", "")
        if not channel or not state:
            return
        ext = self._extract_extension(channel)
        if not ext:
            return
        if state in ("5", "6"):
            asyncio.create_task(_update_redis_status(ext, "busy", linkedid))
        elif state == "2":
            asyncio.create_task(_update_redis_status(ext, "ringing", linkedid))

    def _handle_channel_hangup(self, headers):
        channel = headers.get("Channel", "")
        linkedid = headers.get("LinkedID", "")
        if not linkedid:
            return
        ext = self._extract_extension(channel)
        if ext:
            asyncio.create_task(_update_redis_status(ext, "idle", linkedid))

    def _handle_soft_hangup(self, headers):
        channel = headers.get("Channel", "")
        linkedid = headers.get("LinkedID", "")
        if not linkedid:
            return
        ext = self._extract_extension(channel)
        if ext:
            asyncio.create_task(_update_redis_status(ext, "idle", linkedid))

    def _handle_peer_status(self, headers):
        peer = headers.get("Peer", "").split("/")[-1]
        status = headers.get("PeerStatus", "")
        if status == "Reachable":
            asyncio.create_task(_update_redis_status(peer, "idle", ttl=300))
        else:
            asyncio.create_task(_update_redis_status(peer, "unavailable", ttl=300))

    def _extract_extension(self, channel_name):
        parts = channel_name.split("/")
        if len(parts) >= 2:
            base = parts[1]
            ext = base.split("-")[0]
            if ext and ext.isdigit():
                return ext
        return None

    def send_login(self, username, password):
        self.transport.write(
            f"Action: Login\r\nUsername: {username}\r\nSecret: {password}\r\n\r\n".encode()
        )


class AMIWatcher:
    """Manages AMI connection and updates Redis with agent status."""

    def __init__(self):
        self.redis = None
        self.running = False
        self.db_engine = None
        self.db_session = None

    async def start(self):
        global _redis_client
        logger.info("Starting AMI Watcher...")
        logger.info(f"Asterisk: {ASTERISK_HOST}:{ASTERISK_PORT}")
        _redis_client = redis.from_url(REDIS_URL, decode_responses=True)
        await _redis_client.ping()
        self.redis = _redis_client
        logger.info("Redis connected")
        self.db_engine = create_async_engine(DATABASE_URL)
        self.db_session = async_sessionmaker(self.db_engine, expire_on_commit=False)
        self.running = True
        await self._connect_ami()
        while self.running:
            try:
                await asyncio.sleep(POLL_INTERVAL)
                await self._refresh_agent_status_from_db()
            except Exception as e:
                logger.error(f"Error in main loop: {e}")
                await asyncio.sleep(5)

    async def _connect_ami(self):
        while self.running:
            try:
                loop = asyncio.get_running_loop()
                transport, protocol = await loop.create_connection(
                    lambda: AMIProtocol(), ASTERISK_HOST, ASTERISK_PORT
                )
                protocol.connection_made(transport)
                protocol.send_login(AMI_USERNAME, AMI_PASSWORD)
                await asyncio.sleep(1)
                if protocol.logged_in:
                    logger.info(f"Connected to Asterisk AMI at {ASTERISK_HOST}:{ASTERISK_PORT}")
                    while self.running:
                        try:
                            if not protocol.connected:
                                break
                            await asyncio.sleep(1)
                        except (asyncio.CancelledError, Exception):
                            break
                    logger.warning("AMI connection lost, reconnecting...")
                    await asyncio.sleep(5)
                else:
                    logger.error("AMI login failed - check credentials")
                    await asyncio.sleep(10)
            except ConnectionRefusedError:
                logger.error(f"Cannot connect to Asterisk AMI at {ASTERISK_HOST}:{ASTERISK_PORT}")
                await asyncio.sleep(10)
            except OSError as e:
                logger.error(f"AMI connection error: {e}")
                await asyncio.sleep(5)

    async def _refresh_agent_status_from_db(self):
        try:
            async with self.db_session() as session:
                from app.models.agent import Agent
                result = await session.execute(Agent)
                agents = result.scalars().all()
                for agent in agents:
                    if agent.status == "active":
                        key = f"agent_status:{agent.extension}"
                        exists = await self.redis.exists(key)
                        if not exists:
                            await self.redis.setex(key, AGENT_STATUS_TTL, "idle")
        except Exception as e:
            logger.error(f"Error refreshing agent status: {e}")

    def stop(self):
        logger.info("Stopping AMI Watcher...")
        self.running = False
        if self.redis:
            asyncio.create_task(self.redis.close())
        if self.db_engine:
            asyncio.create_task(self.db_engine.dispose())


async def _update_redis_status(extension, status, linkedid="", ttl=None):
    global _redis_client
    if not extension or not _redis_client:
        return
    try:
        key = f"agent_status:{extension}"
        await _redis_client.setex(key, ttl or AGENT_STATUS_TTL, status)
        logger.debug(f"Agent {extension} -> {status} (linkedid={linkedid})")
    except Exception as e:
        logger.error(f"Redis update error: {e}")


async def main():
    watcher = AMIWatcher()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, watcher.stop)
    await watcher.start()


if __name__ == "__main__":
    asyncio.run(main())
