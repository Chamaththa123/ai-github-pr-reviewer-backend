const axios = require("axios");
const Review = require("../models/Review");
const { analyzePRWithAST } = require("../services/geminiService");
const crypto = require("crypto");

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || "";

function verifySignature(req) {
  if (!WEBHOOK_SECRET) return true; // skip if no secret

  const sig = req.headers["x-hub-signature-256"];
  const hmac = crypto.createHmac("sha256", WEBHOOK_SECRET);
  const digest =
    "sha256=" + hmac.update(JSON.stringify(req.body)).digest("hex");
  return sig === digest;
}

const handlePRWebhook = async (req, res) => {
  try {
    // Uncomment for production
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

    const commitMessages = commitsRes.data
      .map((c) => c.commit.message)
      .join("\n");

    // Fetch changed files with raw content
    const filesRes = await axios.get(
      `https://api.github.com/repos/${repo}/pulls/${pullRequestId}/files`,
      { headers: { Authorization: `token ${GITHUB_TOKEN}` } }
    );

    const files = await Promise.all(
      filesRes.data.map(async (f) => {
        let content = "";

        // Get file content for AST analysis
        if (
          f.status !== "removed" &&
          (f.filename.endsWith(".js") ||
            f.filename.endsWith(".ts") ||
            f.filename.endsWith(".jsx") ||
            f.filename.endsWith(".tsx"))
        ) {
          try {
            const contentRes = await axios.get(f.contents_url, {
              headers: { Authorization: `token ${GITHUB_TOKEN}` },
            });
            content = Buffer.from(contentRes.data.content, "base64").toString(
              "utf8"
            );
          } catch (err) {
            console.warn(
              `Failed to fetch content for ${f.filename}:`,
              err.message
            );
          }
        }

        return {
          filename: f.filename,
          patch: f.patch || "",
          content: content,
          status: f.status,
          additions: f.additions,
          deletions: f.deletions,
        };
      })
    );

    // Enhanced analysis with AST + AI
    const analysisResult = await analyzePRWithAST(commitMessages, files);

    // Check if analysis was successful
    if (analysisResult.error) {
      console.error("Enhanced Analysis failed:", analysisResult.error);
    }

    const codeFileTypes = [
      ...new Set(
        files
          .filter((f) =>
            f.filename.match(/\.(js|ts|jsx|tsx|py|java|cs|php|go|rb|html|css)$/)
          )
          .map((f) => f.filename.substring(f.filename.lastIndexOf(".")))
      ),
    ];

    // Save to DB with enhanced schema structure
    const review = new Review({
      repo,
      pullRequestId,
      commitMessage: commitMessages,
      reviewComments: "Enhanced Automated Review with AST Analysis",
      issues: analysisResult.issues || [],
      summary: analysisResult.summary || {
        total: 0,
        bySeverity: {},
        byType: {},
      },
      astFindings: analysisResult.astFindings || [],
      securityScore: analysisResult.securityScore || 0,
      status: analysisResult.error ? "failed" : "completed",
      analysisMetadata: {
        filesAnalyzed: files.length,
        astAnalysisPerformed: analysisResult.astAnalysisPerformed || false,
        analysisTimestamp: new Date(),
        codeFileTypes: codeFileTypes,
      },
      performanceMetrics: analysisResult.performanceMetrics || {
        totalAnalysisTime: 0,
        astAnalysisTime: 0,
        aiAnalysisTime: 0,
        memoryUsage: 0,
      },
    });

    const savedReview = await review.save();

    console.log(`Enhanced review saved for PR #${pullRequestId} in ${repo}`);
    console.log(`Found ${analysisResult.issues?.length || 0} issues`);
    console.log(`Security Score: ${analysisResult.securityScore || 0}/100`);

    res.status(200).json({
      message: "Enhanced review created",
      reviewId: savedReview._id,
      issuesFound: analysisResult.issues?.length || 0,
      summary: analysisResult.summary,
      securityScore: analysisResult.securityScore,
      astAnalysisPerformed: analysisResult.astAnalysisPerformed,
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
        summary: { total: 0, bySeverity: {}, byType: {} },
        astFindings: [],
        securityScore: 0,
        status: "error",
      });

      await errorReview.save();
    } catch (saveError) {
      console.error("Failed to save error state:", saveError);
    }

    res.status(500).json({
      message: "Error processing PR webhook",
      error: err.message,
    });
  }
};

module.exports = { handlePRWebhook };
