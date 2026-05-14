"""
Shared interval cache instance — imported by any route that reads or writes
appointment busy-intervals.

Keeping the cache in a dedicated module (rather than inside app/routes/public.py)
prevents route modules from importing each other's private state.
"""

from app.utils.lru_cache import LRUCache

# Module-level cache: stores busy-interval lists keyed by ISO date string.
# Capacity 14 keeps ~2 weeks of dates warm; older dates are evicted automatically.
# Every route that commits appointment changes must call .invalidate(date_key).
intervals_cache: LRUCache = LRUCache(capacity=14)
