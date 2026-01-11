async function sendMessage() {
  const input = document.getElementById("userInput");
  const message = input.value.trim();

  if (message === "") return;

  const chatBox = document.getElementById("chatMessages");

  // Show user message
  const userMsg = document.createElement("p");
  userMsg.className = "user-message";
  userMsg.innerText = message;
  chatBox.appendChild(userMsg);

  input.value = "";
  chatBox.scrollTop = chatBox.scrollHeight;

  // Show typing indicator
  const botMsg = document.createElement("p");
  botMsg.className = "bot-message";
  botMsg.innerText = "Typing...";
  chatBox.appendChild(botMsg);

  try {
    const response = await fetch("http://localhost:3000/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ message })
    });

    const data = await response.json();
    botMsg.innerText = data.reply;
  } catch (error) {
    botMsg.innerText = "Sorry, something went wrong.";
    console.error(error);
  }

  chatBox.scrollTop = chatBox.scrollHeight;
}

// ===== AI ITINERARY GENERATOR =====


// Map instance
let map = null;
let routingControl = null;

async function getCoordinates(placeName) {
  // Append state/country to ensure local results
  const query = `${placeName}, Maharashtra, India`;
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`, {
      headers: {
        'User-Agent': 'MaharashtraTourGuide/1.0'
      }
    });
    const data = await response.json();
    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
        name: placeName
      };
    } else {
      // Fallback: Try searching without "Maharashtra, India" if too specific
      const retryResponse = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(placeName)}&limit=1`, {
        headers: { 'User-Agent': 'MaharashtraTourGuide/1.0' }
      });
      const retryData = await retryResponse.json();
      if (retryData && retryData.length > 0) {
        return { lat: parseFloat(retryData[0].lat), lng: parseFloat(retryData[0].lon), name: placeName };
      }
    }
  } catch (error) {
    console.warn(`Failed to geocode ${placeName}:`, error);
  }
  return null;
}

