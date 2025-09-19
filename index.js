// const Bot = require('node-telegram-bot-api');
// const mongoose = require('mongoose');
// require('dotenv').config();

// const OWNER_ID = 7116951061; // Faqat shu ID ishlata oladi

// const wordSchema = new mongoose.Schema({
//     chatId: Number,
//     uzbek: String,
//     korean: String,
//     date: { type: Date, default: Date.now }
// });
// const Word = mongoose.model("Word", wordSchema);

// const userSessions = {};

// mongoose.connect(process.env.MONGO_URI)
//     .then(() => {
//         console.log("✅ MongoDB ulandi");
//         startBot();
//     })
//     .catch(err => console.error("❌ MongoDB xatosi:", err));

// function startBot() {
//     const bot = new Bot(process.env.TELEGRAM_TOKEN, { polling: true });

//     bot.on("polling_error", (err) => console.error("📡 Polling xatosi:", err.message));

//     const mainMenu = {
//         reply_markup: {
//             keyboard: [
//                 ["📚 Testni boshlash", "➕ So‘z qo‘shish"],
//                 ["📄 Mening so‘zlarim"]
//             ],
//             resize_keyboard: true
//         }
//     };

//     const testMenu = {
//         reply_markup: {
//             keyboard: [
//                 ["⏸ Testni pauza qilish", "❌ Testni to‘xtatish"]
//             ],
//             resize_keyboard: true
//         }
//     };

//     bot.setMyCommands([
//         { command: "/start", description: "Botni ishga tushirish" },
//         { command: "/add", description: "So‘z qo‘shish: /add salom - 안녕하세요" },
//         { command: "/test", description: "Testni boshlash" },
//         { command: "/words", description: "Mening so‘zlarim ro‘yxati" }
//     ]);

//     // START
//     bot.onText(/^\/start$/, (msg) => {
//         if (msg.chat.id !== OWNER_ID) return;
//         bot.sendMessage(msg.chat.id, "👋 Salom! Men koreys so‘zlarni o‘rganishga yordam beraman.", mainMenu);
//     });

//     // TEST BOSHLASH (tugma bosilganda)
//     bot.onText(/📚 Testni boshlash/, (msg) => {
//         if (msg.chat.id !== OWNER_ID) return;
//         if (userSessions[msg.chat.id]?.paused) {
//             resumeTest(msg.chat.id, bot);
//         } else {
//             startTest(msg.chat.id, bot);
//         }
//     });

//     // TESTNI PAUZA QILISH
//     bot.onText(/⏸ Testni pauza qilish/, (msg) => {
//         const chatId = msg.chat.id;
//         if (chatId !== OWNER_ID) return;

//         if (!userSessions[chatId]) {
//             return bot.sendMessage(chatId, "Test hali boshlanmagan.", mainMenu);
//         }

//         userSessions[chatId].paused = true;
//         bot.sendMessage(chatId, "⏸ Test pauza qilindi. Davom ettirish uchun “📚 Testni boshlash” tugmasini bosing.", mainMenu);
//     });

//     // TESTNI TO‘XTATISH
//     bot.onText(/❌ Testni to‘xtatish/, (msg) => {
//         const chatId = msg.chat.id;
//         if (chatId !== OWNER_ID) return;

//         if (!userSessions[chatId]) {
//             return bot.sendMessage(chatId, "Test hali boshlanmagan.", mainMenu);
//         }

//         delete userSessions[chatId];
//         bot.sendMessage(chatId, "🛑 Test to‘xtatildi!", mainMenu);
//     });

//     // ➕ SO‘Z QO‘SHISH
//     bot.onText(/➕ So‘z qo‘shish/, (msg) => {
//         if (msg.chat.id !== OWNER_ID) return;
//         const chatId = msg.chat.id;

//         userSessions[chatId] = {
//             ...userSessions[chatId],
//             adding: true
//         };

//         bot.sendMessage(
//             chatId,
//             "✍ So‘z(lar)ni qo‘shing: Format `salom - 안녕하세요`\n\nBir nechta so‘z kiritsangiz, yangi qatordan yoki vergul bilan ajrating."
//         );
//     });

