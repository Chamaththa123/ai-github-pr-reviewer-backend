const { GoogleGenerativeAI } = require("@google/generative-ai");
const { analyzeSecurityVulnerabilities } = require("./astSecurityAnalyzer");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const analyzePRWithAST = async (commitMessages, files) => {
  const startTime = Date.now();
  const startMemory = process.memoryUsage();
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // Start AST analysis timing
    const astStartTime = Date.now();

    // Perform AST analysis on JavaScript/TypeScript files
    const astFindings = [];
    const jsFiles = files.filter(
      (f) =>
        f.content &&
        (f.filename.endsWith(".js") ||
          f.filename.endsWith(".ts") ||
          f.filename.endsWith(".jsx") ||
          f.filename.endsWith(".tsx"))
    );

    console.log(
      `Performing AST analysis on ${jsFiles.length} JavaScript/TypeScript files`
    );

    for (const file of jsFiles) {
      try {
        const astResult = await analyzeSecurityVulnerabilities(
          file.content,
          file.filename
        );
        if (astResult.vulnerabilities.length > 0) {
          astFindings.push({
            file: file.filename,
            vulnerabilities: astResult.vulnerabilities,
            complexity: astResult.complexity,
            metrics: astResult.metrics,
          });
        }
      } catch (astError) {
        console.warn(
          `AST analysis failed for ${file.filename}:`,
          astError.message
        );
      }
    }

    // End AST analysis timing
    const astEndTime = Date.now();
    console.log(
      `AST analysis completed in ${astEndTime - astStartTime}ms, found ${
        astFindings.length
      } files with vulnerabilities`
    );

    // Prepare enhanced prompt with AST findings
    const fileSummaries = files
      .slice(0, 10)
      .map((f, idx) => {
        const astInfo = astFindings.find((af) => af.file === f.filename);
        let astSummary = "";

        if (astInfo) {
          astSummary = `\nAST ANALYSIS:
- Vulnerabilities found: ${astInfo.vulnerabilities.length}
- Complexity score: ${astInfo.complexity}
- Critical patterns: ${astInfo.vulnerabilities
            .filter((v) => v.severity === "critical")
            .map((v) => v.type)
            .join(", ")}`;
        }

        return `FILE ${idx + 1}: ${f.filename}
STATUS: ${f.status} (+${f.additions || 0}/-${f.deletions || 0} lines)
PATCH (first 2000 chars):
${(f.patch || "").slice(0, 2000)}${astSummary}`;
      })
      .join("\n\n");

    const astSummary =
      astFindings.length > 0
        ? `\n\nAST SECURITY ANALYSIS SUMMARY:
${astFindings
  .map(
    (af) =>
      `- ${af.file}: ${af.vulnerabilities.length} vulnerabilities (Complexity: ${af.complexity})`
  )
  .join("\n")}

Key vulnerabilities detected:
${astFindings
  .flatMap((af) => af.vulnerabilities)
  .filter((v) => v.severity === "critical" || v.severity === "high")
  .slice(0, 5)
  .map((v) => `- ${v.type}: ${v.description}`)
  .join("\n")}`
        : "";

    const enhancedPrompt = `
You are a senior software engineer performing an automated pull request review with AST analysis support.

Commit Messages: ${commitMessages}

Files Changed: ${fileSummaries}${astSummary}

CRITICAL: Return ONLY valid JSON without any markdown formatting, explanations, or code blocks.

ENHANCED ANALYSIS INSTRUCTIONS:
1. Use the AST analysis results to validate and enhance your findings
2. Focus on security vulnerabilities with high precision
3. Consider code complexity and maintainability
4. Prioritize issues based on severity and exploitability

Analyze and return JSON with enhanced security focus:
1. Code readability and maintainability
2. Logic correctness, including:
   - Potential runtime errors (null references, type errors, async/await issues)
   - Memory leaks and resource management
   - Race conditions and concurrency issues
3. Security vulnerabilities (CRITICAL FOCUS), including:
   - Code injection vulnerabilities (SQL, NoSQL, Command, LDAP)
   - Cross-site scripting (XSS) and CSRF vulnerabilities
   - Authentication and authorization bypasses
   - Cryptographic weaknesses and insecure random generation
   - Sensitive data exposure and logging
   - Prototype pollution and dependency vulnerabilities
   - Server-side request forgery (SSRF)
4. Performance and scalability issues
5. Documentation and testing coverage

Return ONLY this JSON structure with NO markdown formatting:
{
  "issues": [
    {
      "type": "readability|logic|security|performance|documentation|testing",
      "title": "Short title",
      "description": "Detailed explanation with context",
      "file": "filename",
      "location": "function/line reference",
      "severity": "critical|high|medium|low",
      "cwe": "CWE-XXX if applicable",
      "confidence": "high|medium|low",
      "exploitability": "high|medium|low|none"
    }
  ],
  "summary": { 
    "total": 0, 
    "bySeverity": {"critical": 0, "high": 0, "medium": 0, "low": 0},
    "byType": {"security": 0, "logic": 0, "readability": 0, "performance": 0, "documentation": 0}
  },
  "securityScore": 85,
  "recommendations": [
    "Specific actionable recommendations"
  ]
}
`;

    // Start AI analysis timing
    const aiStartTime = Date.now();

    console.log("Sending request to Gemini AI...");
    const result = await model.generateContent(enhancedPrompt);
    const response = await result.response;
    const text = response.text().trim();

    // End AI analysis timing
    const aiEndTime = Date.now();

    console.log(
      `AI Response received in ${aiEndTime - aiStartTime}ms, response length:`,
      text.length
    );
    console.log("First 200 characters:", text.substring(0, 200));

    // Enhanced JSON parsing with multiple fallback strategies
    const analysisResult = parseAIResponse(text);

    if (analysisResult.error) {
      console.error("Failed to parse AI response, using AST analysis only");
      const fallbackResult = createFallbackResponse(
        astFindings,
        analysisResult.error
      );

      // Add performance metrics to fallback result
      const endTime = Date.now();
      const endMemory = process.memoryUsage();

      fallbackResult.performanceMetrics = {
        totalAnalysisTime: endTime - startTime,
        astAnalysisTime: astEndTime - astStartTime,
        aiAnalysisTime: aiEndTime - aiStartTime,
        memoryUsage: Math.round(
          (endMemory.heapUsed - startMemory.heapUsed) / 1024 / 1024
        ), // MB
        filesAnalyzed: jsFiles.length,
        astFindingsCount: astFindings.length,
        fallbackUsed: true,
      };

      return fallbackResult;
    }

    // Add AST findings to the successful result
    analysisResult.astFindings = astFindings;
    analysisResult.astAnalysisPerformed = astFindings.length > 0;

    // Calculate enhanced security score if not provided
    if (!analysisResult.securityScore || analysisResult.securityScore === 0) {
      analysisResult.securityScore = calculateSecurityScore(
        analysisResult.issues,
        astFindings
      );
    }

    // Calculate final performance metrics
    const endTime = Date.now();
    const endMemory = process.memoryUsage();

    analysisResult.performanceMetrics = {
      totalAnalysisTime: endTime - startTime,
      astAnalysisTime: astEndTime - astStartTime,
      aiAnalysisTime: aiEndTime - aiStartTime,
      memoryUsage: Math.round(
        (endMemory.heapUsed - startMemory.heapUsed) / 1024 / 1024
      ), // MB
      filesAnalyzed: jsFiles.length,
      totalFiles: files.length,
      astFindingsCount: astFindings.length,
      issuesFound: analysisResult.issues?.length || 0,
      fallbackUsed: false,
      breakdown: {
        astAnalysisPercentage: Math.round(
          ((astEndTime - astStartTime) / (endTime - startTime)) * 100
        ),
        aiAnalysisPercentage: Math.round(
          ((aiEndTime - aiStartTime) / (endTime - startTime)) * 100
        ),
        otherProcessingPercentage: Math.round(
          ((endTime -
            startTime -
            (astEndTime - astStartTime) -
            (aiEndTime - aiStartTime)) /
            (endTime - startTime)) *
            100
        ),
      },
    };

    console.log(
      `Analysis completed in ${endTime - startTime}ms: ${
        analysisResult.issues?.length || 0
      } issues found, Security Score: ${analysisResult.securityScore}`
    );
    console.log(
      `Performance breakdown - AST: ${analysisResult.performanceMetrics.astAnalysisTime}ms (${analysisResult.performanceMetrics.breakdown.astAnalysisPercentage}%), AI: ${analysisResult.performanceMetrics.aiAnalysisTime}ms (${analysisResult.performanceMetrics.breakdown.aiAnalysisPercentage}%)`
    );

    return analysisResult;
  } catch (err) {
    console.error("Enhanced Analysis Error:", err);
    // Calculate error metrics
    const endTime = Date.now();
    const endMemory = process.memoryUsage();

    return {
      issues: [],
      summary: { total: 0, bySeverity: {}, byType: {} },
      astFindings: [],
      astAnalysisPerformed: false,
      securityScore: 0,
      error: `Error in enhanced PR analysis: ${err.message}`,
      performanceMetrics: {
        totalAnalysisTime: endTime - startTime,
        astAnalysisTime: 0,
        aiAnalysisTime: 0,
        memoryUsage: Math.round(
          (endMemory.heapUsed - startMemory.heapUsed) / 1024 / 1024
        ), // MB
        filesAnalyzed: 0,
        totalFiles: files.length,
        astFindingsCount: 0,
        issuesFound: 0,
        fallbackUsed: false,
        errorOccurred: true,
        errorMessage: err.message,
      },
    };
  }
};

