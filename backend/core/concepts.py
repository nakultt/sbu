"""Build an exam's concept graph and bind each concept to the student's notes.

The graph comes from the local LLM given nothing but an exam name, then every
concept is bound to real chunks by vector search — so the map is grounded in the
material the student actually owns, and study/RAG steps have something to cite.
"""
from __future__ import annotations

import logging
import re
import threading
import time

from core import db, llm, mastery, vectorstore

logger = logging.getLogger(__name__)

MAX_CONCEPTS = 60
SOURCES_PER_CONCEPT = 5
MAX_TIER_DEPTH = 12

GRAPH_SYSTEM = """You map an exam syllabus into a prerequisite graph of concepts.

Return one JSON object with this exact shape:
{"concepts": [{"name": "Concept name",
               "blurb": "One sentence on what the student must be able to do.",
               "prerequisites": ["Other concept name", ...]}]}

Rules:
- Produce between 20 and 45 concepts covering the whole exam, not just the basics.
- Names are short noun phrases, unique, and title-cased.
- "prerequisites" lists ONLY names that also appear in this same concepts array.
- The prerequisite relation must be acyclic: a concept never depends on something
  that depends on it, directly or indirectly.
- Foundational concepts have an empty prerequisites array. Include several.
"""


def _slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:60] or "exam"


# ── Goal lifecycle ────────────────────────────────────────────────────────

def current_goal() -> dict | None:
    with db.conn() as c:
        row = c.execute(
            "SELECT * FROM exam_goals ORDER BY created_at DESC LIMIT 1"
        ).fetchone()
    return dict(row) if row else None


def get_goal(goal_id: int) -> dict | None:
    with db.conn() as c:
        row = c.execute("SELECT * FROM exam_goals WHERE id=?", (goal_id,)).fetchone()
    return dict(row) if row else None


def create_goal(name: str) -> dict:
    """Create a goal in `building` state and start the graph build in the background."""
    name = name.strip()[:120]
    if not name:
        raise ValueError("an exam name is required")
    now = time.time()
    with db.conn() as c:
        goal_id = c.execute(
            "INSERT INTO exam_goals (name, slug, status, created_at) VALUES (?,?,?,?)",
            (name, _slug(name), "building", now),
        ).lastrowid

    thread = threading.Thread(target=_build_safely, args=(goal_id, name), daemon=True)
    thread.start()
    return get_goal(goal_id)


def delete_goal(goal_id: int) -> None:
    """Remove a goal and everything derived from it, newest dependants first."""
    with db.conn() as c:
        concept_ids = [
            row["id"]
            for row in c.execute("SELECT id FROM concepts WHERE goal_id=?", (goal_id,))
        ]
        session_ids = [
            row["id"]
            for row in c.execute("SELECT id FROM sessions WHERE goal_id=?", (goal_id,))
        ]
        if session_ids:
            marks = ",".join("?" * len(session_ids))
            c.execute(f"DELETE FROM session_items WHERE session_id IN ({marks})", session_ids)
            c.execute(f"DELETE FROM attempts WHERE session_id IN ({marks})", session_ids)
        if concept_ids:
            marks = ",".join("?" * len(concept_ids))
            c.execute(f"DELETE FROM attempts WHERE concept_id IN ({marks})", concept_ids)
            c.execute(f"DELETE FROM questions WHERE concept_id IN ({marks})", concept_ids)
            c.execute(f"DELETE FROM mastery_history WHERE concept_id IN ({marks})", concept_ids)
            c.execute(f"DELETE FROM mastery WHERE concept_id IN ({marks})", concept_ids)
            c.execute(f"DELETE FROM concept_sources WHERE concept_id IN ({marks})", concept_ids)
            c.execute(
                f"DELETE FROM concept_edges WHERE concept_id IN ({marks}) "
                f"OR prereq_id IN ({marks})",
                concept_ids + concept_ids,
            )
        c.execute("DELETE FROM sessions WHERE goal_id=?", (goal_id,))
        c.execute("DELETE FROM concepts WHERE goal_id=?", (goal_id,))
        c.execute("DELETE FROM exam_goals WHERE id=?", (goal_id,))


