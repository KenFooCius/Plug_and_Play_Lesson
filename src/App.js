import React, { useEffect, useMemo, useState, useRef } from "react";
import confetti from "canvas-confetti";

/**
 * Plug & Play Lesson Games (React, single-file)
 * - URL/Text → Summary + Vocab (Gemini)
 * - Teacher’s Trivia (5×5)
 * - Wonder Wheel (SVG): Wheel-of-Fortune–style wedges, readable labels, multi-rotation spins
 *   + Two hint systems above the puzzle:
 *     1) 💡 Reveal Letter — reveals a random hidden letter (3 per puzzle)
 *     2) 🧭 Context Hint — definition-style clue without the word (3 per puzzle)
 */

// ---------- helpers ----------
const cx = (...xs) => xs.filter(Boolean).join(" ");
function proxyFetchText(url) {
  const prox = "https://r.jina.ai/http://" + url.replace(/^https?:\/\//, "");
  return fetch(prox).then((r) => {
    if (!r.ok) throw new Error("Could not fetch text from URL");
    return r.text();
  });
}
const cleanCompare = (s) => (s || "").toUpperCase().replace(/[^A-Z]/g, "");

// ---------- Gemini ----------
async function geminiSummarizeAndVocab({ apiKey, text }) {
  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" +
    encodeURIComponent(apiKey);

  const prompt = `You are helping a 4th grade teacher design a lesson.

TASKS:
1) Write a friendly, one-paragraph summary (3-5 sentences) for 4th graders about the content below.
2) Extract 8-14 important KEY VOCABULARY terms appropriate for 4th graders and provide short, kid-friendly definitions.

FORMAT your response as strict JSON with this exact shape:
{"summary":"...","vocab":[{"term":"...","definition":"..."}]}

CONTENT START
${text}
CONTENT END`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.6, maxOutputTokens: 1200 },
    }),
  });
  if (!res.ok)
    throw new Error(`Gemini error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const out = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  let obj;
  try {
    obj = JSON.parse(out);
  } catch {
    const m = out && out.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("Failed to parse Gemini JSON output.");
    obj = JSON.parse(m[0]);
  }
  return obj;
}

async function geminiBuildJeopardy({ apiKey, text }) {
  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" +
    encodeURIComponent(apiKey);

  const prompt = `Create a Jeopardy-style board for 4th graders from the content below.

- 5 categories, each with 5 clues (25 total).
- Each clue has a short QUESTION and a concise ANSWER.
- Return JSON: {"categories":[{"title":"...","clues":[{"question":"...","answer":"..."} x5]} x5]}

CONTENT START
${text}
CONTENT END`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.6, maxOutputTokens: 1600 },
    }),
  });
  if (!res.ok)
    throw new Error(`Gemini Jeopardy error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const out = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  let parsed;
  try {
    parsed = JSON.parse(out);
  } catch {
    const m = out && out.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("Failed to parse Jeopardy JSON.");
    parsed = JSON.parse(m[0]);
  }
  let categories = Array.isArray(parsed?.categories) ? parsed.categories : [];
  categories = categories
    .filter((c) => c && c.title && Array.isArray(c.clues))
    .slice(0, 5)
    .map((c) => ({
      title: String(c.title).trim().slice(0, 40),
      clues: (c.clues || []).slice(0, 5).map((cl, i) => ({
        question: String(cl?.question || "")
          .trim()
          .slice(0, 160),
        answer: String(cl?.answer || "")
          .trim()
          .slice(0, 120),
        value: [100, 200, 300, 400, 500][i] || (i + 1) * 100,
      })),
    }));
  if (categories.length !== 5 || categories.some((c) => c.clues.length !== 5)) {
    throw new Error(
      "Teacher’s Trivia board incomplete. Try again or simplify the source."
    );
  }
  return { categories };
}

// ---------- UI ----------
function Header() {
  return (
    <header className="p-4 sm:p-6 border-b bg-white sticky top-0 z-20">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl sm:text-3xl font-bold">
            Plug & Play Lesson Games
          </h1>
          <span className="text-xs text-gray-500 hidden sm:inline">
            URL → Summary → Vocab → Games
          </span>
        </div>
      </div>
    </header>
  );
}

function ApiKeyPanel({ apiKey, setApiKey }) {
  const [persist, setPersist] = useState(
    () => localStorage.getItem("pp.persistKey") === "true"
  );
  useEffect(() => {
    if (persist && apiKey) localStorage.setItem("pp.apiKey", apiKey);
  }, [persist, apiKey]);
  useEffect(() => {
    if (persist && !apiKey) setApiKey(localStorage.getItem("pp.apiKey") || "");
  }, [persist]); // eslint-disable-line
  return (
    <section className="border rounded-2xl p-4 sm:p-5 bg-white shadow-sm">
      <h2 className="font-semibold text-lg mb-2">Gemini API Key</h2>
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value.trim())}
          placeholder="Paste your API key..."
          className="border rounded-xl px-3 py-2 w-full sm:w-96"
        />
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={persist}
            onChange={(e) => {
              const v = e.target.checked;
              setPersist(v);
              localStorage.setItem("pp.persistKey", String(v));
              if (!v) localStorage.removeItem("pp.apiKey");
            }}
          />
          Remember on this device
        </label>
      </div>
      <p className="text-xs text-gray-500 mt-2">
        Tip: keep this client-side for demos only.
      </p>
    </section>
  );
}