// Robust JSON parsing with multiple fallback strategies
function parseAIResponse(text) {
  const strategies = [
    // Strategy 1: Direct JSON parsing
    () => JSON.parse(text),

    // Strategy 2: Extract JSON from markdown code blocks
    () => {
      const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1]);
      }
      throw new Error("No JSON code block found");
    },

    // Strategy 3: Extract JSON from any code blocks
    () => {
      const codeMatch = text.match(/```\s*([\s\S]*?)\s*```/);
      if (codeMatch) {
        return JSON.parse(codeMatch[1]);
      }
      throw new Error("No code block found");
    },

    // Strategy 4: Find JSON-like structure
    () => {
      const jsonStart = text.indexOf("{");
      const jsonEnd = text.lastIndexOf("}");
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        const jsonStr = text.substring(jsonStart, jsonEnd + 1);
        return JSON.parse(jsonStr);
      }
      throw new Error("No JSON structure found");
    },

    // Strategy 5: Clean and parse
    () => {
      let cleanText = text
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .replace(/^\s*[\w\s]*\n/, "") // Remove any intro text
        .trim();

      // Find the first { and last }
      const start = cleanText.indexOf("{");
      const end = cleanText.lastIndexOf("}");

      if (start !== -1 && end !== -1 && end > start) {
        cleanText = cleanText.substring(start, end + 1);
        return JSON.parse(cleanText);
      }

      throw new Error("Could not extract clean JSON");
    },
  ];

  let lastError = null;

  for (let i = 0; i < strategies.length; i++) {
    try {
      console.log(`Trying parsing strategy ${i + 1}...`);
      const result = strategies[i]();
      console.log(`Parsing strategy ${i + 1} succeeded`);
      return result;
    } catch (error) {
      console.log(`Parsing strategy ${i + 1} failed:`, error.message);
      lastError = error;
      continue;
    }
  }

  // All strategies failed
  console.error("All JSON parsing strategies failed");
  console.error("Raw response:", text);
  return { error: `JSON parsing failed: ${lastError?.message}` };
}

