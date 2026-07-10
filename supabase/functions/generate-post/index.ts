const DAILY_AI_LIMIT = 3;
const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
const RETRYABLE_GEMINI_STATUSES = new Set([429, 500, 503, 504]);

class ProviderError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 503,
  ) {
    super(message);
  }
}

Deno.serve(async (req) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, headers);
  }

  let authorization = "";
  let claimId = "";
  let keepClaim = false;

  try {
    authorization = req.headers.get("authorization") || "";
    if (!authorization.toLowerCase().startsWith("bearer ")) {
      return json({ error: "Authentication is required" }, 401, headers);
    }

    const body = await req.json();
    const content = String(body?.content || "").trim();
    const postStyle = String(body?.post_style || "").trim();
    const platform = normalizePlatform(body?.platform);
    const username = sanitizeUsername(body?.social_profile?.username);
    const profileUrl = sanitizeProfileUrl(body?.social_profile?.profile_url);
    const mentions = extractMentions(content); // 2/7/2026

    if (!content) {
      return json({ error: "Content is required" }, 400, headers);
    }

    if (content.length > 1200) {
      return json({ error: "Content is too long" }, 400, headers);
    }

    if (!postStyle) {
      return json({ error: "Post style is required" }, 400, headers);
    }

    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiApiKey) {
      return json({
        code: "ai_provider_config_error",
        error: "خدمة الذكاء الاصطناعي غير مهيأة حاليًا.",
      }, 503, headers);
    }

    const dailyLimit = await claimDailyAiGeneration(authorization);
    if (!dailyLimit.allowed) {
      return json({
        code: "ai_daily_limit_reached",
        error: `انتهى حد اليوم: استخدمت ${dailyLimit.used_count} من ${dailyLimit.limit_count} منشورات AI اليوم. يمكنك المحاولة مرة أخرى بعد بداية اليوم الجديد بتوقيت جرينتش UTC.`,
        used_count: dailyLimit.used_count,
        limit_count: dailyLimit.limit_count,
        reset_timezone: "UTC",
      }, 429, headers);
    }
    claimId = dailyLimit.claim_id;

    const prompt = buildPrompt({
      content,
      postStyle: postStyle.slice(0, 80),
      platform,
      username,
      profileUrl,
      mentions, // 2/7/2026
    });

    const data = await generateWithGemini(geminiApiKey, prompt);
    const generatedPost = extractGeneratedPost(data); // 2/7/2026

    if (!generatedPost) {
      return json({
        code: "ai_no_content",
        error: "لم تُرجع خدمة الذكاء الاصطناعي نصًا. لم تُحتسب هذه المحاولة؛ حاول مرة أخرى.",
      }, 502, headers);
    }

    keepClaim = true;
    return json({ generated_post: generatedPost }, 200, headers);
  } catch (error) {
    console.log("GENERATE_POST_ERROR:", error instanceof Error ? error.message : "Unknown error");
    if (error instanceof ProviderError) {
      return json({ code: error.code, error: error.message }, error.status, headers);
    }
    return json({ error: "Unexpected server error" }, 500, headers);
  } finally {
    if (claimId && !keepClaim && authorization) {
      await releaseDailyAiGeneration(authorization, claimId).catch((error) => {
        console.log("DAILY_LIMIT_RELEASE_ERROR:", error instanceof Error ? error.message : "Unknown error");
      });
    }
  }
});

async function claimDailyAiGeneration(authorization: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing Supabase function environment");
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/claim_daily_ai_generation_v2`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supabaseAnonKey,
      authorization,
    },
    body: JSON.stringify({ max_daily: DAILY_AI_LIMIT }),
  });

  if (!response.ok) {
    console.log("DAILY_LIMIT_ERROR:", response.status);
    throw new Error("Daily limit check failed");
  }

  const payload = await response.json();
  const row = Array.isArray(payload) ? payload[0] : payload;

  return {
    allowed: Boolean(row?.allowed),
    used_count: Number(row?.used_count || 0),
    limit_count: Number(row?.limit_count || DAILY_AI_LIMIT),
    claim_id: String(row?.claim_id || ""),
  };
}

async function releaseDailyAiGeneration(authorization: string, claimId: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !supabaseAnonKey) return;

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/release_daily_ai_generation`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supabaseAnonKey,
      authorization,
    },
    body: JSON.stringify({ target_claim_id: claimId }),
  });

  if (!response.ok) {
    throw new Error(`Daily limit release failed (${response.status})`);
  }
}

