// pages/api/compare.js
export const config = { api: { bodyParser: false } };
export const runtime = "nodejs";

import formidable from "formidable";
import fs from "fs/promises";
import { OpenAI } from "openai";
import { authAdmin } from "@/lib/firebase/firebaseAdmin";
import { checkAndConsumeQuota } from "@/lib/billing/quota";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const isEmu = !!process.env.FIRESTORE_EMULATOR_HOST; // ✅ emulator detect

function parseForm(req) {
  const form = formidable({ multiples: true, maxFiles: 2, maxFileSize: 15 * 1024 * 1024 });
  return new Promise((resolve, reject) => {
    form.parse(req, (err, fields, files) => (err ? reject(err) : resolve({ fields, files })));
  });
}

// support both: image1/image2 OR images[] etc.
function pickTwoImages(files) {
  const valid = new Set(["image/png", "image/jpeg", "image/webp"]);
  const flat = [];
  for (const key of Object.keys(files || {})) {
    const arr = Array.isArray(files[key]) ? files[key] : [files[key]];
    for (const f of arr) if (f && valid.has(f.mimetype)) flat.push(f);
  }
  return flat.slice(0, 2);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  try {
    // ---- 1) Auth (dev bypass) ----
    let uid = "anonymous";
    if (isEmu) {
      uid = "dev-user"; // ✅ no token needed in emulator
    } else {
      const authHeader = req.headers.authorization || "";
      const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
      if (!idToken) return res.status(401).json({ error: "Unauthorized. Token missing." });
      try {
        const decoded = await authAdmin.verifyIdToken(idToken, true);
        uid = decoded.uid;
      } catch {
        return res.status(401).json({ error: "Invalid or expired token" });
      }
    }

    // ---- 2) Quota (skip in emulator) ----
    if (!isEmu) {
      try {
        await checkAndConsumeQuota({ uid });
      } catch (err) {
        const code = err?.code || "";
        const msg = err?.message || "Access denied.";
        if (code === "NO_PLAN")        return res.status(403).json({ error: msg, error_code: "NO_PLAN" });
        if (code === "LIMIT_EXCEEDED") return res.status(429).json({ error: msg, error_code: "LIMIT_EXCEEDED" });
        return res.status(403).json({ error: msg });
      }
    }

    // ---- 3) Parse files ----
    const { files } = await parseForm(req);
    const [image1, image2] = pickTwoImages(files);
    if (!image1 || !image2) {
      return res.status(400).json({ error: "Upload 2 images (JPG/PNG/WEBP)" });
    }

    // ---- 4) Read images ----
    const [img1, img2] = await Promise.all([
      fs.readFile(image1.filepath, { encoding: "base64" }),
      fs.readFile(image2.filepath, { encoding: "base64" }),
    ]);

    // ---- 5) OpenAI Vision ----
    let completion;
    try {
      completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  "Compare these two UI screenshots and generate a markdown-based QA report.\n" +
                  "Focus on layout shifts, missing or misaligned elements, spacing, font, color, and visual consistency issues.\n" +
                  "Organize output with bullet points under clear headings.",
              },
              { type: "image_url", image_url: { url: `data:${image1.mimetype};base64,${img1}` } },
              { type: "image_url", image_url: { url: `data:${image2.mimetype};base64,${img2}` } },
            ],
          },
        ],
      });
    } catch (aiErr) {
      return res.status(502).json({ error: "AI provider error", detail: String(aiErr?.message || aiErr) });
    }

    const result = completion?.choices?.[0]?.message?.content;
    if (!result) return res.status(502).json({ error: "OpenAI did not return a result" });

    return res.status(200).json({ ok: true, result });
  } catch (error) {
    const msg = error?.message || "Unknown error";
    const isQuota = /quota|resource-exhausted/i.test(msg);
    return res.status(isQuota ? 429 : 500).json({
      error: isQuota ? "Quota exceeded" : "Server error",
      detail: msg,
    });
  }
}