// Create fallback response using only AST findings
function createFallbackResponse(astFindings, error) {
  const issues = astFindingsToIssues(astFindings);
  const summary = generateSummaryFromAST(astFindings);
  const securityScore = calculateSecurityScore([], astFindings);

  return {
    issues: issues,
    summary: summary,
    astFindings: astFindings,
    astAnalysisPerformed: astFindings.length > 0,
    securityScore: securityScore,
    recommendations: generateRecommendationsFromAST(astFindings),
    error: `AI parsing failed, using AST analysis only: ${error}`,
  };
}

// Generate recommendations from AST findings
function generateRecommendationsFromAST(astFindings) {
  const recommendations = [];

  if (astFindings.length === 0) {
    recommendations.push(
      "No security vulnerabilities detected by AST analysis"
    );
    return recommendations;
  }

  const criticalVulns = astFindings
    .flatMap((f) => f.vulnerabilities)
    .filter((v) => v.severity === "critical");
  const highVulns = astFindings
    .flatMap((f) => f.vulnerabilities)
    .filter((v) => v.severity === "high");

  if (criticalVulns.length > 0) {
    recommendations.push(
      `Address ${criticalVulns.length} critical security vulnerabilities immediately`
    );
  }

  if (highVulns.length > 0) {
    recommendations.push(
      `Review and fix ${highVulns.length} high-severity security issues`
    );
  }

  // Add specific recommendations based on vulnerability types
  const vulnTypes = [
    ...new Set(
      astFindings.flatMap((f) => f.vulnerabilities).map((v) => v.type)
    ),
  ];

  vulnTypes.forEach((type) => {
    switch (type) {
      case "SQL Injection":
        recommendations.push(
          "Use parameterized queries to prevent SQL injection"
        );
        break;
      case "Command Injection":
        recommendations.push(
          "Validate and sanitize all user inputs for shell commands"
        );
        break;
      case "Cross-Site Scripting (XSS)":
        recommendations.push(
          "Implement proper input sanitization and output encoding"
        );
        break;
      case "Hardcoded Credentials":
        recommendations.push(
          "Move sensitive credentials to environment variables"
        );
        break;
    }
  });

  return recommendations.slice(0, 5); // Limit to top 5 recommendations
}

