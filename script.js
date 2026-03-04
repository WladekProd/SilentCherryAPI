const axios = require("axios");
const fs = require("fs");

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REFRESH_TOKEN = process.env.REFRESH_TOKEN;
const CAMPAIGN_ID = process.env.CAMPAIGN_ID;

async function refreshTokens() {
  const res = await axios.post("https://www.patreon.com/api/oauth2/token", null, {
    params: {
      grant_type: "refresh_token",
      refresh_token: REFRESH_TOKEN,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    },
    headers: { "Content-Type": "application/x-www-form-urlencoded" }
  });
  return {
    access: res.data.access_token,
    refresh: res.data.refresh_token 
  };
}

async function fetchMembers(token) {
  const res = await axios.get(`https://www.patreon.com/api/oauth2/v2/campaigns/${CAMPAIGN_ID}/members`, {
    headers: { Authorization: `Bearer ${token}` },
    params: { include: "currently_entitled_tiers,user", "fields[user]": "full_name", "fields[tier]": "amount_cents" }
  });
  return res.data;
}

function filterMembers(data) {
  const tiers = {};
  const users = {};
  data.included.forEach(item => {
    if (item.type === "tier") tiers[item.id] = item.attributes.amount_cents;
    if (item.type === "user") users[item.id] = item.attributes.full_name;
  });

  return data.data
    .filter(member => {
      const tierId = member.relationships.currently_entitled_tiers?.data?.[0]?.id;
      return tierId && tiers[tierId] >= 1500;
    })
    .map(member => {
      const userId = member.relationships.user.data.id;
      return users[userId];
    });
}

(async () => {
  try {
    const tokens = await refreshTokens();
    const data = await fetchMembers(tokens.access);
    const supporters = filterMembers(data);
    fs.writeFileSync("supporters.json", JSON.stringify(supporters, null, 2));

    console.log(`::add-mask::${tokens.refresh}`);
    console.log(`NEW_REFRESH_TOKEN=${tokens.refresh}`);
    
    console.log("Supporters JSON updated!");
  } catch (e) {
    console.error(e.response?.data || e.message);
    process.exit(1);
  }
})();