def _build_safely(goal_id: int, name: str) -> None:
    try:
        build(goal_id, name)
    except Exception as exc:  # a half-built graph is never shown
        logger.exception("concept graph build failed", extra={"goal_id": goal_id})
        with db.conn() as c:
            c.execute(
                "UPDATE exam_goals SET status='error', error=? WHERE id=?",
                (str(exc)[:400], goal_id),
            )


# ── Graph construction ────────────────────────────────────────────────────

def _assign_tiers(names: list[str], prereqs: dict[str, list[str]]) -> dict[str, int]:
    """Longest-path depth from a root, so a concept always sits below its prerequisites.

    Cycles the model may have emitted are broken by the depth cap rather than
    rejected: a slightly flattened graph is far better than no graph at all.
    """
    tiers: dict[str, int] = {}

    def depth(name: str, seen: frozenset[str]) -> int:
        if name in tiers:
            return tiers[name]
        if name in seen or len(seen) > MAX_TIER_DEPTH:
            return 0
        parents = [p for p in prereqs.get(name, []) if p in prereqs]
        value = 0 if not parents else 1 + max(
            depth(p, seen | {name}) for p in parents
        )
        value = min(value, MAX_TIER_DEPTH)
        tiers[name] = value
        return value

    for name in names:
        depth(name, frozenset())
    return tiers


def _parse_graph(payload: dict) -> tuple[list[dict], dict[str, list[str]]]:
    raw = payload.get("concepts") or []
    seen: dict[str, dict] = {}
    for entry in raw:
        if not isinstance(entry, dict):
            continue
        name = str(entry.get("name") or "").strip()[:120]
        if not name or name.lower() in {key.lower() for key in seen}:
            continue
        seen[name] = {
            "name": name,
            "blurb": str(entry.get("blurb") or "").strip()[:300],
            "prerequisites": [
                str(p).strip()[:120]
                for p in (entry.get("prerequisites") or [])
                if str(p).strip()
            ],
        }
        if len(seen) >= MAX_CONCEPTS:
            break
    if not seen:
        raise ValueError("the model returned no usable concepts")

    # Keep only prerequisite names that resolve, case-insensitively.
    canonical = {name.lower(): name for name in seen}
    prereqs = {
        name: [
            canonical[p.lower()]
            for p in entry["prerequisites"]
            if p.lower() in canonical and canonical[p.lower()] != name
        ]
        for name, entry in seen.items()
    }
    return list(seen.values()), prereqs


def build(goal_id: int, name: str) -> None:
    """Generate the graph, persist it, and bind concepts to the student's chunks."""
    payload = llm.chat_json(
        GRAPH_SYSTEM,
        f"Exam or subject: {name}\n\nMap it into a prerequisite concept graph.",
        max_tokens=4000,
    )
    entries, prereqs = _parse_graph(payload)
    tiers = _assign_tiers([e["name"] for e in entries], prereqs)

    ordered = sorted(entries, key=lambda e: (tiers.get(e["name"], 0), e["name"]))
    now = time.time()
    position_in_tier: dict[int, int] = {}
    ids: dict[str, int] = {}

    with db.conn() as c:
        for entry in ordered:
            tier = tiers.get(entry["name"], 0)
            position = position_in_tier.get(tier, 0)
            position_in_tier[tier] = position + 1
            ids[entry["name"]] = c.execute(
                "INSERT INTO concepts (goal_id, name, blurb, tier, position, created_at) "
                "VALUES (?,?,?,?,?,?)",
                (goal_id, entry["name"], entry["blurb"], tier, position, now),
            ).lastrowid
        c.executemany(
            "INSERT OR IGNORE INTO concept_edges (prereq_id, concept_id) VALUES (?,?)",
            [
                (ids[parent], ids[child])
                for child, parents in prereqs.items()
                for parent in parents
                if child in ids and parent in ids
            ],
        )

    mastery.ensure_rows(list(ids.values()))
    bind_sources(goal_id)

    with db.conn() as c:
        c.execute("UPDATE exam_goals SET status='ready', error=NULL WHERE id=?", (goal_id,))


