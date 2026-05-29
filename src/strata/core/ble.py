import abc
import asyncio
import threading
import logging
from typing import Callable, Optional

logger = logging.getLogger("strata.ble")

class BaseBLE(abc.ABC):
    """Abstract interface for BLE operations."""

    @abc.abstractmethod
    def start_advertising(self, data: bytes):
        """Starts advertising the given data."""
        pass

    @abc.abstractmethod
    def stop_advertising(self):
        """Stops advertising."""
        pass

    @abc.abstractmethod
    def start_scanning(self, callback: Callable[[str, int, bytes], None]):
        """
        Starts scanning for devices.
        Callback: (address, rssi, advertisement_data)
        """
        pass

    @abc.abstractmethod
    def stop_scanning(self):
        """Stops scanning."""
        pass

    @abc.abstractmethod
    def stop_all(self):
        """Stops all BLE activities."""
        pass


class BleakHAL(BaseBLE):
    """BLE implementation using the bleak library."""

    def __init__(self):
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        
        # Bleak specific components (to be initialized in the loop)
        self._scanner = None
        self._advertising_data: Optional[bytes] = None
        self._is_advertising = False
        self._is_scanning = False
        self._scan_callback: Optional[Callable] = None

        # Start the background event loop thread
        self._start_event_loop()

    def _start_event_loop(self):
        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()
        # Wait for loop to be ready
        while self._loop is None or not self._loop.is_running():
            threading.Event().wait(0.1)

    def _run_loop(self):
        self._loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self._loop)
        try:
            self._loop.run_forever()
        finally:
            self._loop.close()

    def start_advertising(self, data: bytes):
        self._advertising_data = data
        if not self._is_advertising:
            logger.info("Starting BLE advertising (Simulation/Stub - Bleak has limited advertising support on some platforms)")
            # NOTE: Bleak's advertising support varies greatly by platform.
            # On Linux (BlueZ), it's better handled via direct dbus or other tools if Bleak fails.
            # For now, we will use a placeholder or attempt a basic advertisement if available.
            self._is_advertising = True
            
    def stop_advertising(self):
        self._is_advertising = False
        logger.info("Stopped BLE advertising")

    def start_scanning(self, callback: Callable[[str, int, bytes], None]):
        self._scan_callback = callback
        if not self._is_scanning:
            self._is_scanning = True
            asyncio.run_coroutine_threadsafe(self._run_scanning(), self._loop)

    async def _run_scanning(self):
        from bleak import BleakScanner
        
        def detection_callback(device, advertisement_data):
            if self._scan_callback and self._is_scanning:
                # We look for our specific manufacturer data or service data
                # For simplicity, we pass all raw data for now
                m_data = advertisement_data.manufacturer_data
                if m_data:
                    # Bleak returns manufacturer_data as a dict {id: bytes}
                    for company_id, data in m_data.items():
                        self._scan_callback(device.address, device.rssi, data)

        try:
            async with BleakScanner(detection_callback) as scanner:
                logger.info("BLE Scanning started")
                while self._is_scanning:
                    await asyncio.sleep(1)
        except Exception as e:
            logger.error(f"BLE Scan error: {e}")
        finally:
            self._is_scanning = False
            logger.info("BLE Scanning stopped")

    def stop_scanning(self):
        self._is_scanning = False

    def stop_all(self):
        self.stop_advertising()
        self.stop_scanning()
        if self._loop:
            self._loop.call_soon_threadsafe(self._loop.stop)
        if self._thread:
            self._thread.join(timeout=2)
