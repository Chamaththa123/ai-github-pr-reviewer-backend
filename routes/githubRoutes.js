const express = require("express");
const { handlePRWebhook } = require("../controllers/githubController");
const router = express.Router();

router.post("/webhook", handlePRWebhook);

module.exports = router;
