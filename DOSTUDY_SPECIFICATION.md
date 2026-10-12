# DOSTUDY — Product Architecture & Comprehensive Engineering Specification

## 1. Executive Summary & Core Philosophy

### The Real Student Context
You are **NOT** stupid—college material is written in dense, dry, intimidating academic jargon that professors rarely explain simply. When juggling work shifts, mental exhaustion, and multiple classes, complex textbooks cause mental block and self-doubt. 

**DOSTUDY** is designed around a single guiding principle:
> **"Explain it like I'm a beginner, never judge me for asking 10 times, break everything down until it clicks, and keep my school data 100% private and untouched."**

### Core Pillars
1. **The "Zero-Confusion / ELI5" Reviewer System**: Translates hard academic text into everyday relatable analogies, visual logic flows, step-by-step breakdowns, and "Why This Matters" summaries.
2. **Infinite Patient Q&A Tutor**: An AI buddy you can ask the same question 10 different ways without any frustration until you truly understand it.
3. **Strict Read-Only Privacy Safeguard**: When you connect your school email / Google Classroom, DOSTUDY is **100% READ-ONLY**. It *never* touches, modifies, posts, deletes, submits, or emails anything on your behalf.
4. **Auto-Pilot Study Organizer for Working Students**: Eliminates cramming by turning overwhelming syllabi into gentle, bite-sized 20–30 minute study blocks scheduled around work shifts.
5. **GWA Protector**: Subject folders with a realistic target grade simulator.
6. **Aesthetic Zen**: Clean minimalist pink Japanese/Korean stationery aesthetic that lowers anxiety.

---

## 2. Security, Privacy & School Email Policy (Read-Only Guarantee)

> [!IMPORTANT]
> **Zero-Touch / Read-Only Policy for School Email & Google Classroom**
> - **Read-Only Scopes (`*.readonly`)**: DOSTUDY only requests permission to *view/fetch* course announcements and attachments.
> - **No Submissions**: DOSTUDY will **never** submit assignments, turn in work, or edit coursework.
> - **No Email Sending**: DOSTUDY will **never** send emails, alter drafts, or delete messages in your school inbox.
> - **Personal Local Storage**: All your generated notes, flashcards, and study progress stay on your private local device / personal account. Your professors and university cannot see DOSTUDY.

---

## 3. Visual Identity: "Clean Minimalist Pink" Aesthetic

- **Atmosphere**: Soft, gentle, calming pastel pink palette with cozy warmth to make studying feel like relaxing at a cafe.
- **Palette**:
  - Canvas: Creamy Blush / Porcelain Pink (`#FFF0F3`, `#FDF8F8`)
  - Accent / Buttons: Soft Dusty Rose (`#E0839C`, `#D16D86`)
  - Cards & Panels: Frosted translucent glass (`rgba(255, 255, 255, 0.90)`) with delicate border lines (`#F7D6DC`)
  - Badges & Highlights: Strawberry Milk & Peach (`#F8B4C0`, `#FDE2E4`)
  - Typography: Deep Charcoal Plum (`#2D2327`) for soft, strain-free reading.

---

## 4. In-Depth Study Engine: The "Slow-Learner Friendly" Reviewer System

### Module A: The "Explain Like I'm Five" (ELI5) "Perfect Reviewer"
A reviewer that never skips any test question, but explains concepts so simply and clearly that anyone can grasp them immediately.

```
┌────────────────────────────────────────────────────────────────────────┐
│                   STRUCTURE OF EVERY REVIEWER TOPIC                    │
├────────────────────────────────────────────────────────────────────────┤
│ 1. 💡 THE "PLAIN ENGLISH" ANALOGY (Relatable everyday real-life story) │
│ 2. 🎯 WHAT IT ACTUALLY MEANS (No jargon, pure crystal-clear concept)   │
│ 3. 🔍 STEP-BY-STEP BREAKDOWN (Numbered logical flow: Step 1 → 2 → 3)  │
│ 4. ⚠️ "EXAM TRAP" (The tricky trick questions professors love to ask)   │
│ 5. 🧠 MEMORY SHORTCUT (Catchy mnemonic or visual mental image)         │
│ 6. ❓ 10-SECOND CHECK QUESTION (Instant self-check before moving on)   │
└────────────────────────────────────────────────────────────────────────┘
```