async function generateItinerary() {
  const city = document.getElementById("cityInput").value;
  const days = parseInt(document.getElementById("daysInput").value);
  const season = document.getElementById("seasonInput").value;
  const language = document.getElementById("languageInput").value;
  const resultDiv = document.getElementById("itineraryResult");
  const mapDiv = document.getElementById("map");

  if (!city) {
    alert("Please enter a destination city");
    return;
  }

  resultDiv.style.display = "block";
  mapDiv.style.display = "none";
  resultDiv.innerHTML = "<p>Generating itinerary using AI...</p>";

  // Updated Prompt: Strict Location Validation & Language Enforcement
  const prompt = `
    You are an expert local guide for Maharashtra, India.
    User Request: Create a ${days}-day itinerary for "${city}" in ${season} season.
    Target Language: ${language} (Strictly enforce this).

    STEP 1: VALIDATE LOCATION
    - Is "${city}" a known place in Maharashtra, India?
    - If it is a locality (e.g., "Shivajinagar", "Bandra"), assume the main city (e.g., "Pune", "Mumbai") and proceed.
    - If it is NOT in Maharashtra (e.g., "Delhi", "Paris", "Bangalore"), RETURN ERROR JSON.

    STEP 2: GENERATE ITINERARY
    - If valid, create a detailed day-by-day plan.

    CRITICAL: 
    - Return ONLY valid JSON. 
    - NO trailing commas. 
    - NO comments (like // or /* */) inside the JSON.
    - NO markdown formatting.

    Format for SUCCESS:
    {
      "valid": true,
      "city_name": "Pune",
      "itinerary": [
        {
          "day": 1,
          "details": "Morning: Visit Shaniwar Wada..."
        }
      ],
      "location_names": [
        "Shaniwar Wada, Pune",
        "Raja Dinkar Kelkar Museum, Pune"
      ]
    }

    Format for ERROR (Not in Maharashtra):
    {
      "valid": false,
      "error": "I can only plan trips within Maharashtra. '${city}' seems to be outside."
    }

    IMPORTANT for "location_names":
    1. Order them geographically for a smooth route.
    2. Use English for location names to ensure map compatibility.
    3. Include 4-6 key stops.
  `;

  try {
    const response = await fetch("http://localhost:3000/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: prompt }),
    });

    if (!response.ok) {
      throw new Error(`Server Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    let replyText = data.reply;

    // Clean up markdown
    replyText = replyText.replace(/```json/g, "").replace(/```/g, "").trim();

    // Extract JSON object if wrapped in text
    const startIndex = replyText.indexOf('{');
    const endIndex = replyText.lastIndexOf('}');
    if (startIndex !== -1 && endIndex !== -1) {
      replyText = replyText.substring(startIndex, endIndex + 1);
    }

    // SANITIZATION: Remove comments (// ... and /* ... */) which break JSON.parse
    replyText = replyText.replace(/\/\/.*$/gm, ""); // Remove single line comments
    replyText = replyText.replace(/\/\*[\s\S]*?\*\//g, ""); // Remove multi-line comments

    // SANITIZATION: Additional cleanup
    replyText = replyText.replace(/,\s*([\]}])/g, '$1'); // Remove trailing commas aggressively

    let parsedData;
    const sanitizedText = replyText.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/gs, (match) => {
      return match.replace(/\n/g, "\\n").replace(/\r/g, "\\r");
    });

    try {
      // 1. Try Strict Parsing
      parsedData = JSON.parse(sanitizedText);
    } catch (e) {
      console.warn("Strict parse failed, trying relaxed parse...");
      try {
        // 2. Try Relaxed Parsing (handles trailing commas, single quotes, comments)
        parsedData = (new Function("return " + replyText))();
      } catch (e2) {
        console.error("JSON Parse Error", e2);
        // 3. Fail Gracefully - User asked NOT to show raw text
        resultDiv.innerHTML = `<div class='alert alert-danger'>
           <strong>Formatting Error</strong><br>
           The AI generated a plan but we couldn't format it correctly. 
           Please try clicking "Generate Itinerary" again.
         </div>`;
        return;
      }
    }

    resultDiv.innerHTML = "";

    // Check Validation
    if (parsedData.valid === false) {
      resultDiv.innerHTML = `<div class="alert alert-danger"><b>Location Error:</b> ${parsedData.error}</div>`;
      return;
    }

    // Render Itinerary Cards
    if (parsedData.itinerary && Array.isArray(parsedData.itinerary)) {
      parsedData.itinerary.forEach((dayPlan) => {
        let content = dayPlan.details || "Details not available.";
        resultDiv.innerHTML += `
          <div class="card mb-3 shadow">
            <div class="card-body">
              <h5 class="card-title">Day ${dayPlan.day}</h5>
              <div class="card-text" style="font-family: Roboto;">
                ${content}
              </div>
            </div>
          </div>
        `;
      });
    }

    // Process Map with Optimized Geocoding (Parallel + Staggered)
    if (parsedData.location_names && parsedData.location_names.length > 0) {
      mapDiv.style.display = "block";
      const loadingMsgId = "map-loading-msg";
      resultDiv.innerHTML += `<p id="${loadingMsgId}" class="text-muted"><small>Fetching map data...</small></p>`;

      // Initialize Map if needed
      if (!map) {
        map = L.map('map');
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors'
        }).addTo(map);
      }
      setTimeout(() => { map.invalidateSize(); }, 100);

      // Reset Layers
      if (routingControl) {
        map.removeControl(routingControl);
        routingControl = null;
      }
      map.eachLayer((layer) => {
        if (layer instanceof L.Marker) map.removeLayer(layer);
      });

      // Optimized Coordinates Fetching
      const fetchCoordinate = async (locName, delay) => {
        // Check cache
        const cacheKey = `geo:${locName}`;
        const cached = localStorage.getItem(cacheKey);
        if (cached) return JSON.parse(cached);

        // Staggered delay to respect rate limits but go faster
        await new Promise(r => setTimeout(r, delay));

        const coords = await getCoordinates(locName);
        if (coords) {
          localStorage.setItem(cacheKey, JSON.stringify(coords));
        }
        return coords;
      };

      // Create array of promises with staggered delays (600ms apart)
      // This is much faster than awaiting each one sequentially (1100ms)
      const coordPromises = parsedData.location_names.map((loc, i) => fetchCoordinate(loc, i * 600));

      const results = await Promise.all(coordPromises);
      const waypoints = results.filter(c => c !== null).map(c => L.latLng(c.lat, c.lng));

      // Remove loading message
      const loadingMsg = document.getElementById(loadingMsgId);
      if (loadingMsg) loadingMsg.remove();

      // Add Routing Control
      if (waypoints.length > 0) {
        routingControl = L.Routing.control({
          waypoints: waypoints,
          routeWhileDragging: false,
          showAlternatives: false,
          fitSelectedRoutes: true,
          lineOptions: {
            styles: [{ color: 'blue', opacity: 0.7, weight: 5 }]
          },
          createMarker: function (i, wp, nWps) {
            // Use the original name from the list if possible
            const label = parsedData.location_names[i] || `Stop ${i + 1}`;
            return L.marker(wp.latLng).bindPopup(label);
          }
        }).addTo(map);
      } else {
        mapDiv.innerHTML += `<div class="alert alert-warning">Could not locate places on the map.</div>`;
      }
    }

  } catch (error) {
    console.error(error);
    resultDiv.innerHTML = `<div class="alert alert-danger">Failed to generate itinerary. <br><small>${error.message}</small></div>`;
  }
}


// ===== SEASONAL PLANNER =====

const seasonalData = {
  monsoon: {
    recommended: [
      { name: "Lonavala & Khandala", text: "Famous for waterfalls and lush greenery.", img: "https://govindaresorts.com/wp-content/uploads/june-blog2-cover.jpg" },
      { name: "Malshej Ghat", text: "Cloud-kissed peaks and migratory flamingos.", img: "https://www.tourmyindia.com/states/maharashtra/images/malshej-ghat1.jpg" },
      { name: "Bhimashankar", text: "Misty forests and ancient Jyotirlinga.", img: "https://www.revv.co.in/blogs/wp-content/uploads/2020/05/Bhimshankar-Temple-1280x720.jpg" }
    ],
    avoid: [
      { name: "Beaches (Konkan)", text: "High tides and rough seas make it unsafe.", img: "https://mediaim.expedia.com/destination/2/aa05685d4972ffb269e7a8433432695e.jpg" }
    ]
  },
  summer: {
    recommended: [
      { name: "Mahabaleshwar", text: "Cool climate and strawberry farms.", img: "https://hikerwolf.com/wp-content/uploads/2020/09/lodwick_point1.jpg" },
      { name: "Tadoba Andhari", text: "Best time for tiger sightings at waterholes.", img: "https://media.istockphoto.com/id/1129798883/photo/tigress-crossing-near-sign-board-tadoba-maharashtra-india.jpg?s=612x612&w=0&k=20&c=fEqDPAPgewG_atvN2pkS3u0nl7PYT7cj161zAl8DCPY=" },
      { name: "Alibaug", text: "Coastal breeze makes evenings pleasant.", img: "https://www.fabhotels.com/blog/wp-content/uploads/2023/05/Kulaba-Fort.jpg" }
    ],
    avoid: [
      { name: "Nagpur & Vidarbha", text: "Extremely high temperatures (45°C+).", img: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Nagpur_Railway_Station.jpg/1200px-Nagpur_Railway_Station.jpg" }
    ]
  },
  winter: {
    recommended: [
      { name: "Aurangabad (Ajanta/Ellora)", text: "Pleasant weather for exploring caves.", img: "https://travelsetu.com/apps/uploads/new_destinations_photos/destination/2023/12/28/645e299540a48d37deab1dc2c14c8bad_1000x1000.jpg" },
      { name: "Nashik (Vineyards)", text: "Perfect for wine tours and tasting.", img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRTze2w325ty8k5xo62vQOvCsgYevTNJpsamQ&s" },
      { name: "Tarkarli", text: "Clear waters ideal for scuba diving.", img: "https://www.captureatrip.com/_next/image?url=https%3A%2F%2Fcaptureatrip-cms-storage.s3.ap-south-1.amazonaws.com%2FPlaces_to_Visit_in_Tarkarli_2e9660fa98.webp&w=3840&q=50" }
    ],
    avoid: [
      { name: "Malshej Ghat", text: "Waterfalls dry up; less scenic than monsoon.", img: "https://www.tourmyindia.com/states/maharashtra/images/malshej-ghat1.jpg" }
    ]
  }
};

function filterSeason() {
  const seasonSelect = document.getElementById("seasonSelect");
  if (!seasonSelect) return; // Guard clause if element doesn't exist

  const season = seasonSelect.value;
  const data = seasonalData[season];

  const recContainer = document.getElementById("recommendedTrips");
  const notRecContainer = document.getElementById("notRecommendedTrips");

  if (recContainer) {
    recContainer.innerHTML = data.recommended.map(place => `
      <div class="col-md-4 mb-3">
        <div class="card h-100 shadow-sm border-success" style="border-width: 0 0 0 4px;">
          <img src="${place.img}" class="card-img-top" alt="${place.name}" style="height: 150px; object-fit: cover;">
          <div class="card-body">
            <h5 class="card-title" style="font-family: 'Playfair Display', serif;">${place.name}</h5>
            <p class="card-text small text-muted">${place.text}</p>
          </div>
        </div>
      </div>
    `).join("");
  }

  if (notRecContainer) {
    notRecContainer.innerHTML = data.avoid.map(place => `
      <div class="col-md-4 mb-3">
        <div class="card h-100 shadow-sm border-danger" style="border-width: 0 0 0 4px;">
           <img src="${place.img}" class="card-img-top" alt="${place.name}" style="height: 150px; object-fit: cover;">
          <div class="card-body">
            <h5 class="card-title" style="font-family: 'Playfair Display', serif;">${place.name}</h5>
            <p class="card-text small text-muted">${place.text}</p>
          </div>
        </div>
      </div>
    `).join("");
  }

  // Reset AI box
  const aiBox = document.getElementById("aiExplanation");
  if (aiBox) aiBox.classList.add("d-none");
}


async function explainSeason() {
  const season = document.getElementById("seasonSelect").value;
  const box = document.getElementById("aiExplanation");

  box.classList.remove("d-none");
  box.innerHTML = "🤖 Generating explanation...";

  try {
    const response = await fetch("http://localhost:3000/api/season-explanation", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ season })
    });

    const data = await response.json();
    box.innerHTML = `<b>AI Insight:</b><br>${data.explanation}`;

  } catch (error) {
    box.innerHTML = "⚠️ Unable to fetch AI explanation at the moment.";
    console.error(error);
  }
}

// Initial load if on the page
document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("seasonSelect")) {
    filterSeason();
  }
});