async function generateWithGemini(apiKey: string, prompt: string) {
  let lastStatus = 0;
  let lastBody = "";

  for (const model of GEMINI_MODELS) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (attempt > 0) await sleep(800 * (attempt + 1));

      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
            }),
            signal: AbortSignal.timeout(30000),
          },
        );

        if (response.ok) return await response.json();

        lastStatus = response.status;
        lastBody = (await response.text().catch(() => "")).slice(0, 800);
        console.log("GEMINI_API_ERROR:", model, response.status, lastBody);

        if (!RETRYABLE_GEMINI_STATUSES.has(response.status)) break;
      } catch (error) {
        lastStatus = 503;
        lastBody = error instanceof Error ? error.message : "Network error";
        console.log("GEMINI_NETWORK_ERROR:", model, lastBody);
      }
    }
  }

  if (lastStatus === 403) {
    throw new ProviderError(
      "ai_provider_config_error",
      "مفتاح خدمة الذكاء الاصطناعي غير صالح حاليًا. لم تُحتسب هذه المحاولة.",
    );
  }

  if (lastStatus === 429) {
    throw new ProviderError(
      "ai_provider_busy",
      "خدمة الذكاء الاصطناعي وصلت إلى حدها المؤقت. لم تُحتسب هذه المحاولة؛ حاول بعد قليل.",
    );
  }

  throw new ProviderError(
    "ai_provider_unavailable",
    "خدمة الذكاء الاصطناعي غير متاحة مؤقتًا. لم تُحتسب هذه المحاولة؛ حاول مرة أخرى.",
  );
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function buildPrompt(input: {
  content: string;
  postStyle: string;
  platform: "linkedin" | "x" | "instagram";
  username: string;
  profileUrl: string;
  mentions: string[]; // 2/7/2026
}) {
  const postStyle = normalizePostStyle(input.postStyle); // 2/7/2026
  const platformInstructions = {
    linkedin: [
      "اكتب منشور LinkedIn طبيعي وبشري.", // 2/7/2026
      "اجعل الأسلوب شخصيًا واحترافيًا.", // 2/7/2026
      "لا تجعل النص يبدو كبيان شركة رسمي.", // 2/7/2026
      "استخدم فقرات قصيرة.", // 2/7/2026
      "ابدأ بخطاف قوي أو تجربة شخصية.", // 2/7/2026
      "اجعل المنشور واقعيًا وكأن مطورًا حقيقيًا كتبه.", // 2/7/2026
      "لا تبالغ بالكلمات الرسمية.", // 2/7/2026
      "أضف حتى 3 هاشتاقات مناسبة، ويجب أن يكون #DevLogAI واحدًا منها.", // 2/7/2026
    ],
    x: [
      "اكتب منشور X طبيعي ومباشر.", // 2/7/2026
      "اجعل الفكرة كاملة وواضحة بدون قطع.", // 2/7/2026
      "استخدم نبرة مناسبة لمنشورات X.", // 2/7/2026
      "لا تختصر إذا كان الاختصار سيجعل المعنى ناقصًا.", // 2/7/2026
      "أضف حتى 3 هاشتاقات مناسبة، ويجب أن يكون #DevLogAI واحدًا منها.", // 2/7/2026
    ],
    instagram: [
      "اكتب منشور Instagram casual.", // 2/7/2026
      "أسلوب خفيف وشخصي.", // 2/7/2026
      "استخدم Emojis باعتدال.", // 2/7/2026
      "اجعل المنشور تفاعليًا.", // 2/7/2026
      "أضف حتى 3 هاشتاقات مناسبة، ويجب أن يكون #DevLogAI واحدًا منها.", // 2/7/2026
    ],
  }[input.platform].join("\n- ");
  const styleInstructions = getStyleInstructions(postStyle.key).join("\n- "); // 2/7/2026
  const mentionInstruction = input.mentions.length // 2/7/2026
    ? `إشارات كتبها المستخدم داخل الإنجاز: ${input.mentions.map((mention) => `@${mention}`).join(", ")}\n- حافظ على هذه الإشارات كما هي داخل المنشور إذا كانت مرتبطة بالسياق.\n- لا تضع مسافة بعد @ ولا تغيّر اليوزرنيم.\n- مثال: @monaj94 يبقى @monaj94.` // 2/7/2026
    : "إذا لم يكتب المستخدم إشارة تبدأ بـ @ داخل الإنجاز، لا تخترع أي إشارة."; // 2/7/2026

  const accountInstruction = input.username || input.profileUrl
    ? [
      "بيانات حساب المستخدم على المنصة:",
      `- اسم المستخدم: ${input.username ? `@${input.username}` : "غير محدد"}`,
      `- رابط الحساب: ${input.profileUrl || "غير محدد"}`,
      "استخدم اسم المستخدم أو رابط الحساب داخل النص عندما يكون مناسبًا وطبيعيًا. لا تخترع حسابات أو أسماء.",
    ].join("\n")
    : "لا توجد بيانات حساب محفوظة لهذه المنصة. لا تخترع يوزر نيم أو رابط حساب.";

  return `
أنت محرك كتابة لمنصة DevLog AI.

مهمتك:
تحويل إنجاز المستخدم إلى منشور جاهز للنشر باللغة العربية الممتازة.

قواعد مهمة:
- أعد النص النهائي فقط.
- لا تكتب مقدمات أو شرحًا.
- لا تستخدم Markdown.
- لا تقل: "إليك المنشور" أو "ها هي الصياغة" أو "بالتأكيد".
- ابدأ مباشرة بالمحتوى.
- اجعل النص طبيعيًا وبشريًا.
- أضف حتى 3 هاشتاقات في النهاية، ويجب أن يكون #DevLogAI واحدًا منها.
- إذا كتب المستخدم @username داخل الإنجاز، حافظ عليه كما هو.
- يجب أن ينتهي المنشور بجملة كاملة وغير مقطوعة.

تعليمات المنصة:
- ${platformInstructions}

${accountInstruction}

تعليمات الإشارات:
${mentionInstruction}

نوع المنشور:
${postStyle.label}

تعليمات النمط:
- ${styleInstructions}

الإنجاز:
${input.content}
`;
}

