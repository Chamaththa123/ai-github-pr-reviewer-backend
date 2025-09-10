const Review = require("../models/Review");

const getReviews = async (req, res) => {
  try {
    console.log('test')
    const { id } = req.params;
    console.log(id)
    const reviews = await Review.find({ repoId: id }).sort({ createdAt: -1 });
    res.json(reviews);
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: "Error fetching reviews" });
  }
};


module.exports = { getReviews };