//     // 📄 MENING SO‘ZLARIM
//     bot.onText(/📄 Mening so‘zlarim/, async (msg) => {
//         if (msg.chat.id !== OWNER_ID) return;
//         const chatId = msg.chat.id;

//         if (userSessions[chatId]?.lastListMessageId) {
//             try {
//                 await bot.deleteMessage(chatId, userSessions[chatId].lastListMessageId);
//             } catch {}
//         }

//         const words = await Word.find({ chatId });
//         if (words.length === 0) {
//             return bot.sendMessage(chatId, "📭 Sizda hali so‘zlar yo‘q.");
//         }

//         const inlineKeyboard = words.map(w => ([{ text: `${w.uzbek} - ${w.korean}`, callback_data: `word_${w._id}` }]));
//         const sentMsg = await bot.sendMessage(chatId, "📄 Sizning so‘zlaringiz:", {
//             reply_markup: { inline_keyboard: inlineKeyboard }
//         });

//         userSessions[chatId] = {
//             ...userSessions[chatId],
//             lastListMessageId: sentMsg.message_id
//         };
//     });

//     // CALLBACK HANDLER
//     bot.on("callback_query", async (query) => {
//         const chatId = query.message.chat.id;
//         if (chatId !== OWNER_ID) return bot.answerCallbackQuery(query.id, { text: "⛔ Ruxsat yo‘q" });
//         const data = query.data;

//         if (data.startsWith("word_")) {
//             const id = data.split("_")[1];
//             const word = await Word.findById(id);
//             if (!word) return bot.answerCallbackQuery(query.id, { text: "❌ So‘z topilmadi" });

//             return bot.editMessageText(
//                 `📌 ${word.uzbek} — ${word.korean}`,
//                 {
//                     chat_id: chatId,
//                     message_id: query.message.message_id,
//                     reply_markup: {
//                         inline_keyboard: [
//                             [{ text: "✏ Tahrirlash", callback_data: `edit_${word._id}` }],
//                             [{ text: "🗑 O‘chirish", callback_data: `delete_${word._id}` }],
//                             [{ text: "⬅ Orqaga", callback_data: "back_to_list" }]
//                         ]
//                     }
//                 }
//             );
//         }

//         if (data.startsWith("delete_")) {
//             const id = data.split("_")[1];
//             await Word.findByIdAndDelete(id);
//             bot.answerCallbackQuery(query.id, { text: "🗑 O‘chirildi!" });

//             await bot.editMessageText("✅ So‘z o‘chirildi!", { chat_id: chatId, message_id: query.message.message_id });
            
//             setTimeout(async () => {
//                 try {
//                     await bot.deleteMessage(chatId, query.message.message_id);
//                 } catch {}

//                 const words = await Word.find({ chatId });
//                 if (words.length === 0) {
//                     return bot.sendMessage(chatId, "📭 Sizda hali so‘zlar yo‘q.");
//                 }

//                 const inlineKeyboard = words.map(w => ([{ text: `${w.uzbek} - ${w.korean}`, callback_data: `word_${w._id}` }]));
//                 const sentMsg = await bot.sendMessage(chatId, "📄 Sizning so‘zlaringiz:", {
//                     reply_markup: { inline_keyboard: inlineKeyboard }
//                 });

//                 userSessions[chatId] = {
//                     ...userSessions[chatId],
//                     lastListMessageId: sentMsg.message_id
//                 };
//             }, 3000);
//             return;
//         }

//         if (data.startsWith("edit_")) {
//             const id = data.split("_")[1];
//             userSessions[chatId] = { ...userSessions[chatId], editingId: id, messagesToDelete: [] };

//             bot.sendMessage(chatId, "✏ Yangi qiymatni kiriting: Format `salom - 안녕하세요`").then(sentMsg => {
//                 userSessions[chatId].messagesToDelete.push(sentMsg.message_id);
//             });
//             return;
//         }

//         if (data === "back_to_list") {
//             bot.deleteMessage(chatId, query.message.message_id);
//             const fakeMsg = { chat: { id: chatId }, text: "📄 Mening so‘zlarim" };
//             bot.emit("text", fakeMsg);
//         }
//     });

