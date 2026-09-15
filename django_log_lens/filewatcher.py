import os
import threading
import time
from collections.abc import Callable


class FileWatcher:
    """
    Utility class to watch for file changes and trigger callbacks on modifications.
    When instantiated, it starts a background thread that monitors the specified file.
    """

    def __init__(self, filepath: str, interval: float, callback: Callable):
        self.filepath = filepath
        self.callback = callback
        self.interval = interval
        self._last_modified = None
        self._last_size = 0
        threading.Thread(target=self._watch_file, daemon=True).start()

    def _watch_file(self):
        """Polls the file on a fixed interval, forever, dispatching a callback on each change."""
        while True:
            self._poll_once()
            time.sleep(self.interval)

    def _poll_once(self) -> None:
        """Checks the file's mtime once and, if it changed, notifies the callback."""
        try:
            modified_time = os.path.getmtime(self.filepath)
            if self._last_modified is None:
                self._last_modified = modified_time
                self._last_size = os.path.getsize(self.filepath)
                return

            if modified_time != self._last_modified:
                self._last_modified = modified_time
                self.callback(self.filepath, self._get_modification_type())
        except FileNotFoundError:
            pass

    def _get_modification_type(self) -> str:
        """Determines the type of modification: 'append' or 'rotate'."""
        new_size = os.path.getsize(self.filepath)
        modification_type = "rotate" if new_size < self._last_size else "append"
        self._last_size = new_size
        return modification_type
