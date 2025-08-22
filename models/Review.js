const mongoose = require("mongoose");

const ReviewSchema = new mongoose.Schema({
  repo: String,
  pullRequestId: Number,
  commitMessage: String,
  reviewComments: String,
  aiSuggestions: String,
  status: { type: String, default: "pending" },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Review", ReviewSchema);