//     // XABAR QABUL QILISH
//     bot.on('message', async (msg) => {
//         const chatId = msg.chat.id;
//         if (chatId !== OWNER_ID) return;
//         const text = msg.text?.trim();
//         if (!text || text.startsWith('/')) return;

//         // ➕ So'z qo'shish rejimi
//         if (userSessions[chatId]?.adding) {
//             if (!text.includes('-')) {
//                 return bot.sendMessage(chatId, "❗ Format: salom - 안녕하세요");
//             }
//             await addMultipleWords(chatId, text, bot);
//             userSessions[chatId].adding = false;
//             return;
//         }

//         // Tahrirlash rejimi
//         if (userSessions[chatId]?.editingId) {
//             const [uzbek, korean] = text.split('-').map(s => s.trim());
//             if (!uzbek || !korean) {
//                 return bot.sendMessage(chatId, "❗ Format: salom - 안녕하세요");
//             }

//             await Word.findByIdAndUpdate(userSessions[chatId].editingId, { uzbek, korean });

//             const messagesToDelete = userSessions[chatId].messagesToDelete || [];
//             for (const messageId of messagesToDelete) {
//                 try {
//                     await bot.deleteMessage(chatId, messageId);
//                 } catch {}
//             }

//             const sentMsg = await bot.sendMessage(chatId, "✅ So‘z tahrirlandi!");
//             setTimeout(async () => {
//                 try {
//                     await bot.deleteMessage(chatId, sentMsg.message_id);
//                 } catch {}

//                 if (userSessions[chatId]?.lastListMessageId) {
//                     try {
//                         await bot.deleteMessage(chatId, userSessions[chatId].lastListMessageId);
//                     } catch {}
//                 }

//                 const words = await Word.find({ chatId });
//                 if (words.length === 0) {
//                     return bot.sendMessage(chatId, "📭 Sizda hali so‘zlar yo‘q.");
//                 }

//                 const inlineKeyboard = words.map(w => ([{ text: `${w.uzbek} - ${w.korean}`, callback_data: `word_${w._id}` }]));
//                 const sentList = await bot.sendMessage(chatId, "📄 Sizning so‘zlaringiz:", {
//                     reply_markup: { inline_keyboard: inlineKeyboard }
//                 });

//                 userSessions[chatId].lastListMessageId = sentList.message_id;
//             }, 3000);

//             delete userSessions[chatId].editingId;
//             delete userSessions[chatId].messagesToDelete;
//             return;
//         }

//         // Test javobi
//         if (userSessions[chatId]?.currentWord && !userSessions[chatId].paused) {
//             if (["📚 Testni boshlash", "➕ So‘z qo‘shish", "📄 Mening so‘zlarim", "⏸ Testni pauza qilish", "❌ Testni to‘xtatish"].includes(text)) {
//                 return;
//             }

//             const correctAnswer = userSessions[chatId].currentWord.uzbek.toLowerCase();
//             setTimeout(() => {
//                 if (text.trim().toLowerCase() === correctAnswer) {
//                     bot.sendMessage(chatId, "✅ To‘g‘ri!");
//                     userSessions[chatId].correct++;
//                 } else {
//                     bot.sendMessage(chatId, `❌ Noto‘g‘ri! To‘g‘ri javob: ${userSessions[chatId].currentWord.uzbek}`);
//                 }
//                 setTimeout(() => nextQuestion(chatId, bot), 4000);
//             }, 2000);
//         }
//     });

//     // So‘z qo‘shish funksiyasi
//     async function addMultipleWords(chatId, text, bot) {
//         const entries = text.split(/[\n,]/).map(s => s.trim()).filter(s => s.includes('-'));
//         if (!entries.length) return bot.sendMessage(chatId, "❗ Format: salom - 안녕하세요");

//         let addedCount = 0;
//         for (const entry of entries) {
//             const [uzbek, korean] = entry.split('-').map(s => s.trim());
//             if (uzbek && korean) {
//                 await Word.create({ chatId, uzbek, korean });
//                 addedCount++;
//             }
//         }
//         bot.sendMessage(chatId, `✅ ${addedCount} ta so‘z qo‘shildi!`, mainMenu);
//     }

