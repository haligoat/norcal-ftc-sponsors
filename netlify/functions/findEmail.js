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

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "web-search-2025-03-05"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        system: `You find contact emails for FTC robotics teams. Search their website, FIRST profile, and social media. Respond ONLY with JSON: {"teamName":"...","teamNumber":"...","email":"...or null","emailSource":"...or null","website":"...or null","contactName":"...or null","confidence":"high/medium/low","notes":"..."}`,
        messages: [{ role: "user", content: `Find contact email for FTC team: "${team}". Return JSON only.` }]
      })
    });

    const data = await response.json();
    console.log("API response:", JSON.stringify(data));

    const textBlock = data.content && data.content.find(b => b.type === "text");
    if (!textBlock) throw new Error("No text in response: " + JSON.stringify(data));

    const text = textBlock.text.replace(/```json|```/g, "").trim();
    const match = text.match(/\{[\s\S]+\}/);
    if (!match) throw new Error("No JSON found in: " + text);
    const result = JSON.parse(match[0]);

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type"
      },
      body: JSON.stringify(result)
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type"
      },
      body: JSON.stringify({ error: err.message })
    };
  }
};
