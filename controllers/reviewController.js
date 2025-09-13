const Review = require("../models/Review");

const getReviews = async (req, res) => {
  try {
    const { id } = req.params;
    const reviews = await Review.find({ repoId: id }).sort({ createdAt: -1 });
    res.json(reviews);
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: "Error fetching reviews" });
  }
};


module.exports = { getReviews };
