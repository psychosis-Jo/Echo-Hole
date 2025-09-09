/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Type } from "@google/genai";

// --- DOM Elements ---
const micBtn = document.getElementById("mic-btn") as HTMLButtonElement;
const statusDiv = document.getElementById("status") as HTMLParagraphElement;
const notesContainer = document.getElementById(
  "notes-container",
) as HTMLDivElement;

// --- App State ---
let isListening = false;
let finalTranscript = "";
type Note = {
  id: number;
  note: string;
  tags: string[];
};
let notes: Note[] = [];

// --- Speech Recognition Setup ---
// FIX: Cast window to `any` to access experimental SpeechRecognition APIs.
const SpeechRecognition =
  (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
if (!SpeechRecognition) {
  statusDiv.textContent =
    "Speech recognition is not supported in this browser.";
  micBtn.disabled = true;
}
const recognition = new SpeechRecognition();
recognition.continuous = true;
recognition.interimResults = true;
recognition.lang = "en-US";

// --- Gemini AI Setup ---
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
const model = "gemini-2.5-flash";

const schema = {
  type: Type.OBJECT,
  properties: {
    note: {
      type: Type.STRING,
      description: "A concise summary of the user's thought or idea.",
    },
    tags: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        "An array of 2-4 relevant keywords or hashtags based on the note.",
    },
  },
  required: ["note", "tags"],
};

async function processTranscript(transcript: string) {
  statusDiv.textContent = "Thinking...";
  micBtn.disabled = true;
  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: `You are an AI assistant that processes spoken thoughts. From the following transcript, extract the core note and suggest a few relevant hashtags (tags). The note should be a concise summary of the user's thought. Transcript: "${transcript}"`,
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
      },
    });

    const jsonText = response.text.trim();
    const parsed = JSON.parse(jsonText) as Omit<Note, "id">;

    if (parsed.note && parsed.tags) {
      const newNote: Note = {
        id: Date.now(),
        note: parsed.note,
        tags: parsed.tags,
      };
      notes.unshift(newNote); // Add to the beginning of the array
      renderNotes();
    }
  } catch (error) {
    console.error("Error processing with Gemini:", error);
    statusDiv.textContent = "Error: Could not process the thought.";
  } finally {
    statusDiv.textContent = "Tap the mic to capture a thought";
    micBtn.disabled = false;
  }
}

// --- UI Rendering ---
function renderNotes() {
  notesContainer.innerHTML = "";
  notes.forEach((note) => {
    const card = document.createElement("div");
    card.className = "note-card";

    const noteText = document.createElement("p");
    noteText.textContent = note.note;

    const tagsContainer = document.createElement("div");
    tagsContainer.className = "tags-container";
    note.tags.forEach((tag) => {
      const tagEl = document.createElement("span");
      tagEl.className = "tag";
      // Add '#' if it's not there
      tagEl.textContent = tag.startsWith("#") ? tag : `#${tag}`;
      tagsContainer.appendChild(tagEl);
    });

    card.appendChild(noteText);
    card.appendChild(tagsContainer);
    notesContainer.appendChild(card);
  });
}

// --- Event Handlers ---
micBtn.addEventListener("click", () => {
  isListening = !isListening;
  if (isListening) {
    micBtn.classList.add("listening");
    statusDiv.textContent = "Listening...";
    finalTranscript = "";
    recognition.start();
  } else {
    micBtn.classList.remove("listening");
    statusDiv.textContent = "Processing...";
    recognition.stop();
  }
});

// FIX: Use `any` for event type as SpeechRecognitionEvent may not be defined.
recognition.onresult = (event: any) => {
  let interimTranscript = "";
  for (let i = event.resultIndex; i < event.results.length; ++i) {
    if (event.results[i].isFinal) {
      finalTranscript += event.results[i][0].transcript;
    } else {
      interimTranscript += event.results[i][0].transcript;
    }
  }
  statusDiv.textContent = interimTranscript || "Listening...";
};

recognition.onend = () => {
  isListening = false;
  micBtn.classList.remove("listening");
  if (finalTranscript) {
    processTranscript(finalTranscript);
  } else {
    statusDiv.textContent = "Tap the mic to capture a thought";
  }
};

// FIX: Use `any` for event type as SpeechRecognitionErrorEvent may not be defined.
recognition.onerror = (event: any) => {
  console.error("Speech recognition error:", event.error);
  statusDiv.textContent = `Error: ${event.error}`;
  isListening = false;
  micBtn.classList.remove("listening");
};

// Initial Render
renderNotes();
