# K-Quiz Bot

K-Quiz — bu Telegram orqali foydalanuvchilarga koreys tilidagi so‘zlarni o‘rganish va test orqali bilimlarini sinash imkonini beruvchi interaktiv bot.

## Xususiyatlar
- 📚 **So‘z qo‘shish** — foydalanuvchi o‘z lug‘atiga yangi so‘zlarni qo‘shishi mumkin.
- 📝 **Test rejimi** — tasodifiy so‘zlardan test o‘tkazadi va natijalarni ko‘rsatadi.
- 🔄 **So‘zlarni yangilash** — mavjud so‘zlarni tahrirlash imkoni.
- 🗑 **So‘zlarni o‘chirish** — lug‘atdan so‘zlarni olib tashlash.
- 📊 **Natija statistikasi** — to‘g‘ri va noto‘g‘ri javoblar foizini hisoblaydi.

## Texnologiyalar
- **Node.js** — server logikasi
- **MongoDB** — ma’lumotlarni saqlash
- **node-telegram-bot-api** — Telegram bilan integratsiya

## Ishga tushirish
1. `git clone <repo-url>`
2. `npm install`
3. `.env` faylida `BOT_TOKEN` va `MONGO_URI` ni kiriting
4. `node index.js` yoki `npm start` orqali ishga tushiring
