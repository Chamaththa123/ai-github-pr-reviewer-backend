const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const analyzePR = async (commitMessage, codeDiff) => {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

    const prompt = `
You are an AI code reviewer. Analyze the following pull request:

Commit Message: ${commitMessage}
Code Diff: ${codeDiff}

Check for:
1. Proper commit message format
2. Logical errors
3. Style violations
4. Security vulnerabilities

Return a structured review with recommendations.
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (err) {
    console.error("❌ Gemini API Error", err);
    return "Error analyzing PR.";
  }
};

module.exports = { analyzePR };
