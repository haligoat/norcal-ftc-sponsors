exports.handler = async function(event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  try {
    const body = JSON.parse(event.body);
    const team = body.team;

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + process.env.GEMINI_KEY,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: "Find the contact email for FTC robotics team: " + team + ". Check their website and FIRST profile at ftc-events.firstinspires.org. Reply with ONLY a JSON object like this, no markdown: {\"teamName\":\"\",\"teamNumber\":\"\",\"email\":\"\",\"emailSource\":\"\",\"website\":\"\",\"contactName\":\"\",\"confidence\":\"high or medium or low\",\"notes\":\"\"}"
            }]
          }],
          tools: [{ google_search: {} }]
        })
      }
    );

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || JSON.stringify(data);


    let result;
    try {
      const clean = text.replace(/^```json/, "").replace(/```$/, "").trim();
      result = JSON.parse(clean);
    } catch(e) {
      result = {
        teamName: team,
        teamNumber: null,
        email: null,
        emailSource: null,
        website: null,
        contactName: null,
        confidence: "low",
        notes: text.substring(0, 300)
      };
    }

    return { statusCode: 200, headers, body: JSON.stringify(result) };
  } catch(err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
