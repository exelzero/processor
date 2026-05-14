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
from typing import Any


class LRUCache:
    """
    Fixed-capacity LRU cache with O(1) get, put, and invalidate.

    Not thread-safe — suitable for single-process, single-worker deployments.
    Multiple Uvicorn/Gunicorn worker *processes* each hold their own cache
    instance; an invalidation in one process is invisible to the others.
    Use a shared store (Redis, DB timestamp) if running with workers > 1.
    Add a threading.Lock around _store mutations for multi-threaded workers.
    """

    # Unique sentinel returned by get() on a cache miss.
    # Using a private object (not None) means None is a valid storable value
    # and callers can distinguish a miss from a cached None unambiguously.
    MISSING: object = object()

    def __init__(self, capacity: int) -> None:
        if capacity < 1:
            raise ValueError('capacity must be at least 1')
        self._capacity = capacity
        self._store: OrderedDict = OrderedDict()

    def get(self, key: Any) -> Any:
        """Return cached value, or LRUCache.MISSING on a miss.  Marks key as MRU."""
        if key not in self._store:
            return LRUCache.MISSING
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
        # Does not update LRU order — use get() if the access should count as a use.
        return key in self._store
