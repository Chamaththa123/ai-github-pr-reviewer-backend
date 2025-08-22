const axios = require("axios");
const Review = require("../models/Review");
const { analyzePR } = require("../services/geminiService");

const handlePRWebhook = async (req, res) => {
  try {
    const { action, pull_request, repository } = req.body;

    if (action !== "opened") {
      return res.status(200).json({ message: "Ignored event" });
    }

    const repo = repository.full_name;
    const pullRequestId = pull_request.number;
    const commitMessage = pull_request.title;

    // Fetch diff from GitHub
    const diffUrl = pull_request.diff_url;
    const diffRes = await axios.get(diffUrl);
    const codeDiff = diffRes.data;

    // Analyze with Gemini AI
    const aiSuggestions = await analyzePR(commitMessage, codeDiff);

    // Save to DB
    const review = new Review({
      repo,
      pullRequestId,
      commitMessage,
      reviewComments: "Automated Review",
      aiSuggestions,
      status: "completed",
    });

    await review.save();

    res.status(200).json({ message: "Review created", review });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error processing PR webhook" });
  }
};

module.exports = { handlePRWebhook };
