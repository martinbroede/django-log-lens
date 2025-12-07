import os
import threading
from typing import Callable


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
        """Internal method to watch the file for changes."""
        import os
        import time

        while True:
            try:
                modified_time = os.path.getmtime(self.filepath)
                if self._last_modified is None:
                    self._last_modified = modified_time
                    self._last_size = os.path.getsize(self.filepath)

                if modified_time != self._last_modified:
                    self._last_modified = modified_time
                    self.callback(self.filepath, self._get_modification_type())
            except FileNotFoundError:
                pass

            time.sleep(self.interval)

    def _get_modification_type(self) -> str:
        """Determines the type of modification: 'append' or 'rotate'."""
        new_size = os.path.getsize(self.filepath)
        if new_size < self._last_size:
            self._last_size = new_size
            return "rotate"
        else:
            self._last_size = new_size
            return "append"
