const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const analyzePR = async (commitMessages, files) => {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const fileSummaries = files
      .slice(0, 10)
      .map(
        (f, idx) =>
          `FILE ${idx + 1}: ${f.filename}\nPATCH (first 2000 chars):\n${(
            f.patch || ""
          ).slice(0, 2000)}`
      )
      .join("\n\n");

    const prompt = `
You are a senior software engineer performing an automated pull request review.

Commit Messages: ${commitMessages}

Files Changed: ${fileSummaries}

Analyze and return JSON with:
1. Code readability
2. Logic correctness, including:
   - Potential runtime errors (e.g., division by zero, null references, off-by-one errors)
   - Unhandled promises in Node.js
   - Missing or insufficient error handling
3. Security vulnerabilities, including:
   - Hardcoded secrets, API keys, or sensitive information
   - Potential for SQL injection, cross-site scripting (XSS), or command injection
   - Use of deprecated APIs or unsafe methods
4. Code improvement
5. Documentation / comments

Return JSON only:
{
  "issues": [
    {
      "type": "readability|logic|security|improvement|documentation",
      "title": "Short title",
      "description": "Explain issue",
      "file": "filename",
      "location": "function/line",
      "severity": "critical|high|medium|low"
    }
  ],
  "summary": { "total": 0, "bySeverity": {} }
}
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    console.log("Raw AI Response:", text);
    
    // Parse the JSON response
    try {
      const analysisResult = JSON.parse(text);
      return analysisResult;
    } catch (parseError) {
      console.error("JSON Parse Error:", parseError);
      console.log("Raw text that failed to parse:", text);
      
      // Try to extract JSON from the response if it's wrapped in markdown
      const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        try {
          const analysisResult = JSON.parse(jsonMatch[1]);
          return analysisResult;
        } catch (secondParseError) {
          console.error("Second JSON Parse Error:", secondParseError);
          return {
            issues: [],
            summary: { total: 0, bySeverity: {} },
            error: "Failed to parse AI response"
          };
        }
      }
      
      return {
        issues: [],
        summary: { total: 0, bySeverity: {} },
        error: "Failed to parse AI response"
      };
    }
  } catch (err) {
    console.error("Gemini API Error:", err);
    return {
      issues: [],
      summary: { total: 0, bySeverity: {} },
      error: "Error analyzing PR"
    };
  }
};

module.exports = { analyzePR };