async function generateRunAnalysis({ distance, duration, pace, streak }) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const baseUrl = process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/models";

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const prompt = [
    "You are STRINEX AI Coach. Give concise, practical post-run coaching.",
    `Distance (km): ${distance}`,
    `Duration (seconds): ${duration}`,
    `Average pace (min/km): ${pace}`,
    `Current streak (days): ${streak.currentStreak}`,
    `Longest streak (days): ${streak.longestStreak}`,
    "Return advice in 4 bullet sections:",
    "1) Recovery tips",
    "2) Hydration advice",
    "3) Training recommendation for next run",
    "4) Streak consistency tip",
    "Keep it under 180 words.",
  ].join("\n");

  const response = await fetch(`${baseUrl}/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 400,
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${body}`);
  }

  const data = await response.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const text = parts.map((part) => part?.text || "").join("\n").trim();

  return text || "No AI feedback generated.";
}

module.exports = {
  generateRunAnalysis,
};
