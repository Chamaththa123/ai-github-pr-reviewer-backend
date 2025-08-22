const axios = require("axios");
const Review = require("../models/Review");
const { analyzePR } = require("../services/geminiService");
const crypto = require("crypto");

const GITHUB_TOKEN = process.env.GITHUB_TOKEN; // Personal Access Token with repo read access
const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || "";


function verifySignature(req) {
  if (!WEBHOOK_SECRET) return true; // skip if no secret

  const sig = req.headers["x-hub-signature-256"];
  const hmac = crypto.createHmac("sha256", WEBHOOK_SECRET);
  const digest = "sha256=" + hmac.update(JSON.stringify(req.body)).digest("hex");
  return sig === digest;
}

const handlePRWebhook = async (req, res) => {
  try {
    if (!verifySignature(req)) {
      return res.status(401).json({ message: "Webhook signature mismatch" });
    }

    const { action, pull_request, repository } = req.body;

    if (!["opened", "synchronize", "edited"].includes(action)) {
      return res.status(200).json({ message: "Ignored event" });
    }

    const repo = repository.full_name;
    const pullRequestId = pull_request.number;
    const prTitle = pull_request.title;
    const prUrl = pull_request.html_url;

    // Fetch commits for this PR
    const commitsRes = await axios.get(
      `https://api.github.com/repos/${repo}/pulls/${pullRequestId}/commits`,
      { headers: { Authorization: `token ${GITHUB_TOKEN}` } }
    );

    const commitMessages = commitsRes.data.map(c => c.commit.message).join("\n");

    // Fetch changed files
    const filesRes = await axios.get(
      `https://api.github.com/repos/${repo}/pulls/${pullRequestId}/files`,
      { headers: { Authorization: `token ${GITHUB_TOKEN}` } }
    );

    const files = filesRes.data.map(f => ({
      filename: f.filename,
      patch: f.patch || ""
    }));

    // Analyze with Gemini AI
    const aiSuggestions = await analyzePR(commitMessages, files);

    // Save to DB
    const review = new Review({
      repo,
      pullRequestId,
      commitMessage: commitMessages,
      reviewComments: "Automated Review",
      aiSuggestions,
      status: "completed",
    });

    await review.save();

    res.status(200).json({ message: "Review created", review });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error processing PR webhook", error: err.message });
  }
};

module.exports = { handlePRWebhook };
