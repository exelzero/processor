"""
LRU (Least Recently Used) cache implemented with OrderedDict.

An LRU cache evicts the least recently accessed entry when capacity is
exceeded, keeping hot data in memory while bounding memory use.

Why OrderedDict instead of a plain dict + list?
  dict alone: O(1) lookup, but tracking access order requires O(n) scan.
  list alone: O(1) append, but lookup is O(n).
  OrderedDict: maintains insertion/access order internally via a
    doubly-linked list threaded through the hash table nodes.
    move_to_end() and popitem(last=False) are both O(1), so get and put
    are O(1) without any extra data structure.

The classic alternative is an explicit doubly-linked list + dict:
  - head/tail sentinel nodes mark the MRU and LRU ends
  - each node holds key, value, prev, next pointers
  - dict maps key → node for O(1) access
OrderedDict is that structure, already built into CPython — using it
keeps the implementation concise while preserving the O(1) guarantees.
"""

from collections import OrderedDict
from typing import Any, Optional


class LRUCache:
    """
    Fixed-capacity LRU cache with O(1) get, put, and invalidate.

    Not thread-safe — suitable for single-process deployments (e.g. a
    single Uvicorn worker).  Add a threading.Lock around _store mutations
    if running with multiple threads or workers sharing state.
    """

    def __init__(self, capacity: int) -> None:
        if capacity < 1:
            raise ValueError('capacity must be at least 1')
        self._capacity = capacity
        self._store: OrderedDict = OrderedDict()

    def get(self, key: Any) -> Optional[Any]:
        """Return cached value or None on miss.  Marks key as most recently used."""
        if key not in self._store:
            return None
        self._store.move_to_end(key)   # O(1) — relink node to tail (MRU end)
        return self._store[key]

    def put(self, key: Any, value: Any) -> None:
        """Insert or update a key.  Evicts the LRU entry if over capacity."""
        if key in self._store:
            self._store.move_to_end(key)   # existing key → bump to MRU
        self._store[key] = value
        if len(self._store) > self._capacity:
            self._store.popitem(last=False)  # O(1) — remove head (LRU end)

    def invalidate(self, key: Any) -> None:
        """Remove a single key (no-op if absent).  Used for write-through invalidation."""
        self._store.pop(key, None)

    def __len__(self) -> int:
        return len(self._store)

    def __contains__(self, key: Any) -> bool:
        return key in self._store
