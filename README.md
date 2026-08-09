# Ace Tutor AI

#!/usr/bin/env python3
import os
import re
import json
import uuid
from datetime import date
from pathlib import Path

from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from google import genai
from google.genai import types

app = Flask(__name__)
CORS(app)

TEXT_MODEL = "gemini-2.5-flash"
TTS_MODEL = "gemini-2.5-flash-preview-tts"

USERS = {}
DAILY_PROGRESS = {}

OUTPUT_DIR = Path("output_audio")
OUTPUT_DIR.mkdir(exist_ok=True)


def get_client():
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY environment variable is missing.")
    return genai.Client(api_key=api_key)


def parse_json(text):
    if text is None:
        raise ValueError("Empty model response")
    text = text.strip()
    fence = re.match(r"^```(?:json)?\s*(.*?)\s*```$", text, re.DOTALL)
    if fence:
        text = fence.group(1).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if m:
            return json.loads(m.group(0))
        raise


def text_json(client, prompt, temperature=0.2, max_output_tokens=8192):
    resp = client.models.generate_content(
        model=TEXT_MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            temperature=temperature,
            max_output_tokens=max_output_tokens,
            response_mime_type="application/json",
        ),
    )
    return parse_json(resp.text)


def make_audio(client, text, filename=None):
    if not filename:
        filename = f"{uuid.uuid4().hex}.mp3"
    out_path = OUTPUT_DIR / filename

    response = client.models.generate_content(
        model=TTS_MODEL,
        contents=text,
        config=types.GenerateContentConfig(
            response_modalities=["audio"],
        ),
    )

    audio_bytes = None
    if response.candidates:
        cand = response.candidates[0]
        if cand.content and cand.content.parts:
            for part in cand.content.parts:
                if getattr(part, "inline_data", None) and part.inline_data.data:
                    audio_bytes = part.inline_data.data
                    break

    if not audio_bytes:
        raise ValueError("No audio returned by TTS model")

    with open(out_path, "wb") as f:
        f.write(audio_bytes)

    return str(out_path)


@app.route("/api/onboard", methods=["POST"])
def onboard():
    try:
        data = request.get_json() or {}
        user_id = data.get("userId")
        if not user_id:
            return jsonify({"error": "userId is required"}), 400

        profile = {
            "userId": user_id,
            "className": data.get("className", "10th Grade"),
            "country": data.get("country", "USA"),
            "educationBoard": data.get("educationBoard", "Standard Board"),
            "examPrepTime": data.get("examPrepTime", "3 months"),
            "parentEmail": data.get("parentEmail"),
            "dailyTaskGoal": int(data.get("dailyTaskGoal", 3)),
        }

        USERS[user_id] = profile
        DAILY_PROGRESS[user_id] = {
            "date": date.today().isoformat(),
            "completed": 0,
            "goal": profile["dailyTaskGoal"],
        }

        return jsonify({"status": "onboarded", "profile": profile})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/generate-lecture", methods=["POST"])
def generate_lecture():
    try:
        data = request.get_json() or {}
        topic = data.get("topic")
        class_name = data.get("className", "10th Grade")
        country = data.get("country", "USA")
        board = data.get("educationBoard", "Standard Board")

        if not topic:
            return jsonify({"error": "Topic is required"}), 400

        client = get_client()

        prompt = f"""
Create a complete, full-content academic lecture for exam preparation.

Target Student:
- Class/Level: {class_name}
- Country: {country}
- Board: {board}
- Topic: {topic}

Return STRICT JSON only in this exact shape:
{{
  "topic": "{topic}",
  "academicRigorHeader": "string",
  "parts": [
    {{
      "segmentTitle": "Concept Foundations",
      "readingTimeMinutes": 10,
      "audioSpeakerPrompt": "100-140 word narration script",
      "writtenTranscriptMarkdown": "full, detailed markdown lesson",
      "acedCheckpoints": ["checkpoint 1", "checkpoint 2"]
    }},
    {{
      "segmentTitle": "Rigorous Breakdown",
      "readingTimeMinutes": 10,
      "audioSpeakerPrompt": "100-140 word narration script",
      "writtenTranscriptMarkdown": "full, detailed markdown lesson",
      "acedCheckpoints": ["checkpoint 1", "checkpoint 2"]
    }},
    {{
      "segmentTitle": "Under-the-Hood Secret",
      "readingTimeMinutes": 10,
      "audioSpeakerPrompt": "100-140 word narration script",
      "writtenTranscriptMarkdown": "full, detailed markdown lesson",
      "acedCheckpoints": ["checkpoint 1", "checkpoint 2"]
    }},
    {{
      "segmentTitle": "Ultimate Synthesis",
      "readingTimeMinutes": 10,
      "audioSpeakerPrompt": "100-140 word narration script",
      "writtenTranscriptMarkdown": "full, detailed markdown lesson",
      "acedCheckpoints": ["checkpoint 1", "checkpoint 2"]
    }}
  ]
}}
"""

        lecture = text_json(client, prompt, temperature=0.2, max_output_tokens=8192)

        audio_files = []
        for i, part in enumerate(lecture.get("parts", [])):
            speech = (part.get("audioSpeakerPrompt") or "").strip()
            if speech:
                path = make_audio(client, speech, filename=f"lecture_{uuid.uuid4().hex}_part{i+1}.mp3")
                audio_files.append({"partIndex": i, "audioFile": path})
            else:
                audio_files.append({"partIndex": i, "audioFile": None})

        return jsonify({"lecture": lecture, "audioFiles": audio_files})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/solve-doubt", methods=["POST"])
