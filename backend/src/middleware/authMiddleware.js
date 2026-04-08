const { verifyToken } = require("@clerk/backend");

function extractBearerToken(req) {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) return null;
  return authHeader.slice("Bearer ".length).trim();
}

async function requireAuth(req, res, next) {
  try {
    const token = extractBearerToken(req);

    if (!token) {
      return res.status(401).json({ message: "Missing Authorization token." });
    }

    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
    });

    if (!payload || !payload.sub) {
      return res.status(401).json({ message: "Invalid Clerk token." });
    }

    req.auth = {
      userId: payload.sub,
      sessionId: payload.sid || null,
      payload,
    };

    return next();
  } catch (error) {
    return res.status(401).json({ message: "Unauthorized", error: error.message });
  }
}

module.exports = {
  requireAuth,
  extractBearerToken,
};