function normalizePlatform(value: unknown): "linkedin" | "x" | "instagram" {
  return value === "x" || value === "instagram" ? value : "linkedin";
}

function extractMentions(content: string) { // 2/7/2026
  const mentions = new Set<string>(); // 2/7/2026
  const matcher = /(?:^|\s)@([A-Za-z0-9._-]{1,80})/g; // 2/7/2026
  let match: RegExpExecArray | null; // 2/7/2026
  while ((match = matcher.exec(content)) !== null) { // 2/7/2026
    mentions.add(match[1]); // 2/7/2026
  } // 2/7/2026
  return Array.from(mentions); // 2/7/2026
} // 2/7/2026

type PostStyleKey = "professional" | "friendly" | "motivational" | "technical" | "short" | "storytelling"; // 2/7/2026
 // 2/7/2026
function normalizePostStyle(value: unknown): { key: PostStyleKey; label: string } { // 2/7/2026
  const raw = String(value || "").trim().toLowerCase(); // 2/7/2026
  const styleMap: Record<PostStyleKey, string[]> = { // 2/7/2026
    professional: ["professional", "احترافي"], // 2/7/2026
    friendly: ["friendly", "ودي", "ودّي"], // 2/7/2026
    motivational: ["motivational", "تحفيزي"], // 2/7/2026
    technical: ["technical", "تقني"], // 2/7/2026
    short: ["short", "مختصر"], // 2/7/2026
    storytelling: ["storytelling", "قصصي"], // 2/7/2026
  }; // 2/7/2026
  const labels: Record<PostStyleKey, string> = { // 2/7/2026
    professional: "احترافي", // 2/7/2026
    friendly: "ودّي", // 2/7/2026
    motivational: "تحفيزي", // 2/7/2026
    technical: "تقني", // 2/7/2026
    short: "مختصر", // 2/7/2026
    storytelling: "قصصي", // 2/7/2026
  }; // 2/7/2026
  const key = Object.entries(styleMap).find(([, names]) => names.includes(raw))?.[0] as PostStyleKey | undefined; // 2/7/2026
  const safeKey = key || "professional"; // 2/7/2026
  return { key: safeKey, label: labels[safeKey] }; // 2/7/2026
} // 2/7/2026
 // 2/7/2026
