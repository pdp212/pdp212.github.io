const { S3Client } = require("@aws-sdk/client-s3");
const { Upload } = require("@aws-sdk/lib-storage");
const fs = require("fs");
const path = require("path");

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const BUCKET_NAME = process.env.R2_BUCKET_NAME || "pdp212-profile";

if (!ACCOUNT_ID || !ACCESS_KEY_ID || !SECRET_ACCESS_KEY) {
  console.error("❌ Thiếu thông tin xác thực Cloudflare R2.");
  console.error("Vui lòng cấu hình qua biến môi trường: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY");
  console.error("Ví dụ: R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... node upload_video.js <file>");
  process.exit(1);
}

const client = new S3Client({
  region: "auto",
  endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: ACCESS_KEY_ID,
    secretAccessKey: SECRET_ACCESS_KEY,
  },
});

async function uploadFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found -> ${filePath}`);
    process.exit(1);
  }

  const fileName = path.basename(filePath);
  const fileStream = fs.createReadStream(filePath);
  
  // Basic content type inference
  let contentType = 'application/octet-stream';
  if (fileName.endsWith('.mp4')) contentType = 'video/mp4';
  if (fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')) contentType = 'image/jpeg';
  if (fileName.endsWith('.png')) contentType = 'image/png';
  if (fileName.endsWith('.webp')) contentType = 'image/webp';

  console.log(`🚀 Bắt đầu upload: ${fileName}...`);
  console.log(`Dung lượng: ${(fs.statSync(filePath).size / (1024 * 1024)).toFixed(2)} MB`);

  try {
    const upload = new Upload({
      client,
      params: {
        Bucket: BUCKET_NAME,
        Key: fileName,
        Body: fileStream,
        ContentType: contentType,
      },
    });

    upload.on("httpUploadProgress", (progress) => {
      const percentage = Math.round((progress.loaded / progress.total) * 100);
      process.stdout.write(`\r⏳ Đang tải lên: ${percentage}% `);
    });

    await upload.done();
    console.log(`\n✅ Upload THÀNH CÔNG!`);
    console.log(`\n🎉 LINK XEM TRỰC TIẾP DÀNH CHO BẠN:`);
    console.log(`👉 https://pub-xxxxxxxxxxxx.r2.dev/${fileName}`);
    console.log(`(Lưu ý: Bạn cần thay phần 'pub-xxx' bằng Public Dev URL của Bucket trên Dashboard R2)`);
  } catch (error) {
    console.error("\n❌ Upload thất bại:", error);
  }
}

// Get the file path from command line arguments
const args = process.argv.slice(2);
if (args.length === 0) {
  console.log("Usage: node upload_video.js <path-to-video-file>");
  process.exit(1);
}

uploadFile(args[0]);
