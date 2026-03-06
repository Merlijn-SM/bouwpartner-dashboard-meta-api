export default async function handler(req, res) {
  const token = process.env.META_ACCESS_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;

  if (!token || !adAccountId) {
    return res.status(500).json({
      error: "Missing META_ACCESS_TOKEN or META_AD_ACCOUNT_ID"
    });
  }

  try {
    // 1️⃣ Haal optionele query params op
    const { since: querySince, until: queryUntil } = req.query;

    // 2️⃣ Bepaal time range
    let since;
    let until;

    if (querySince && queryUntil) {
      // Gebruik periode uit URL
      since = querySince;
      until = queryUntil;
    } else {
      // Fallback: max 36 maanden terug
      const today = new Date();
      until = today.toISOString().slice(0, 10);

      const sinceDate = new Date();
      sinceDate.setMonth(sinceDate.getMonth() - 36);
      since = sinceDate.toISOString().slice(0, 10);
    }

    // 3️⃣ Haal ACTIVE campagnes op
    const campaignsUrl =
      `https://graph.facebook.com/v18.0/${adAccountId}/campaigns` +
      `?fields=id,name,status` +
      `&limit=100` +
      `&access_token=${encodeURIComponent(token)}`;

    const campaignsRes = await fetch(campaignsUrl, { cache: "no-store" });
    const campaignsJson = await campaignsRes.json();

    if (!campaignsRes.ok) {
      return res.status(campaignsRes.status).json({
        error: "Meta Campaigns API error",
        details: campaignsJson
      });
    }

    const activeCampaignNames = (campaignsJson.data || [])
      .filter(c => c.status === "ACTIVE")
      .map(c => c.name);

    if (activeCampaignNames.length === 0) {
      return res.status(200).json({ data: [] });
    }

    // 4️⃣ Insights request met JSON time_range
    const timeRange = JSON.stringify({ since, until });

    const insightsUrl =
      `https://graph.facebook.com/v18.0/${adAccountId}/insights` +
      `?level=campaign` +
      `&fields=campaign_name,spend,impressions,clicks,reach,frequency,actions` +
      `&time_range=${encodeURIComponent(timeRange)}` +
      `&access_token=${encodeURIComponent(token)}`;

    const insightsRes = await fetch(insightsUrl, { cache: "no-store" });
    const insightsJson = await insightsRes.json();

    if (!insightsRes.ok) {
      return res.status(insightsRes.status).json({
        error: "Meta Insights API error",
        details: insightsJson
      });
    }

    // 5️⃣ Filter alleen ACTIVE campagnes
    const rows = Array.isArray(insightsJson.data)
      ? insightsJson.data
      : [];

    const filteredData = rows.filter(row =>
      activeCampaignNames.includes(row.campaign_name)
    );

    return res.status(200).json({ data: filteredData });

  } catch (e) {
    return res.status(500).json({
      error: "Server error",
      details: String(e)
    });
  }
}
