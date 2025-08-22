const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const dotenv = require("dotenv");
const connectDB = require("./config/db");

dotenv.config();
connectDB();

const app = express();

app.use(bodyParser.json());
app.use(cors());

// Routes
app.use("/api/github", require("./routes/githubRoutes"));
app.use("/api/reviews", require("./routes/reviewRoutes"));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));