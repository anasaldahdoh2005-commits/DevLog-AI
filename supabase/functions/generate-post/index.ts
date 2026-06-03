
Deno.serve(async (req) => {

  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods":
      "POST, OPTIONS",
    "Content-Type": "application/json",
  };

  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers,
    });
  }

  try {

    // قراءة البيانات
   const {
   content,
   post_style,
   platform
  } = await req.json();

    // Validation
    if (!content || typeof content !== "string") {

      return new Response(
        JSON.stringify({
          error: "Content is required",
        }),
        {
          status: 400,
          headers,
        }
      );
    }

    if (!post_style) {

      return new Response(
        JSON.stringify({
          error: "Post style is required",
        }),
        {
          status: 400,
          headers,
        }
      );
    }

    // Gemini API Key
    const GEMINI_API_KEY =
      Deno.env.get("GEMINI_API_KEY");

    if (!GEMINI_API_KEY) {

      return new Response(
        JSON.stringify({
          error: "Missing Gemini API Key",
        }),
        {
          status: 500,
          headers,
        }
      );
    }

    // Prompt
    let platformInstructions = '';
    if (platform === 'linkedin') {

platformInstructions = `
اكتب منشور LinkedIn طبيعي وبشري.

الشروط:
- اجعل الأسلوب شخصيًا واحترافيًا
- لا تجعل النص يبدو كبيان شركة رسمي
- استخدم فقرات قصيرة
- ابدأ بخطاف قوي أو تجربة شخصية
- اجعل المنشور واقعيًا وكأن مطورًا حقيقيًا كتبه
- لا تبالغ بالكلمات الرسمية
- أضف 3 هاشتاقات كحد أقصى
`;
}

else if (platform === 'x') {

  platformInstructions = `
اكتب منشور X قصير جدًا.

الشروط:
- الحد الأقصى 220 حرف
- جملة قوية ومباشرة
- بدون شرح طويل
- بدون فقرات كثيرة
- بدون حشو
- هاشتاق أو اثنين فقط
`;
}

else if (platform === 'instagram') {

  platformInstructions = `
اكتب منشور Instagram casual.

الشروط:
- أسلوب خفيف وشخصي
- استخدم Emojis باعتدال
- اجعل المنشور تفاعلي
- أضف هاشتاقات مناسبة
`;
}
const prompt = `
أنت محرك كتابة لمنصة DevLog AI.

مهمتك:
تحويل إنجازات المستخدم إلى منشورات جاهزة للنشر.

قواعد مهمة:
- أعد النص النهائي فقط
- ممنوع كتابة مقدمات
- ممنوع الشرح
- ممنوع Markdown
- ممنوع قول:
  "إليك المنشور"
  "ها هي الصياغة"
  "بالتأكيد"
- ابدأ مباشرة بالمحتوى
- اجعل النص طبيعيًا وبشريًا


${platformInstructions}

نوع المنشور:
${post_style}

الإنجاز:
${content}
`;

    // Request to Gemini
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt,
                },
              ],
            },
          ],
        }),
      }
    );

    // Gemini API failed
    if (!response.ok) {

      const errorText =
        await response.text();

      console.log(
        "GEMINI API ERROR:",
        errorText
      );

      return new Response(
        JSON.stringify({
          error: "Gemini API failed",
          details: errorText,
        }),
        {
          status: 500,
          headers,
        }
      );
    }

    // Parse response
    const data =
      await response.json();

    console.log(
      "GEMINI RESPONSE:",
      JSON.stringify(data)
    );

    // Extract generated text
    const generated_post =
      data?.candidates?.[0]
        ?.content?.parts?.[0]?.text;

    // No generated text
    if (!generated_post) {

      return new Response(
        JSON.stringify({
          error:
            "No text generated from Gemini",
        }),
        {
          status: 500,
          headers,
        }
      );
    }

    // Success response
    return new Response(
      JSON.stringify({
        generated_post,
      }),
      {
        status: 200,
        headers,
      }
    );

  } catch (error) {

    console.log(
      "FULL ERROR:",
      error
    );

    return new Response(
      JSON.stringify({
        error: error.message,
        full: String(error),
      }),
      {
        status: 500,
        headers,
      }
    );
  }
});