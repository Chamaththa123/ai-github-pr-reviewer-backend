function calculateOverallScore(review) {
  let score = 100;

  review.issues.forEach(issue => {
    switch (issue.severity) {
      case "critical": score -= 15; break;
      case "high": score -= 10; break;
      case "medium": score -= 5; break;
      case "low": score -= 2; break;
    }
  });

  review.security?.vulnerabilities?.forEach(vuln => {
    if (vuln.severity === "critical") score -= 15;
    else if (vuln.severity === "high") score -= 10;
  });

  if (review.metrics?.complexity && review.metrics.complexity < 10) {
    score += 5;
  }

  return Math.max(0, Math.min(100, score));
}

module.exports = { calculateOverallScore };
