exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
      },
      body: ""
    };
  }

  try {
    const { team } = JSON.parse(event.body);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Find the contact email for FTC robotics team: "${team}". Search their website and FIRST profile at ftc-events.firstinspires.org. Return ONLY this JSON with no extra text or markdown:\n{"teamName":"","teamNumber":"","email":"","emailSource":"","website":"","contactName":"","confidence":"high or medium or low","notes":""}\nIf you cannot find something put null for that field.`
            }]
          }],
          tools: [{ google_search: {} }],
          generationConfig: {
            response_mime_type: "application/json"
          }
        })
      }
    );

    const data = await response.json();
    console.log("Gemini raw:", JSON.stringify(data));

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    console.log("Gemini text:", text);

    // Try multiple ways to extract JSON
    let result;
    try {
      result = JSON.parse(text);
    } catch {
      const match = text.replace(/```json|```/g, "").trim().match(/\{[\s\S
