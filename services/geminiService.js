const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const analyzePR = async (commitMessages, files) => {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

    // Build file string (limit first 10 files to control tokens)
    const fileSummaries = files
      .slice(0, 10)
      .map(
        (f, idx) =>
          `FILE ${idx + 1}: ${f.filename}\nPATCH (first 2000 chars):\n${(f.patch || "").slice(
            0,
            2000
          )}`
      )
      .join("\n\n");

    const prompt = `
You are a senior software engineer performing an automated pull request review.
Analyze the following PR in detail.

Commit Messages:
${commitMessages}

Files Changed:
${fileSummaries}

For each file or commit, analyze and provide structured suggestions in JSON format for the following categories:

1. Code readability → suggest better variable names, function decomposition, formatting.
2. Logic correctness → detect subtle logical errors that static analysis may not catch.
3. Security / vulnerabilities → highlight potential security issues.
4. Code improvement → refactoring suggestions, performance optimizations.
5. Documentation / comments → check if functions/classes are documented properly.

Return JSON with this structure:

{
  "issues": [
    {
      "type": "readability|logic|security|improvement|documentation",
      "title": "Short one-line title",
      "description": "Explain the issue in 1-3 sentences",
      "file": "filename",
      "location": "function or line number if possible",
      "severity": "critical|high|medium|low"
    }
  ],
  "summary": {
    "total": N,
    "bySeverity": {
      "critical": X,
      "high": Y,
      "medium": Z,
      "low": W
    }
  }
}

Return **valid JSON only**, no extra text.
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;

    // Extract text from Gemini response
    return response.text ? response.text() : JSON.stringify(response);
  } catch (err) {
    console.error("Gemini API Error:", err);
    return "Error analyzing PR.";
  }
};

module.exports = { analyzePR };
