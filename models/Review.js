const mongoose = require("mongoose");

// Enhanced Issue Schema with additional security fields
const IssueSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        "readability",
        "logic",
        "security",
        "performance",
        "documentation",
        "testing",
        "improvement",
      ],
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    file: {
      type: String,
      required: true,
    },
    location: {
      type: String,
      required: true,
    },
    severity: {
      type: String,
      enum: ["critical", "high", "medium", "low"],
      required: true,
    },
    // New fields for enhanced security analysis
    cwe: {
      type: String,
      default: null,
      // match: /^CWE-\d+$/,
    },
    confidence: {
      type: String,
      enum: ["high", "medium", "low"],
      default: "medium",
    },
    exploitability: {
      type: String,
      enum: ["high", "medium", "low", "none"],
      default: "none",
    },
    source: {
      type: String,
      enum: ["ai", "ast", "hybrid"],
      default: "ai",
    },
  },
  {
    timestamps: false,
  }
);

// Vulnerability Schema for AST findings
const VulnerabilitySchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    location: {
      type: String,
      required: true,
    },
    severity: {
      type: String,
      enum: ["critical", "high", "medium", "low"],
      required: true,
    },
    cwe: {
      type: String,
      // match: /^CWE-\d+$/,
    },
    exploitability: {
      type: String,
      enum: ["high", "medium", "low", "none"],
      default: "medium",
    },
    pattern: {
      type: String,
      required: true,
    },
    confidence: {
      type: String,
      enum: ["high", "medium", "low"],
      default: "high",
    },
  },
  {
    _id: false,
    timestamps: false,
  }
);

// Code Metrics Schema
const CodeMetricsSchema = new mongoose.Schema(
  {
    functions: {
      type: Number,
      default: 0,
    },
    loops: {
      type: Number,
      default: 0,
    },
    conditions: {
      type: Number,
      default: 0,
    },
    depth: {
      type: Number,
      default: 0,
    },
    linesOfCode: {
      type: Number,
      default: 0,
    },
  },
  {
    _id: false,
    timestamps: false,
  }
);

// AST Finding Schema
const ASTFindingSchema = new mongoose.Schema(
  {
    file: {
      type: String,
      required: true,
    },
    vulnerabilities: [VulnerabilitySchema],
    complexity: {
      type: Number,
      required: true,
      min: 0,
    },
    metrics: CodeMetricsSchema,
    analysisTimestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    _id: false,
    timestamps: false,
  }
);

// Enhanced Summary Schema with byType categorization
const SummarySchema = new mongoose.Schema(
  {
    total: {
      type: Number,
      required: true,
      default: 0,
    },
    bySeverity: {
      critical: { type: Number, default: 0 },
      high: { type: Number, default: 0 },
      medium: { type: Number, default: 0 },
      low: { type: Number, default: 0 },
    },
    byType: {
      security: { type: Number, default: 0 },
      logic: { type: Number, default: 0 },
      readability: { type: Number, default: 0 },
      performance: { type: Number, default: 0 },
      documentation: { type: Number, default: 0 },
      testing: { type: Number, default: 0 },
      improvement: { type: Number, default: 0 },
    },
    bySource: {
      ai: { type: Number, default: 0 },
      ast: { type: Number, default: 0 },
      hybrid: { type: Number, default: 0 },
    },
  },
  {
    _id: false,
    timestamps: false,
  }
);

// Analysis Metadata Schema
const AnalysisMetadataSchema = new mongoose.Schema(
  {
    filesAnalyzed: {
      type: Number,
      default: 0,
    },
    astAnalysisPerformed: {
      type: Boolean,
      default: false,
    },
    analysisTimestamp: {
      type: Date,
      default: Date.now,
    },
    analysisVersion: {
      type: String,
      default: "2.0",
    },
    aiModel: {
      type: String,
      default: "gemini-1.5-flash",
    },
    processingTime: {
      type: Number, // in milliseconds
      default: 0,
    },
    codeFileTypes: [
      {
        type: String,
        // enum: [
        //   ".js",
        //   ".ts",
        //   ".jsx",
        //   ".tsx",
        //   ".vue",
        //   ".py",
        //   ".java",
        //   ".cs",
        //   ".php",
        //   ".go",
        //   ".rb",
        //   ".html",
        // ],
      },
    ],
  },
  {
    _id: false,
    timestamps: false,
  }
);

// Main Review Schema with enhanced fields
const ReviewSchema = new mongoose.Schema(
  {
    // Basic PR Information
    // repo: {
    //   type: String,
    //   required: true,
    // },
    repoId: {
      type: Number,
      required: true,
    },
    pullRequestId: {
      type: Number,
      required: true,
    },
    reviewTurn: { type: Number, required: true, default: 1 },
    commitMessage: {
      type: String,
      required: true,
    },
    reviewComments: {
      type: String,
      default: "Automated Review",
    },

    // Analysis Results
    issues: [IssueSchema],
    summary: {
      type: SummarySchema,
      required: true,
    },

    // AST Analysis Results
    astFindings: [ASTFindingSchema],

    // Security Scoring
    securityScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },

    // Analysis Status
    status: {
      type: String,
      enum: ["pending", "completed", "failed", "error"],
      default: "pending",
      // index: true,
    },

    // Enhanced Metadata
    analysisMetadata: AnalysisMetadataSchema,

    // Performance Metrics
    performanceMetrics: {
      totalAnalysisTime: { type: Number, default: 0 }, // ms
      astAnalysisTime: { type: Number, default: 0 }, // ms
      aiAnalysisTime: { type: Number, default: 0 }, // ms
      memoryUsage: { type: Number, default: 0 }, // MB
    },

    // Error Handling
    errorDetails: {
      message: String,
      stack: String,
      code: String,
      timestamp: Date,
    },

    overallScore: {
      type: Number,
      min: 0,
      max: 100,
    },
    contributorId: {
      type: String,
      required: true,
    },
    contributorUsername: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
    collection: "reviews",
  }
);

