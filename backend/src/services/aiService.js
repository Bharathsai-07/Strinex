async function generateRunAnalysis({
  distance,
  duration,
  pace,
  streak,
  userPrompt = "",
  systemInstruction = "",
  runContext = {},
}) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const baseUrl = process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/models";

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const configuredMaxOutputTokens = Number(process.env.GEMINI_MAX_OUTPUT_TOKENS);
  const maxOutputTokens = Number.isFinite(configuredMaxOutputTokens) && configuredMaxOutputTokens > 0
    ? Math.floor(configuredMaxOutputTokens)
    : 2048;

  const configuredContinuationTurns = Number(process.env.GEMINI_CONTINUATION_TURNS);
  const maxContinuationTurns = Number.isFinite(configuredContinuationTurns) && configuredContinuationTurns > 0
    ? Math.floor(configuredContinuationTurns)
    : 3;

  const baseContext = [
    "You are STRINEX AI Coach. Give concise, practical post-run coaching.",
    `Distance (km): ${distance}`,
    `Duration (seconds): ${duration}`,
    `Average pace (min/km): ${pace}`,
    `Current streak (days): ${streak.currentStreak}`,
    `Longest streak (days): ${streak.longestStreak}`,
  ];

  if (runContext && typeof runContext === "object") {
    if (runContext.calories != null) baseContext.push(`Estimated calories: ${runContext.calories}`);
    if (runContext.timestamp) baseContext.push(`Run timestamp: ${runContext.timestamp}`);
    if (runContext.gpsPoints != null) baseContext.push(`GPS points logged: ${runContext.gpsPoints}`);
  }

  const normalizedPrompt = String(userPrompt || "").trim();
  const prompt = normalizedPrompt
    ? [
        ...baseContext,
        "",
        "User question:",
        normalizedPrompt,
        "",
        "Answer in concise bullet points tied to these run metrics.",
      ].join("\n")
    : [
        ...baseContext,
        "Return advice in 4 bullet sections:",
        "1) Recovery tips",
        "2) Hydration advice",
        "3) Training recommendation for next run",
        "4) Streak consistency tip",
        "Keep it under 180 words.",
      ].join("\n");

  const fullInstruction = [
    "You are STRINEX AI Coach.",
    systemInstruction || "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const geminiUrl = `${baseUrl}/${model}:generateContent?key=${apiKey}`;
  console.log(`[aiService] Calling Gemini: ${baseUrl}/${model}:generateContent`);
  console.log(`[aiService] API key (last 6): ...${apiKey.slice(-6)}`);

  let combinedText = "";
  let currentPrompt = prompt;

  for (let turn = 0; turn < maxContinuationTurns; turn++) {
    const response = await fetch(geminiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: currentPrompt }],
          },
        ],
        system_instruction: {
          parts: [{ text: fullInstruction }],
        },
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens,
        },
      }),
    });

    console.log(`[aiService] Gemini response status: ${response.status}`);

    if (!response.ok) {
      const body = await response.text();
      const bodyLower = body.toLowerCase();
      console.log(`[aiService] ⚠️ Gemini error (${response.status}): ${body.substring(0, 200)}`);
      // Catch quota exhaustion errors (429, 400 with quota message, etc.)
      if (response.status === 429 || bodyLower.includes("quota")) {
        console.log(`[aiService] → Quota exhausted, using offline fallback`);
        return _buildQuotaFallback({
          distance,
          duration,
          pace,
          streak,
          userPrompt: normalizedPrompt,
          runContext,
        });
      }

      if (response.status === 503 || bodyLower.includes("unavailable") || bodyLower.includes("high demand")) {
        console.log(`[aiService] → Model unavailable, using offline fallback`);
        return _buildQuotaFallback({
          distance,
          duration,
          pace,
          streak,
          userPrompt: normalizedPrompt,
          runContext,
        });
      }

      if (bodyLower.includes("api_key_invalid") || bodyLower.includes("api key not valid")) {
        throw new Error("Gemini API key is invalid. Update GEMINI_API_KEY in .env with a valid key from Google AI Studio and restart backend.");
      }

      throw new Error(`Gemini API error (${response.status}): ${body}`);
    }

    const data = await response.json();

    // Check if response contains error (sometimes Gemini returns 200 with error in body)
    if (data?.error?.message && data.error.message.toLowerCase().includes("quota")) {
      return _buildQuotaFallback({
        distance,
        duration,
        pace,
        streak,
        userPrompt: normalizedPrompt,
        runContext,
      });
    }

    if (data?.error?.status && String(data.error.status).toLowerCase() === "unavailable") {
      return _buildQuotaFallback({
        distance,
        duration,
        pace,
        streak,
        userPrompt: normalizedPrompt,
        runContext,
      });
    }

    const candidate = data?.candidates?.[0] || {};
    const parts = candidate?.content?.parts || [];
    const chunk = parts.map((part) => part?.text || "").join("\n").trim();

    if (chunk) {
      combinedText = _mergeWithoutOverlap(combinedText, chunk);
    }

    const finishReason = String(candidate?.finishReason || "").toUpperCase();
    if (finishReason !== "MAX_TOKENS") {
      break;
    }

    // Ask for a strict continuation when the model stops due to output token cap.
    const tail = combinedText.slice(-1800);
    currentPrompt = [
      "Continue the exact same answer from where you stopped.",
      "Do not restart and do not repeat prior lines.",
      "Return only the continuation.",
      "",
      "Original prompt:",
      prompt,
      "",
      "Already generated tail:",
      tail,
    ].join("\n");
  }

  console.log(`[aiService] ✅ Gemini returned ${combinedText.length} chars of text`);
  return combinedText || "No AI feedback generated.";
}

