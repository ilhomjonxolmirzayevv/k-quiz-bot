const Bot = require("node-telegram-bot-api");
const mongoose = require("mongoose");
const cron = require("node-cron");
const express = require("express");
require("dotenv").config();

// O'qituvchilar ID (misol uchun) — siz xohlasangiz bu listni DBga o'tkazishingiz mumkin
const TEACHERS = [1228723117];

// ====== Schemas ======
const wordSchema = new mongoose.Schema({
  chatId: Number,
  lesson: Number,
  en: String,
  uz: String,
  date: { type: Date, default: Date.now },
});
const Word = mongoose.model("Word", wordSchema);

// Foydalanuvchi sozlamalari (har bir foydalanuvchi uchun)
const userSettingsSchema = new mongoose.Schema({
  chatId: Number,
  remindersEnabled: { type: Boolean, default: true },
});
const UserSettings = mongoose.model("UserSettings", userSettingsSchema);

// O'qituvchi sozlamalari (o'qituvchi natija olishni o'chirishi mumkin)
const teacherSettingsSchema = new mongoose.Schema({
  teacherId: Number,
  receiveResults: { type: Boolean, default: true },
});
const TeacherSettings = mongoose.model("TeacherSettings", teacherSettingsSchema);

// In-memory sessiyalar
const userSessions = {};

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB ulandi");
    startBot();
  })
  .catch((err) => console.error("❌ MongoDB xatosi:", err));