function SourceInput({ mode, setMode, url, setUrl, rawText, setRawText }) {
  return (
    <section className="border rounded-2xl p-4 sm:p-5 bg-white shadow-sm">
      <h2 className="font-semibold text-lg mb-2">Source</h2>
      <div className="flex gap-2 mb-3">
        <button
          className={cx(
            "px-3 py-1.5 rounded-xl border",
            mode === "url" ? "bg-black text-white" : "bg-white"
          )}
          onClick={() => setMode("url")}
        >
          URL
        </button>
        <button
          className={cx(
            "px-3 py-1.5 rounded-xl border",
            mode === "text" ? "bg-black text-white" : "bg-white"
          )}
          onClick={() => setMode("text")}
        >
          Paste Text
        </button>
      </div>
      {mode === "url" ? (
        <>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/lesson-article"
            className="border rounded-xl px-3 py-2 w-full"
          />
          <p className="text-xs text-gray-500 mt-2">
            URL mode uses a CORS-friendly reader; Paste Text works everywhere.
          </p>
        </>
      ) : (
        <textarea
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder="Paste article text here..."
          rows={7}
          className="border rounded-xl px-3 py-2 w-full"
        />
      )}
    </section>
  );
}

function SummaryCard({ summary }) {
  if (!summary) return null;
  return (
    <section className="border rounded-2xl p-4 sm:p-5 bg-white shadow-sm">
      <h3 className="font-semibold text-lg mb-2">Kid-Friendly Summary</h3>
      <p className="leading-7 text-gray-800">{summary}</p>
    </section>
  );
}

