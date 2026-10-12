# DOSTUDY

A calm, distraction-free study companion application built for working college students. DOSTUDY turns lecture materials (PDF, DOCX, PPTX, TXT) into easy ELI5 reviewers, Brainscape-style spaced-repetition flashcards (ratings 1–5), realistic practice tests, interactive voice tutoring calls with push-to-talk/interrupt, and anti-cramming schedule blocks balanced around work shifts.

---

## Features

- **Upload & Build**: Drag-and-drop course slides and documents to generate:
  - **ELI5 Reviewer**: Broken down into plain English with real-life analogies, memory hooks, and "Exam Traps".
  - **Flashcards (Brainscape Style)**: Minimalist 1–5 rating system (`1: Blank`, `2: Hard`, `3: Okay`, `4: Good`, `5: Easy`) powered by spaced repetition.
  - **Practice Tests**: Multiple choice, True/False, and identification questions with step-by-step explanations for each option.
  - **Recitation Cheat Cards**: Ready-to-use speaking points and cold-call answers for active class participation.
- **Two-Way Voice Tutor**: Live oral rehearsal with instant speech recognition, explicit turn-taking, and a **Tap to Interrupt & Speak** button so the AI never monologues.
- **Anti-Cramming Schedule**: Pre-configured with your university milestones and exams (Semi Finals, Finals, Milestones) with protected work hours and bite-sized 20–25 minute study blocks.
- **Privacy & Safety**: 100% local and read-only. University data and school emails are never modified, sent, or altered.

---

## Quick Start (How to Run at School)

### 1. Clone the repository
```bash
git clone https://github.com/czayna/dostudy.git
cd dostudy
```

### 2. Set up Python Environment & Install Dependencies
```bash
python -m venv venv
# On Windows:
venv\Scripts\activate
# On Mac/Linux:
source venv/bin/activate

pip install -r backend/requirements.txt
```

### 3. Add your Gemini API Key
Create a `.env` file in the root folder:
```bash
GEMINI_API_KEY=your_gemini_api_key_here
```
*(Get a free API key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey))*

### 4. Start the Application
```bash
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```
Open your browser and navigate to:
**`http://127.0.0.1:8000`**

---

## Tech Stack
- **Backend**: Python 3.10+, FastAPI, Uvicorn, SQLite, Google GenAI SDK (`gemini-3.8-flash`)
- **Document Extractors**: `pypdf`, `python-docx`, `python-pptx`
- **Frontend**: Vanilla ES Modules, Responsive CSS (Minimalist Soft Pink Palette)
- **Audio & Speech**: Web Speech API (`SpeechRecognition` & `SpeechSynthesis`)
