import express from "express";
import multer from "multer";
import { uploadToR2 } from "../utils/r2Actions.js";

const router = express.Router();
const upload = multer();

router.post("/", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    const fileName = Date.now() + "-" + file.originalname;

    const url = await uploadToR2(file.buffer, fileName, file.mimetype);

    return res.json({ success: true, url });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Upload failed" });
  }
});

export default router;