function VocabList({ vocab }) {
  if (!vocab?.length) return null;
  return (
    <section className="border rounded-2xl p-4 sm:p-5 bg-white shadow-sm">
      <h3 className="font-semibold text-lg mb-3">Key Vocabulary</h3>
      <ul className="grid sm:grid-cols-2 gap-3">
        {vocab.map((v, idx) => (
          <li key={idx} className="border rounded-xl p-3">
            <div className="font-semibold">{v.term}</div>
            <div className="text-sm text-gray-700">{v.definition}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------- Teacher's Trivia ----------
function TeachersTrivia({ board, players, setPlayers }) {
  const [active, setActive] = useState(0);
  const [used, setUsed] = useState(new Set());
  const [modal, setModal] = useState(null);
  const [guess, setGuess] = useState("");
  const [result, setResult] = useState("");
  const [attempted, setAttempted] = useState(new Set());

  useEffect(() => {
    setUsed(new Set());
  }, [board]);

  function markUsed(cIdx, rIdx) {
    setUsed((prev) => new Set(prev).add(`${cIdx}-${rIdx}`));
  }
  function openClue(cIdx, rIdx) {
    const clue = board.categories[cIdx].clues[rIdx];
    setModal({ cIdx, rIdx, clue });
    setGuess("");
    setResult("");
    setAttempted(new Set());
  }
  function closeModal() {
    setModal(null);
    setGuess("");
    setResult("");
    setAttempted(new Set());
  }
  function award(delta, playerIdx = active) {
    setPlayers((prev) => {
      const arr = [...prev];
      arr[playerIdx] = {
        ...arr[playerIdx],
        score: (arr[playerIdx].score || 0) + delta,
      };
      return arr;
    });
  }
  function rotateToNextUntried() {
    if (players.length <= 1) return;
    for (let k = 1; k <= players.length; k++) {
      const cand = (active + k) % players.length;
      if (!attempted.has(cand)) {
        setActive(cand);
        return;
      }
    }
  }
  function onMarkCorrect() {
    if (!modal) return;
    const val = modal.clue.value || (modal.rIdx + 1) * 100;
    award(val);
    setResult(`✅ Correct! +${val}`);
    markUsed(modal.cIdx, modal.rIdx);
    setTimeout(closeModal, 800);
  }
  function onMarkIncorrect() {
    if (!modal) return;
    const val = modal.clue.value || (modal.rIdx + 1) * 100;
    award(-val);
    setResult(`❌ Incorrect. -${val}`);
    setAttempted((prev) => new Set(prev).add(active));
    rotateToNextUntried();
  }

  if (!board) return null;
  const allUsed = board.categories.every((cat, c) =>
    cat.clues.every((_, r) => used.has(`${c}-${r}`))
  );

  return (
    <section className="border rounded-2xl p-4 sm:p-6 bg-white shadow-sm">
      <div className="flex flex-col xl:flex-row xl:items-start gap-4 xl:gap-6">
        <div className="flex-1">
          <h3 className="font-semibold text-xl">Teacher’s Trivia (5×5)</h3>
          <p className="text-sm text-gray-600">
            Use <b>Correct</b> / <b>Incorrect</b>. Wrong answers auto-rotate to
            the next player.
          </p>
        </div>
      </div>

      {/* Players */}
      <div className="mt-4">
        <div className="flex items-center justify-between">
          <h4 className="font-semibold">Players</h4>
          <button
            className="px-3 py-1.5 rounded-lg border"
            onClick={() =>
              setPlayers((prev) => [
                ...prev,
                { name: `Player ${prev.length + 1}`, score: 0 },
              ])
            }
          >
            + Add player
          </button>
        </div>
        <div className="mt-2 overflow-x-auto no-scrollbar">
          <div className="flex gap-2 pr-2">
            {players.map((p, i) => (
              <button
                key={i}
                onClick={() => setActive(i)}
                className={cx(
                  "whitespace-nowrap rounded-full px-3 py-1.5 border text-sm font-semibold transition",
                  i === active
                    ? "bg-yellow-400 border-yellow-500 text-gray-900 shadow"
                    : "bg-white border-gray-300 text-gray-800 hover:bg-gray-50"
                )}
                title="Set active player"
              >
                {(i === active ? "👑 " : "") + (p.name || `Player ${i + 1}`)} ·
                ${p.score || 0}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Board */}
      <div className="mt-6">
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
          {board.categories.map((cat, idx) => (
            <div
              key={idx}
              className="bg-blue-900 text-yellow-300 rounded-lg py-3 px-2 text-center font-black uppercase tracking-wide shadow border border-blue-700"
            >
              {cat.title}
            </div>
          ))}
        </div>

        <div className="mt-2">
          {[0, 1, 2, 3, 4].map((r) => (
            <div key={r} className="mt-2 grid grid-cols-1 sm:grid-cols-5 gap-2">
              {[0, 1, 2, 3, 4].map((c) => {
                const id = `${c}-${r}`;
                const usedTile = used.has(id);
                const value =
                  board.categories[c].clues[r].value || (r + 1) * 100;
                return (
                  <button
                    key={id}
                    disabled={usedTile}
                    onClick={() => openClue(c, r)}
                    className={cx(
                      "rounded-lg flex items-center justify-center font-extrabold border transition select-none h-16 sm:h-20 md:h-24",
                      usedTile
                        ? "bg-blue-900/30 text-blue-900/40 border-blue-200 cursor-not-allowed"
                        : "bg-blue-800 text-yellow-300 border-blue-600 hover:scale-105 active:scale-95"
                    )}
                  >
                    {usedTile ? "✓" : `$${value}`}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        {allUsed && (
          <div className="mt-4 text-green-700 font-semibold">
            🎉 Board complete!
          </div>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <div
          className="fixed inset-0 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,.45)" }}
        >
          <div className="bg-white rounded-2xl w-full max-w-3xl p-6 shadow-2xl border">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs uppercase tracking-wider text-blue-600 font-bold">
                  {board.categories[modal.cIdx].title}
                </div>
                <div className="text-2xl font-extrabold text-blue-900">
                  ${modal.clue.value}
                </div>
                <div className="text-sm text-gray-600 mt-1">
                  Current: <b>{players[active]?.name || "Player"}</b>
                </div>
              </div>
              <button
                className="text-gray-500 hover:text-black"
                onClick={() => (setModal(null), setAttempted(new Set()))}
              >
                ✕
              </button>
            </div>

            <div className="mt-3">
              <div className="text-sm uppercase tracking-wide text-gray-500">
                Question
              </div>
              <div className="text-lg">{modal.clue.question}</div>
            </div>

            <div className="mt-3">
              <div className="text-sm uppercase tracking-wide text-gray-500">
                Your Answer (optional)
              </div>
              <input
                className="border rounded-md px-3 py-2 w-full"
                placeholder="Type answer here… (for your reference)"
                value={guess}
                onChange={(e) => setGuess(e.target.value)}
              />

              <div className="mt-2 flex gap-2">
                <button
                  className="btn-judge"
                  style={{
                    background: "#059669",
                    color: "#fff",
                    borderColor: "#047857",
                  }}
                  onClick={onMarkCorrect}
                >
                  ✓ Correct
                </button>
                <button
                  className="btn-judge"
                  style={{
                    background: "#e11d48",
                    color: "#fff",
                    borderColor: "#be123c",
                  }}
                  onClick={onMarkIncorrect}
                >
                  ✗ Incorrect
                </button>
              </div>

              <div className="mt-2 text-sm">
                {result &&
                  (result.startsWith("✅") ? (
                    <span className="text-green-700 font-semibold">
                      {result}
                    </span>
                  ) : (
                    <span className="text-red-700 font-semibold">{result}</span>
                  ))}
              </div>
            </div>

            <div className="mt-3">
              <div className="text-sm uppercase tracking-wide text-gray-500">
                Official Answer
              </div>
              <details className="mt-1">
                <summary className="cursor-pointer select-none inline-block px-3 py-1.5 rounded-lg border bg-indigo-600 text-white">
                  Show Answer
                </summary>
                <div className="mt-2 text-lg font-semibold text-indigo-800">
                  {modal.clue.answer}
                </div>
              </details>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <button
                className="px-3 py-2 rounded-lg border"
                onClick={() => {
                  markUsed(modal.cIdx, modal.rIdx);
                  setModal(null);
                }}
              >
                Pass / Mark Used
              </button>
              <div className="text-sm text-gray-600">
                Next turn:{" "}
                <b>
                  {players[(active + 1) % Math.max(players.length, 1)]?.name}
                </b>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// ---------- Wonder Wheel (SVG, Wheel-of-Fortune style) ----------
const WW_WEDGES = [
  { label: "$300", type: "points", value: 300, color: "#2563eb" },
  { label: "$450", type: "points", value: 450, color: "#10b981" },
  { label: "$500", type: "points", value: 500, color: "#f59e0b" },
  { label: "$650", type: "points", value: 650, color: "#9333ea" },
  { label: "$700", type: "points", value: 700, color: "#ef4444" },
  { label: "BANKRUPT", type: "bankrupt", value: 0, color: "#111827" },
  { label: "$800", type: "points", value: 800, color: "#0ea5e9" },
  { label: "$900", type: "points", value: 900, color: "#db2777" },
  { label: "LOSE A TURN", type: "lose", value: 0, color: "#6b7280" },
  { label: "$1000", type: "points", value: 1000, color: "#22c55e" },
  { label: "DOUBLE", type: "double", value: 200, color: "#8b5cf6" },
  { label: "BONUS +$200", type: "bonus", value: 200, color: "#14b8a6" },
];

function WonderWheel({ vocab, players, setPlayers }) {
  // Geometry (smaller so it doesn't cover RHS modules)
  const SIZE = 440;
  const R = SIZE / 2;
  const R_OUTER = R - 8;
  const R_INNER = R * 0.16;
  const SEG = 360 / WW_WEDGES.length;

  // Spin state
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState(null);
  const [canGuess, setCanGuess] = useState(false);
  const [currentDeg, setCurrentDeg] = useState(0);
  const groupRef = useRef(null);

  // Puzzle state
  const bank = useMemo(
    () =>
      (vocab || [])
        .map((v) => String(v.term || "").trim())
        .filter((t) => t.length >= 3)
        .slice(0, 20),
    [vocab]
  );

  // Definition map for context hints
  const defMap = useMemo(() => {
    const map = {};
    (vocab || []).forEach((v) => {
      if (v?.term)
        map[String(v.term).toUpperCase()] = String(v.definition || "");
    });
    return map;
  }, [vocab]);

  const [puzzleIdx, setPuzzleIdx] = useState(0);
  const [guessed, setGuessed] = useState(new Set());
  const [active, setActive] = useState(0);

  // Two hint counters + shown context hints
  const [letterHintsLeft, setLetterHintsLeft] = useState(3);
  const [contextHintsLeft, setContextHintsLeft] = useState(3);
  const [contextHints, setContextHints] = useState([]);

  const phrase = useMemo(
    () => (bank[puzzleIdx] || "").toUpperCase(),
    [bank, puzzleIdx]
  );
  const masked = useMemo(
    () =>
      phrase
        .split("")
        .map((ch) => (!/[A-Z]/.test(ch) ? ch : guessed.has(ch) ? ch : "▢"))
        .join(""),
    [phrase, guessed]
  );
  const remainingLetters = useMemo(
    () =>
      phrase.split("").filter((ch) => /[A-Z]/.test(ch) && !guessed.has(ch))
        .length,
    [phrase, guessed]
  );
  const misses = useMemo(
    () =>
      Array.from(guessed)
        .filter((L) => /[A-Z]/.test(L) && !phrase.includes(L))
        .sort(),
    [guessed, phrase]
  );

  // Audio (tiny beeps)
  const audioCtxRef = useRef(null);
  function ctx() {
    if (!audioCtxRef.current) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      audioCtxRef.current = new Ctx();
    }
    return audioCtxRef.current;
  }
  function beep(freq = 800, duration = 0.08, type = "square", gain = 0.05) {
    const ac = ctx();
    ac.resume();
    const now = ac.currentTime;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    g.gain.setValueAtTime(gain, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(g).connect(ac.destination);
    osc.start(now);
    osc.stop(now + duration);
  }
  const spinTimer = useRef(null);
  function playSpinStart() {
    let t = 0;
    spinTimer.current = setInterval(() => {
      beep(600 + Math.sin(t / 2) * 200, 0.05, "square", 0.06);
      t++;
    }, 120);
  }
  function playSpinStop() {
    if (spinTimer.current) clearInterval(spinTimer.current);
    spinTimer.current = null;
  }
  function playSuccess() {
    beep(880, 0.1, "sine", 0.08);
    setTimeout(() => beep(1046, 0.12, "sine", 0.08), 120);
  }
  function playFail() {
    beep(220, 0.12, "sawtooth", 0.09);
    setTimeout(() => beep(180, 0.14, "sawtooth", 0.09), 120);
  }

  useEffect(() => {
    setGuessed(new Set());
    setResult(null);
    setCanGuess(false);
    setLetterHintsLeft(3);
    setContextHintsLeft(3);
    setContextHints([]);
  }, [puzzleIdx]);

  function award(delta, playerIdx = active) {
    setPlayers((prev) => {
      const arr = [...prev];
      arr[playerIdx] = {
        ...arr[playerIdx],
        score: (arr[playerIdx].score || 0) + delta,
      };
      return arr;
    });
  }
  function setScoreZero(playerIdx = active) {
    setPlayers((prev) => {
      const arr = [...prev];
      arr[playerIdx] = { ...arr[playerIdx], score: 0 };
      return arr;
    });
  }
  function nextPlayer() {
    setActive((a) => (players.length ? (a + 1) % players.length : 0));
  }

  // Geometry helpers for SVG ring sectors
  function polar(r, deg) {
    const rad = (deg * Math.PI) / 180;
    return { x: r * Math.cos(rad), y: r * Math.sin(rad) };
  }
  function ringSectorPath(rInner, rOuter, a0, a1) {
    const large = a1 - a0 > 180 ? 1 : 0;
    const p0 = polar(rOuter, a0);
    const p1 = polar(rOuter, a1);
    const p2 = polar(rInner, a1);
    const p3 = polar(rInner, a0);
    return [
      `M ${p0.x} ${p0.y}`,
      `A ${rOuter} ${rOuter} 0 ${large} 1 ${p1.x} ${p1.y}`,
      `L ${p2.x} ${p2.y}`,
      `A ${rInner} ${rInner} 0 ${large} 0 ${p3.x} ${p3.y}`,
      "Z",
    ].join(" ");
  }

  // ---------- SPIN (fixed alignment with top pointer at -90°) ----------
  function spin() {
    if (spinning) return;
    setSpinning(true);
    setCanGuess(false);
    playSpinStart();

    // choose target wedge index
    const idx = Math.floor(Math.random() * WW_WEDGES.length);
    // angle that puts wedge center under the pointer
    const targetAlpha = (360 - (idx * SEG + SEG / 2)) % 360;
    const now = ((currentDeg % 360) + 360) % 360;
    const forward = (targetAlpha - now + 360) % 360;

    const extraSpins = 6 + Math.floor(Math.random() * 3); // 6–8 spins
    const jitter = (Math.random() - 0.5) * (SEG * 0.4); // stay inside wedge
    const delta = extraSpins * 360 + forward + jitter;
    const target = currentDeg + delta;

    if (groupRef.current) {
      groupRef.current.style.transition =
        "transform 3.1s cubic-bezier(.17,.67,.32,1)";
      groupRef.current.style.transform = `rotate(${target}deg)`;
    }

    setTimeout(() => {
      setCurrentDeg(target);
      setSpinning(false);
      playSpinStop();
      const wedge = WW_WEDGES[idx];
      setResult(wedge);
      if (wedge.type === "lose") {
        playFail();
        nextPlayer();
      } else if (wedge.type === "bankrupt") {
        playFail();
        setScoreZero();
        nextPlayer();
      } else {
        setCanGuess(true);
      }
    }, 3200);
  }

  // Guessing
  function onGuessLetter(L) {
    if (!canGuess) return;
    const letter = (L || "").toUpperCase();
    if (!/^[A-Z]$/.test(letter)) return;
    if (guessed.has(letter)) {
      playFail();
      return;
    }
    const set = new Set(guessed);
    set.add(letter);
    const matches = phrase.split("").filter((ch) => ch === letter).length;

    let per = 0;
    let bonus = 0;
    if (result?.type === "points") per = result.value;
    if (result?.type === "double") per = 200;
    if (result?.type === "bonus") {
      per = 100;
      if (matches > 0) bonus = 200;
    }

    if (matches > 0) {
      award(matches * per + bonus);
      playSuccess();
      setGuessed(set);
      if (remainingLetters - matches <= 0) {
        award(200);
        confetti({ particleCount: 160, spread: 70, origin: { y: 0.6 } });
        setTimeout(
          () => setPuzzleIdx((i) => (bank.length ? (i + 1) % bank.length : 0)),
          600
        );
      } else {
        setCanGuess(false);
      }
    } else {
      setGuessed(set);
      playFail();
      nextPlayer();
      setCanGuess(false);
    }
  }

  function onSolve(e) {
    e.preventDefault();
    const guess = cleanCompare(e.target.elements.solve.value);
    e.target.reset();
    if (!guess) return;
    if (guess === cleanCompare(phrase)) {
      award(500);
      playSuccess();
      confetti({ particleCount: 200, spread: 80, origin: { y: 0.6 } });
      setTimeout(
        () => setPuzzleIdx((i) => (bank.length ? (i + 1) % bank.length : 0)),
        400
      );
    } else {
      award(-100);
      playFail();
      nextPlayer();
    }
  }

  // ---------- Hint systems ----------
  // 1) Reveal Letter
  function useLetterHint() {
    if (letterHintsLeft <= 0 || !phrase) return;
    const remaining = phrase
      .split("")
      .map((ch) => ch)
      .filter((ch) => /[A-Z]/.test(ch) && !guessed.has(ch));

    if (!remaining.length) return;

    const vowels = new Set(["A", "E", "I", "O", "U"]);
    const consonants = remaining.filter((ch) => !vowels.has(ch));
    const pool = consonants.length ? consonants : remaining;
    const pick = pool[Math.floor(Math.random() * pool.length)];

    const set = new Set(guessed);
    set.add(pick);
    setGuessed(set);
    setLetterHintsLeft((h) => h - 1);
    playSuccess();

    const newlyRevealed = phrase.split("").filter((ch) => ch === pick).length;
    if (remainingLetters - newlyRevealed <= 0) {
      award(200);
      confetti({ particleCount: 160, spread: 70, origin: { y: 0.6 } });
      setTimeout(
        () => setPuzzleIdx((i) => (bank.length ? (i + 1) % bank.length : 0)),
        600
      );
    }
  }

  // 2) Context Hint — uses vocab definition with masking
  function maskTermInText(text, term) {
    if (!text) return "";
    try {
      const re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig");
      return text.replace(re, "_____");
    } catch {
      return text;
    }
  }
  function firstWords(s, n = 10) {
    const parts = String(s || "")
      .split(/\s+/)
      .filter(Boolean);
    const t = parts.slice(0, n).join(" ");
    return parts.length > n ? t + "…" : t;
  }
  function useContextHint() {
    if (contextHintsLeft <= 0 || !phrase) return;
    const def = defMap[phrase] || "";
    let masked = maskTermInText(def, phrase);
    if (!masked) masked = "A key term from the article.";

    const step = 3 - contextHintsLeft; // 0,1,2
    let text = "";
    if (step === 0)
      text = `It’s a ${phrase.length}-letter word. Clue: ${firstWords(
        masked,
        8
      )}`;
    else if (step === 1) text = `Think about: ${masked}`;
    else {
      const first = phrase[0];
      text = `More specific: ${masked} (starts with “${first}”).`;
    }

    setContextHints((prev) => [...prev, text]);
    setContextHintsLeft((h) => h - 1);
    playSuccess();
  }

  // Label helpers
  function fontSizeFor(label) {
    const base = 26; // tuned for the smaller wheel
    const len = String(label).length;
    if (len <= 6) return base + 4;
    if (len <= 10) return base;
    return base - 4;
  }
  // NEW: wrap special labels to two lines
  function wrapWheelLabel(label) {
    const L = String(label).toUpperCase();
    if (L.includes("LOSE A TURN")) return ["LOSE", "A TURN"];
    if (L.includes("BONUS")) {
      const rest = L.replace(/BONUS/i, "").trim(); // "+$200" / "+200"
      return ["BONUS", rest || "+$200"];
    }
    if (L.includes("BANKRUPT")) return ["BANK", "RUPT"]; // compact and readable
    return [label];
  }

  return (
    <section className="border rounded-2xl p-4 sm:p-6 bg-white shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-xl">Wonder Wheel</h3>
        {/* Scoreboard */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pl-2">
          {players.map((p, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              className={cx(
                "whitespace-nowrap rounded-full px-3 py-1.5 border text-sm font-semibold",
                i === active
                  ? "bg-emerald-400 border-emerald-500 text-gray-900"
                  : "bg-white border-gray-300"
              )}
              title="Set active player"
            >
              {(i === active ? "🎯 " : "") + (p.name || `Player ${i + 1}`)} · $
              {p.score || 0}
            </button>
          ))}
          <button
            className="whitespace-nowrap rounded-full px-3 py-1.5 border text-sm font-semibold bg-white"
            onClick={() =>
              setPlayers((prev) => [
                ...prev,
                { name: `Player ${prev.length + 1}`, score: 0 },
              ])
            }
          >
            + Add
          </button>
        </div>
      </div>

      <div className="mt-4 grid lg:grid-cols-2 gap-8 items-center">
        {/* WHEEL (SVG) */}
        <div
          className="relative mx-auto"
          style={{ width: SIZE, maxWidth: "100%" }}
        >
          {/* pointer at top */}
          <div
            style={{
              position: "absolute",
              top: -16,
              left: "50%",
              transform: "translateX(-50%)",
              width: 0,
              height: 0,
              borderLeft: "12px solid transparent",
              borderRight: "12px solid transparent",
              borderBottom: "22px solid #111827",
              zIndex: 5,
            }}
          />
          <svg
            width={SIZE}
            height={SIZE}
            viewBox={`${-R} ${-R} ${SIZE} ${SIZE}`}
            style={{
              display: "block",
              background: "#ffffff",
              borderRadius: "50%",
              boxShadow: "0 14px 38px rgba(0,0,0,.18)",
              border: "10px solid white",
            }}
          >
            <g ref={groupRef}>
              {/* Wedges */}
              {WW_WEDGES.map((w, i) => {
                const a0 = i * SEG - 90; // start angle (top = -90deg)
                const a1 = a0 + SEG;
                const mid = (a0 + a1) / 2;

                // word wrap + font sizing
                const lines = wrapWheelLabel(w.label);
                let fs = fontSizeFor(w.label);
                if (lines.length > 1) fs = Math.max(18, fs - 2);
                const lineHeight = fs * 0.9;
                const dy0 = (-lineHeight * (lines.length - 1)) / 2;

                const isDark = w.color === "#111827" || w.color === "#6b7280";

                return (
                  <g key={i}>
                    <path
                      d={ringSectorPath(R_INNER, R_OUTER, a0, a1)}
                      fill={w.color}
                      stroke="#ffffff"
                      strokeWidth={2}
                    />
                    {/* Label near outer rim, tangent; pull slightly inward if multi-line */}
                    <g
                      transform={`rotate(${mid}) translate(${
                        R_OUTER - (lines.length > 1 ? 48 : 40)
                      },0) rotate(90)`}
                    >
                      <text
                        textAnchor="middle"
                        dominantBaseline="middle"
                        style={{
                          fontWeight: 900,
                          fontSize: fs,
                          letterSpacing: "0.02em",
                          fill: "#ffffff",
                          paintOrder: "stroke",
                          stroke: isDark ? "#000000" : "rgba(0,0,0,.75)",
                          strokeWidth: 4,
                        }}
                      >
                        {lines.map((ln, j) => (
                          <tspan key={j} x="0" dy={j === 0 ? dy0 : lineHeight}>
                            {ln}
                          </tspan>
                        ))}
                      </text>
                    </g>
                  </g>
                );
              })}

              {/* Center hub */}
              <circle
                r={R_INNER}
                fill="#111827"
                stroke="#e5e7eb"
                strokeWidth="2"
              />
              <circle r={R_INNER - 8} fill="#1f2937" />
            </g>
          </svg>

          <div className="mt-3 text-center">
            <button
              onClick={spin}
              disabled={spinning}
              className="px-4 py-2 rounded-xl text-white"
              style={{ background: "linear-gradient(90deg,#22d3ee,#a78bfa)" }}
            >
              {spinning ? "Spinning…" : "Spin Wonder Wheel"}
            </button>
            {result && (
              <div className="mt-2 text-sm">
                Result: <b>{result.label}</b>{" "}
                {canGuess ? "— type a letter!" : ""}
              </div>
            )}
          </div>
        </div>

        {/* PUZZLE + HINTS */}
        <div>
          <div className="rounded-2xl p-4 border bg-gradient-to-br from-indigo-50 to-teal-50">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs uppercase tracking-wide text-gray-500">
                Puzzle
              </div>

              <div className="flex gap-2">
                {/* Context Hint */}
                <button
                  onClick={useContextHint}
                  disabled={contextHintsLeft <= 0 || !phrase}
                  className={cx(
                    "px-3 py-1.5 rounded-lg border text-sm font-semibold",
                    contextHintsLeft > 0
                      ? "bg-white hover:bg-gray-50"
                      : "bg-gray-200 cursor-not-allowed"
                  )}
                  title="Give a definition-style clue"
                >
                  🧭 Context Hint ({contextHintsLeft} left)
                </button>

                {/* Reveal Letter */}
                <button
                  onClick={useLetterHint}
                  disabled={letterHintsLeft <= 0 || !phrase}
                  className={cx(
                    "px-3 py-1.5 rounded-lg border text-sm font-semibold",
                    letterHintsLeft > 0
                      ? "bg-white hover:bg-gray-50"
                      : "bg-gray-200 cursor-not-allowed"
                  )}
                  title="Reveal one hidden letter"
                >
                  💡 Reveal Letter ({letterHintsLeft} left)
                </button>
              </div>
            </div>

            {/* Show any context hints issued */}
            {contextHints.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {contextHints.map((h, i) => (
                  <span
                    key={i}
                    className="inline-block px-3 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-200 text-sm"
                  >
                    {h}
                  </span>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-1 mt-2">
              {masked.split("").map((ch, i) => (
                <div
                  key={i}
                  style={{
                    width: 42,
                    height: 50,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 10,
                    background: "#f1f5f9",
                    border: "1px solid #e2e8f0",
                    fontWeight: 800,
                    fontSize: 18,
                  }}
                >
                  {ch}
                </div>
              ))}
            </div>

            <div className="mt-3 text-xs text-gray-600 flex items-center gap-3">
              <span>
                Letters remaining: <b>{remainingLetters}</b>
              </span>
              <span className="text-gray-400">|</span>
              <span>
                Misses:{" "}
                {misses.length ? (
                  misses.join(", ")
                ) : (
                  <span className="text-gray-400">None</span>
                )}
              </span>
            </div>
          </div>

          {/* Type a letter */}
          <form
            className="mt-4 flex gap-2 items-center"
            onSubmit={(e) => {
              e.preventDefault();
              const inp = e.currentTarget.elements.letter;
              const L = String(inp.value || "")
                .trim()
                .slice(0, 1)
                .toUpperCase();
              inp.value = "";
              if (!/^[A-Z]$/.test(L)) return;
              onGuessLetter(L);
            }}
          >
            <div>
              <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">
                Type a letter
              </div>
              <input
                name="letter"
                maxLength={1}
                className="border rounded-md px-3 py-2 w-24 text-center text-lg"
                placeholder="A"
                disabled={!canGuess}
              />
            </div>
            <button
              className="px-3 py-2 rounded-md text-white"
              style={{
                background: canGuess
                  ? "linear-gradient(90deg,#34d399,#60a5fa)"
                  : "#cbd5e1",
              }}
              disabled={!canGuess}
            >
              Guess
            </button>
          </form>

          {/* Solve */}
          <form onSubmit={onSolve} className="mt-4 flex gap-2">
            <input
              name="solve"
              className="border rounded-md px-3 py-2 flex-1"
              placeholder="Type full answer to solve…"
            />
            <button
              className="px-3 py-2 rounded-md text-white"
              style={{ background: "linear-gradient(90deg,#34d399,#60a5fa)" }}
            >
              Solve (+500)
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}

// ---------- Main App ----------
export default function App() {
  const [apiKey, setApiKey] = useState("");
  const [mode, setMode] = useState("url");
  const [url, setUrl] = useState("");
  const [rawText, setRawText] = useState("");

  const [summary, setSummary] = useState("");
  const [vocab, setVocab] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [board, setBoard] = useState(null);
  const [players, setPlayers] = useState([
    { name: "Player 1", score: 0 },
    { name: "Player 2", score: 0 },
  ]);

  // Ensure Tailwind once
  useEffect(() => {
    const id = "tailwind-cdn";
    if (!document.getElementById(id)) {
      const l = document.createElement("link");
      l.id = id;
      l.rel = "stylesheet";
      l.href =
        "https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css";
      document.head.appendChild(l);
    }
  }, []);

  async function onBuild() {
    setError("");
    setLoading(true);
    try {
      if (!apiKey) throw new Error("Please enter your Gemini API key.");

      let text = rawText;
      if (mode === "url") {
        if (!url) throw new Error("Enter a URL or switch to Paste Text.");
        text = await proxyFetchText(url);
      }
      if (!text || text.length < 60)
        throw new Error("Not enough text to summarize.");

      // 1) summary + vocab
      const out = await geminiSummarizeAndVocab({ apiKey, text });
      const cleanedVocab = (out.vocab || [])
        .map((v) => ({
          term: String(v.term || "").trim(),
          definition: String(v.definition || "").trim(),
        }))
        .filter((v) => v.term && v.definition)
        .slice(0, 16);

      setSummary(out.summary || "");
      setVocab(cleanedVocab);

      // 2) Teacher's Trivia board
      const b = await geminiBuildJeopardy({ apiKey, text });
      setBoard(b);

      setTimeout(
        () =>
          window.scrollTo({
            top: document.body.scrollHeight,
            behavior: "smooth",
          }),
        50
      );
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <main className="max-w-6xl mx-auto p-4 sm:p-6 space-y-5">
        <ApiKeyPanel apiKey={apiKey} setApiKey={setApiKey} />
        <SourceInput
          mode={mode}
          setMode={setMode}
          url={url}
          setUrl={setUrl}
          rawText={rawText}
          setRawText={setRawText}
        />

        <section className="border rounded-2xl p-4 sm:p-5 bg-white shadow-sm flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-lg">Build Lesson</h2>
            <p className="text-sm text-gray-600">
              Summarize → extract vocab → create games (Teacher’s Trivia, Wonder
              Wheel).
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onBuild}
              disabled={loading}
              className="px-4 py-2 rounded-xl bg-indigo-600 text-white disabled:opacity-60"
            >
              {loading ? "Building…" : "Summarize & Build Games"}
            </button>
          </div>
        </section>

        {error && (
          <div className="border border-red-300 bg-red-50 text-red-800 rounded-xl p-3">
            {error}
          </div>
        )}

        <SummaryCard summary={summary} />
        <VocabList vocab={vocab} />

        {board && (
          <TeachersTrivia
            board={board}
            players={players}
            setPlayers={setPlayers}
          />
        )}

        {vocab?.length > 0 && (
          <WonderWheel
            vocab={vocab}
            players={players}
            setPlayers={setPlayers}
          />
        )}
      </main>
    </div>
  );
}
