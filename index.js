const Bot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
require('dotenv').config();

const OWNER_ID = 7116951061; // Faqat shu ID ishlata oladi

const wordSchema = new mongoose.Schema({
    chatId: Number,
    uzbek: String,
    korean: String,
    date: { type: Date, default: Date.now }
});
const Word = mongoose.model("Word", wordSchema);

const userSessions = {};

mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log("✅ MongoDB ulandi");
        startBot();
    })
    .catch(err => console.error("❌ MongoDB xatosi:", err));

function startBot() {
    const bot = new Bot(process.env.TELEGRAM_TOKEN, { polling: true });

    bot.on("polling_error", (err) => console.error("📡 Polling xatosi:", err.message));

    const mainMenu = {
        reply_markup: {
            keyboard: [
                ["📚 Testni boshlash", "➕ So‘z qo‘shish"],
                ["📄 Mening so‘zlarim"]
            ],
            resize_keyboard: true
        }
    };

    const testMenu = {
        reply_markup: {
            keyboard: [
                ["⏸ Testni pauza qilish", "❌ Testni to‘xtatish"]
            ],
            resize_keyboard: true
        }
    };

    bot.setMyCommands([
        { command: "/start", description: "Botni ishga tushirish" },
        { command: "/add", description: "So‘z qo‘shish: /add salom - 안녕하세요" },
        { command: "/test", description: "Testni boshlash" },
        { command: "/words", description: "Mening so‘zlarim ro‘yxati" }
    ]);

    // START
    bot.onText(/^\/start$/, (msg) => {
        if (msg.chat.id !== OWNER_ID) return;
        bot.sendMessage(msg.chat.id, "👋 Salom! Men koreys so‘zlarni o‘rganishga yordam beraman.", mainMenu);
    });

    // TEST BOSHLASH (tugma bosilganda)
    bot.onText(/📚 Testni boshlash/, (msg) => {
        if (msg.chat.id !== OWNER_ID) return;
        if (userSessions[msg.chat.id]?.paused) {
            resumeTest(msg.chat.id, bot);
        } else {
            startTest(msg.chat.id, bot);
        }
    });

    // TESTNI PAUZA QILISH
    bot.onText(/⏸ Testni pauza qilish/, (msg) => {
        const chatId = msg.chat.id;
        if (chatId !== OWNER_ID) return;

        if (!userSessions[chatId]) {
            return bot.sendMessage(chatId, "Test hali boshlanmagan.", mainMenu);
        }

        userSessions[chatId].paused = true;
        bot.sendMessage(chatId, "⏸ Test pauza qilindi. Davom ettirish uchun “📚 Testni boshlash” tugmasini bosing.", mainMenu);
    });

    // TESTNI TO‘XTATISH
    bot.onText(/❌ Testni to‘xtatish/, (msg) => {
        const chatId = msg.chat.id;
        if (chatId !== OWNER_ID) return;

        if (!userSessions[chatId]) {
            return bot.sendMessage(chatId, "Test hali boshlanmagan.", mainMenu);
        }

        delete userSessions[chatId];
        bot.sendMessage(chatId, "🛑 Test to‘xtatildi!", mainMenu);
    });

    // ➕ SO‘Z QO‘SHISH
    bot.onText(/➕ So‘z qo‘shish/, (msg) => {
        if (msg.chat.id !== OWNER_ID) return;
        const chatId = msg.chat.id;

        userSessions[chatId] = {
            ...userSessions[chatId],
            adding: true
        };

        bot.sendMessage(
            chatId,
            "✍ So‘z(lar)ni qo‘shing: Format `salom - 안녕하세요`\n\nBir nechta so‘z kiritsangiz, yangi qatordan yoki vergul bilan ajrating."
        );
    });

    // 📄 MENING SO‘ZLARIM
    bot.onText(/📄 Mening so‘zlarim/, async (msg) => {
        if (msg.chat.id !== OWNER_ID) return;
        const chatId = msg.chat.id;

        if (userSessions[chatId]?.lastListMessageId) {
            try {
                await bot.deleteMessage(chatId, userSessions[chatId].lastListMessageId);
            } catch {}
        }

        const words = await Word.find({ chatId });
        if (words.length === 0) {
            return bot.sendMessage(chatId, "📭 Sizda hali so‘zlar yo‘q.");
        }

        const inlineKeyboard = words.map(w => ([{ text: `${w.uzbek} - ${w.korean}`, callback_data: `word_${w._id}` }]));
        const sentMsg = await bot.sendMessage(chatId, "📄 Sizning so‘zlaringiz:", {
            reply_markup: { inline_keyboard: inlineKeyboard }
        });

        userSessions[chatId] = {
            ...userSessions[chatId],
            lastListMessageId: sentMsg.message_id
        };
    });

    // CALLBACK HANDLER
    bot.on("callback_query", async (query) => {
        const chatId = query.message.chat.id;
        if (chatId !== OWNER_ID) return bot.answerCallbackQuery(query.id, { text: "⛔ Ruxsat yo‘q" });
        const data = query.data;

        if (data.startsWith("word_")) {
            const id = data.split("_")[1];
            const word = await Word.findById(id);
            if (!word) return bot.answerCallbackQuery(query.id, { text: "❌ So‘z topilmadi" });

            return bot.editMessageText(
                `📌 ${word.uzbek} — ${word.korean}`,
                {
                    chat_id: chatId,
                    message_id: query.message.message_id,
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: "✏ Tahrirlash", callback_data: `edit_${word._id}` }],
                            [{ text: "🗑 O‘chirish", callback_data: `delete_${word._id}` }],
                            [{ text: "⬅ Orqaga", callback_data: "back_to_list" }]
                        ]
                    }
                }
            );
        }

        if (data.startsWith("delete_")) {
            const id = data.split("_")[1];
            await Word.findByIdAndDelete(id);
            bot.answerCallbackQuery(query.id, { text: "🗑 O‘chirildi!" });

            await bot.editMessageText("✅ So‘z o‘chirildi!", { chat_id: chatId, message_id: query.message.message_id });
            
            setTimeout(async () => {
                try {
                    await bot.deleteMessage(chatId, query.message.message_id);
                } catch {}

                const words = await Word.find({ chatId });
                if (words.length === 0) {
                    return bot.sendMessage(chatId, "📭 Sizda hali so‘zlar yo‘q.");
                }

                const inlineKeyboard = words.map(w => ([{ text: `${w.uzbek} - ${w.korean}`, callback_data: `word_${w._id}` }]));
                const sentMsg = await bot.sendMessage(chatId, "📄 Sizning so‘zlaringiz:", {
                    reply_markup: { inline_keyboard: inlineKeyboard }
                });

                userSessions[chatId] = {
                    ...userSessions[chatId],
                    lastListMessageId: sentMsg.message_id
                };
            }, 3000);
            return;
        }

        if (data.startsWith("edit_")) {
            const id = data.split("_")[1];
            userSessions[chatId] = { ...userSessions[chatId], editingId: id, messagesToDelete: [] };

            bot.sendMessage(chatId, "✏ Yangi qiymatni kiriting: Format `salom - 안녕하세요`").then(sentMsg => {
                userSessions[chatId].messagesToDelete.push(sentMsg.message_id);
            });
            return;
        }

        if (data === "back_to_list") {
            bot.deleteMessage(chatId, query.message.message_id);
            const fakeMsg = { chat: { id: chatId }, text: "📄 Mening so‘zlarim" };
            bot.emit("text", fakeMsg);
        }
    });

    // XABAR QABUL QILISH
    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        if (chatId !== OWNER_ID) return;
        const text = msg.text?.trim();
        if (!text || text.startsWith('/')) return;

        // ➕ So'z qo'shish rejimi
        if (userSessions[chatId]?.adding) {
            if (!text.includes('-')) {
                return bot.sendMessage(chatId, "❗ Format: salom - 안녕하세요");
            }
            await addMultipleWords(chatId, text, bot);
            userSessions[chatId].adding = false;
            return;
        }

        // Tahrirlash rejimi
        if (userSessions[chatId]?.editingId) {
            const [uzbek, korean] = text.split('-').map(s => s.trim());
            if (!uzbek || !korean) {
                return bot.sendMessage(chatId, "❗ Format: salom - 안녕하세요");
            }

            await Word.findByIdAndUpdate(userSessions[chatId].editingId, { uzbek, korean });

            const messagesToDelete = userSessions[chatId].messagesToDelete || [];
            for (const messageId of messagesToDelete) {
                try {
                    await bot.deleteMessage(chatId, messageId);
                } catch {}
            }

            const sentMsg = await bot.sendMessage(chatId, "✅ So‘z tahrirlandi!");
            setTimeout(async () => {
                try {
                    await bot.deleteMessage(chatId, sentMsg.message_id);
                } catch {}

                if (userSessions[chatId]?.lastListMessageId) {
                    try {
                        await bot.deleteMessage(chatId, userSessions[chatId].lastListMessageId);
                    } catch {}
                }

                const words = await Word.find({ chatId });
                if (words.length === 0) {
                    return bot.sendMessage(chatId, "📭 Sizda hali so‘zlar yo‘q.");
                }

                const inlineKeyboard = words.map(w => ([{ text: `${w.uzbek} - ${w.korean}`, callback_data: `word_${w._id}` }]));
                const sentList = await bot.sendMessage(chatId, "📄 Sizning so‘zlaringiz:", {
                    reply_markup: { inline_keyboard: inlineKeyboard }
                });

                userSessions[chatId].lastListMessageId = sentList.message_id;
            }, 3000);

            delete userSessions[chatId].editingId;
            delete userSessions[chatId].messagesToDelete;
            return;
        }

        // Test javobi
        if (userSessions[chatId]?.currentWord && !userSessions[chatId].paused) {
            if (["📚 Testni boshlash", "➕ So‘z qo‘shish", "📄 Mening so‘zlarim", "⏸ Testni pauza qilish", "❌ Testni to‘xtatish"].includes(text)) {
                return;
            }

            const correctAnswer = userSessions[chatId].currentWord.uzbek.toLowerCase();
            setTimeout(() => {
                if (text.trim().toLowerCase() === correctAnswer) {
                    bot.sendMessage(chatId, "✅ To‘g‘ri!");
                    userSessions[chatId].correct++;
                } else {
                    bot.sendMessage(chatId, `❌ Noto‘g‘ri! To‘g‘ri javob: ${userSessions[chatId].currentWord.uzbek}`);
                }
                setTimeout(() => nextQuestion(chatId, bot), 4000);
            }, 2000);
        }
    });

    // So‘z qo‘shish funksiyasi
    async function addMultipleWords(chatId, text, bot) {
        const entries = text.split(/[\n,]/).map(s => s.trim()).filter(s => s.includes('-'));
        if (!entries.length) return bot.sendMessage(chatId, "❗ Format: salom - 안녕하세요");

        let addedCount = 0;
        for (const entry of entries) {
            const [uzbek, korean] = entry.split('-').map(s => s.trim());
            if (uzbek && korean) {
                await Word.create({ chatId, uzbek, korean });
                addedCount++;
            }
        }
        bot.sendMessage(chatId, `✅ ${addedCount} ta so‘z qo‘shildi!`, mainMenu);
    }

    // TEST BOSHLASH
    async function startTest(chatId, bot) {
        const words = await Word.find({ chatId });
        if (!words.length) return bot.sendMessage(chatId, "📭 Sizda hali so‘zlar yo‘q.", mainMenu);

        userSessions[chatId] = {
            words: words.sort(() => Math.random() - 0.5),
            index: 0,
            currentWord: null,
            paused: false,
            correct: 0
        };

        for (let i = 1; i <= 3; i++) {
            await bot.sendMessage(chatId, i.toString());
            await new Promise(r => setTimeout(r, 1000));
        }

        await bot.sendMessage(chatId, "📚 Test boshlandi!", testMenu);
        nextQuestion(chatId, bot);
    }

    function nextQuestion(chatId, bot) {
        const session = userSessions[chatId];
        if (!session || session.index >= session.words.length) return showResultAndStop(chatId, bot);

        session.currentWord = session.words[session.index++];
        bot.sendMessage(chatId, `❓ ${session.currentWord.korean} — bu nima?`, testMenu);
    }

    function resumeTest(chatId, bot) {
        if (userSessions[chatId]) {
            userSessions[chatId].paused = false;
            bot.sendMessage(chatId, "▶ Test davom ettirildi!", testMenu);
            nextQuestion(chatId, bot);
        }
    }

    function showResultAndStop(chatId, bot) {
        const session = userSessions[chatId];
        if (!session) return;
        const total = session.words.length, correct = session.correct;
        const percent = ((correct / total) * 100).toFixed(1);
    
        session.paused = true;
    
        bot.sendMessage(chatId, 
            `✅ Test tugadi!\n📊 Natija: ${correct} / ${total}\n📈 Foiz: ${percent}%`, 
            {
                reply_markup: {
                    keyboard: [
                        ["📚 Testni qayta boshlash"],
                        ["❌ Testni to‘xtatish"]
                    ],
                    resize_keyboard: true
                }
            }
        );
    }
}
