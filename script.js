const axios = require("axios");
const fs = require("fs");

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REFRESH_TOKEN = process.env.REFRESH_TOKEN;
const CAMPAIGN_ID = process.env.CAMPAIGN_ID;

async function fetchAllTiers(token) {
  const res = await axios.get(`https://www.patreon.com/api/oauth2/v2/campaigns/${CAMPAIGN_ID}`, {
    headers: { Authorization: `Bearer ${token}` },
    params: {
      include: "tiers",
      "fields[tier]": "title,amount_cents,description,image_url,url,patron_count,published,published_at"
    }
  });
  return res.data;
}

async function fetchAllMembers(token) {
  let allMembers = [];
  let allIncluded = [];
  
  let nextUrl = `https://www.patreon.com/api/oauth2/v2/campaigns/${CAMPAIGN_ID}/members`;
  let params = { 
    include: "currently_entitled_tiers,user", 
    "fields[user]": "full_name" 
  };

  while (nextUrl) {
    const isFirstPage = nextUrl.includes('?') === false;
    const res = await axios.get(nextUrl, {
      headers: { Authorization: `Bearer ${token}` },
      params: isFirstPage ? params : {}
    });

    allMembers.push(...res.data.data);
    if (res.data.included) {
      allIncluded.push(...res.data.included);
    }

    nextUrl = res.data.links?.next || null;
  }
  
  return { data: allMembers, included: allIncluded };
}

function processPatreonData(campaignData, membersData) {
  const tiersInfo = {};
  const allTiers = [];
  const tiersResult = {};

  if (campaignData.included) {
    campaignData.included.forEach(item => {
      if (item.type === "tier") {
        const tierData = { id: item.id, ...item.attributes };
        tiersInfo[item.id] = tierData;
        allTiers.push(tierData);
        
        tiersResult[item.id] = {
          tierId: item.id,
          tierName: tierData.title,
          amount_cents: tierData.amount_cents,
          supporters: []
        };
      }
    });
  }

  const usersInfo = {};
  
  if (membersData.included) {
    membersData.included.forEach(item => {
      if (item.type === "user") {
        usersInfo[item.id] = item.attributes.full_name;
      }
    });
  }

  membersData.data.forEach(member => {
    const tierData = member.relationships.currently_entitled_tiers?.data;
    if (!tierData || tierData.length === 0) return;

    const tierId = tierData[0].id;
    const userId = member.relationships.user?.data?.id;
    const userName = usersInfo[userId];

    if (tiersResult[tierId] && userName) {
      tiersResult[tierId].supporters.push(userName);
    }
  });

  const sortedSupporters = Object.values(tiersResult).sort((a, b) => b.amount_cents - a.amount_cents);
  const sortedTiers = allTiers.sort((a, b) => b.amount_cents - a.amount_cents);

  return { sortedSupporters, sortedTiers };
}

(async () => {
  try {
    const res = await axios.post("https://www.patreon.com/api/oauth2/token", null, {
      params: {
        grant_type: "refresh_token",
        refresh_token: REFRESH_TOKEN,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      },
      headers: { "Content-Type": "application/x-www-form-urlencoded" }
    });

    const accessToken = res.data.access_token;
    const newRefreshToken = res.data.refresh_token;

    const campaignData = await fetchAllTiers(accessToken);
    const membersData = await fetchAllMembers(accessToken);
    
    const { sortedSupporters, sortedTiers } = processPatreonData(campaignData, membersData);
    
    fs.writeFileSync("supporters.json", JSON.stringify(sortedSupporters, null, 2));
    fs.writeFileSync("membership_tiers.json", JSON.stringify(sortedTiers, null, 2));
    
    console.log(`---DATA_START---`);
    console.log(`NEW_REFRESH_TOKEN=${newRefreshToken}`);
    console.log(`---DATA_END---`);
    
    console.log("Supporters and Tiers JSONs completely updated!");
  } catch (e) {
    console.error(e.response?.data || e.message);
    process.exit(1);
  }
})();
