import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import axios from "axios";
import FormData from "form-data";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // API to remove background using remove.bg
  app.post("/api/remove-bg", async (req, res) => {
    try {
      const { imageBase64 } = req.body;
      const apiKey = process.env.REMOVE_BG_API_KEY;

      if (!apiKey) {
        return res.status(500).json({ error: "Chưa cấu hình REMOVE_BG_API_KEY trong môi trường." });
      }

      const formData = new FormData();
      if (imageBase64) {
        const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, 'base64');
        formData.append('image_file', buffer, { filename: 'upload.png' });
      } else {
        return res.status(400).json({ error: "Không tìm thấy dữ liệu ảnh." });
      }

      formData.append('size', 'auto');

      const response = await axios.post('https://api.remove.bg/v1.0/removebg', formData, {
        headers: {
          ...formData.getHeaders(),
          'X-Api-Key': apiKey,
        },
        responseType: 'arraybuffer'
      });

      res.set('Content-Type', 'image/png');
      res.send(response.data);
    } catch (error: any) {
      let errorMsg = "Lỗi khi tách nền với remove.bg";
      if (error.response?.data) {
        try {
          const data = JSON.parse(error.response.data.toString());
          errorMsg = data.errors?.[0]?.title || errorMsg;
        } catch (e) {
          errorMsg = error.response.data.toString();
        }
      }
      console.error("Background removal error:", errorMsg);
      res.status(500).json({ error: errorMsg });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
