"""
In-process counters, exposed in Prometheus text format at /metrics.

Deliberately dependency-free and per-process, matching the rate limiter: the
engine runs single-worker, so a shared store would be premature. A multi-instance
deployment needs one — see README.

The counters chosen are the ones a pilot actually needs to watch: how often the
system refuses to answer, how often the deterministic overdose block fires, and
whether retrieval is healthy. Refusal rate is the signal that tells an operator
the knowledge base has a gap, and it is invisible without this.
"""
import threading
import time
from collections import defaultdict
from typing import Dict


class Metrics:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._counters: Dict[str, float] = defaultdict(float)
        # Fixed buckets in seconds; clinical queries are seconds, not micro.
        self._latency_buckets = (0.5, 1, 2, 5, 10, 30)
        self._latency_counts: Dict[float, int] = defaultdict(int)
        self._latency_sum = 0.0
        self._latency_total = 0
        self._started = time.time()

    def incr(self, name: str, value: float = 1.0) -> None:
        with self._lock:
            self._counters[name] += value

    def observe_latency(self, seconds: float) -> None:
        with self._lock:
            self._latency_sum += seconds
            self._latency_total += 1
            for bucket in self._latency_buckets:
                if seconds <= bucket:
                    self._latency_counts[bucket] += 1

    def render(self, *, indexed_chunks: int, retriever_available: bool) -> str:
        with self._lock:
            counters = dict(self._counters)
            latency_counts = dict(self._latency_counts)
            latency_sum = self._latency_sum
            latency_total = self._latency_total
            uptime = time.time() - self._started

        lines = [
            "# HELP bnp_uptime_seconds Seconds since the engine started.",
            "# TYPE bnp_uptime_seconds gauge",
            f"bnp_uptime_seconds {uptime:.0f}",
            "# HELP bnp_indexed_chunks Number of retrievable chunks.",
            "# TYPE bnp_indexed_chunks gauge",
            f"bnp_indexed_chunks {indexed_chunks}",
            "# HELP bnp_retriever_available 1 when retrieval can serve queries.",
            "# TYPE bnp_retriever_available gauge",
            f"bnp_retriever_available {1 if retriever_available else 0}",
        ]

        documented = {
            "bnp_queries_total": "Clinical queries received.",
            "bnp_queries_answered_total": "Queries that produced an answer.",
            "bnp_queries_refused_total": "Queries refused by any safety gate.",
            "bnp_overdose_blocks_total": "Overdoses stopped by the deterministic hard block.",
            "bnp_safety_alerts_total": "Safety alerts raised.",
            "bnp_retrieval_unavailable_total": "Queries refused because retrieval was down.",
            "bnp_audit_write_failures_total": "Audit writes that failed, each refusing its request.",
            "bnp_documents_indexed_total": "Documents added to the corpus.",
            "bnp_documents_retired_total": "Documents retired from the corpus.",
        }
        for name, help_text in documented.items():
            lines.append(f"# HELP {name} {help_text}")
            lines.append(f"# TYPE {name} counter")
            lines.append(f"{name} {counters.get(name, 0):.0f}")

        lines.append("# HELP bnp_query_duration_seconds Clinical query latency.")
        lines.append("# TYPE bnp_query_duration_seconds histogram")
        cumulative = 0
        for bucket in self._latency_buckets:
            cumulative = latency_counts.get(bucket, 0)
            lines.append(f'bnp_query_duration_seconds_bucket{{le="{bucket}"}} {cumulative}')
        lines.append(f'bnp_query_duration_seconds_bucket{{le="+Inf"}} {latency_total}')
        lines.append(f"bnp_query_duration_seconds_sum {latency_sum:.3f}")
        lines.append(f"bnp_query_duration_seconds_count {latency_total}")

        return "\n".join(lines) + "\n"


metrics = Metrics()
