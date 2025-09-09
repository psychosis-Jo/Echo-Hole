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
const langSelector = document.getElementById(
  "lang-selector",
) as HTMLSelectElement;
const clearBtn = document.getElementById("clear-btn") as HTMLButtonElement;

// --- App State ---
let isListening = false;
let finalTranscript = "";
type Note = {
  id: number;
  note: string;
  tags: string[];
};
let notes: Note[] = [];

// --- Language Configuration ---
const supportedLanguages = [
    { code: "en-US", name: "English (US)" },
    { code: "zh-CN", name: "简体中文" },
    { code: "es-ES", name: "Español" },
    { code: "fr-FR", name: "Français" },
    { code: "de-DE", name: "Deutsch" },
    { code: "ja-JP", name: "日本語" },
    { code: "ko-KR", name: "한국어" },
];

supportedLanguages.forEach(lang => {
    const option = document.createElement("option");
    option.value = lang.code;
    option.textContent = lang.name;
    langSelector.appendChild(option);
});

// Set initial language based on browser, fallback to English
const browserLang = navigator.language;
const initialLang = supportedLanguages.find(l => l.code === browserLang)?.code || 'en-US';
langSelector.value = initialLang;

// --- Data Persistence ---
const STORAGE_KEY = 'echo-hole-notes';

function saveNotes() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

function loadNotes() {
  const savedNotes = localStorage.getItem(STORAGE_KEY);
  if (savedNotes) {
    try {
      notes = JSON.parse(savedNotes);
    } catch (e) {
      console.error("Error parsing notes from localStorage", e);
      notes = []; // Start fresh if data is corrupted
    }
  }
}

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
recognition.lang = langSelector.value; // Set initial recognition language

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
  langSelector.disabled = true;

  const currentLang = langSelector.value;
  const currentLangName = supportedLanguages.find(l => l.code === currentLang)?.name || currentLang;


  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: `You are an AI assistant that processes spoken thoughts. The user is speaking in ${currentLangName} (${currentLang}). From the following transcript, extract the core note and suggest a few relevant hashtags (tags). The note and tags MUST be in the same language as the transcript. Transcript: "${transcript}"`,
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
      saveNotes();
      renderNotes();
    }
  } catch (error) {
    console.error("Error processing with Gemini:", error);
    statusDiv.textContent = "Error: Could not process the thought.";
  } finally {
    statusDiv.textContent = "Tap the mic to capture a thought";
    micBtn.disabled = false;
    langSelector.disabled = false;
  }
}

// --- UI Rendering ---
function deleteNote(idToDelete: number) {
    notes = notes.filter(note => note.id !== idToDelete);
    saveNotes();
    renderNotes();
}

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

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-btn";
    deleteBtn.setAttribute("aria-label", "Delete note");
    deleteBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#8a8a8a">
            <path d="M0 0h24v24H0z" fill="none"/>
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
        </svg>
    `;
    deleteBtn.addEventListener('click', () => deleteNote(note.id));

    card.appendChild(deleteBtn);
    card.appendChild(noteText);
    card.appendChild(tagsContainer);
    notesContainer.appendChild(card);
  });
}

// --- Event Handlers ---
langSelector.addEventListener('change', () => {
    recognition.lang = langSelector.value;
});

micBtn.addEventListener("click", () => {
  isListening = !isListening;
  if (isListening) {
    micBtn.classList.add("listening");
    langSelector.disabled = true;
    statusDiv.textContent = "Listening...";
    finalTranscript = "";
    recognition.start();
  } else {
    micBtn.classList.remove("listening");
    langSelector.disabled = false;
    statusDiv.textContent = "Processing...";
    recognition.stop();
  }
});

clearBtn.addEventListener('click', () => {
    if (notes.length > 0 && confirm("Are you sure you want to delete all notes? This cannot be undone.")) {
        notes = [];
        saveNotes();
        renderNotes();
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
  langSelector.disabled = false;
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
  langSelector.disabled = false;
};

// Initial Load and Render
loadNotes();
renderNotes();