function _mergeWithoutOverlap(existing, incoming) {
  if (!existing) return incoming;
  if (!incoming) return existing;

  const maxOverlap = Math.min(existing.length, incoming.length, 400);
  for (let overlap = maxOverlap; overlap > 0; overlap--) {
    if (existing.slice(-overlap) === incoming.slice(0, overlap)) {
      return existing + incoming.slice(overlap);
    }
  }

  return `${existing}\n${incoming}`;
}

function _formatPace(secondsPerKm) {
  if (!Number.isFinite(secondsPerKm) || secondsPerKm <= 0) return "--:--";
  const minutes = Math.floor(secondsPerKm / 60);
  const seconds = Math.round(secondsPerKm % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function _buildQuotaFallback({ distance, duration, pace, streak, userPrompt, runContext }) {
  const paceLabel = _formatPace(Number(pace) * 60);
  const calories = runContext?.calories != null ? `${runContext.calories}` : "N/A";
  const points = runContext?.gpsPoints != null ? `${runContext.gpsPoints}` : "N/A";
  const prompt = String(userPrompt || "").toLowerCase();

  if (prompt.includes("hydration") || prompt.includes("water") || prompt.includes("meal") || prompt.includes("diet")) {
    return [
      "AI quota is temporarily exhausted, so I’m using offline coaching mode.",
      "",
      "- Hydration: drink 500-750 ml water over the next hour, then sip regularly through the day.",
      "- Food: choose a carb + protein meal now, such as rice with eggs/chicken/tofu, or yogurt with fruit and oats.",
      "- Recovery: 5-10 minutes of easy walking plus light hamstring, calf, and hip flexor stretching.",
      `- Run context: ${distance} km in ${duration}s, pace ${paceLabel}/km, streak ${streak.currentStreak}d, calories ${calories}, GPS points ${points}.`,
    ].join("\n");
  }

  return [
    "AI quota is temporarily exhausted, so I’m using offline coaching mode.",
    "",
    `- Run summary: ${distance} km completed with an average pace of ${paceLabel}/km and a current streak of ${streak.currentStreak} day${streak.currentStreak === 1 ? "" : "s"}.`,
    "- Recovery: do a short cooldown walk, rehydrate, and get 7-9 hours of sleep tonight.",
    "- Next run: keep the next session easy if this one felt hard, or add a small distance increase if it felt comfortable.",
    "- Consistency: one run today still counts toward momentum. Keep the streak alive with the next planned session.",
    `- Run context: calories ${calories}, GPS points ${points}.`,
    "",
    "If you want the full Gemini response, the backend API key needs an active paid quota/billing allowance.",
  ].join("\n");
}

module.exports = {
  generateRunAnalysis,
};