function startBot() {
  const bot = new Bot(process.env.TELEGRAM_TOKEN, { polling: true });

  // ====== Helperlar ======
  async function getMainMenu(chatId) {
    return {
      reply_markup: {
        keyboard: [
          ["📚 Testni boshlash", "➕ So‘z qo‘shish"],
          ["📄 Mening so‘zlarim", "⚙️ Sozlamalar"],
        ],
        resize_keyboard: true,
      },
    };
  }

  function formatLessonList(words) {
    // Gruppalab chiqarish
    const byLesson = {};
    for (let w of words) {
      if (!byLesson[w.lesson]) byLesson[w.lesson] = [];
      byLesson[w.lesson].push(w);
    }
    const lessons = Object.keys(byLesson).sort((a, b) => a - b);
    const lines = [];
    for (let l of lessons) {
      lines.push(`📘 ${l}-dars:`);
      byLesson[l].forEach((w, i) => lines.push(`${i + 1}. ${w.en} — ${w.uz}`));
      lines.push('');
    }
    return { lines: lines.join("\n"), byLesson };
  }

  // START
  bot.onText(/^\/start$/, async (msg) => {
    const name = msg.from.first_name || msg.from.username || "O‘quvchi";
    const menu = await getMainMenu(msg.chat.id);
    bot.sendMessage(
      msg.chat.id,
      `👋 Salom, *${name}*!\nBu bot orqali inglizcha so‘zlarni o‘rganamiz.`,
      { ...menu, parse_mode: "Markdown" }
    );
  });

  // So'z qo'shish
  bot.onText(/➕ So‘z qo‘shish/, (msg) => {
    userSessions[msg.chat.id] = { waitingLesson: true };
    bot.sendMessage(msg.chat.id, "📖 Avval dars raqamini kiriting (masalan: `1`)", { parse_mode: "Markdown" });
  });

  // Mening so'zlarim — endi dars bo'yicha guruhlab yuboradi va har bir so'z uchun inline knopkalar beradi
  bot.onText(/📄 Mening so‘zlarim/, async (msg) => {
    const chatId = msg.chat.id;
    const words = await Word.find({ chatId }).sort({ lesson: 1, _id: 1 });
    if (!words.length) return bot.sendMessage(chatId, "📭 Sizda hali so‘zlar yo‘q.");

    const { byLesson } = formatLessonList(words);
    for (let l of Object.keys(byLesson).sort((a, b) => a - b)) {
      const list = byLesson[l];
      const textLines = [`📘 ${l}-dars:`];
      const inline = [];
      list.forEach((w, idx) => {
        textLines.push(`${idx + 1}. ${w.en} — ${w.uz}`);
        inline.push([
          { text: `✏️ ${w.en}`, callback_data: `edit_${w._id}` },
          { text: `🗑 ${w.en}`, callback_data: `delete_${w._id}` },
        ]);
      });

      await bot.sendMessage(chatId, textLines.join("\n"), {
        reply_markup: { inline_keyboard: inline },
      });
    }
  });

  // Testni boshlash — tanlaganidan keyin mode -> vaqt
  bot.onText(/📚 Testni boshlash/, async (msg) => {
    const chatId = msg.chat.id;
    const words = await Word.find({ chatId });
    if (!words.length) return bot.sendMessage(chatId, "📭 Sizda hali so‘zlar yo‘q.");

    userSessions[chatId] = { step: "chooseLesson" };

    const lessons = await Word.distinct("lesson", { chatId });
    const keyboard = lessons.map((l) => [`📘 ${l}-dars`]);
    keyboard.push(["📚 Barcha darslar"]);

    bot.sendMessage(chatId, "📝 Test uchun darsni tanlang:", {
      reply_markup: { keyboard, resize_keyboard: true, one_time_keyboard: true },
    });
  });

  // Sozlamalar menyusi
  bot.onText(/⚙️ Sozlamalar/, async (msg) => {
    const chatId = msg.chat.id;
    if (!userSessions[chatId]) userSessions[chatId] = {};
    const s = (await UserSettings.findOne({ chatId })) || (await UserSettings.create({ chatId }));

    // Agar foydalanuvchi o'qituvchi bo'lsa, o'qituvchi sozlamalarini ham ko'rsat
    const isTeacher = TEACHERS.includes(chatId);
    let teacherSettings = null;
    if (isTeacher) {
      teacherSettings = (await TeacherSettings.findOne({ teacherId: chatId })) || (await TeacherSettings.create({ teacherId: chatId }));
    }

    const inline = [
      [{ text: `${s.remindersEnabled ? '✅' : '❌'} Eslatmalar`, callback_data: `toggle_reminder` }],
    ];
    if (isTeacher) inline.push([{ text: `${teacherSettings.receiveResults ? '✅' : '❌'} Natijalarni qabul qilish`, callback_data: `toggle_teacher_${chatId}` }]);

    bot.sendMessage(chatId, "⚙️ Sozlamalar:", {
      reply_markup: { inline_keyboard: inline },
    });
  });

  // Umumiy message handler
  bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text?.trim();
    if (!text || text.startsWith("/")) return;

    if (!userSessions[chatId]) userSessions[chatId] = {};
    userSessions[chatId].userName = msg.from.first_name || msg.from.username || "Noma'lum";
    const session = userSessions[chatId];

    // So'z qo'shish: dars raqami
    if (session?.waitingLesson && /^\d+$/.test(text)) {
      session.waitingLesson = false;
      session.adding = true;
      session.lesson = parseInt(text);
      return bot.sendMessage(chatId, "✍️ Endi so‘zlarni kiriting:\n`cat - mushuk`\n`apple - olma`", { parse_mode: "Markdown" });
    }

    // So'z qo'shish: content
    if (session?.adding) {
      const lines = text.split("\n");
      let added = 0;
      for (let line of lines) {
        const parts = line.split("-");
        if (parts.length >= 2) {
          const en = parts[0].trim();
          const uz = parts.slice(1).join("-").trim();
          if (en && uz) {
            await Word.create({ chatId, lesson: session.lesson, en, uz });
            added++;
          }
        }
      }
      const count = await Word.countDocuments({ chatId });
      delete userSessions[chatId].adding;
      const menu = await getMainMenu(chatId);
      return bot.sendMessage(chatId, `✅ ${added} ta so‘z ${session.lesson}-darsga qo‘shildi!\n📚 Jami: ${count} ta`, menu);
    }

    // So'z tahrirlash
    if (session?.editing && text.includes("-")) {
      const parts = text.split("-");
      const en = parts[0].trim();
      const uz = parts.slice(1).join("-").trim();
      await Word.findByIdAndUpdate(session.editing, { en, uz });
      bot.sendMessage(chatId, `✅ So‘z yangilandi: ${en} — ${uz}`);
      delete userSessions[chatId].editing;
      return;
    }

    // Test bosqichlari
    if (session?.step === "chooseLesson") {
      if (text.includes("📘")) {
        session.lesson = parseInt(text.match(/\d+/)[0]);
      } else {
        session.lesson = "all";
      }
      session.step = "chooseMode";
      return bot.sendMessage(chatId, "🔄 Tarjimaning yo‘nalishini tanlang:", {
        reply_markup: { keyboard: [["EN → UZ", "UZ → EN"]], resize_keyboard: true, one_time_keyboard: true },
      });
    }

    if (session?.step === "chooseMode") {
      if (text === "EN → UZ") session.mode = "en-uz";
      else if (text === "UZ → EN") session.mode = "uz-en";
      else return bot.sendMessage(chatId, "❌ Noto‘g‘ri tanlov, qayta urinib ko‘ring.");

      // Endi vaqt tanlash: 3,5,7 yoki vaqtsiz
      session.step = "chooseDuration";
      return bot.sendMessage(chatId, "⏱ Vaqtni tanlang:", {
        reply_markup: { keyboard: [["3 daqiqa", "5 daqiqa", "7 daqiqa"], ["Vaqtsiz"]], resize_keyboard: true, one_time_keyboard: true },
      });
    }

    if (session?.step === "chooseDuration") {
      let ms = Infinity;
      if (text === "3 daqiqa") ms = 3 * 60 * 1000;
      else if (text === "5 daqiqa") ms = 5 * 60 * 1000;
      else if (text === "7 daqiqa") ms = 7 * 60 * 1000;
      else if (text === "Vaqtsiz") ms = Infinity;
      else return bot.sendMessage(chatId, "❌ Noto‘g‘ri tanlov, qayta urinib ko‘ring.");

      // Tayyorlangan so'zlar to'plami
      const filter = session.lesson === "all" ? { chatId } : { chatId, lesson: session.lesson };
      const words = await Word.find(filter);
      if (!words.length) return bot.sendMessage(chatId, "📭 Tanlangan darsda so‘z topilmadi.");

      session.words = words.sort(() => Math.random() - 0.5);
      session.index = 0; // index ko'rsatadi Hozirgi so'z joyi
      session.correct = 0;
      session.mistakes = [];
      session.correctAnswers = [];
      session.step = "inTest";
      session.paused = false;
      session.pauseStartedAt = null;
      session.testDuration = ms;
      session.endTime = ms === Infinity ? Infinity : Date.now() + ms;

      bot.sendMessage(chatId, `🚀 Test boshlandi! (${ms === Infinity ? 'Vaqtsiz' : Math.round(ms/60000) + ' daqiqa'}) ⏳`);
      return sendCurrentQuestion(chatId, bot);
    }

    // Javob tekshirish — faqat inTest va pauzada emas bo'lsa
    if (session?.step === "inTest" && session.currentWord && !session.paused) {
      if (session.waitTimer) clearTimeout(session.waitTimer);
      const answer = text.toLowerCase().trim();
      const correct = (session.mode === "en-uz" ? session.currentWord.uz : session.currentWord.en).toLowerCase();

      if (answer === correct) {
        session.correct++;
        session.correctAnswers.push(`✔️ ${session.currentWord.en} — ${session.currentWord.uz}`);
        await bot.sendMessage(chatId, "✅ To‘g‘ri!");
      } else {
        session.mistakes.push(`❌ ${session.currentWord.en} — ${session.currentWord.uz} (siz: ${answer})`);
        await bot.sendMessage(chatId, `❌ Noto‘g‘ri! To‘g‘ri javob: ${correct}`);
      }

      // Javobdan so'ng indexni oshirib keyingi savolni yuborish
      session.index += 1;
      return setTimeout(() => sendCurrentQuestion(chatId, bot), 1200);
    }
  });

  // Inline tugmalar handler
  bot.on("callback_query", async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    if (!userSessions[chatId]) userSessions[chatId] = {};
    const session = userSessions[chatId];

    // Pauza
    if (data === "pause" && session.step === "inTest") {
      if (session.waitTimer) clearTimeout(session.waitTimer);
      session.paused = true;
      session.pauseStartedAt = Date.now();
      await bot.sendMessage(chatId, "⏸ Test pauzaga qo‘yildi.", {
        reply_markup: { inline_keyboard: [[{ text: "▶️ Davom ettirish", callback_data: "resume" }]] },
      });
      return bot.answerCallbackQuery(query.id);
    }

    // Resume
    if (data === "resume" && session.paused) {
      // End timeni pause davomiyligi bilan to'g'rilash
      if (session.testDuration !== Infinity && session.pauseStartedAt) {
        const pausedFor = Date.now() - session.pauseStartedAt;
        session.endTime += pausedFor;
        session.pauseStartedAt = null;
      }
      session.paused = false;
      await bot.sendMessage(chatId, "▶️ Test davom etmoqda...");
      // Qaytadan hozirgi savolni yubor
      return sendCurrentQuestion(chatId, bot);
    }

    // To'xtatish
    if (data === "stop") {
      if (session.waitTimer) clearTimeout(session.waitTimer);
      const menu = await getMainMenu(chatId);
      bot.sendMessage(chatId, "⏹ Test to‘xtatildi.", menu);
      delete userSessions[chatId];
      return bot.answerCallbackQuery(query.id);
    }

    // So'zni o'chirish
    if (data.startsWith("delete_")) {
      const id = data.split("_")[1];
      await Word.findByIdAndDelete(id);
      // O'chirilgan button bosilgan xabarni tahrirlash
      try {
        await bot.editMessageText("🗑 So‘z o‘chirildi!", { chat_id: chatId, message_id: query.message.message_id });
      } catch (e) {
        // ignore
      }
      return bot.answerCallbackQuery(query.id, { text: "So‘z o‘chirildi" });
    }

    // So'zni tahrirlash
    if (data.startsWith("edit_")) {
      const id = data.split("_")[1];
      userSessions[chatId].editing = id;
      await bot.sendMessage(chatId, "✏️ Yangi ko‘rinishda kiriting:\n`apple - olma`", { parse_mode: "Markdown" });
      return bot.answerCallbackQuery(query.id);
    }

    // Sozlamalar toggle
    if (data === "toggle_reminder") {
      const s = (await UserSettings.findOne({ chatId })) || (await UserSettings.create({ chatId }));
      s.remindersEnabled = !s.remindersEnabled;
      await s.save();
      await bot.editMessageText(`⚙️ Sozlamalar:\nEslatmalar: ${s.remindersEnabled ? '✅' : '❌'}`, { chat_id: chatId, message_id: query.message.message_id });
      return bot.answerCallbackQuery(query.id);
    }

    if (data.startsWith("toggle_teacher_")) {
      const teacherId = parseInt(data.split("_")[2]);
      const t = (await TeacherSettings.findOne({ teacherId })) || (await TeacherSettings.create({ teacherId }));
      t.receiveResults = !t.receiveResults;
      await t.save();
      await bot.editMessageText(`⚙️ Sozlamalar:\nNatijalarni qabul qilish: ${t.receiveResults ? '✅' : '❌'}`, { chat_id: chatId, message_id: query.message.message_id });
      return bot.answerCallbackQuery(query.id);
    }

    bot.answerCallbackQuery(query.id);
  });

  // Savol yuborish: hozirgi indeks bo'yicha so'zni yuboradi, pauza va timeout bilan xavfsiz
  async function sendCurrentQuestion(chatId, bot) {
    const session = userSessions[chatId];
    if (!session) return;

    // Test muddati tugaganmi?
    if (session.testDuration !== Infinity && Date.now() > session.endTime) {
      return finishTest(chatId, bot);
    }

    if (session.index >= session.words.length) {
      return finishTest(chatId, bot);
    }

    // Hozirgi so'zni aniqlash (index hali oshirilmagan)
    session.currentWord = session.words[session.index];

    const q = session.mode === "en-uz" ? `❓ *${session.currentWord.en}* — o‘zbekchasini yozing` : `❓ *${session.currentWord.uz}* — inglizchasini yozing`;

    const inline = [[{ text: "⏸ Pauza", callback_data: "pause" }, { text: "⏹ To‘xtatish", callback_data: "stop" }]];

    await bot.sendMessage(chatId, q, { parse_mode: "Markdown", reply_markup: { inline_keyboard: inline } });

    // Per-question timeout — agar 60s ichida javob bo'lmasa keyingi savolga o'tish yoki testni tugatish
    if (session.waitTimer) clearTimeout(session.waitTimer);
    session.waitTimer = setTimeout(() => {
      // Agar hozir pauzada bo'lsa, qoldirish
      if (session.paused) return;
      // Agar test muddati tugagan bo'lsa
      if (session.testDuration !== Infinity && Date.now() > session.endTime) return finishTest(chatId, bot);

      // Per-question timeout: biz ushbu so'zni xato deb hisoblaymiz va davom etamiz
      session.mistakes.push(`❌ ${session.currentWord.en} — ${session.currentWord.uz} (javob berilmadi)`);
      session.index += 1;
      bot.sendMessage(chatId, "⏰ Javob yo‘q, keyingi savolga o‘tilmoqda.");
      return sendCurrentQuestion(chatId, bot);
    }, 60 * 1000);
  }

  // Testni tugatish
  async function finishTest(chatId, bot) {
    const session = userSessions[chatId];
    if (!session) return;

    // Clear timers
    if (session.waitTimer) clearTimeout(session.waitTimer);

    const total = session.words.length;
    const correct = session.correct || 0;
    const percent = total === 0 ? 0 : ((correct / total) * 100).toFixed(1);

    const mistakes = session.mistakes.length > 0 ? `\n❌ Xatolar:\n${session.mistakes.join("\n")}` : "\n✅ Hech qanday xato yo‘q!";
    const correctList = session.correctAnswers.length > 0 ? `\n✔️ To‘g‘ri javoblar:\n${session.correctAnswers.join("\n")}` : "";
    const menu = await getMainMenu(chatId);

    await bot.sendMessage(chatId, `📊 *Test tugadi!*\n✅ To‘g‘ri: ${correct}/${total}\n📈 Foiz: ${percent}%${mistakes}${correctList}`, { parse_mode: "Markdown", ...menu });

    // O'qituvchilarga natija yuborish faqat ularning sozlamalari yoqilgan bo'lsa
    for (let t of TEACHERS) {
      const ts = (await TeacherSettings.findOne({ teacherId: t })) || (await TeacherSettings.create({ teacherId: t }));
      if (!ts.receiveResults) continue;

      await bot.sendMessage(
        t,
        `👨‍🎓 O‘quvchi: *${session.userName || "Noma'lum"}*\n🆔 ID: ${chatId}\n📊 Natija: ${correct}/${total} (${percent}%)${mistakes}${correctList}`,
        { parse_mode: "Markdown" }
      );
    }

    delete userSessions[chatId];
  }

  // ====== Reminder cronlar (foydalanuvchi sozlamalariga qarab) ======
  cron.schedule(
    "0 8 * * *",
    async () => {
      const users = await UserSettings.find({ remindersEnabled: true }).select("chatId -_id");
      const ids = users.map((u) => u.chatId);
      // Agar hech kim sozlamaga qo'shilmagan bo'lsa, default bo'yicha Word.jamiga qarab yuborish
      if (!ids.length) {
        const all = await Word.distinct("chatId");
        for (let id of all) await bot.sendMessage(id, "🌅 Ertalabki salom! 📖 So‘zlarni takrorlashni unutmang!");
        return;
      }
      for (let id of ids) {
        // Faqat agar foydalanuvchida kamida bitta so'z bo'lsa
        const cnt = await Word.countDocuments({ chatId: id });
        if (cnt > 0) await bot.sendMessage(id, "🌅 Ertalabki salom! 📖 So‘zlarni takrorlashni unutmang!");
      }
    },
    { timezone: "Asia/Tashkent" }
  );

  cron.schedule(
    "0 20 * * *",
    async () => {
      const users = await UserSettings.find({ remindersEnabled: true }).select("chatId -_id");
      const ids = users.map((u) => u.chatId);
      if (!ids.length) {
        const all = await Word.distinct("chatId");
        for (let id of all) await bot.sendMessage(id, "🌙 Kechqurungi eslatma: 📚 Bugun o‘rgangan so‘zlaringizni qaytarib chiqing!");
        return;
      }
      for (let id of ids) {
        const cnt = await Word.countDocuments({ chatId: id });
        if (cnt > 0) await bot.sendMessage(id, "🌙 Kechqurungi eslatma: 📚 Bugun o‘rgangan so‘zlaringizni qaytarib chiqing!");
      }
    },
    { timezone: "Asia/Tashkent" }
  );
}

// Express server (health-check uchun)
const app = express();
app.get("/", (req, res) => res.send("Bot is running! ✅"));
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`🌐 Express server running on port ${PORT}`));