// Compound indexes for better query performance
// ReviewSchema.index({ repo: 1, pullRequestId: 1 }, { unique: true });
// ReviewSchema.index({ status: 1, createdAt: -1 });
// ReviewSchema.index({ "summary.bySeverity.critical": -1 });
// ReviewSchema.index({ securityScore: -1 });
// ReviewSchema.index({ "analysisMetadata.astAnalysisPerformed": 1 });

// Virtual for total vulnerabilities from AST
ReviewSchema.virtual("totalASTVulnerabilities").get(function () {
  return this.astFindings.reduce((total, finding) => {
    return total + finding.vulnerabilities.length;
  }, 0);
});

// Virtual for critical issues count
ReviewSchema.virtual("criticalIssuesCount").get(function () {
  return this.summary.bySeverity.critical || 0;
});

// Virtual for security issues count
ReviewSchema.virtual("securityIssuesCount").get(function () {
  return this.summary.byType.security || 0;
});

// Method to calculate risk score based on findings
ReviewSchema.methods.calculateRiskScore = function () {
  const criticalWeight = 10;
  const highWeight = 7;
  const mediumWeight = 4;
  const lowWeight = 1;

  const riskScore =
    this.summary.bySeverity.critical * criticalWeight +
    this.summary.bySeverity.high * highWeight +
    this.summary.bySeverity.medium * mediumWeight +
    this.summary.bySeverity.low * lowWeight;

  return Math.min(100, riskScore);
};

// Method to get security-focused summary
ReviewSchema.methods.getSecuritySummary = function () {
  const securityIssues = this.issues.filter(
    (issue) => issue.type === "security"
  );
  const astVulns = this.astFindings.flatMap(
    (finding) => finding.vulnerabilities
  );

  return {
    totalSecurityIssues: securityIssues.length,
    totalASTVulnerabilities: astVulns.length,
    criticalSecurityIssues: securityIssues.filter(
      (i) => i.severity === "critical"
    ).length,
    highSecurityIssues: securityIssues.filter((i) => i.severity === "high")
      .length,
    securityScore: this.securityScore,
    riskScore: this.calculateRiskScore(),
    topCWEs: this.getTopCWEs(),
  };
};

// Method to get top CWE categories
ReviewSchema.methods.getTopCWEs = function () {
  const cwes = [];

  // Collect CWEs from issues
  this.issues.forEach((issue) => {
    if (issue.cwe) cwes.push(issue.cwe);
  });

  // Collect CWEs from AST findings
  this.astFindings.forEach((finding) => {
    finding.vulnerabilities.forEach((vuln) => {
      if (vuln.cwe) cwes.push(vuln.cwe);
    });
  });

  // Count occurrences and return top 5
  const cweCount = cwes.reduce((acc, cwe) => {
    acc[cwe] = (acc[cwe] || 0) + 1;
    return acc;
  }, {});

  return Object.entries(cweCount)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([cwe, count]) => ({ cwe, count }));
};

// Pre-save middleware to update summary statistics
ReviewSchema.pre("save", function (next) {
  // Update summary totals
  this.summary.total = this.issues.length;

  // Reset counters
  Object.keys(this.summary.bySeverity).forEach((key) => {
    this.summary.bySeverity[key] = 0;
  });
  Object.keys(this.summary.byType).forEach((key) => {
    this.summary.byType[key] = 0;
  });
  Object.keys(this.summary.bySource).forEach((key) => {
    this.summary.bySource[key] = 0;
  });

  // Count issues by severity, type, and source
  this.issues.forEach((issue) => {
    this.summary.bySeverity[issue.severity]++;
    this.summary.byType[issue.type]++;
    this.summary.bySource[issue.source || "ai"]++;
  });

  next();
});

// Static method to find high-risk reviews
ReviewSchema.statics.findHighRiskReviews = function (limit = 10) {
  return this.find({
    $or: [
      { "summary.bySeverity.critical": { $gt: 0 } },
      { securityScore: { $lt: 70 } },
    ],
  })
    .sort({ "summary.bySeverity.critical": -1, securityScore: 1 })
    .limit(limit);
};

// Static method to get analytics
ReviewSchema.statics.getAnalytics = function (dateFrom, dateTo) {
  const matchStage = {
    createdAt: {
      $gte: dateFrom || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
      $lte: dateTo || new Date(),
    },
  };

  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalReviews: { $sum: 1 },
        averageSecurityScore: { $avg: "$securityScore" },
        totalIssues: { $sum: "$summary.total" },
        criticalIssues: { $sum: "$summary.bySeverity.critical" },
        highIssues: { $sum: "$summary.bySeverity.high" },
        mediumIssues: { $sum: "$summary.bySeverity.medium" },
        lowIssues: { $sum: "$summary.bySeverity.low" },
        astAnalysisCount: {
          $sum: { $cond: ["$analysisMetadata.astAnalysisPerformed", 1, 0] },
        },
      },
    },
  ]);
};

module.exports = mongoose.model("Review", ReviewSchema);
