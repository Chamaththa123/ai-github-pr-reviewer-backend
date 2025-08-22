// src/services/githubService.js
const axios = require("axios");

const getPRDetails = async (pull_request) => {
  const diffRes = await axios.get(pull_request.diff_url);
  const diff = diffRes.data;

  const commitsRes = await axios.get(pull_request.commits_url, {
    headers: { "Accept": "application/vnd.github+json" }
  });
  const commits = commitsRes.data.map(c => c.commit.message);

  return { diff, commits };
};

module.exports = { getPRDetails };