def solve_doubt():
    try:
        data = request.get_json() or {}
        user_message = data.get("userMessage")
        topic = data.get("topic", "General")
        class_name = data.get("className", "10th Grade")
        country = data.get("country", "USA")
        board = data.get("educationBoard", "Standard Board")
        history = data.get("conversationHistory", [])

        if not user_message:
            return jsonify({"error": "userMessage is required"}), 400

        client = get_client()

        history_text = ""
        for msg in history:
            role = "Student" if msg.get("role") == "user" else "AceCoach"
            history_text += f"{role}: {msg.get('content')}\n"

        prompt = f"""
You are AceCoach, a strict, highly motivating tutor.
Goal: help the student solve doubts in {topic} without directly giving away the answer.

Context:
- Class/Level: {class_name}
- Country: {country}
- Board: {board}

Rules:
1. Guide step by step.
2. Use hints, not final answers first.
3. Be sharp, clear, and encouraging.

Conversation History:
{history_text}

Student Query:
{user_message}

Return STRICT JSON only:
{{
  "coachResponse": "markdown response with hints, steps, and corrected reasoning",
  "motivationalSlogan": "one-line slogan",
  "recommendedAction": "what the student should do next"
}}
"""

        result = text_json(client, prompt, temperature=0.7, max_output_tokens=2048)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/generate-homework-and-quiz", methods=["POST"])
def generate_homework_and_quiz():
    try:
        data = request.get_json() or {}
        topic = data.get("topic")
        class_name = data.get("className", "10th Grade")
        country = data.get("country", "USA")
        board = data.get("educationBoard", "Standard Board")

        if not topic:
            return jsonify({"error": "Topic is required"}), 400

        client = get_client()

        prompt = f"""
Generate a rigorous homework mission and revision deck.

Topic: {topic}
Class: {class_name}
Board: {board}
Country: {country}

Return STRICT JSON only:
{{
  "missionId": "{uuid.uuid4().hex}",
  "homeworkQuestions": [
    {{
      "id": "hw-1",
      "questionText": "full question",
      "gradingStandard": "what full marks need",
      "difficulty": "HARD"
    }},
    {{
      "id": "hw-2",
      "questionText": "full question",
      "gradingStandard": "what full marks need",
      "difficulty": "ACE_LEVEL"
    }}
  ],
  "revisionCards": [
    {{
      "front": "question side",
      "back": "answer side"
    }}
  ]
}}
"""

        result = text_json(client, prompt, temperature=0.3, max_output_tokens=4096)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/submit-homework", methods=["POST"])
def submit_homework():
    try:
        data = request.get_json() or {}
        topic = data.get("topic", "General")
        class_name = data.get("className", "10th Grade")
        board = data.get("educationBoard", "Standard Board")
        question = data.get("question")
        answer = data.get("answer")

        if not question or not answer:
            return jsonify({"error": "question and answer are required"}), 400

        client = get_client()

        prompt = f"""
Grade this answer strictly.

Topic: {topic}
Level: {class_name}
Board: {board}

Question:
{question}

Student Answer:
{answer}

Return STRICT JSON only:
{{
  "scorePercentage": 0,
  "aceVerdict": "ACE_APPROVED | MASTERS_REVIEW | RE_LEARN_REQUIRED",
  "detailedFeedbackMarkdown": "detailed feedback",
  "parentAlertSnippet": "short summary"
}}
"""

        result = text_json(client, prompt, temperature=0.2, max_output_tokens=2048)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/audio/<path:filename>", methods=["GET"])
def get_audio(filename):
    path = OUTPUT_DIR / filename
    if not path.exists():
        return jsonify({"error": "file not found"}), 404
    return send_file(str(path), mimetype="audio/mpeg", as_attachment=True)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", 5000)), debug=False)

this is my code..  make my ai perfect

The frontend was built with [Lovable](https://lovable.dev).

The backend was done by a variety or neural networks using primarily python

**Live app**: https://ace-learn-spark.lovable.app

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
