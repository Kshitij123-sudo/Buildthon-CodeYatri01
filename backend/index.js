import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Groq from "groq-sdk";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

app.get("/", (req, res) => {
  res.send("Backend running with Groq AI");
});

app.post("/chat", async (req, res) => {
  try {
    const userMessage = req.body.message;

    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        {
          role: "system",
          content:
            "You are 'Sahyadri', a warm, enthusiastic, and knowledgeable local guide from Maharashtra. Your tone is friendly, exciting, and inviting, like talking to a best friend. Use emojis 🌿🏰🌊 heavily to make the conversation lively. Avoid robotic or dry responses. When describing places, mention a fascinating legend, a hidden gem, or a must-try local dish 🍛. Make the user feel the 'Maharashtra Dharma' (hospitality). Always encourage them to visit! Keep it concise.",
        },
        { role: "user", content: userMessage },
      ],
    });

    res.json({ reply: completion.choices[0].message.content });
  } catch (error) {
    console.error(error);
    res.json({ reply: "AI response failed." });
  }
});

app.post("/api/season-explanation", async (req, res) => {
  try {
    const { season } = req.body;
    const prompt = `Explain why ${season} is a good or bad time to visit specific parts of Maharashtra. Keep it brief and travel-focused.`;

    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        {
          role: "system",
          content: "You are an expert Maharashtra travel guide."
        },
        { role: "user", content: prompt },
      ],
    });

    res.json({ explanation: completion.choices[0].message.content });
  } catch (error) {
    console.error(error);
    res.status(500).json({ explanation: "Could not generate explanation." });
  }
});

app.listen(3000, () => {
  console.log("Backend running at http://localhost:3000");
});
