const axios = require("axios");
const Review = require("../models/Review");
const { analyzePRWithAST } = require("../services/geminiService");
const crypto = require("crypto");
const { calculateOverallScore } = require("../utils/scoreCalculator");

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || "";

function verifySignature(req) {
  if (!WEBHOOK_SECRET) return true;

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
    const repoId = repository.id;
    const pullRequestId = pull_request.number;
    const prTitle = pull_request.title;
    const prUrl = pull_request.html_url;

    // Contributor info
    const contributorId = pull_request.user.id;
    const contributorUsername = pull_request.user.login;

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

        let additionsOnly = "";
    if (f.patch) {
      additionsOnly = f.patch
        .split("\n")
        .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
        .map((line) => line.slice(1)) // remove `+`
        .join("\n");
    }

        return {
          filename: f.filename,
           patch: additionsOnly,
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

    // Get the next review turn number for this PR
    const lastReview = await Review.findOne({ repoId, pullRequestId }).sort({
      reviewTurn: -1,
    });

    console.log("lastReview", lastReview);

    const reviewTurn = lastReview ? lastReview.reviewTurn + 1 : 1;

    // Calculate overall score
    const overallScore = calculateOverallScore({
      issues: analysisResult.issues || [],
      security: { vulnerabilities: analysisResult.astFindings || [] },
      metrics: analysisResult.performanceMetrics || {},
    });

    // Save to DB with enhanced schema structure
    const review = new Review({
      // repo,
      repoId,
      pullRequestId,
      reviewTurn,
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
      overallScore: overallScore,
      contributorId: contributorId,
      contributorUsername: contributorUsername,
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
    console.log(
      `Enhanced review saved for PR #${pullRequestId} in ${repo} (Turn ${reviewTurn})`
    );
    console.log(`Found ${analysisResult.issues?.length || 0} issues`);
    console.log(`Security Score: ${analysisResult.securityScore || 0}/100`);
    console.log("Review ID:", savedReview._id);

    res.status(200).json({
      message: "Enhanced review created",
      reviewId: savedReview._id,
      reviewTurn: reviewTurn,
      issuesFound: analysisResult.issues?.length || 0,
      summary: analysisResult.summary,
      securityScore: analysisResult.securityScore,
      astAnalysisPerformed: analysisResult.astAnalysisPerformed,
    });
  } catch (err) {
    console.error("Webhook processing error:", err);

    // Try to save error state to DB with proper review turn handling
    try {
      const repo = req.body.repository?.full_name || "unknown";
      const pullRequestId = req.body.pull_request?.number || 0;

      // Get the next review turn number for error case as well
      const lastReview = await Review.findOne({ repo, pullRequestId }).sort({
        reviewTurn: -1,
      });

      const reviewTurn = lastReview ? lastReview.reviewTurn + 1 : 1;

      const errorReview = new Review({
        repo: repo,
        repoId: req.body.repository?.id || 0,
        pullRequestId: pullRequestId,
        reviewTurn: reviewTurn,
        commitMessage: "Error occurred during processing",
        reviewComments: `Error: ${err.message}`,
        issues: [],
        summary: { total: 0, bySeverity: {}, byType: {} },
        astFindings: [],
        securityScore: 0,
        status: "error",
        errorDetails: {
          message: err.message,
          stack: err.stack,
          timestamp: new Date(),
        },
      });

      await errorReview.save();
      console.log(
        `Error review saved for PR #${pullRequestId} in ${repo} (Turn ${reviewTurn})`
      );
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
