const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const analyzePR = async (commitMessages, files) => {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

    // Build file string
    const fileSummaries = files.slice(0, 10).map((f, idx) => `FILE ${idx+1}: ${f.filename}\n${f.patch.slice(0,2000)}`).join("\n\n");

    const prompt = `
You are an AI code reviewer. Analyze the following pull request:

Commit Messages:
${commitMessages}

Files Changed:
${fileSummaries}

Check for:
1. Proper commit message format
2. Logical errors
3. Style violations
4. Security vulnerabilities

Return a structured JSON with "issues" and "summary".
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;

    // response.text() may vary depending on SDK version
    return response.text ? response.text() : JSON.stringify(response);
  } catch (err) {
    console.error("Gemini API Error:", err);
    return "Error analyzing PR.";
  }
};

module.exports = { analyzePR };
