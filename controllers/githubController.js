const axios = require("axios");
const Review = require("../models/Review");
const { analyzePR } = require("../services/geminiService");
const crypto = require("crypto");

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
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
    // if (!verifySignature(req)) {
    //   return res.status(401).json({ message: "Webhook signature mismatch" });
    // }

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

    // Analyze with Gemini AI - now returns parsed JSON object
    const analysisResult = await analyzePR(commitMessages, files);

    // Check if analysis was successful
    if (analysisResult.error) {
      console.error("AI Analysis failed:", analysisResult.error);
    }

    // Save to DB with new schema structure
    const review = new Review({
      repo,
      pullRequestId,
      commitMessage: commitMessages,
      reviewComments: "Automated Review",
      issues: analysisResult.issues || [], // Save issues as array of subdocuments
      summary: analysisResult.summary || { total: 0, bySeverity: {} }, // Save summary as subdocument
      status: analysisResult.error ? "failed" : "completed",
    });

    const savedReview = await review.save();

    console.log(`Review saved for PR #${pullRequestId} in ${repo}`);
    console.log(`Found ${analysisResult.issues?.length || 0} issues`);

    // Optional: Post summary comment back to GitHub PR
    // if (analysisResult.issues && analysisResult.issues.length > 0) {
    //   await postReviewCommentToGitHub(repo, pullRequestId, analysisResult);
    // }

    res.status(200).json({ 
      message: "Review created", 
      reviewId: savedReview._id,
      issuesFound: analysisResult.issues?.length || 0,
      summary: analysisResult.summary
    });

  } catch (err) {
    console.error("Webhook processing error:", err);
    
    // Try to save error state to DB
    try {
      const errorReview = new Review({
        repo: req.body.repository?.full_name || "unknown",
        pullRequestId: req.body.pull_request?.number || 0,
        commitMessage: "Error occurred during processing",
        reviewComments: `Error: ${err.message}`,
        issues: [],
        summary: { total: 0, bySeverity: {} },
        status: "error",
      });
      
      await errorReview.save();
    } catch (saveError) {
      console.error("Failed to save error state:", saveError);
    }

    res.status(500).json({ 
      message: "Error processing PR webhook", 
      error: err.message 
    });
  }
};

module.exports = { handlePRWebhook };