function getStyleInstructions(style: PostStyleKey) { // 2/7/2026
  return { // 2/7/2026
    professional: [ // 2/7/2026
      "اجعل النص مهنيًا وواضحًا بدون مبالغة.", // 2/7/2026
      "ركز على القيمة والنتيجة وما تعلمه المستخدم.", // 2/7/2026
      "استخدم نبرة مناسبة لسوق العمل وبناء الحضور المهني.", // 2/7/2026
    ], // 2/7/2026
    friendly: [ // 2/7/2026
      "اكتب بأسلوب ودّي وبشري وقريب.", // 2/7/2026
      "خفف الرسمية واجعل التجربة تبدو شخصية.", // 2/7/2026
      "استخدم لغة بسيطة وواضحة.", // 2/7/2026
    ], // 2/7/2026
    motivational: [ // 2/7/2026
      "اجعل المنشور محفزًا ويركز على التقدم.", // 2/7/2026
      "اربط الإنجاز بالاستمرارية والتعلم.", // 2/7/2026
      "اختم بجملة تشجع على مواصلة البناء.", // 2/7/2026
    ], // 2/7/2026
    technical: [ // 2/7/2026
      "ركز على التفاصيل التقنية والأدوات المستخدمة.", // 2/7/2026
      "اشرح المشكلة والحل والنتيجة بشكل مختصر.", // 2/7/2026
      "لا تبسط المصطلحات التقنية زيادة عن اللازم.", // 2/7/2026
    ], // 2/7/2026
    short: [ // 2/7/2026
      "اكتب نصًا مباشرًا بدون حشو.", // 2/7/2026
      "حافظ على الفكرة كاملة حتى لو احتاجت أكثر من جملة.", // 2/7/2026
      "لا تقطع السياق ولا تنهي المنشور قبل اكتمال المعنى.", // 2/7/2026
    ], // 2/7/2026
    storytelling: [ // 2/7/2026
      "حوّل الإنجاز إلى قصة قصيرة.", // 2/7/2026
      "ابدأ بالسياق أو المشكلة ثم الفعل ثم النتيجة.", // 2/7/2026
      "اجعل السرد طبيعيًا وغير مصطنع.", // 2/7/2026
    ], // 2/7/2026
  }[style]; // 2/7/2026
} // 2/7/2026
 // 2/7/2026
function extractGeneratedPost(data: any) { // 2/7/2026
  const parts = data?.candidates?.[0]?.content?.parts; // 2/7/2026
  if (!Array.isArray(parts)) return ""; // 2/7/2026
  return parts.map((part: any) => String(part?.text || "")).join("").trim(); // 2/7/2026
} // 2/7/2026

function sanitizeUsername(value: unknown) {
  return String(value || "").trim().replace(/^@+/, "").replace(/[^\p{L}\p{N}._-]/gu, "").slice(0, 80);
}

function sanitizeProfileUrl(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  try {
    const url = new URL(raw);
    return ["http:", "https:"].includes(url.protocol) ? url.toString().slice(0, 300) : "";
  } catch {
    return "";
  }
}

function json(payload: Record<string, unknown>, status: number, headers: HeadersInit) {
  return new Response(JSON.stringify(payload), { status, headers });
}
