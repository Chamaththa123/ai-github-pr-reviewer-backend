const mongoose = require("mongoose");

const IssueSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['readability', 'logic', 'security', 'improvement', 'documentation'],
    required: true
  },
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  file: {
    type: String,
    required: true
  },
  location: {
    type: String,
    required: true
  },
  severity: {
    type: String,
    enum: ['critical', 'high', 'medium', 'low'],
    required: true
  }
});

const SummarySchema = new mongoose.Schema({
  total: {
    type: Number,
    required: true
  },
  bySeverity: {
    critical: { type: Number, default: 0 },
    high: { type: Number, default: 0 },
    medium: { type: Number, default: 0 },
    low: { type: Number, default: 0 }
  }
});

const ReviewSchema = new mongoose.Schema({
  repo: String,
  pullRequestId: Number,
  commitMessage: String,
  reviewComments: String,
  issues: [IssueSchema],
  summary: SummarySchema,
  status: { type: String, default: "pending" },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Review", ReviewSchema);
