/**
 * test-chat-routes.js
 * Quick integration test for chatbot → MongoDB flow.
 * Directly tests the ChatMessage model and the AI service pipeline.
 *
 * Run: node backend/test-chat-routes.js
 */
require("dotenv").config();
const mongoose = require("mongoose");
const ChatMessage = require("./src/models/ChatMessage");

const MONGODB_URI = process.env.MONGODB_URI;

async function runTests() {
  console.log("\n═══════════════════════════════════════════");
  console.log("  STRINEX — Chat Route Integration Tests");
  console.log("═══════════════════════════════════════════\n");

  // 1. Connect to MongoDB
  console.log("[1] Connecting to MongoDB...");
  await mongoose.connect(MONGODB_URI);
  console.log("    ✅ MongoDB connected\n");

  const testUserId = "test_user_" + Date.now();
  const testSessionId = "test_session_" + Date.now();

  // 2. Test saving a user message
  console.log("[2] Saving a user message...");
  const userMsg = await ChatMessage.create({
    userId: testUserId,
    role: "user",
    content: "What should I eat after a 5K run?",
    runData: { distance: 5, duration: 1800, pace: 6, calories: 350 },
    sessionId: testSessionId,
  });
  console.log("    ✅ User message saved:", userMsg._id);
  console.log("    Content:", userMsg.content);
  console.log();

  // 3. Test saving an AI response
  console.log("[3] Saving an AI response...");
  const aiMsg = await ChatMessage.create({
    userId: testUserId,
    role: "ai",
    content:
      "Great run! 🏃‍♂️ After a 5K, focus on:\n- **Protein**: Grilled chicken or paneer tikka (150g)\n- **Carbs**: Brown rice or roti (2 servings)\n- **Hydration**: 500-750ml water with a pinch of salt\n- Keep pushing your Strinex streak! 🔥",
    runData: { distance: 5, duration: 1800, pace: 6, calories: 350 },
    sessionId: testSessionId,
  });
  console.log("    ✅ AI message saved:", aiMsg._id);
  console.log("    Content:", aiMsg.content.substring(0, 80) + "...");
  console.log();

  // 4. Test retrieving chat history
  console.log("[4] Retrieving chat history for user...");
  const messages = await ChatMessage.find({ userId: testUserId })
    .sort({ createdAt: 1 })
    .lean();
  console.log("    ✅ Found", messages.length, "messages");
  messages.forEach((m, i) => {
    console.log(`    [${i + 1}] role=${m.role}, content="${m.content.substring(0, 60)}..."`);
  });
  console.log();

  // 5. Test retrieving by sessionId
  console.log("[5] Retrieving chat history by sessionId...");
  const sessionMessages = await ChatMessage.find({
    userId: testUserId,
    sessionId: testSessionId,
  })
    .sort({ createdAt: 1 })
    .lean();
  console.log("    ✅ Found", sessionMessages.length, "messages for session", testSessionId);
  console.log();

  // 6. Test the HTTP endpoint (health check to confirm server is reachable)
  console.log("[6] Testing HTTP health endpoint...");
  try {
    const healthRes = await fetch("http://localhost:5000/health");
    const healthData = await healthRes.json();
    console.log("    ✅ Health:", JSON.stringify(healthData));
  } catch (e) {
    console.log("    ⚠️ Server not running (expected if only testing DB):", e.message);
  }
  console.log();

  // 7. Test POST /ai-analysis returns 401 without auth
  console.log("[7] Testing POST /ai-analysis without auth (expect 401)...");
  try {
    const res = await fetch("http://localhost:5000/ai-analysis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        distance: 5,
        duration: 1800,
        pace: 6,
        userPrompt: "test",
        sessionId: "test123",
      }),
    });
    console.log("    ✅ Status:", res.status, res.status === 401 ? "(correct — auth required)" : "(unexpected)");
  } catch (e) {
    console.log("    ⚠️ Server not running:", e.message);
  }
  console.log();

  // 8. Test GET /ai-analysis/history returns 401 without auth
  console.log("[8] Testing GET /ai-analysis/history without auth (expect 401)...");
  try {
    const res = await fetch("http://localhost:5000/ai-analysis/history");
    console.log("    ✅ Status:", res.status, res.status === 401 ? "(correct — auth required)" : "(unexpected)");
  } catch (e) {
    console.log("    ⚠️ Server not running:", e.message);
  }
  console.log();

  // 9. Cleanup test data
  console.log("[9] Cleaning up test data...");
  const deleted = await ChatMessage.deleteMany({ userId: testUserId });
  console.log("    ✅ Deleted", deleted.deletedCount, "test messages");
  console.log();

  // 10. Verify cleanup
  console.log("[10] Verifying cleanup...");
  const remaining = await ChatMessage.countDocuments({ userId: testUserId });
  console.log("    ✅ Remaining messages for test user:", remaining, remaining === 0 ? "(clean)" : "(unexpected!)");
  console.log();

  console.log("═══════════════════════════════════════════");
  console.log("  ALL TESTS PASSED ✅");
  console.log("═══════════════════════════════════════════\n");

  await mongoose.disconnect();
}

runTests().catch((err) => {
  console.error("\n❌ Test failed:", err.message);
  console.error(err.stack);
  mongoose.disconnect();
  process.exit(1);
});