def bind_sources(goal_id: int) -> int:
    """Attach the closest note chunks to each concept. Absence of notes is not an error."""
    with db.conn() as c:
        rows = c.execute(
            "SELECT id, name, blurb FROM concepts WHERE goal_id=?", (goal_id,)
        ).fetchall()
    bound = 0
    for row in rows:
        query = f"{row['name']}. {row['blurb']}".strip()
        try:
            hits = vectorstore.search(query, k=SOURCES_PER_CONCEPT)
        except Exception:  # empty or unbuilt index — the map still works without it
            logger.warning("vector search unavailable while binding concepts")
            return bound
        pairs = [
            (row["id"], int(hit["chunk_id"]), float(hit.get("_distance") or 0.0))
            for hit in hits
            if hit.get("chunk_id") is not None
        ]
        if not pairs:
            continue
        with db.conn() as c:
            c.executemany(
                "INSERT OR REPLACE INTO concept_sources (concept_id, chunk_id, score) "
                "VALUES (?,?,?)",
                pairs,
            )
        bound += len(pairs)
    return bound


# ── Reads ─────────────────────────────────────────────────────────────────

def list_concepts(goal_id: int) -> list[dict]:
    with db.conn() as c:
        rows = c.execute(
            "SELECT * FROM concepts WHERE goal_id=? ORDER BY tier, position", (goal_id,)
        ).fetchall()
    return [dict(row) for row in rows]


def get_concept(concept_id: int) -> dict | None:
    with db.conn() as c:
        row = c.execute("SELECT * FROM concepts WHERE id=?", (concept_id,)).fetchone()
    return dict(row) if row else None


def list_edges(goal_id: int) -> list[dict]:
    with db.conn() as c:
        rows = c.execute(
            "SELECT e.prereq_id, e.concept_id FROM concept_edges e "
            "JOIN concepts c ON c.id = e.concept_id WHERE c.goal_id=?",
            (goal_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def prerequisites_of(concept_id: int) -> list[int]:
    with db.conn() as c:
        rows = c.execute(
            "SELECT prereq_id FROM concept_edges WHERE concept_id=?", (concept_id,)
        ).fetchall()
    return [row["prereq_id"] for row in rows]


def downstream_counts(goal_id: int) -> dict[int, int]:
    """How many concepts each concept unlocks, transitively — used to rank urgency."""
    edges = list_edges(goal_id)
    children: dict[int, list[int]] = {}
    for edge in edges:
        children.setdefault(edge["prereq_id"], []).append(edge["concept_id"])

    counts: dict[int, int] = {}

    def walk(node: int, seen: set[int]) -> set[int]:
        reached: set[int] = set()
        for child in children.get(node, []):
            if child in seen:
                continue
            reached.add(child)
            reached |= walk(child, seen | {child})
        return reached

    for concept in list_concepts(goal_id):
        counts[concept["id"]] = len(walk(concept["id"], {concept["id"]}))
    return counts


def source_chunks(concept_id: int, limit: int = SOURCES_PER_CONCEPT) -> list[dict]:
    """The note excerpts bound to a concept, for the `read` step and scoped RAG."""
    with db.conn() as c:
        rows = c.execute(
            "SELECT ch.id AS chunk_id, ch.text, ch.source_label, ch.item_id, "
            "       ch.ts_start, ch.page, cs.score "
            "FROM concept_sources cs JOIN chunks ch ON ch.id = cs.chunk_id "
            "WHERE cs.concept_id=? ORDER BY cs.score ASC LIMIT ?",
            (concept_id, limit),
        ).fetchall()
    return [dict(row) for row in rows]


def graph(goal_id: int) -> dict:
    """Nodes, edges and mastery in one payload — everything the concept map needs."""
    states = mastery.all_for_goal(goal_id)
    counts = downstream_counts(goal_id)
    nodes = []
    for concept in list_concepts(goal_id):
        state = states.get(concept["id"])
        nodes.append({
            "id": concept["id"],
            "name": concept["name"],
            "blurb": concept["blurb"],
            "tier": concept["tier"],
            "position": concept["position"],
            "p_known": state.p_known if state else mastery.P_INIT,
            "attempts": state.attempts if state else 0,
            "confidence": state.confidence if state else 0.0,
            "in_srs": state.in_srs if state else False,
            "downstream": counts.get(concept["id"], 0),
        })
    return {"nodes": nodes, "edges": list_edges(goal_id)}
