const axios = require("axios");
const fs = require("fs");

const TOKEN = process.env.PATREON_TOKEN;
const CAMPAIGN_ID = process.env.CAMPAIGN_ID;

async function fetchMembers() {
    const response = await axios.get(
        `https://www.patreon.com/api/oauth2/v2/campaigns/${CAMPAIGN_ID}/members`,
        {
            headers: {
                Authorization: `Bearer ${TOKEN}`
            },
            params: {
                include: "currently_entitled_tiers,user",
                "fields[user]": "full_name",
                "fields[tier]": "amount_cents"
            }
        }
    );

    return response.data;
}

function filterMembers(data) {
    const tiers = {};
    const users = {};

    data.included.forEach(item => {
        if (item.type === "tier") {
            tiers[item.id] = item.attributes.amount_cents;
        }

        if (item.type === "user") {
            users[item.id] = item.attributes.full_name;
        }
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

async function main() {
    const data = await fetchMembers();
    const supporters = filterMembers(data);

    fs.writeFileSync(
        "supporters.json",
        JSON.stringify(supporters, null, 2)
    );
}

main();