#### Detailed Breakdown of Reviewer Elements:
1. **Real-Life Analogies**: If learning *accounting debits/credits*, compare it to a bank account or water flowing between buckets. If learning *cellular mitosis*, compare it to baking and slicing bread.
2. **"Why Do I Care?" Context**: Tells your brain why this concept exists before overwhelming you with formulas.
3. **Glossary of Simple Translations**: A dedicated side-box translating professor jargon into normal human words:
   - e.g., *"Juxtaposition"* $\rightarrow$ *"Putting two different things side-by-side to compare."*
4. **"Exam Traps" (Red Alert Callouts)**: Explicitly calls out common student confusions and pitfalls so you don't lose easy points on trick questions.
5. **Interactive Re-Explain Button ("I Still Don't Get It")**: Click a single button under any concept to see it explained with a different analogy, simpler language, or a step-by-step diagram.

---

### Module B: The Infinite-Patience Voice & Text Tutor ("Ask 10 Times" Mode)
- **Zero Judgment Guarantee**: You can ask *"Can you explain this again even simpler?"* 10 times in a row, and the AI will happily find a new creative way to explain it without rushing you.
- **Hands-Free Voice Call (Knowt-Style)**:
  - Put your phone on speaker while lying down or commuting from work.
  - Talk to your AI study partner: *"Hey, I'm confused about Chapter 3. Can you quiz me gently?"*
  - The AI speaks softly, asks one small question at a time, praises your effort, and guides you to the right answer.
- **Micro-Drilling**: Instead of testing huge paragraphs, drills only 1 small concept at a time until it's locked into memory.

---

### Module C: Brainscape-Style Spaced Repetition Flashcards
- **Bite-Sized Cards**: Front has 1 clear question; Back has 1 clear answer with the key terms in bold.
- **Confidence Rating (1 to 5)**:
  - If you click **1 (I have no clue)**: The card reappears in 2 minutes.
  - If you click **3 (I kinda remember but had to think)**: The card reappears tomorrow.
  - If you click **5 (I know this by heart)**: The card rests for a week.
- You never waste time reviewing things you already know; your limited study time goes straight to the hard cards.

---

### Module D: High-Yield Practice Mock Tests
- **Gradual Difficulty**:
  - Level 1: Warm-up identification & matching (builds confidence).
  - Level 2: Multiple choice with realistic questions.
  - Level 3: Tricky scenario questions.
- **Explanations for Every Option**: For each question, it tells you:
  - Why Option A is **Correct**.
  - Why Option B is a distractor.
  - Why Option C is only half-true.

---

## 5. Working Student Anti-Cramming & School Organization

### Module E: School Email & Google Classroom Automation (Read-Only)
- **Automatic Folder Sync**: Reads your Google Classroom courses and builds matching subject folders:
  - e.g., `[ACC101] Financial Accounting`, `[ENG201] Technical Writing`.
- **Auto-Fetch Coursework**: Whenever a teacher posts a slide PDF or syllabus, DOSTUDY detects it and puts it into your subject folder ready to turn into a reviewer with 1 click.
- **Read-Only Safety**: Does not write to Google Classroom, never submits drafts, and never sends emails.

### Module F: Anti-Cramming Schedule Engine (Synced with Google Calendar)
- **Work-Study Balance**:
  - You input your work shifts (e.g., *Mon/Wed/Fri 4 PM - 10 PM*).
  - DOSTUDY blocks out work and rest hours so it **never** schedules study sessions when you are physically exhausted.
- **Micro-Sessions (20–30 Minutes)**:
  - No 5-hour marathon cramming sessions.
  - Automatically schedules 20 to 30-minute micro-study blocks spaced across 10–14 days.
