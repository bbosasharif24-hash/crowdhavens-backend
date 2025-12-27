const uploadToR2 = require("../utils/r2Upload");
const multer = require("multer");

const upload = multer();

router.post("/upload-doc", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).send("No file uploaded");
  }

  const result = await uploadToR2(
    req.file.buffer,
    req.file.originalname,
    req.file.mimetype
  );

  // Save result.key in DB (NOT the file)
  res.json({
    success: true,
    r2Key: result.key,
  });
});
