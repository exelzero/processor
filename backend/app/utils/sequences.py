"""
Integer sequence utilities — three approaches to missing-integer detection.

Each function targets a different problem shape and demonstrates a distinct
algorithmic technique.  All three are O(n) time; they differ in space
complexity and in what "missing" means.
"""


def find_missing_one(nums: list[int]) -> int:
    """
    Find the single missing integer in a permutation of [1..n].

    XOR approach — O(n) time, O(1) space.

    Key insight: XOR is its own inverse (a ^ a = 0, a ^ 0 = a).
    XOR every index in [1..n+1] with every value in nums; each present
    number appears exactly twice (once as an index, once as a value) and
    cancels to 0.  Only the missing number appears once, so it survives.

    Example: nums = [3, 1, 4]  →  missing is 2
      result = 1^2^3^4 ^ 3^1^4 = (1^1)^(3^3)^(4^4)^2 = 0^0^0^2 = 2

    Contrast with the arithmetic approach (expected_sum - actual_sum):
    XOR avoids integer overflow risk and works without knowing n in advance.
    """
    result = 0
    for i in range(1, len(nums) + 2):   # XOR expected range [1..n] (n = full permutation size)
        result ^= i
    for x in nums:                       # XOR actual values — duplicates cancel
        result ^= x
    return result


def first_missing_positive(nums: list[int]) -> int:
    """
    Find the smallest positive integer absent from an unsorted list.

    In-place index-as-hash approach — O(n) time, O(1) extra space.

    Key insight: the answer must be in [1..n+1].  Any value outside that
    range is irrelevant.  We use the array itself as a presence map:
    swap each value x into position x-1 (where 1 ≤ x ≤ n).  After one
    pass, index i holds i+1 iff i+1 was present; the first gap is the answer.

    The while-loop looks O(n²) but each swap moves at least one element to
    its correct slot, so the total number of swaps across the entire loop
    is bounded by n — amortised O(n) overall.

    Example: nums = [3, 4, -1, 1]
      after placement: [1, -1, 3, 4]   (2 is missing → return 2)
    """
    n = len(nums)

    for i in range(n):
        # Move nums[i] to its target slot while it's in-range and displaced.
        while 1 <= nums[i] <= n and nums[nums[i] - 1] != nums[i]:
            target = nums[i] - 1
            nums[i], nums[target] = nums[target], nums[i]

    for i in range(n):
        if nums[i] != i + 1:
            return i + 1

    return n + 1   # all of [1..n] present; answer is n+1


def find_gaps(ids: list[int]) -> list[int]:
    """
    Return every integer missing from the inclusive range [min(ids)..max(ids)].

    Set-membership approach — O(n) time, O(n) space.

    Used for auditing integer sequences (appointment IDs, invoice numbers,
    etc.) to detect soft-deleted or skipped records.  Converting to a set
    first makes each membership check O(1) instead of O(n), so the full
    scan over the range is O(range_size) rather than O(range_size × n).

    Returns an empty list when the sequence is already contiguous or has
    fewer than two elements.
    """
    if len(ids) < 2:
        return []

    id_set = set(ids)                          # O(n) build, O(1) lookup
    lo, hi = min(id_set), max(id_set)
    return [i for i in range(lo, hi + 1) if i not in id_set]
