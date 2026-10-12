import os
import json
import logging
from typing import List, Dict, Any, Optional
from google import genai
from google.genai import types

logger = logging.getLogger(__name__)

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")

def get_client() -> Optional[genai.Client]:
    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        return None
    return genai.Client(api_key=api_key)

STUDY_BUDDY_PERSONA = """
You are DOSTUDY Buddy, a patient, warm, and slow-learner friendly academic study partner for a working college student aiming for a 1.35 GWA.
Guidelines:
1. Explain in simple, plain everyday English. Translate dry academic jargon into relatable analogies (like food, money, daily commutes, shopping).
2. Step-by-step logic: Short paragraphs and numbered steps.
3. The student may ask 10 times because they are learning slowly. NEVER rush them, judge them, or make them feel bad.
4. Highlight "Exam Traps" (tricky pitfalls professors use on tests) and "Must Memorize" key points.
5. Provide actionable speaking points for class participation/recitation.
"""

def generate_reviewer(text_content: str, filename: str) -> Dict[str, Any]:
    client = get_client()
    if not client:
        return {
            "title": filename,
            "summary": "Gemini API key is not set. Please add GEMINI_API_KEY to your .env to generate live AI reviewers.",
            "topics": [
                {
                    "title": "Setup Notice",
                    "why_it_matters": "AI features require a Gemini API Key.",
                    "analogy": "Like a car needing gas to run.",
                    "plain_meaning": "Add GEMINI_API_KEY to your environment variables.",
                    "steps": ["Open .env file", "Paste your Gemini API Key", "Restart DOSTUDY"],
                    "key_terms": [{"term": "API Key", "simple": "A secret password for the AI"}],
                    "formulas": [],
                    "must_memorize": ["API keys must be kept private."],
                    "exam_traps": ["Forgetting to restart the server after changing .env."],
                    "memory_hook": "Key opens the door to studying!",
                    "check": {"question": "What is needed to enable AI?", "answer": "A Gemini API Key."}
                }
            ]
        }

    prompt = f"""
{STUDY_BUDDY_PERSONA}

Analyze this study material extracted from "{filename}":

=== STUDY CONTENT ===
{text_content[:25000]}
=== END CONTENT ===

Generate a comprehensive, 100% complete ELI5 (Explain Like I'm 5) "Perfect Reviewer" in JSON format.
DO NOT skip any examinable concepts. Break down the material into clear logical topics.

Return ONLY valid JSON matching this schema:
{{
  "title": "Descriptive Subject / Chapter Title",
  "summary": "2-3 paragraph plain-English executive summary giving the big picture",
  "topics": [
    {{
      "title": "Topic Title",
      "why_it_matters": "Why does this concept exist / real-world relevance",
      "analogy": "Memorable, vivid real-life analogy (cooking, shopping, sports, daily life)",
      "plain_meaning": "Clear step-by-step concept explanation in simple terms",
      "steps": ["Step 1...", "Step 2..."],
      "key_terms": [{{"term": "Jargon Term", "simple": "Everyday plain translation"}}],
      "formulas": [{{"name": "Formula Name", "formula": "E=mc^2", "plain": "Plain English explanation"}}],
      "must_memorize": ["Exact key fact 1", "Rule 2"],
      "exam_traps": ["Common student misconception professors test"],
      "memory_hook": "Catchy mnemonic or mental visual trick",
      "check": {{"question": "Quick self-check question", "answer": "Answer explanation"}}
    }}
  ]
}}
"""
    try:
        response = client.models.generate_content(
            model="gemini-3.8-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.4
            )
        )
        return json.loads(response.text)
    except Exception as e:
        logger.error(f"Error generating reviewer: {e}")
        return {
            "title": filename,
            "summary": f"Could not generate reviewer automatically: {str(e)}",
            "topics": []
        }

def generate_flashcards(text_content: str, filename: str) -> List[Dict[str, str]]:
    client = get_client()
    if not client:
        return [
            {
                "front": "How do you activate DOSTUDY's Gemini AI?",
                "back": "Add **GEMINI_API_KEY** to your `.env` file.",
                "hint": "Free key at aistudio.google.com"
            }
        ]

    prompt = f"""
{STUDY_BUDDY_PERSONA}

From the study material below extracted from "{filename}", create Brainscape-style Spaced Repetition Flashcards.
Target 15 to 40 high-yield, bite-sized cards.
Format:
Front: Crisp single question or prompt
Back: Clear concise answer with **bold** key terms
Hint: Catchy mnemonic or memory trigger

=== CONTENT ===
{text_content[:25000]}
=== END ===

Return JSON array of cards:
[
  {{
    "front": "Question...",
    "back": "Clear answer with **bold** keywords...",
    "hint": "Mnemonic or hint..."
  }}
]
"""
    try:
        response = client.models.generate_content(
            model="gemini-3.8-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.3
            )
        )
        return json.loads(response.text)
    except Exception as e:
        logger.error(f"Error generating flashcards: {e}")
        return []

