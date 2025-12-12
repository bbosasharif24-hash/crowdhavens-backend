import express from "express";
import cors from "cors";
import "dotenv/config.js";

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// ------------------------------
// Health Check (Render requires this)
// ------------------------------
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

// ------------------------------
// Root Route (must return JSON)
// ------------------------------
app.get("/", (req, res) => {
  res.status(200).json({ message: "CrowdHavens backend is running" });
});

// ------------------------------
// Upload Route
// ------------------------------
import uploadRoutes from "./routes/upload.js";
app.use("/api/upload", uploadRoutes);

// ------------------------------
// Start Server
// ------------------------------
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