// Helper functions (same as before)
function calculateSecurityScore(issues = [], astFindings = []) {
  let score = 100;

  // Deduct points for issues
  issues.forEach((issue) => {
    if (issue.type === "security") {
      switch (issue.severity) {
        case "critical":
          score -= 25;
          break;
        case "high":
          score -= 15;
          break;
        case "medium":
          score -= 8;
          break;
        case "low":
          score -= 3;
          break;
      }
    }
  });

  // Deduct points for AST findings
  astFindings.forEach((finding) => {
    finding.vulnerabilities.forEach((vuln) => {
      switch (vuln.severity) {
        case "critical":
          score -= 20;
          break;
        case "high":
          score -= 12;
          break;
        case "medium":
          score -= 6;
          break;
        case "low":
          score -= 2;
          break;
      }
    });
  });

  return Math.max(0, Math.min(100, score));
}

function astFindingsToIssues(astFindings) {
  const issues = [];

  astFindings.forEach((finding) => {
    finding.vulnerabilities.forEach((vuln) => {
      issues.push({
        type: "security",
        title: `AST: ${vuln.type}`,
        description: vuln.description,
        file: finding.file,
        location: vuln.location,
        severity: vuln.severity,
        cwe: vuln.cwe && /^CWE-\d+$/.test(vuln.cwe) ? vuln.cwe : null,
        confidence: "high",
        exploitability: vuln.exploitability || "medium",
        source: "ast",
      });
    });
  });

  return issues;
}

function generateSummaryFromAST(astFindings) {
  const issues = astFindingsToIssues(astFindings);
  const summary = {
    total: issues.length,
    bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
    byType: {
      security: issues.length,
      logic: 0,
      readability: 0,
      performance: 0,
      documentation: 0,
      testing: 0,
    },
  };

  issues.forEach((issue) => {
    summary.bySeverity[issue.severity]++;
  });

  return summary;
}

module.exports = { analyzePRWithAST };