def generate_practice_test(text_content: str, filename: str, count: int = 15) -> Dict[str, Any]:
    client = get_client()
    if not client:
        return {
            "title": f"Practice Test: {filename}",
            "questions": []
        }

    prompt = f"""
{STUDY_BUDDY_PERSONA}

Create a realistic {count}-question practice exam from this material for "{filename}".
Mix:
- 50% Multiple Choice (4 choices)
- 25% True/False with justification
- 25% Identification (short answer)

Include detailed step-by-step explanations for WHY the right answer is correct and WHY the wrong options are distractors.

=== CONTENT ===
{text_content[:25000]}
=== END ===

Return JSON object:
{{
  "title": "Practice Exam Title",
  "questions": [
    {{
      "type": "mcq",
      "level": 1,
      "topic": "Topic Name",
      "question": "Question text...",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "answer": 0,
      "explanations": ["Why A is right", "Why B is wrong", "Why C is wrong", "Why D is wrong"]
    }},
    {{
      "type": "tf",
      "level": 2,
      "topic": "Topic Name",
      "question": "Statement...",
      "answer": true,
      "explanation": "Why statement is true/false"
    }},
    {{
      "type": "id",
      "level": 2,
      "topic": "Topic Name",
      "question": "Identification prompt...",
      "answer": "Correct Term",
      "accept": ["synonym 1", "alternate spelling"],
      "explanation": "Why this term is correct"
    }}
  ]
}}
"""
    try:
        response = client.models.generate_content(
            model="gemini-3.8-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.5
            )
        )
        return json.loads(response.text)
    except Exception as e:
        logger.error(f"Error generating test: {e}")
        return {"title": filename, "questions": []}

def tutor_turn(messages: List[Dict[str, str]], mode: str = "chat", context: str = "", spoken: bool = False) -> str:
    client = get_client()
    if not client:
        return "Gemini API key is not configured. Please add GEMINI_API_KEY in `.env` to chat with your study buddy."

    history_text = "\n".join([f"{m.get('role', 'user')}: {m.get('text', '')}" for m in messages[-10:]])
    
    voice_constraint = ""
    if spoken:
        voice_constraint = """
CRITICAL LIVE VOICE CALL RULES (MANDATORY):
- YOU ARE ON A LIVE TWO-WAY VOICE CALL WITH THE STUDENT.
- KEEP YOUR ANSWER EXTREMELY BRIEF: 1 TO 2 SHORT SENTENCES ONLY (UNDER 35 WORDS TOTAL).
- DO NOT MONOLOGUE, DO NOT GIVE LONG EXPLANATIONS, AND DO NOT LECTURE.
- ALWAYS END BY ASKING A SIMPLE QUESTION OR PASSING THE FLOOR BACK TO THE STUDENT TO LET THEM SPEAK.
- Example: "The mitochondria is like the power plant generating energy for the cell. Does that analogy make sense, or should we try another one?"
"""

    prompt = f"""
{STUDY_BUDDY_PERSONA}

Mode: {mode.upper()}
{voice_constraint}
Relevant Study Material Context:
{context[:10000] if context else "General college academic assistance"}

Recent Conversation:
{history_text}

Respond gently, concisely, and supportively. If the student doesn't understand, break it down further with a new analogy. Ask one question at a time if drilling.
"""
    try:
        response = client.models.generate_content(
            model="gemini-3.8-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.7
            )
        )
        return response.text
    except Exception as e:
        return f"Study buddy error: {str(e)}"

