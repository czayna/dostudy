import os
import json
import uuid
import shutil
from pathlib import Path
from typing import List, Optional
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

from .db import get_db, UPLOAD_DIR, BASE_DIR
from .doc_parser import extract_text_from_file
from . import ai_service

app = FastAPI(title="DOSTUDY API (Python / FastAPI)", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

FRONTEND_DIR = BASE_DIR / "frontend"

# --- Models ---
class SubjectCreate(BaseModel):
    name: str
    teacher: Optional[str] = ""
    units: Optional[int] = 3
    color: Optional[str] = "#E0839C"

class SubjectUpdate(BaseModel):
    name: str
    teacher: Optional[str] = ""
    units: Optional[int] = 3
    color: Optional[str] = "#E0839C"

class ComponentItem(BaseModel):
    name: str
    weight: float
    score: Optional[float] = None

class ComponentsUpdate(BaseModel):
    components: List[ComponentItem]

class FlashcardCreate(BaseModel):
    subject_id: int
    front: str
    back: str
    hint: Optional[str] = ""

class RateCard(BaseModel):
    rating: int

class TutorChat(BaseModel):
    fileId: Optional[int] = None
    mode: Optional[str] = "chat"
    spoken: Optional[bool] = False
    messages: List[dict]

class ReexplainPayload(BaseModel):
    topicIndex: int
    style: Optional[str] = "simpler"

class TestAttemptPayload(BaseModel):
    score: int
    total: int
    weakTopics: Optional[List[str]] = []

class TutorSummaryPayload(BaseModel):
    messages: List[dict]
    subjectId: Optional[int] = None
    fileId: Optional[int] = None
    saveCards: Optional[bool] = False

class EventCreate(BaseModel):
    subject_id: Optional[int] = None
    title: str
    date: str
    kind: Optional[str] = "exam"

class BusyCreate(BaseModel):
    dow: int
    start: str
    end: str
    kind: Optional[str] = "work"
    label: Optional[str] = ""

class SettingsUpdate(BaseModel):
    goal: float

# --- Routes ---

@app.get("/api/health")
def health_check():
    api_key_present = bool(os.environ.get("GEMINI_API_KEY", ""))
    return {
        "ok": True,
        "runtime": "python-fastapi",
        "ai": {
            "configured": api_key_present,
            "model": "gemini-2.5-flash"
        },
        "google": {
            "configured": False,
            "connected": False,
            "scopes": ["classroom.courses.readonly", "classroom.coursework.me.readonly"]
        }
    }

@app.get("/api/settings")
def get_settings():
    conn = get_db()
    row = conn.execute("SELECT value FROM settings WHERE key = 'goal'").fetchone()
    conn.close()
    goal = float(json.loads(row["value"])) if row else 1.35
    return {"goal": goal}

@app.put("/api/settings")
def update_settings(payload: SettingsUpdate):
    conn = get_db()
    conn.execute(
        "INSERT INTO settings(key, value) VALUES('goal', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (json.dumps(payload.goal),)
    )
    conn.commit()
    conn.close()
    return {"goal": payload.goal}

# Subjects
@app.get("/api/subjects")
def list_subjects():
    conn = get_db()
    subjects = conn.execute("SELECT * FROM subjects ORDER BY id ASC").fetchall()
    result = []
    for s in subjects:
        sid = s["id"]
        comps = conn.execute("SELECT id, name, weight, score FROM components WHERE subject_id = ? ORDER BY position ASC, id ASC", (sid,)).fetchall()
        f_count = conn.execute("SELECT COUNT(*) c FROM files WHERE subject_id = ?", (sid,)).fetchone()["c"]
        r_count = conn.execute("SELECT COUNT(*) c FROM reviewers WHERE subject_id = ?", (sid,)).fetchone()["c"]
        c_count = conn.execute("SELECT COUNT(*) c FROM flashcards WHERE subject_id = ?", (sid,)).fetchone()["c"]
        t_count = conn.execute("SELECT COUNT(*) c FROM tests WHERE subject_id = ?", (sid,)).fetchone()["c"]
        result.append({
            "id": sid,
            "name": s["name"],
            "teacher": s["teacher"],
            "units": s["units"],
            "color": s["color"],
            "created_at": s["created_at"],
            "components": [dict(c) for c in comps],
            "counts": {
                "files": f_count,
                "reviewers": r_count,
                "flashcards": c_count,
                "tests": t_count
            }
        })
    conn.close()
    return result

@app.post("/api/subjects")
def create_subject(sub: SubjectCreate):
    conn = get_db()
    cur = conn.execute(
        "INSERT INTO subjects(name, teacher, units, color) VALUES(?,?,?,?)",
        (sub.name, sub.teacher, sub.units, sub.color)
    )
    sid = cur.lastrowid
    defaults = [("Quizzes", 20), ("Recitation / Participation", 10), ("Projects", 20), ("Midterm Exam", 20), ("Final Exam", 30)]
    for idx, (name, weight) in enumerate(defaults):
        conn.execute("INSERT INTO components(subject_id, name, weight, position) VALUES(?,?,?,?)", (sid, name, weight, idx))
    conn.commit()
    conn.close()
    return {"id": sid, "name": sub.name}

@app.put("/api/subjects/{subject_id}")
def edit_subject(subject_id: int, sub: SubjectUpdate):
    conn = get_db()
    conn.execute(
        "UPDATE subjects SET name = ?, teacher = ?, units = ?, color = ? WHERE id = ?",
        (sub.name, sub.teacher, sub.units, sub.color, subject_id)
    )
    conn.commit()
    conn.close()
    return {"ok": True}

@app.delete("/api/subjects/{subject_id}")
def delete_subject(subject_id: int):
    conn = get_db()
    conn.execute("DELETE FROM subjects WHERE id = ?", (subject_id,))
    conn.commit()
    conn.close()
    return {"ok": True}

@app.put("/api/subjects/{subject_id}/components")
def update_components(subject_id: int, payload: ComponentsUpdate):
    conn = get_db()
    conn.execute("DELETE FROM components WHERE subject_id = ?", (subject_id,))
    for idx, c in enumerate(payload.components):
        conn.execute(
            "INSERT INTO components(subject_id, name, weight, score, position) VALUES(?,?,?,?,?)",
            (subject_id, c.name, c.weight, c.score, idx)
        )
    conn.commit()
    comps = conn.execute("SELECT id, name, weight, score FROM components WHERE subject_id = ? ORDER BY position ASC", (subject_id,)).fetchall()
    conn.close()
    return {"components": [dict(c) for c in comps]}

# Files
@app.get("/api/files")
def list_files():
    conn = get_db()
    files = conn.execute("""
        SELECT f.id, f.subject_id, f.name, f.mime, f.size, f.created_at,
               (SELECT COUNT(*) FROM reviewers r WHERE r.file_id = f.id) reviewers,
               (SELECT COUNT(*) FROM flashcards c WHERE c.file_id = f.id) flashcards,
               (SELECT COUNT(*) FROM tests t WHERE t.file_id = f.id) tests
        FROM files f ORDER BY f.id DESC
    """).fetchall()
    conn.close()
    return [dict(f) for f in files]

@app.post("/api/subjects/{subject_id}/files")
async def upload_files(subject_id: int, files: List[UploadFile] = File(...)):
    conn = get_db()
    saved = []
    rejected = []
    for f in files:
        raw_name = f.filename or "uploaded_file"
        stored_name = f"{uuid.uuid4().hex}_{raw_name}"
        save_path = UPLOAD_DIR / stored_name
        try:
            with open(save_path, "wb") as buffer:
                shutil.copyfileobj(f.file, buffer)
            file_size = save_path.stat().st_size
            text_extracted = extract_text_from_file(save_path)
            cur = conn.execute(
                "INSERT INTO files(subject_id, name, stored_name, mime, size, text_cache) VALUES(?,?,?,?,?,?)",
                (subject_id, raw_name, stored_name, f.content_type or "application/octet-stream", file_size, text_extracted)
            )
            saved.append({"id": cur.lastrowid, "name": raw_name})
        except Exception as e:
            rejected.append({"name": raw_name, "reason": str(e)})
    conn.commit()
    conn.close()
    return {"saved": saved, "rejected": rejected}

@app.delete("/api/files/{file_id}")
def delete_file(file_id: int):
    conn = get_db()
    row = conn.execute("SELECT stored_name FROM files WHERE id = ?", (file_id,)).fetchone()
    if row:
        target = UPLOAD_DIR / row["stored_name"]
        if target.exists():
            target.unlink()
    conn.execute("DELETE FROM files WHERE id = ?", (file_id,))
    conn.commit()
    conn.close()
    return {"ok": True}

# Reviewers
@app.get("/api/reviewers")
def list_reviewers():
    conn = get_db()
    rows = conn.execute("SELECT id, subject_id, file_id, title, content, created_at FROM reviewers ORDER BY id DESC").fetchall()
    conn.close()
    out = []
    for r in rows:
        c = json.loads(r["content"])
        out.append({
            "id": r["id"],
            "subject_id": r["subject_id"],
            "file_id": r["file_id"],
            "title": r["title"],
            "created_at": r["created_at"],
            "topics": len(c.get("topics", []))
        })
    return out

@app.get("/api/reviewers/{reviewer_id}")
def get_reviewer(reviewer_id: int):
    conn = get_db()
    row = conn.execute("SELECT * FROM reviewers WHERE id = ?", (reviewer_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Reviewer not found")
    c = json.loads(row["content"])
    return {
        "id": row["id"],
        "subject_id": row["subject_id"],
        "file_id": row["file_id"],
        "title": row["title"],
        "created_at": row["created_at"],
        **c
    }

@app.post("/api/files/{file_id}/reviewer")
def build_reviewer(file_id: int):
    conn = get_db()
    row = conn.execute("SELECT * FROM files WHERE id = ?", (file_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="File not found")
    text_content = row["text_cache"] or ""
    res = ai_service.generate_reviewer(text_content, row["name"])
    conn.execute("DELETE FROM reviewers WHERE file_id = ?", (file_id,))
    cur = conn.execute(
        "INSERT INTO reviewers(subject_id, file_id, title, content) VALUES(?,?,?,?)",
        (row["subject_id"], file_id, res.get("title", row["name"]), json.dumps(res))
    )
    conn.commit()
    rev_id = cur.lastrowid
    conn.close()
    return {"id": rev_id, **res}

@app.post("/api/files/{file_id}/recitation")
def build_recitation(file_id: int):
    conn = get_db()
    row = conn.execute("SELECT * FROM files WHERE id = ?", (file_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="File not found")
    res = ai_service.generate_recitation_cheat_card(row["text_cache"] or "", row["name"])
    return res

@app.post("/api/reviewers/{reviewer_id}/reexplain")
def reexplain_reviewer(reviewer_id: int, payload: ReexplainPayload):
    conn = get_db()
    row = conn.execute("SELECT * FROM reviewers WHERE id = ?", (reviewer_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Reviewer not found")
    content = json.loads(row["content"])
    topics = content.get("topics", [])
    if payload.topicIndex < 0 or payload.topicIndex >= len(topics):
        raise HTTPException(status_code=400, detail="Invalid topic index")
    topic = topics[payload.topicIndex]
    explanation = ai_service.reexplain_topic(
        topic_title=topic.get("title", ""),
        current_content=topic.get("plain_meaning", ""),
        style=payload.style or "simpler",
        context=row["title"]
    )
    return {"explanation": explanation}


# Flashcards
@app.get("/api/flashcards")
def list_flashcards(subjectId: Optional[int] = None, due: Optional[int] = 0):
    conn = get_db()
    query = "SELECT id, subject_id, file_id, front, back, hint, reps, last_rating, due_at FROM flashcards"
    params = []
    if subjectId:
        query += " WHERE subject_id = ?"
        params.append(subjectId)
    query += " ORDER BY due_at ASC LIMIT 300"
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.get("/api/flashcards/stats")
def flashcard_stats():
    conn = get_db()
    rows = conn.execute("""
        SELECT subject_id, COUNT(*) total,
               SUM(CASE WHEN reps >= 3 THEN 1 ELSE 0 END) mastered,
               SUM(CASE WHEN due_at <= datetime('now') THEN 1 ELSE 0 END) due
        FROM flashcards GROUP BY subject_id
    """).fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.post("/api/files/{file_id}/flashcards")
def build_flashcards(file_id: int):
    conn = get_db()
    row = conn.execute("SELECT * FROM files WHERE id = ?", (file_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="File not found")
    text_content = row["text_cache"] or ""
    cards = ai_service.generate_flashcards(text_content, row["name"])
    added = 0
    for c in cards:
        conn.execute(
            "INSERT INTO flashcards(subject_id, file_id, front, back, hint) VALUES(?,?,?,?,?)",
            (row["subject_id"], file_id, c.get("front", ""), c.get("back", ""), c.get("hint", ""))
        )
        added += 1
    conn.commit()
    conn.close()
    return {"added": added}

@app.post("/api/flashcards")
def create_flashcard(card: FlashcardCreate):
    conn = get_db()
    cur = conn.execute(
        "INSERT INTO flashcards(subject_id, front, back, hint) VALUES(?,?,?,?)",
        (card.subject_id, card.front, card.back, card.hint)
    )
    conn.commit()
    cid = cur.lastrowid
    conn.close()
    return {"id": cid}

@app.post("/api/flashcards/{card_id}/rate")
def rate_card(card_id: int, payload: RateCard):
    conn = get_db()
    intervals = {1: "+2 minutes", 2: "+8 hours", 3: "+1 day", 4: "+3 days", 5: "+7 days"}
    modifier = intervals.get(payload.rating, "+1 day")
    conn.execute(
        f"UPDATE flashcards SET last_rating = ?, reps = reps + 1, due_at = datetime('now', '{modifier}') WHERE id = ?",
        (payload.rating, card_id)
    )
    conn.commit()
    conn.close()
    return {"ok": True}

# Tests
@app.get("/api/tests")
def list_tests():
    conn = get_db()
    rows = conn.execute("""
        SELECT t.id, t.subject_id, t.file_id, t.title, t.questions, t.created_at,
               (SELECT COUNT(*) FROM test_attempts a WHERE a.test_id = t.id) attempts,
               (SELECT MAX(score * 100.0 / total) FROM test_attempts a WHERE a.test_id = t.id) best
        FROM tests t ORDER BY t.id DESC
    """).fetchall()
    conn.close()
    out = []
    for r in rows:
        qs = json.loads(r["questions"])
        out.append({
            "id": r["id"],
            "subject_id": r["subject_id"],
            "file_id": r["file_id"],
            "title": r["title"],
            "questions": len(qs),
            "created_at": r["created_at"],
            "attempts": r["attempts"],
            "best": r["best"]
        })
    return out

@app.get("/api/tests/{test_id}")
def get_test(test_id: int):
    conn = get_db()
    row = conn.execute("SELECT * FROM tests WHERE id = ?", (test_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Test not found")
    return {
        "id": row["id"],
        "subject_id": row["subject_id"],
        "file_id": row["file_id"],
        "title": row["title"],
        "questions": json.loads(row["questions"])
    }

@app.post("/api/files/{file_id}/tests")
def build_test(file_id: int, count: int = 15):
    conn = get_db()
    row = conn.execute("SELECT * FROM files WHERE id = ?", (file_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="File not found")
    res = ai_service.generate_practice_test(row["text_cache"] or "", row["name"], count=count)
    conn.execute("DELETE FROM tests WHERE file_id = ?", (file_id,))
    cur = conn.execute(
        "INSERT INTO tests(subject_id, file_id, title, questions) VALUES(?,?,?,?)",
        (row["subject_id"], file_id, res.get("title", row["name"]), json.dumps(res.get("questions", [])))
    )
    conn.commit()
    tid = cur.lastrowid
    conn.close()
    return {"id": tid, "title": res.get("title"), "questions": len(res.get("questions", []))}

@app.post("/api/tests/{test_id}/attempts")
def record_test_attempt(test_id: int, payload: TestAttemptPayload):
    conn = get_db()
    row = conn.execute("SELECT subject_id FROM tests WHERE id = ?", (test_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Test not found")
    conn.execute(
        "INSERT INTO test_attempts(test_id, subject_id, score, total, weak_topics) VALUES(?,?,?,?,?)",
        (test_id, row["subject_id"], payload.score, payload.total, json.dumps(payload.weakTopics or []))
    )
    conn.commit()
    conn.close()
    return {"ok": True}

# Tutor & Voice
@app.post("/api/tutor/chat")
def chat_tutor(payload: TutorChat):
    context = ""
    if payload.fileId:
        conn = get_db()
        row = conn.execute("SELECT text_cache FROM files WHERE id = ?", (payload.fileId,)).fetchone()
        conn.close()
        if row and row["text_cache"]:
            context = row["text_cache"]
    reply = ai_service.tutor_turn(payload.messages, mode=payload.mode or "chat", context=context, spoken=bool(payload.spoken))
    return {"reply": reply}

@app.post("/api/tutor/summary")
def tutor_summary(payload: TutorSummaryPayload):
    context = ""
    conn = get_db()
    if payload.fileId:
        row = conn.execute("SELECT text_cache FROM files WHERE id = ?", (payload.fileId,)).fetchone()
        if row and row["text_cache"]:
            context = row["text_cache"]
    res = ai_service.summarize_session(payload.messages, context=context)
    cards_added = 0
    if payload.saveCards and payload.subjectId and res.get("new_cards"):
        for c in res["new_cards"]:
            conn.execute(
                "INSERT INTO flashcards(subject_id, file_id, front, back, hint) VALUES(?,?,?,?,?)",
                (payload.subjectId, payload.fileId, c.get("front", ""), c.get("back", ""), c.get("hint", ""))
            )
            cards_added += 1
        conn.commit()
    conn.close()
    return {
        "summary": res.get("summary", ""),
        "strengths": res.get("strengths", []),
        "gaps": res.get("gaps", []),
        "cardsAdded": cards_added
    }

# Schedule
@app.get("/api/schedule/events")
def list_events():
    conn = get_db()
    rows = conn.execute("SELECT * FROM events ORDER BY date ASC").fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.post("/api/schedule/events")
def add_event(payload: EventCreate):
    conn = get_db()
    cur = conn.execute(
        "INSERT INTO events(subject_id, title, date, kind) VALUES(?,?,?,?)",
        (payload.subject_id, payload.title, payload.date, payload.kind)
    )
    conn.commit()
    eid = cur.lastrowid
    conn.close()
    return {"id": eid, "title": payload.title}

@app.delete("/api/schedule/events/{event_id}")
def delete_event(event_id: int):
    conn = get_db()
    conn.execute("DELETE FROM events WHERE id = ?", (event_id,))
    conn.commit()
    conn.close()
    return {"ok": True}

@app.get("/api/schedule/blocks")
def list_blocks(from_date: Optional[str] = Query(None, alias="from"), to_date: Optional[str] = Query(None, alias="to")):
    conn = get_db()
    rows = conn.execute("SELECT * FROM study_blocks ORDER BY date ASC, start ASC").fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.put("/api/schedule/blocks/{block_id}/done")
def toggle_block_done(block_id: int):
    conn = get_db()
    row = conn.execute("SELECT status FROM study_blocks WHERE id = ?", (block_id,)).fetchone()
    if row:
        new_status = "completed" if row["status"] != "completed" else "planned"
        conn.execute("UPDATE study_blocks SET status = ? WHERE id = ?", (new_status, block_id))
        conn.commit()
    conn.close()
    return {"ok": True}

@app.get("/api/schedule/busy")
def list_busy():
    conn = get_db()
    rows = conn.execute("SELECT * FROM busy_slots ORDER BY dow ASC, start ASC").fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.post("/api/schedule/busy")
def add_busy(payload: BusyCreate):
    conn = get_db()
    cur = conn.execute(
        "INSERT INTO busy_slots(dow, start, end, kind, label) VALUES(?,?,?,?,?)",
        (payload.dow, payload.start, payload.end, payload.kind, payload.label)
    )
    conn.commit()
    bid = cur.lastrowid
    conn.close()
    return {"id": bid}

@app.delete("/api/schedule/busy/{busy_id}")
def delete_busy(busy_id: int):
    conn = get_db()
    conn.execute("DELETE FROM busy_slots WHERE id = ?", (busy_id,))
    conn.commit()
    conn.close()
    return {"ok": True}

@app.post("/api/schedule/generate")
def generate_schedule():
    conn = get_db()
    events = conn.execute("SELECT * FROM events WHERE date >= date('now') ORDER BY date ASC").fetchall()
    subjects = conn.execute("SELECT * FROM subjects").fetchall()
    
    # Generate balanced micro-study blocks leading up to upcoming exams
    import datetime
    today = datetime.date.today()
    
    # Clean future uncompleted study blocks
    conn.execute("DELETE FROM study_blocks WHERE date >= date('now') AND status = 'planned'")
    
    count = 0
    for ev in events:
        ev_date = datetime.datetime.strptime(ev["date"], "%Y-%m-%d").date()
        days_until = (ev_date - today).days
        lead_days = min(14, max(1, days_until))
        
        for d in range(1, lead_days + 1):
            block_date = today + datetime.timedelta(days=d)
            if block_date >= ev_date:
                break
            # schedule 20-25 min session
            conn.execute(
                "INSERT INTO study_blocks(subject_id, date, start, minutes, task, note) VALUES(?,?,?,?,?,?)",
                (ev["subject_id"] or (subjects[0]["id"] if subjects else None),
                 block_date.isoformat(), "19:00", 25, f"Prep for {ev['title']}", "Spaced review & practice questions")
            )
            count += 1
            
    conn.commit()
    conn.close()
    return {"generated": count}

@app.get("/api/schedule/prefs")
def get_prefs():
    return {
        "windowStart": "06:00",
        "windowEnd": "22:00",
        "blockMinutes": 30,
        "maxPerDay": 3,
        "leadDays": 14,
        "gapMinutes": 15
    }

# Mount static frontend
if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
