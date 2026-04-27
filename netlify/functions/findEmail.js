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
              text: `Search the web and find the contact email for this FTC robotics team: "${team}".
Check their website, FIRST Inspires profile at ftc-events.firstinspires.org, and any social media.
Respond ONLY with a JSON object, no markdown, no explanation:
{"teamName":"...","teamNumber":"...","email":"...or null","emailSource":"...or null","website":"...or null","contactName":"...or null","confidence":"high/medium/low","notes":"brief explanation"}`
            }]
          }],
          tools: [{ google_search: {} }]
        })
      }
    );

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const match = text.replace(/```json|```/g, "").trim().match(/\{[\s\S]+\}/);
    if (!match) throw new Error("No JSON in response: " + text);
    const result = JSON.parse(match[0]);

    return {
      statusCode: 200,
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type" },
      body: JSON.stringify(result)
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type" },
      body: JSON.stringify({ error: err.message })
    };
  }
};