//     // TEST BOSHLASH
//     async function startTest(chatId, bot) {
//         const words = await Word.find({ chatId });
//         if (!words.length) return bot.sendMessage(chatId, "📭 Sizda hali so‘zlar yo‘q.", mainMenu);

//         userSessions[chatId] = {
//             words: words.sort(() => Math.random() - 0.5),
//             index: 0,
//             currentWord: null,
//             paused: false,
//             correct: 0
//         };

//         for (let i = 1; i <= 3; i++) {
//             await bot.sendMessage(chatId, i.toString());
//             await new Promise(r => setTimeout(r, 1000));
//         }

//         await bot.sendMessage(chatId, "📚 Test boshlandi!", testMenu);
//         nextQuestion(chatId, bot);
//     }

//     function nextQuestion(chatId, bot) {
//         const session = userSessions[chatId];
//         if (!session || session.index >= session.words.length) return showResultAndStop(chatId, bot);

//         session.currentWord = session.words[session.index++];
//         bot.sendMessage(chatId, `❓ ${session.currentWord.korean} — bu nima?`, testMenu);
//     }

//     function resumeTest(chatId, bot) {
//         if (userSessions[chatId]) {
//             userSessions[chatId].paused = false;
//             bot.sendMessage(chatId, "▶ Test davom ettirildi!", testMenu);
//             nextQuestion(chatId, bot);
//         }
//     }

//     function showResultAndStop(chatId, bot) {
//         const session = userSessions[chatId];
//         if (!session) return;
//         const total = session.words.length, correct = session.correct;
//         const percent = ((correct / total) * 100).toFixed(1);
    
//         session.paused = true;
    
//         bot.sendMessage(chatId, 
//             `✅ Test tugadi!\n📊 Natija: ${correct} / ${total}\n📈 Foiz: ${percent}%`, 
//             {
//                 reply_markup: {
//                     keyboard: [
//                         ["📚 Testni qayta boshlash"],
//                         ["❌ Testni to‘xtatish"]
//                     ],
//                     resize_keyboard: true
//                 }
//             }
//         );
//     }
// }

const Bot = require("node-telegram-bot-api");
const mongoose = require("mongoose");
require("dotenv").config();
const express = require("express");

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

// 🔹 MongoDB ulanishi
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

    // 🔹 START komandasi
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

    // 🔹 So‘z qo‘shish
    bot.onText(/➕ So‘z qo‘shish/, (msg) => {
        userSessions[msg.chat.id] = { waitingLesson: true };
        bot.sendMessage(
            msg.chat.id,
            "📖 Avval dars raqamini kiriting (masalan: `1`)",
            { parse_mode: "Markdown" }
        );
    });

    // 🔹 Mening so‘zlarim
    bot.onText(/📄 Mening so‘zlarim/, async (msg) => {
        const words = await Word.find({ chatId: msg.chat.id }).sort("lesson");
        if (!words.length)
            return bot.sendMessage(msg.chat.id, "📭 Sizda hali so‘zlar yo‘q.");

        let grouped = {};
        words.forEach((w) => {
            if (!grouped[w.lesson]) grouped[w.lesson] = [];
            grouped[w.lesson].push(`${w.en} — ${w.uz}`);
        });

        let text = "📄 Sizning so‘zlaringiz:\n\n";
        for (let lesson in grouped) {
            text += `📘 ${lesson}-dars:\n${grouped[lesson].join("\n")}\n\n`;
        }
        bot.sendMessage(msg.chat.id, text);
    });

    // 🔹 Testni boshlash
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

    // 🔹 Message handler
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

    // 🔹 Savol berish funksiyasi
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

    // 🔹 Inline tugmalar handler
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

        bot.answerCallbackQuery(query.id);
    });

    // 🔹 Testni tugatish funksiyasi
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
}

// 🔹 Minimal HTTP server (Koyeb health check uchun)
const app = express();
const PORT = process.env.PORT || 8000;

app.get("/", (req, res) => {
    res.send("✅ Bot ishlayapti");
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
