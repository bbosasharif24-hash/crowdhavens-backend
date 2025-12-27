const axios = require("axios");
const FormData = require("form-data");

module.exports = async function uploadToR2(fileBuffer, filename, mime) {
  const form = new FormData();
  form.append("file", fileBuffer, {
    filename,
    contentType: mime,
  });

  const response = await axios.post(
    process.env.R2_WORKER_URL + "/upload",
    form,
    {
      headers: {
        ...form.getHeaders(),
        "x-api-key": process.env.WORKER_API_KEY,
      },
      maxBodyLength: Infinity,
    }
  );

  return response.data; // { key, url }
};
