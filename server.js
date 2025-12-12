import express from "express";
import cors from "cors";

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Health check route FIRST (Render requires this)
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

// Root route
app.get("/", (req, res) => {
  res.json({ message: "CrowdHavens backend is running" });
});

// Upload route
import uploadRoutes from "./routes/upload.js";
app.use("/api/upload", uploadRoutes);

// Server
const PORT = process.env.PORT || 5000;

// Render requires listening on ALL interfaces
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
