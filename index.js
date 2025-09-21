const Bot = require("node-telegram-bot-api");
const mongoose = require("mongoose");
const cron = require("node-cron");
require("dotenv").config();

const TEACHERS = [1228723117, 7921850499]; // O‘qituvchilar ID

// 🔹 So‘zlar uchun schema
const wordSchema = new mongoose.Schema({
    chatId: Number,
    lesson: Number,
    en: String,
    uz: String,
    date: { type: Date, default: Date.now },
});
const Word = mongoose.model("Word", wordSchema);

const userSessions = {}; // Foydalanuvchi sessiyalari

mongoose
    .connect(process.env.MONGO_URI)
    .then(() => {
        console.log("✅ MongoDB ulandi");
        startBot();
    })
    .catch((err) => console.error("❌ MongoDB xatosi:", err));

function startBot() {
    const bot = new Bot(process.env.TELEGRAM_TOKEN, { polling: true });

    // 🔹 Bosh menyu
    async function getMainMenu(chatId) {
        return {
            reply_markup: {
                keyboard: [
                    ["📚 Testni boshlash", "➕ So‘z qo‘shish"],
                    ["📄 Mening so‘zlarim"],
                ],
                resize_keyboard: true,
            },
        };
    }

    // START
    bot.onText(/^\/start$/, async (msg) => {
        const name = msg.from.first_name || msg.from.username || "O‘quvchi";
        const menu = await getMainMenu(msg.chat.id);
        bot.sendMessage(
            msg.chat.id,
            `👋 Salom, *${name}*!  
Bu bot orqali inglizcha so‘zlarni o‘rganamiz.`,
            { ...menu, parse_mode: "Markdown" }
        );
    });

    // ➕ So‘z qo‘shish
    bot.onText(/➕ So‘z qo‘shish/, (msg) => {
        userSessions[msg.chat.id] = { waitingLesson: true };
        bot.sendMessage(
            msg.chat.id,
            "📖 Avval dars raqamini kiriting (masalan: `1`)",
            { parse_mode: "Markdown" }
        );
    });

    // 📄 Mening so‘zlarim (inline tugmalar bilan)
    bot.onText(/📄 Mening so‘zlarim/, async (msg) => {
        const words = await Word.find({ chatId: msg.chat.id }).sort("lesson");
        if (!words.length)
            return bot.sendMessage(msg.chat.id, "📭 Sizda hali so‘zlar yo‘q.");

        for (let w of words) {
            bot.sendMessage(
                msg.chat.id,
                `📘 ${w.lesson}-dars\n${w.en} — ${w.uz}`,
                {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: "✏️ Tahrirlash", callback_data: `edit_${w._id}` },
                                { text: "🗑 O‘chirish", callback_data: `delete_${w._id}` },
                            ],
                        ],
                    },
                }
            );
        }
    });

    // 📚 Testni boshlash
    bot.onText(/📚 Testni boshlash/, async (msg) => {
        const chatId = msg.chat.id;
        const words = await Word.find({ chatId });
        if (!words.length)
            return bot.sendMessage(chatId, "📭 Sizda hali so‘zlar yo‘q.");

        userSessions[chatId] = { step: "chooseLesson" };

        const lessons = await Word.distinct("lesson", { chatId });
        const keyboard = lessons.map((l) => [`📘 ${l}-dars`]);
        keyboard.push(["📚 Barcha darslar"]);

        bot.sendMessage(chatId, "📝 Test uchun darsni tanlang:", {
            reply_markup: {
                keyboard,
                resize_keyboard: true,
                one_time_keyboard: true,
            },
        });
    });

    // Message handler
    bot.on("message", async (msg) => {
        const chatId = msg.chat.id;
        const text = msg.text?.trim();
        if (!text || text.startsWith("/")) return;

        if (!userSessions[chatId]) userSessions[chatId] = {};
        userSessions[chatId].userName =
            msg.from.first_name || msg.from.username || "Noma'lum";

        const session = userSessions[chatId];

        // 🔹 So‘z qo‘shish jarayoni
        if (session?.waitingLesson && /^\d+$/.test(text)) {
            session.waitingLesson = false;
            session.adding = true;
            session.lesson = parseInt(text);
            return bot.sendMessage(
                chatId,
                "✍️ Endi so‘zlarni kiriting:\n`cat - mushuk`\n`apple - olma`",
                { parse_mode: "Markdown" }
            );
        }

        if (session?.adding) {
            const lines = text.split("\n");
            let added = 0;
            for (let line of lines) {
                const [en, uz] = line.split("-");
                if (en && uz) {
                    await Word.create({
                        chatId,
                        lesson: session.lesson,
                        en: en.trim(),
                        uz: uz.trim(),
                    });
                    added++;
                }
            }
            const count = await Word.countDocuments({ chatId });
            delete userSessions[chatId].adding;

            const menu = await getMainMenu(chatId);
            return bot.sendMessage(
                chatId,
                `✅ ${added} ta so‘z ${session.lesson}-darsga qo‘shildi!\n📚 Jami: ${count} ta`,
                menu
            );
        }

        // 🔹 So‘z tahrirlash jarayoni
        if (session?.editing && text.includes("-")) {
            const [en, uz] = text.split("-");
            await Word.findByIdAndUpdate(session.editing, {
                en: en.trim(),
                uz: uz.trim(),
            });
            bot.sendMessage(chatId, `✅ So‘z yangilandi: ${en.trim()} — ${uz.trim()}`);
            delete userSessions[chatId].editing;
        }

        // 🔹 Test jarayoni
        if (session?.step === "chooseLesson") {
            if (text.includes("📘")) {
                session.lesson = parseInt(text.match(/\d+/)[0]);
            } else {
                session.lesson = "all";
            }
            session.step = "chooseMode";
            return bot.sendMessage(chatId, "🔄 Tarjimaning yo‘nalishini tanlang:", {
                reply_markup: {
                    keyboard: [["EN → UZ", "UZ → EN"]],
                    resize_keyboard: true,
                    one_time_keyboard: true,
                },
            });
        }

        if (session?.step === "chooseMode") {
            if (text === "EN → UZ") {
                session.mode = "en-uz";
            } else if (text === "UZ → EN") {
                session.mode = "uz-en";
            } else {
                return bot.sendMessage(chatId, "❌ Noto‘g‘ri tanlov, qayta urinib ko‘ring.");
            }

            const filter =
                session.lesson === "all" ? {} : { chatId, lesson: session.lesson };
            const words = await Word.find({ chatId, ...filter });
            session.words = words.sort(() => Math.random() - 0.5);
            session.index = 0;
            session.correct = 0;
            session.mistakes = [];
            session.correctAnswers = [];
            session.step = "inTest";
            session.endTime = Date.now() + 3 * 60 * 1000;
            bot.sendMessage(chatId, "🚀 Test boshlandi! (3 daqiqa vaqt) ⏳");
            return askQuestion(chatId, bot);
        }

        // 🔹 Javob tekshirish
        if (session?.step === "inTest" && session.currentWord && !session.paused) {
            if (session.waitTimer) clearTimeout(session.waitTimer);
            const answer = text.toLowerCase().trim();
            const correct =
                (session.mode === "en-uz"
                    ? session.currentWord.uz
                    : session.currentWord.en
                ).toLowerCase();

            if (answer === correct) {
                session.correct++;
                session.correctAnswers.push(
                    `✔️ ${session.currentWord.en} — ${session.currentWord.uz}`
                );
                bot.sendMessage(chatId, "✅ To‘g‘ri!");
                setTimeout(() => askQuestion(chatId, bot), 2000);
            } else {
                session.mistakes.push(
                    `❌ ${session.currentWord.en} — ${session.currentWord.uz} (siz: ${answer})`
                );
                bot.sendMessage(chatId, `❌ Noto‘g‘ri! To‘g‘ri javob: ${correct}`);
                setTimeout(() => askQuestion(chatId, bot), 4000);
            }
        }
    });

    // 🔹 Savol berish
    async function askQuestion(chatId, bot) {
        const session = userSessions[chatId];
        if (
            !session ||
            Date.now() > session.endTime ||
            session.index >= session.words.length
        ) {
            return finishTest(chatId, bot);
        }

        session.currentWord = session.words[session.index++];
        const q =
            session.mode === "en-uz"
                ? `❓ *${session.currentWord.en}* — o‘zbekchasini yozing`
                : `❓ *${session.currentWord.uz}* — inglizchasini yozing`;

        bot.sendMessage(chatId, q, {
            parse_mode: "Markdown",
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "⏸ Pauza", callback_data: "pause" },
                        { text: "⏹ To‘xtatish", callback_data: "stop" },
                    ],
                ],
            },
        });

        if (session.waitTimer) clearTimeout(session.waitTimer);
        session.waitTimer = setTimeout(() => {
            bot.sendMessage(chatId, "⏰ Javob yo‘q, test tugadi.");
            finishTest(chatId, bot);
        }, 3 * 60 * 1000);
    }

    // 🔹 Inline tugmalar
    bot.on("callback_query", async (query) => {
        const chatId = query.message.chat.id;
        const data = query.data;
        const session = userSessions[chatId];
        if (!session) return;

        if (data === "pause" && session.step === "inTest") {
            if (session.waitTimer) clearTimeout(session.waitTimer);
            session.paused = true;
            bot.sendMessage(chatId, "⏸ Test pauzaga qo‘yildi.", {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "▶️ Davom ettirish", callback_data: "resume" }],
                    ],
                },
            });
        }

        if (data === "stop") {
            if (session.waitTimer) clearTimeout(session.waitTimer);
            const menu = await getMainMenu(chatId);
            bot.sendMessage(chatId, "⏹ Test to‘xtatildi.", menu);
            delete userSessions[chatId];
        }

        if (data === "resume" && session.paused) {
            session.paused = false;
            bot.sendMessage(chatId, "▶️ Test davom etmoqda...");
            askQuestion(chatId, bot);
        }

        // 🗑 O‘chirish
        if (data.startsWith("delete_")) {
            const id = data.split("_")[1];
            await Word.findByIdAndDelete(id);
            bot.editMessageText("🗑 So‘z o‘chirildi!", {
                chat_id: chatId,
                message_id: query.message.message_id,
            });
        }

        // ✏️ Tahrirlash
        if (data.startsWith("edit_")) {
            const id = data.split("_")[1];
            userSessions[chatId] = { editing: id };
            bot.sendMessage(chatId, "✏️ Yangi ko‘rinishda kiriting:\n`apple - olma`", {
                parse_mode: "Markdown",
            });
        }

        bot.answerCallbackQuery(query.id);
    });

    // 🔹 Testni tugatish
    async function finishTest(chatId, bot) {
        const session = userSessions[chatId];
        if (!session) return;
        const total = session.words.length;
        const correct = session.correct;
        const percent = ((correct / total) * 100).toFixed(1);

        const mistakes =
            session.mistakes.length > 0
                ? `\n❌ Xatolar:\n${session.mistakes.join("\n")}`
                : "\n✅ Hech qanday xato yo‘q!";
        const correctList =
            session.correctAnswers.length > 0
                ? `\n✔️ To‘g‘ri javoblar:\n${session.correctAnswers.join("\n")}`
                : "";

        const menu = await getMainMenu(chatId);

        bot.sendMessage(
            chatId,
            `📊 *Test tugadi!*\n✅ To‘g‘ri: ${correct}/${total}\n📈 Foiz: ${percent}%${mistakes}${correctList}`,
            { parse_mode: "Markdown", ...menu }
        );

        // O‘qituvchiga natija yuborish
        for (let t of TEACHERS) {
            bot.sendMessage(
                t,
                `👨‍🎓 O‘quvchi: *${session.userName || "Noma'lum"}*  
🆔 ID: ${chatId}  
📊 Natija: ${correct}/${total} (${percent}%)${mistakes}${correctList}`,
                { parse_mode: "Markdown" }
            );
        }

        delete userSessions[chatId];
    }

    // 🔔 Reminderlar
    cron.schedule("0 8 * * *", async () => {
        const users = await Word.distinct("chatId");
        for (let id of users) {
            bot.sendMessage(id, "🌅 Ertalabki salom! 📖 So‘zlarni takrorlashni unutmang!");
        }
    });

    cron.schedule("0 20 * * *", async () => {
        const users = await Word.distinct("chatId");
        for (let id of users) {
            bot.sendMessage(id, "🌙 Kechqurungi eslatma: 📚 Bugun o‘rgangan so‘zlaringizni qaytarib chiqing!");
        }
    });
}

