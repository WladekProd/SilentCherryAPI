const axios = require("axios");
const fs = require("fs");

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REFRESH_TOKEN = process.env.REFRESH_TOKEN;
const CAMPAIGN_ID = process.env.CAMPAIGN_ID;

async function fetchMembers(token) {
  const res = await axios.get(`https://www.patreon.com/api/oauth2/v2/campaigns/${CAMPAIGN_ID}/members`, {
    headers: { Authorization: `Bearer ${token}` },
    params: { 
      include: "currently_entitled_tiers,user", 
      "fields[user]": "full_name", 
      // Запрашиваем максимум полезной информации о самом тире
      "fields[tier]": "title,amount_cents,description,image_url,url,patron_count,published,published_at" 
    }
  });
  return res.data;
}

function processPatreonData(data) {
  const tiersInfo = {};
  const usersInfo = {};
  const allTiers = []; // Массив для файла tiers.json

  // 1. Собираем данные о тирах и пользователях
  if (data.included) {
    data.included.forEach(item => {
      if (item.type === "tier") {
        // Сохраняем всю пришедшую информацию о тире
        const tierData = {
          id: item.id,
          ...item.attributes // Разворачиваем все поля (title, description, image_url и т.д.)
        };
        tiersInfo[item.id] = tierData;
        allTiers.push(tierData);
      }
      if (item.type === "user") {
        usersInfo[item.id] = item.attributes.full_name;
      }
    });
  }

  const tiersResult = {};

  // 2. Распределяем спонсоров по тирам
  data.data.forEach(member => {
    const tierData = member.relationships.currently_entitled_tiers?.data;
    if (!tierData || tierData.length === 0) return;

    const tierId = tierData[0].id;
    const tier = tiersInfo[tierId];
    const userId = member.relationships.user?.data?.id;
    const userName = usersInfo[userId];

    if (tier && userName) {
      if (!tiersResult[tierId]) {
        tiersResult[tierId] = {
          tierId: tierId,
          tierName: tier.title,
          amount_cents: tier.amount_cents,
          supporters: []
        };
      }
      tiersResult[tierId].supporters.push(userName);
    }
  });

  // 3. Сортируем оба массива (от дорогих тиров к дешевым)
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

    const data = await fetchMembers(accessToken);
    
    // Получаем сразу оба объекта
    const { sortedSupporters, sortedTiers } = processPatreonData(data);
    
    // Сохраняем в два разных файла
    fs.writeFileSync("supporters.json", JSON.stringify(sortedSupporters, null, 2));
    fs.writeFileSync("tiers.json", JSON.stringify(sortedTiers, null, 2));
    
    console.log(`---DATA_START---`);
    console.log(`NEW_REFRESH_TOKEN=${newRefreshToken}`);
    console.log(`---DATA_END---`);
    
    console.log("Supporters and Tiers JSONs updated!");
  } catch (e) {
    console.error(e.response?.data || e.message);
    process.exit(1);
  }
})();
