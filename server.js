import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// Test route
app.get("/", (req, res) => {
  res.send("CrowdHavens backend is running");
});

// Upload route
import uploadRoutes from "./routes/upload.js";
app.use("/api/upload", uploadRoutes);

const PORT = 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
