import { PutObjectCommand } from "@aws-sdk/client-s3";
import r2 from "./r2.js";

export const uploadToR2 = async (fileBuffer, fileName, mimeType) => {
  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: fileName,
    Body: fileBuffer,
    ContentType: mimeType,
  });

  await r2.send(command);

  return `${process.env.R2_ENDPOINT}/${process.env.R2_BUCKET_NAME}/${fileName}`;
};
