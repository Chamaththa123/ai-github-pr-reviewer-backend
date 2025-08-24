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

const getFileContent = async (repo, path, ref, token) => {
  try {
    const response = await axios.get(
      `https://api.github.com/repos/${repo}/contents/${path}?ref=${ref}`,
      {
        headers: { 
          Authorization: `token ${token}`,
          Accept: "application/vnd.github+json"
        }
      }
    );
    
    if (response.data.content) {
      return Buffer.from(response.data.content, 'base64').toString('utf8');
    }
    
    return null;
  } catch (error) {
    console.warn(`Failed to fetch content for ${path}:`, error.message);
    return null;
  }
};

// Get PR files with enhanced metadata
const getPRFilesWithContent = async (repo, pullNumber, token) => {
  try {
    const response = await axios.get(
      `https://api.github.com/repos/${repo}/pulls/${pullNumber}/files`,
      {
        headers: { 
          Authorization: `token ${token}`,
          Accept: "application/vnd.github+json"
        }
      }
    );

    const filesWithContent = await Promise.all(
      response.data.map(async (file) => {
        let content = null;
        
        // Only fetch content for code files that weren't removed
        if (file.status !== 'removed' && isCodeFile(file.filename)) {
          content = await getFileContentFromContentsUrl(file.contents_url, token);
        }

        return {
          filename: file.filename,
          status: file.status,
          additions: file.additions,
          deletions: file.deletions,
          changes: file.changes,
          patch: file.patch,
          content: content,
          raw_url: file.raw_url,
          contents_url: file.contents_url
        };
      })
    );

    return filesWithContent;
  } catch (error) {
    console.error(`Failed to fetch PR files:`, error.message);
    return [];
  }
};

// Helper function to get file content from contents URL
const getFileContentFromContentsUrl = async (contentsUrl, token) => {
  try {
    const response = await axios.get(contentsUrl, {
      headers: { 
        Authorization: `token ${token}`,
        Accept: "application/vnd.github+json"
      }
    });
    
    if (response.data.content) {
      return Buffer.from(response.data.content, 'base64').toString('utf8');
    }
    
    return null;
  } catch (error) {
    console.warn(`Failed to fetch file content:`, error.message);
    return null;
  }
};

// Helper function to determine if file is a code file
const isCodeFile = (filename)

module.exports = { getPRDetails,getFileContent ,getPRFilesWithContent};