def generate_recitation_cheat_card(text_content: str, filename: str) -> Dict[str, Any]:
    client = get_client()
    if not client:
        return {
            "points": [
                {"type": "Smart Question", "say_it": "Could you clarify how this concept applies in practical scenarios?", "why_it_works": "Shows active listening."}
            ],
            "cold_call_answer": "This material outlines the core framework."
        }

    prompt = f"""
{STUDY_BUDDY_PERSONA}

Generate a Recitation Cheat Card for the student to raise their hand and get high recitation points in college class for "{filename}".
Give them 3 natural, confident things to say, plus a ready-to-use answer if the professor cold-calls on them.

=== MATERIAL ===
{text_content[:20000]}
=== END ===

Return valid JSON:
{{
  "points": [
    {{
      "type": "Clarifying Question / Insight",
      "say_it": "What the student should say out loud in first person (natural conversational English)...",
      "why_it_works": "Why this impresses the professor..."
    }},
    {{
      "type": "Real-world connection",
      "say_it": "...",
      "why_it_works": "..."
    }},
    {{
      "type": "Summary observation",
      "say_it": "...",
      "why_it_works": "..."
    }}
  ],
  "cold_call_answer": "A clear, safe 20-second summary answer if the professor unexpectedly calls their name."
}}
"""
    try:
        response = client.models.generate_content(
            model="gemini-3.8-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.5
            )
        )
        return json.loads(response.text)
    except Exception as e:
        logger.error(f"Error generating recitation card: {e}")
        return {
            "points": [
                {"type": "Key Insight", "say_it": f"In {filename}, the fundamental idea connects foundational theory with application.", "why_it_works": "Demonstrates you reviewed the slides."}
            ],
            "cold_call_answer": "The main takeaway focuses on the core principles and common practical edge-cases."
        }

def reexplain_topic(topic_title: str, current_content: str, style: str = "simpler", context: str = "") -> str:
    client = get_client()
    if not client:
        return "Here is another way to think about it: break it into smaller real-life steps."

    style_guide = {
        "simpler": "Explain it as if explaining to a 10-year-old using the simplest possible vocabulary.",
        "analogy": "Use a completely new, vivid real-world analogy (e.g. food, video games, shopping, sports).",
        "steps": "Break it down into super slow 1-2-3 numbered baby steps.",
        "example": "Give 2 concrete everyday examples showing exactly how this works."
    }.get(style, "Explain it in a different intuitive way.")

    prompt = f"""
{STUDY_BUDDY_PERSONA}

The student said: 'I still don't get this topic.'
Topic: {topic_title}
Current content: {current_content}
Style requested: {style_guide}
Context: {context[:5000]}

Write a warm, non-judgmental alternative explanation. Start with 'No worries at all! Let's look at this another way:' and make it crystal clear.
"""
    try:
        response = client.models.generate_content(
            model="gemini-3.8-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.7
            )
        )
        return response.text
    except Exception as e:
        return f"Here is another way to think about {topic_title}: Break it down into the core goal and why it matters."

def summarize_session(messages: List[Dict[str, str]], context: str = "") -> Dict[str, Any]:
    client = get_client()
    if not client:
        return {
            "summary": "You practiced actively today! Consistent small sessions protect your 1.35 GWA goal.",
            "strengths": ["Consistent effort", "Active recall engagement"],
            "gaps": ["Review unfamiliar terms from today's discussion"],
            "new_cards": []
        }

    history_text = "\n".join([f"{m.get('role', 'user')}: {m.get('text', '')}" for m in messages])
    prompt = f"""
{STUDY_BUDDY_PERSONA}

Analyze this voice tutoring practice session between the tutor and the student:
=== CONVERSATION ===
{history_text}
=== END ===

Extract:
1. Brief encouraging summary (2 sentences).
2. Strengths: 2 things the student understood well.
3. Gaps / Weak Points: 2 specific concepts the student hesitated on or struggled to explain.
4. Up to 3 flashcards specifically addressing those weak points so the student can master them.

Return valid JSON:
{{
  "summary": "...",
  "strengths": ["...", "..."],
  "gaps": ["...", "..."],
  "new_cards": [
    {{
      "front": "Question targeting the weak point",
      "back": "Clear answer with **bold** key terms",
      "hint": "Mnemonic or hint"
    }}
  ]
}}
"""
    try:
        response = client.models.generate_content(
            model="gemini-3.8-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.4
            )
        )
        return json.loads(response.text)
    except Exception as e:
        logger.error(f"Error summarizing session: {e}")
        return {
            "summary": "Great session! You engaged with the material actively today.",
            "strengths": ["Showed curiosity and persistence"],
            "gaps": ["Key definitions to review again"],
            "new_cards": []
        }