- **"I'm Too Tired Today" Shift Recovery**:
  - If you had a grueling shift at work and click *"Skip today"*, the scheduler automatically adjusts future dates forward with zero guilt.

### Module G: The 1.35 GWA Goal Protector & Recitation / Participation Wingman
- **Target Goal**: Maintaining a **1.35 GWA** (High Dean's List / Magna Cum Laude track).
- **The "Active Class Participation & Recitation" Wingman**:
  - In Philippine/college grading systems, **Class Standing & Recitation** often counts for 10% to 20% of the grade—the exact cushion needed to hit 1.35.
  - **"Smart Recitation Cheat Card"**: Before every lecture, DOSTUDY generates 3 high-yield questions or discussion points you can volunteer to say in class to get effortless perfect recitation points.
  - **Cold-Call Rehearsal in Voice Call Mode**: The AI acts like your professor and asks: *"What is your insight on this topic?"* so you practice speaking up without nervous stage fright.
- **The "Aim for Perfect" Exam & Quiz Prep**:
  - Calibrated specifically for a 1.35 GWA target: highlights high-yield edge cases and trick question traps so you don't lose silly points.
- **GWA Simulator & Grade Cushion Calculator**:
  - Live target tracker: calculates the exact grade cushion needed across Quizzes, Midterms, Recitations, and Finals to lock in your **1.35 GWA**.
  - Shows instant alerts if any component dips below the 1.35 threshold, with an action plan to recover points.

---

## 6. Implementation Architecture

```
                  ┌────────────────────────────────────────┐
                  │          STUDENT PRIVATE VAULT         │
                  └────────────────────────────────────────┘
                                      ▲
                                      │ (Read-Only Fetch)
               ┌──────────────────────┴──────────────────────┐
               │                                             │
      Google Classroom API                          School Gmail API
     (OAuth Scope: *.readonly)                    (OAuth Scope: *.readonly)
     - Fetch course announcements                 - Read schedule updates
     - Download lecture PDFs                      - NO SEND, NO WRITE
               │                                             │
               └──────────────────────┬──────────────────────┘
                                      ▼
                        ┌───────────────────────────┐
                        │   DOSTUDY AI PROCESSING   │
                        ├───────────────────────────┤
                        │ • ELI5 Reviewer Generator │
                        │ • Spaced Repetition Cards │
                        │ • Voice Call Study Tutor  │
                        │ • 20-min Anti-Cram Sched  │
                        └───────────────────────────┘
```

---

## 7. Development Phases

| Phase | Focus | Core Deliverables |
| :---: | :--- | :--- |
| **Phase 1** | **Aesthetic Dashboard & Subject Folders** | Clean minimalist pink theme, GWA simulator, subject folders, simple study dashboard. |
| **Phase 2** | **ELI5 Reviewer & Flashcard Generator** | PDF upload with super simple language breakdown, analogies, exam traps, and confidence-rated cards. |
| **Phase 3** | **Infinite Patience Q&A & Voice Calls** | "I still don't get it" multi-explanation engine + hands-free voice drill partner. |
| **Phase 4** | **Google Classroom (Read-Only) & Calendar** | Read-only connection to auto-fetch slides and generate 25-minute study blocks around work shifts. |

---

## 8. Multi-Disciplinary Engineering & Security Sign-Off
- Full technical, cybersecurity, graphic design, and systems analysis audit report is documented in [DOSTUDY_AUDIT_REPORT.md](file:///c:/Users/ynasc/OneDrive/Desktop/DOSTUDY/DOSTUDY_AUDIT_REPORT.md).
- **Security Seal**: 100% Read-Only Google OAuth Scopes (`classroom.*.readonly`), zero email mutation, zero homework auto-submission risk.
- **Cognitive Design Seal**: WCAG 2.1 AA text contrast validation for tired eyes, collapsible one-topic-at-a-time focus accordions.
- **1.35 GWA Seal**: Recitation wingman cheat-sheets and target cushion simulators integrated into subject folders.
